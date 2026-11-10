<?php
require_once __DIR__ . '/auth.php';
sn_require_auth();
header('Content-Type: application/json');
$id = isset($_GET['id']) ?$_GET['id'] : '';
if (empty($id)) { echo json_encode([]); exit; }
try {
    $db = notes_db();
    $stmt =$db->prepare("SELECT id, content, created_at FROM revisions WHERE note_id = :note_id ORDER BY created_at DESC");
    $stmt->execute([':note_id' =>$id]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Throwable $e) { sn_public_error($e); http_response_code(500); echo json_encode([]); }
?>