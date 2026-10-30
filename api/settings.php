<?php
header('Content-Type: application/json');
$file = __DIR__ . '/settings.json';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    file_put_contents($file, $input);
    echo json_encode(['status' => 'success']);
} else {
    echo file_exists($file) ? file_get_contents($file) : json_encode(['backupPath' => '']);
}
?>