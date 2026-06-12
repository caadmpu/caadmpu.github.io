<?php
require_once __DIR__ . '/db.php';
requireAuth(); // Logged in

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'list' && isset($_GET['demanda_id'])) {
        $demanda_id = (int)$_GET['demanda_id'];
        $sql = "SELECT a.*, f.nome as funcionario_nome, s.nome as status_nome 
                FROM acoes a
                LEFT JOIN funcionarios f ON a.funcionario_id = f.id
                LEFT JOIN status_atendimento s ON a.status_id_momento = s.id
                WHERE a.demanda_id = ?
                ORDER BY a.data_acao ASC";
                
        $stmt = $db->prepare($sql);
        $stmt->execute([$demanda_id]);
        jsonResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
} 
elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'create') {
        requireAuth('editar_demandas');
        $sql = "INSERT INTO acoes (demanda_id, descricao, funcionario_id, status_id_momento)
                VALUES (?, ?, ?, ?)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            $data['demanda_id'],
            $data['descricao'] ?? '',
            $data['funcionario_id'] ?? null,
            $data['status_id_momento'] ?? null
        ]);
        
        // Atualizar status da demanda principal se houver mudanca solicitada
        if (!empty($data['status_id_momento'])) {
            $stmt = $db->prepare("UPDATE demandas SET status_id = ? WHERE id = ?");
            $stmt->execute([$data['status_id_momento'], $data['demanda_id']]);
        }
        
        jsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
    }
    elseif ($action === 'update') {
        requireAuth('editar_demandas');
        $sql = "UPDATE acoes SET descricao = ?, funcionario_id = ?, status_id_momento = ? WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            $data['descricao'] ?? '',
            $data['funcionario_id'] ?? null,
            $data['status_id_momento'] ?? null,
            $data['id']
        ]);
        jsonResponse(['success' => true]);
    }
    elseif ($action === 'delete') {
        requireAuth('excluir_demandas');
        $sql = "DELETE FROM acoes WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$data['id']]);
        jsonResponse(['success' => true]);
    }
}

jsonResponse(['error' => 'Invalid action'], 400);
