<?php
date_default_timezone_set('America/Manaus'); // Ajustar relógio para fuso horário de Manaus-AM

$db_file = __DIR__ . '/demandas.sqlite';
$needs_init = !file_exists($db_file);

try {
    $db = new PDO('sqlite:' . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    if ($needs_init) {
        $db->exec("
            CREATE TABLE IF NOT EXISTS setores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS escolas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                sigeam TEXT,
                inep TEXT
            );

            CREATE TABLE IF NOT EXISTS funcionarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cargo TEXT,
                funcao TEXT,
                matricula TEXT,
                portaria TEXT
            );

            CREATE TABLE IF NOT EXISTS demandantes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cargo TEXT,
                funcao TEXT,
                rg TEXT,
                cpf TEXT,
                matricula TEXT,
                endereco TEXT,
                contato TEXT
            );

            CREATE TABLE IF NOT EXISTS tipos_demanda (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS status_atendimento (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS demandas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero_registro INTEGER,
                descricao TEXT,
                demandante_id INTEGER,
                escola_id INTEGER,
                funcionario_id INTEGER,
                tipo_id INTEGER,
                status_id INTEGER,
                data_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
                processo_siged TEXT,
                arquivada INTEGER DEFAULT 0,
                FOREIGN KEY(demandante_id) REFERENCES demandantes(id),
                FOREIGN KEY(escola_id) REFERENCES escolas(id),
                FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
                FOREIGN KEY(tipo_id) REFERENCES tipos_demanda(id),
                FOREIGN KEY(status_id) REFERENCES status_atendimento(id)
            );

            CREATE TABLE IF NOT EXISTS acoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                demanda_id INTEGER,
                data_acao DATETIME DEFAULT CURRENT_TIMESTAMP,
                descricao TEXT,
                funcionario_id INTEGER,
                status_id_momento INTEGER,
                FOREIGN KEY(demanda_id) REFERENCES demandas(id),
                FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
                FOREIGN KEY(status_id_momento) REFERENCES status_atendimento(id)
            );
        ");

        $setores = ['Administrativo', 'Processos e Documentação', 'Alimentação Escolar', 'Manutenção', 'Logística', 'Lotação', 'Conselhos Financeiros'];
        $stmt = $db->prepare("INSERT INTO setores (nome) VALUES (?)");
        foreach ($setores as $setor) {
            $stmt->execute([$setor]);
        }

        $tipos = ['Elétrica', 'Hidráulica', 'Telhado', 'Forro', 'Poço Artesiano', 'Fossa Séptica'];
        $stmt = $db->prepare("INSERT INTO tipos_demanda (nome) VALUES (?)");
        foreach ($tipos as $tipo) {
            $stmt->execute([$tipo]);
        }

        $status = ['EM ANDAMENTO', 'FINALIZADA', 'ARQUIVADA', 'Não Resolvido', 'Não se aplica'];
        $stmt = $db->prepare("INSERT INTO status_atendimento (nome) VALUES (?)");
        foreach ($status as $s) {
            $stmt->execute([$s]);
        }

        $db->exec("INSERT INTO config (key, value) VALUES ('next_demanda_numero', '1')");
    }

} catch (PDOException $e) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// Utilitário para respostas JSON
function jsonResponse($data, $status = 200) {
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($data);
    exit;
}
?>
