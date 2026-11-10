<?php
/**
 * Shared config and database access. Locations come from config.php.
 */

function gn_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

/** Create a private directory if needed. Deliberately generic errors: don't leak server paths. */
function gn_ensure_dir(string $dir): void
{
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        throw new RuntimeException('Data directory does not exist and could not be created.');
    }
}

function notes_db_path(): string
{
    return (string) gn_config()['db_path'];
}

function notes_db(): PDO
{
    $path = notes_db_path();
    gn_ensure_dir(dirname($path));

    $db = new PDO('sqlite:' . $path);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0)");
    $db->exec("CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, note_id TEXT, content TEXT, created_at INTEGER)");
    return $db;
}
