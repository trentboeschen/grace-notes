<?php
require_once __DIR__ . '/auth.php';
gn_require_auth();
header('Content-Type: application/json');
$file = __DIR__ . '/settings.json';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode((string) file_get_contents('php://input'), true);
    $backupPath = is_array($data) && isset($data['backupPath']) && is_string($data['backupPath']) ? trim($data['backupPath']) : '';
    if (@file_put_contents($file, json_encode(['backupPath' => $backupPath], JSON_UNESCAPED_SLASHES), LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Could not save settings. Check folder permissions.']);
    } else {
        echo json_encode(['status' => 'success']);
    }
} else {
    echo file_exists($file) ? file_get_contents($file) : json_encode(['backupPath' => '']);
}
