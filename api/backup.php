<?php
error_reporting(0); // Prevent PHP warnings from corrupting the JSON response
ini_set('display_errors', 0);
header('Content-Type: application/json');

try {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    $path = isset($data['path']) ? trim($data['path']) : '';

    if (empty($path)) { echo json_encode(['status' => 'error', 'message' => 'Backup path is empty.']); exit; }
    
    $path = rtrim($path, '/\\') . DIRECTORY_SEPARATOR;
    if (!is_dir($path)) { @mkdir($path, 0755, true); }
    if (!is_dir($path) || !is_writable($path)) { echo json_encode(['status' => 'error', 'message' => 'Path is not writable. Check folder permissions (e.g., chmod 775 or 777).']); exit; }

    $source = __DIR__ . '/database.sqlite';
    if (!file_exists($source)) { echo json_encode(['status' => 'error', 'message' => 'No database found.']); exit; }

    $filename = 'notes_backup_' . date('Ymd_His') . '.sqlite';
    $destination = $path . $filename;

    if (@copy($source, $destination)) {
        $files = glob($path . 'notes_backup_*.sqlite');
        usort($files, function($a, $b) { return filemtime($b) - filemtime($a); });
        
        $now = time();
        $max_age = 30 * 24 * 3600; 
        $max_files = 30;
        
        foreach ($files as $index => $file) {
            if ($index >= $max_files || ($now - filemtime($file)) > $max_age) {
                @unlink($file);
            }
        }
        echo json_encode(['status' => 'success', 'message' => 'Backup created.', 'file' => $filename]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Permission denied. Could not copy file to destination.']);
    }
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>