<?php
/**
 * Shared database access. The database location comes from config.php.
 */

function notes_db_path(): string
{
    static $path = null;
    if ($path === null) {
        $config = require __DIR__ . '/config.php';
        $path = (string) $config['db_path'];
    }
    return $path;
}

function notes_db(): PDO
{
    $path = notes_db_path();
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        // Deliberately generic: don't leak server paths to clients.
        throw new RuntimeException('Database directory does not exist and could not be created.');
    }

    $db = new PDO('sqlite:' . $path);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0)");
    $db->exec("CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, note_id TEXT, content TEXT, created_at INTEGER)");
    return $db;
}
