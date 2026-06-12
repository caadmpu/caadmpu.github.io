<?php
require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    
    if ($action === 'login') {
        $login = $data['login'] ?? '';
        $senha = $data['senha'] ?? '';
        
        $stmt = $db->prepare("SELECT * FROM usuarios WHERE login = ?");
        $stmt->execute([$login]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user && password_verify($senha, $user['senha_hash'])) {
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_login'] = $user['login'];
            $_SESSION['user_role'] = $user['role'];
            $_SESSION['user_permissoes'] = json_decode($user['permissoes'], true) ?? [];
            
            jsonResponse([
                'success' => true, 
                'role' => $user['role'], 
                'permissoes' => $_SESSION['user_permissoes']
            ]);
        } else {
            jsonResponse(['error' => 'Usuário ou senha incorretos'], 401);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'logout') {
        session_destroy();
        jsonResponse(['success' => true]);
    }
    elseif ($action === 'check') {
        if (isset($_SESSION['user_id'])) {
            jsonResponse([
                'logged_in' => true,
                'login' => $_SESSION['user_login'],
                'role' => $_SESSION['user_role'],
                'permissoes' => $_SESSION['user_permissoes']
            ]);
        } else {
            jsonResponse(['logged_in' => false], 401);
        }
    }
}

jsonResponse(['error' => 'Invalid action'], 400);
