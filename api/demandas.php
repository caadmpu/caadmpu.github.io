<?php
require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'list') {
        $where = "d.arquivada = 0";
        if (isset($_GET['arquivadas']) && $_GET['arquivadas'] === '1') {
            $where = "d.arquivada = 1";
        }
        
        $sql = "SELECT d.*, 
                dem.nome as demandante_nome, 
                esc.nome as escola_nome, 
                fun.nome as funcionario_nome, 
                tip.nome as tipo_nome, 
                sta.nome as status_nome
                FROM demandas d
                LEFT JOIN demandantes dem ON d.demandante_id = dem.id
                LEFT JOIN escolas esc ON d.escola_id = esc.id
                LEFT JOIN funcionarios fun ON d.funcionario_id = fun.id
                LEFT JOIN tipos_demanda tip ON d.tipo_id = tip.id
                LEFT JOIN status_atendimento sta ON d.status_id = sta.id
                WHERE $where
                ORDER BY d.id DESC";
                
        $stmt = $db->query($sql);
        jsonResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    } 
    elseif ($action === 'kpi') {
        // Dashboard KPIs
        $kpi = [];
        
        $stmt = $db->query("SELECT COUNT(*) as total FROM demandas");
        $kpi['TOTAL_DEMANDAS'] = $stmt->fetch()['total'];
        
        $stmt = $db->query("SELECT COUNT(*) as total FROM demandas d JOIN status_atendimento s ON d.status_id = s.id WHERE s.nome = 'FINALIZADA'");
        $kpi['FINALIZADAS'] = $stmt->fetch()['total'];
        
        $stmt = $db->query("SELECT COUNT(*) as total FROM demandas d JOIN status_atendimento s ON d.status_id = s.id WHERE s.nome = 'EM ANDAMENTO'");
        $kpi['EM_ANDAMENTO'] = $stmt->fetch()['total'];
        
        $stmt = $db->query("SELECT COUNT(*) as total FROM demandas WHERE arquivada = 1");
        $kpi['ARQUIVADAS'] = $stmt->fetch()['total'];
        
        // Demandas por Status (Incluindo Arquivadas)
        $stmt = $db->query("
            SELECT s.nome as label, COUNT(d.id) as value 
            FROM status_atendimento s 
            LEFT JOIN demandas d ON d.status_id = s.id
            GROUP BY s.id
        ");
        $kpi['grafico_status'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Demandas por Tipo
        $stmt = $db->query("
            SELECT t.nome as label, COUNT(d.id) as value 
            FROM tipos_demanda t 
            LEFT JOIN demandas d ON d.tipo_id = t.id
            GROUP BY t.id
        ");
        $kpi['grafico_tipo'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        jsonResponse($kpi);
    }
} 
elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'create') {
        $stmt = $db->query("SELECT value FROM config WHERE key = 'next_demanda_numero'");
        $numero = (int)$stmt->fetch()['value'];
        
        $sql = "INSERT INTO demandas (numero_registro, descricao, demandante_id, escola_id, funcionario_id, tipo_id, status_id, processo_siged)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            $numero,
            $data['descricao'] ?? '',
            $data['demandante_id'] ?? null,
            $data['escola_id'] ?? null,
            $data['funcionario_id'] ?? null,
            $data['tipo_id'] ?? null,
            $data['status_id'] ?? null,
            $data['processo_siged'] ?? ''
        ]);
        
        // Atualiza numero
        $db->exec("UPDATE config SET value = value + 1 WHERE key = 'next_demanda_numero'");
        
        jsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
    }
    elseif ($action === 'update') {
        $sql = "UPDATE demandas SET 
                descricao = ?, demandante_id = ?, escola_id = ?, funcionario_id = ?, 
                tipo_id = ?, status_id = ?, processo_siged = ?
                WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            $data['descricao'] ?? '',
            $data['demandante_id'] ?? null,
            $data['escola_id'] ?? null,
            $data['funcionario_id'] ?? null,
            $data['tipo_id'] ?? null,
            $data['status_id'] ?? null,
            $data['processo_siged'] ?? '',
            $data['id']
        ]);
        jsonResponse(['success' => true]);
    }
    elseif ($action === 'update_status') { // Para o Kanban
        $sql = "UPDATE demandas SET status_id = ? WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$data['status_id'], $data['id']]);
        jsonResponse(['success' => true]);
    }
    elseif ($action === 'archive') {
        $sql = "UPDATE demandas SET arquivada = 1 WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$data['id']]);
        jsonResponse(['success' => true]);
    }
    elseif ($action === 'unarchive') {
        $sql = "UPDATE demandas SET arquivada = 0 WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$data['id']]);
        jsonResponse(['success' => true]);
    }
}

jsonResponse(['error' => 'Invalid action'], 400);
