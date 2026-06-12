<?php
require_once __DIR__ . '/db.php';
requireAuth();

// Apenas ADM pode gerenciar usuários
if ($_SESSION['user_role'] !== 'ADM') {
    jsonResponse(['error' => 'Acesso Restrito ao Administrador'], 403);
}

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'list') {
        $stmt = $db->query("SELECT id, login, role, permissoes FROM usuarios ORDER BY id ASC");
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($users as &$u) {
            $u['permissoes'] = json_decode($u['permissoes'], true) ?? [];
        }
        jsonResponse($users);
    }
} 
elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'create') {
        $login = $data['login'];
        $senha = password_hash($data['senha'], PASSWORD_DEFAULT);
        $role = $data['role'] ?? 'COMUM';
        $permissoes = json_encode($data['permissoes'] ?? []);
        
        try {
            $sql = "INSERT INTO usuarios (login, senha_hash, role, permissoes) VALUES (?, ?, ?, ?)";
            $stmt = $db->prepare($sql);
            $stmt->execute([$login, $senha, $role, $permissoes]);
            jsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
        } catch (PDOException $e) {
            jsonResponse(['error' => 'Usuário já existe ou erro no banco'], 400);
        }
    }
    elseif ($action === 'update') {
        $id = $data['id'];
        $login = $data['login'];
        $role = $data['role'] ?? 'COMUM';
        $permissoes = json_encode($data['permissoes'] ?? []);
        
        if (!empty($data['senha'])) {
            $senha = password_hash($data['senha'], PASSWORD_DEFAULT);
            $sql = "UPDATE usuarios SET login = ?, senha_hash = ?, role = ?, permissoes = ? WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute([$login, $senha, $role, $permissoes, $id]);
        } else {
            $sql = "UPDATE usuarios SET login = ?, role = ?, permissoes = ? WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute([$login, $role, $permissoes, $id]);
        }
        
        jsonResponse(['success' => true]);
    }
    elseif ($action === 'delete') {
        // Impedir que o admin delete a si mesmo acidentalmente
        if ($data['id'] == $_SESSION['user_id']) {
            jsonResponse(['error' => 'Você não pode excluir a si mesmo'], 400);
        }
        
        $sql = "DELETE FROM usuarios WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$data['id']]);
        jsonResponse(['success' => true]);
    }
}

jsonResponse(['error' => 'Invalid action'], 400);
