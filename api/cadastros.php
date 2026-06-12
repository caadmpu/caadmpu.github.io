<?php
require_once __DIR__ . '/db.php';
requireAuth(); // Logged in

$action = $_GET['action'] ?? '';
$tabela = $_GET['tabela'] ?? '';

// Tabelas permitidas para evitar SQL Injection
$tabelasPermitidas = [
    'escolas', 
    'funcionarios', 
    'demandantes', 
    'setores', 
    'tipos_demanda', 
    'status_atendimento'
];

if (!in_array($tabela, $tabelasPermitidas)) {
    jsonResponse(['error' => 'Invalid table'], 400);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'list') {
        $stmt = $db->query("SELECT * FROM $tabela ORDER BY id DESC");
        jsonResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
} 
elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'create') {
        requireAuth('gerenciar_cadastros');
        // Obter as chaves do array $data para criar a query dinamicamente
        $columns = implode(", ", array_keys($data));
        $placeholders = implode(", ", array_fill(0, count($data), "?"));
        $values = array_values($data);
        
        $sql = "INSERT INTO $tabela ($columns) VALUES ($placeholders)";
        $stmt = $db->prepare($sql);
        $stmt->execute($values);
        
        jsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
    }
    elseif ($action === 'update') {
        requireAuth('gerenciar_cadastros');
        $id = $data['id'];
        unset($data['id']);
        
        $setClause = [];
        $values = [];
        foreach ($data as $key => $value) {
            $setClause[] = "$key = ?";
            $values[] = $value;
        }
        $setClauseStr = implode(", ", $setClause);
        $values[] = $id;
        
        $sql = "UPDATE $tabela SET $setClauseStr WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute($values);
        
        jsonResponse(['success' => true]);
    }
    elseif ($action === 'delete') {
        requireAuth('gerenciar_cadastros');
        $sql = "DELETE FROM $tabela WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$data['id']]);
        jsonResponse(['success' => true]);
    }
}

jsonResponse(['error' => 'Invalid action'], 400);
