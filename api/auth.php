<?php
/**
 * Single-user authentication.
 *
 * - One password, set on first visit (or reset by deleting the auth file).
 * - Each signed-in browser gets an HttpOnly cookie: "<generation>.<issued>.<hmac>".
 *   No server-side session list, so any number of devices can stay signed in.
 * - The cookie is renewed at most once a day, so a device used at least once
 *   every 400 days (Chrome's cookie lifetime cap) stays signed in indefinitely.
 * - Bumping "generation" (change password / sign out other devices) invalidates
 *   every outstanding cookie at once.
 *
 * State lives in auth.data.php next to the database (override with 'auth_path'
 * in config.local.php). The file starts with a PHP exit guard so that, even if
 * it is inside the web root, requesting it over HTTP reveals nothing.
 */

require_once __DIR__ . '/db.php';

const SN_COOKIE = 'sn_auth';
const SN_COOKIE_TTL = 400 * 86400;     // Chrome caps cookie lifetime at 400 days.
const SN_RENEW_AFTER = 86400;          // Re-issue (slide expiry) at most daily.
const SN_MIN_PASSWORD = 8;
const SN_MAX_PASSWORD = 1024;
const SN_FREE_ATTEMPTS = 5;            // Failed attempts before lockout starts.
const SN_MAX_LOCKOUT = 900;            // Lockout ceiling in seconds.
const SN_FILE_GUARD = "<?php http_response_code(404); exit; ?>\n";

function sn_auth_path(): string
{
    $config = sn_config();
    if (!empty($config['auth_path'])) {
        return (string) $config['auth_path'];
    }
    return dirname(notes_db_path()) . '/auth.data.php';
}

function sn_auth_read(): ?array
{
    $path = sn_auth_path();
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if ($raw === false || strncmp($raw, SN_FILE_GUARD, strlen(SN_FILE_GUARD)) !== 0) {
        throw new SnSafeException('Auth file is unreadable or corrupt.');
    }
    $state = json_decode(substr($raw, strlen(SN_FILE_GUARD)), true);
    if (!is_array($state) || empty($state['password_hash']) || empty($state['secret'])) {
        throw new SnSafeException('Auth file is unreadable or corrupt.');
    }
    return $state;
}

function sn_auth_write(array $state): void
{
    $path = sn_auth_path();
    sn_ensure_dir(dirname($path));
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $data = SN_FILE_GUARD . json_encode($state, JSON_UNESCAPED_SLASHES);
    if (@file_put_contents($tmp, $data, LOCK_EX) === false) {
        throw new SnSafeException('Could not write auth file. Check folder permissions.');
    }
    @chmod($tmp, 0600);
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        throw new SnSafeException('Could not write auth file. Check folder permissions.');
    }
}

/** Run $fn while holding an exclusive lock, so concurrent requests can't clobber state. */
function sn_auth_locked(callable $fn)
{
    $path = sn_auth_path();
    sn_ensure_dir(dirname($path));
    $lock = @fopen($path . '.lock', 'c');
    if ($lock === false) {
        throw new SnSafeException('Could not open auth lock. Check folder permissions.');
    }
    try {
        flock($lock, LOCK_EX);
        return $fn();
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function sn_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443) {
        return true;
    }
    // Common on managed hosting behind a TLS-terminating proxy.
    return isset($_SERVER['HTTP_X_FORWARDED_PROTO'])
        && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https';
}

/** Scope the cookie to the app's folder (the parent of /api/). */
function sn_cookie_path(): string
{
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'));
    $appDir = rtrim(dirname(dirname($script)), '/');
    return $appDir . '/';
}

function sn_sign(array $state, int $generation, int $issued): string
{
    return hash_hmac('sha256', "sn-auth|$generation|$issued", $state['secret']);
}

function sn_set_cookie(string $value, int $expires): void
{
    setcookie(SN_COOKIE, $value, [
        'expires' => $expires,
        'path' => sn_cookie_path(),
        'secure' => sn_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function sn_issue_cookie(array $state): void
{
    $generation = (int) $state['generation'];
    $issued = time();
    sn_set_cookie("$generation.$issued." . sn_sign($state, $generation, $issued), $issued + SN_COOKIE_TTL);
}

function sn_clear_cookie(): void
{
    sn_set_cookie('', time() - 3600);
}

/** Returns the cookie's issue time if valid, otherwise null. */
function sn_verify_cookie(array $state): ?int
{
    $token = isset($_COOKIE[SN_COOKIE]) ? (string) $_COOKIE[SN_COOKIE] : '';
    if (!preg_match('/^(\d{1,10})\.(\d{1,12})\.([0-9a-f]{64})$/', $token, $m)) {
        return null;
    }
    $generation = (int) $m[1];
    $issued = (int) $m[2];
    if ($generation !== (int) $state['generation'] || $issued > time() + 300) {
        return null;
    }
    return hash_equals(sn_sign($state, $generation, $issued), $m[3]) ? $issued : null;
}

function sn_json(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($body);
    exit;
}

/**
 * Gate for API endpoints. Ends the request with 401 unless the browser holds a
 * valid cookie; slides the cookie's expiry forward when it is over a day old.
 */
function sn_require_auth(): void
{
    try {
        $state = sn_auth_read();
    } catch (Throwable $e) {
        sn_json(500, ['status' => 'error', 'message' => sn_public_error($e)]);
    }
    if ($state === null) {
        sn_json(401, ['status' => 'error', 'auth' => 'setup', 'message' => 'No password has been set yet.']);
    }
    $issued = sn_verify_cookie($state);
    if ($issued === null) {
        sn_json(401, ['status' => 'error', 'auth' => 'login', 'message' => 'Sign-in required.']);
    }
    if (time() - $issued > SN_RENEW_AFTER) {
        sn_issue_cookie($state);
    }
    header('Cache-Control: no-store');
}

function sn_valid_new_password($password): ?string
{
    if (!is_string($password) || strlen($password) < SN_MIN_PASSWORD) {
        return 'Password must be at least ' . SN_MIN_PASSWORD . ' characters.';
    }
    if (strlen($password) > SN_MAX_PASSWORD) {
        return 'Password is too long.';
    }
    return null;
}

/**
 * Check a password against the stored hash with a global failed-attempt lockout.
 * Must be called inside sn_auth_locked(). Returns [ok, updatedState, retryAfter].
 */
function sn_check_password(array $state, $password): array
{
    $now = time();
    $lockedUntil = (int) ($state['locked_until'] ?? 0);
    if ($lockedUntil > $now) {
        return [false, $state, $lockedUntil - $now];
    }
    if (is_string($password) && strlen($password) <= SN_MAX_PASSWORD
        && password_verify($password, $state['password_hash'])) {
        $state['failures'] = 0;
        $state['locked_until'] = 0;
        if (password_needs_rehash($state['password_hash'], PASSWORD_DEFAULT)) {
            $state['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
        }
        return [true, $state, 0];
    }
    $failures = (int) ($state['failures'] ?? 0) + 1;
    $state['failures'] = $failures;
    if ($failures >= SN_FREE_ATTEMPTS) {
        $delay = (int) min(SN_MAX_LOCKOUT, 30 * (2 ** min(10, $failures - SN_FREE_ATTEMPTS)));
        $state['locked_until'] = $now + $delay;
    }
    return [false, $state, 0];
}
