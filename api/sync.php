<?php
header('Content-Type: application/json');
try {
    $db = new PDO('sqlite:' . __DIR__ . '/database.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);$db->exec("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0)"); 
    $db->exec("CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, note_id TEXT, content TEXT, created_at INTEGER)");
    $input = file_get_contents('php://input'); $data = json_decode($input, true);
    $server_timestamp = round(microtime(true) * 1000);$client_last_sync = isset($data['last_sync']) ? (int)$data['last_sync'] : 0;
    $db->beginTransaction();
    if (!empty($data['changes'])) {
        $stmtUpsert =$db->prepare("INSERT INTO notes (id, title, content, updated_at, deleted) VALUES (:id, :title, :content, :updated_at, :deleted) ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, updated_at = excluded.updated_at, deleted = excluded.deleted WHERE excluded.updated_at > notes.updated_at");
        foreach ($data['changes'] as$change) {
            if ($change['action'] === 'upsert' && isset($change['note'])) {
                $note = $change['note'];                // Revision Tracking
                $stmtCheck =$db->prepare("SELECT content FROM notes WHERE id = :id");
                $stmtCheck->execute([':id' => $note['id']]);
                $existing =$stmtCheck->fetchColumn();
                
                if ($existing !== false &&$existing !== $note['content']) {
                    $revId = bin2hex(random_bytes(8));
                    $stmtRev =$db->prepare("INSERT INTO revisions (id, note_id, content, created_at) VALUES (?, ?, ?, ?)");
                    $stmtRev->execute([$revId, $note['id'], $existing, round(microtime(true) * 1000)]);
                    
                    // Enforce max 10 revisions per note to prevent disk bloat
                    $stmtPrune =$db->prepare("DELETE FROM revisions WHERE note_id = ? AND id NOT IN (SELECT id FROM revisions WHERE note_id = ? ORDER BY created_at DESC LIMIT 10)");
                    $stmtPrune->execute([$note['id'], $note['id']]);
                }
                
                $stmtUpsert->execute([':id' => $note['id'], ':title' => $note['title'], ':content' => $note['content'], ':updated_at' => $note['updated_at'], ':deleted' => isset($note['deleted']) ? $note['deleted'] : 0]);
            }
        }
    }
    $db->commit();
    $stmtPull =$db->prepare("SELECT id, title, content, updated_at, deleted FROM notes WHERE updated_at > :last_sync");
    $stmtPull->execute([':last_sync' =>$client_last_sync]);
    $server_notes =$stmtPull->fetchAll(PDO::FETCH_ASSOC);
    foreach($server_notes as &$n) { $n['updated_at'] = (int)$n['updated_at']; $n['deleted'] = (int)$n['deleted']; }
    echo json_encode(["status" => "success", "server_timestamp" => $server_timestamp, "server_notes" => $server_notes]);
} catch (Exception $e) {
    if (isset($db) && $db->inTransaction())$db->rollBack();
    http_response_code(500); echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
