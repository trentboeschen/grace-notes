<?php
/**
 * Auth endpoint.
 *   GET                                   -> {configured, authenticated}
 *   POST {action:"setup", password}       -> first-visit only: set password, sign in
 *   POST {action:"login", password}       -> sign in this browser
 *   POST {action:"logout"}                -> sign out this browser
 *   POST {action:"logout_others"}         -> (signed in) invalidate every other browser
 *   POST {action:"change_password", password, new_password}
 *                                         -> (signed in) change password, sign out others
 */
require_once __DIR__ . '/auth.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $state = gn_auth_read();
        gn_json(200, [
            'configured' => $state !== null,
            'authenticated' => $state !== null && gn_verify_cookie($state) !== null,
        ]);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        gn_json(405, ['status' => 'error', 'message' => 'Method not allowed.']);
    }

    $input = json_decode((string) file_get_contents('php://input'), true);
    $action = is_array($input) && isset($input['action']) ? (string) $input['action'] : '';
    $password = $input['password'] ?? null;

    switch ($action) {
        case 'setup':
            if ($error = gn_valid_new_password($password)) {
                gn_json(400, ['status' => 'error', 'message' => $error]);
            }
            $state = gn_auth_locked(function () use ($password) {
                if (gn_auth_read() !== null) {
                    return null;
                }
                $state = [
                    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                    'secret' => bin2hex(random_bytes(32)),
                    'generation' => 1,
                    'failures' => 0,
                    'locked_until' => 0,
                ];
                gn_auth_write($state);
                return $state;
            });
            if ($state === null) {
                gn_json(409, ['status' => 'error', 'auth' => 'login', 'message' => 'A password has already been set.']);
            }
            gn_issue_cookie($state);
            gn_json(200, ['status' => 'success']);

        case 'login':
            $result = gn_auth_locked(function () use ($password) {
                $state = gn_auth_read();
                if ($state === null) {
                    return ['setup'];
                }
                [$ok, $newState, $retryAfter] = gn_check_password($state, $password);
                if ($newState !== $state) {
                    gn_auth_write($newState);
                }
                return [$ok ? 'ok' : 'fail', $newState, $retryAfter];
            });
            if ($result[0] === 'setup') {
                gn_json(409, ['status' => 'error', 'auth' => 'setup', 'message' => 'No password has been set yet.']);
            }
            if ($result[0] === 'fail') {
                if ($result[2] > 0) {
                    header('Retry-After: ' . $result[2]);
                    gn_json(429, ['status' => 'error', 'message' => 'Too many failed attempts. Try again in ' . ceil($result[2] / 60) . ' minute(s).']);
                }
                gn_json(401, ['status' => 'error', 'auth' => 'login', 'message' => 'Incorrect password.']);
            }
            gn_issue_cookie($result[1]);
            gn_json(200, ['status' => 'success']);

        case 'logout':
            gn_clear_cookie();
            gn_json(200, ['status' => 'success']);

        case 'logout_others':
            gn_require_auth();
            $state = gn_auth_locked(function () {
                $state = gn_auth_read();
                $state['generation'] = (int) $state['generation'] + 1;
                gn_auth_write($state);
                return $state;
            });
            gn_issue_cookie($state);
            gn_json(200, ['status' => 'success']);

        case 'change_password':
            gn_require_auth();
            $newPassword = $input['new_password'] ?? null;
            if ($error = gn_valid_new_password($newPassword)) {
                gn_json(400, ['status' => 'error', 'message' => $error]);
            }
            $result = gn_auth_locked(function () use ($password, $newPassword) {
                [$ok, $state, $retryAfter] = gn_check_password(gn_auth_read(), $password);
                if ($ok) {
                    $state['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
                    $state['generation'] = (int) $state['generation'] + 1;
                }
                gn_auth_write($state);
                return [$ok, $state, $retryAfter];
            });
            if (!$result[0]) {
                $message = $result[2] > 0 ? 'Too many failed attempts. Try again later.' : 'Current password is incorrect.';
                gn_json($result[2] > 0 ? 429 : 403, ['status' => 'error', 'message' => $message]);
            }
            gn_issue_cookie($result[1]);
            gn_json(200, ['status' => 'success']);

        default:
            gn_json(400, ['status' => 'error', 'message' => 'Unknown action.']);
    }
} catch (Throwable $e) {
    gn_json(500, ['status' => 'error', 'message' => gn_public_error($e)]);
}
