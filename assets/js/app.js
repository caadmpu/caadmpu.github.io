// ==========================================
// CONFIGURAÇÃO DO FIREBASE (AÇÃO NECESSÁRIA)
// ==========================================
// Cole o firebaseConfig fornecido pelo Firebase Console aqui:
const firebaseConfig = {
    apiKey: "AIzaSyDPYJhmsmGuLQePcWGH11RSLopL5LEovOM",
    authDomain: "gestao-demandas-app.firebaseapp.com",
    projectId: "gestao-demandas-app",
    storageBucket: "gestao-demandas-app.firebasestorage.app",
    messagingSenderId: "764489719142",
    appId: "1:764489719142:web:da557215d9f0abc1f3bca7",
    measurementId: "G-TX5P8C0258"
};

// Inicializa Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

const app = {
    currentView: 'dashboard',
    charts: {},
    calendar: null,
    kanbanSortables: [],
    userDoc: null,

    init() {
        this.bindNav();
        this.startClock();
        
        // Modal events
        document.getElementById('globalModal').addEventListener('click', (e) => {
            if (e.target.id === 'globalModal') this.closeModal();
        });

        // Monitora o status de login via Firebase Auth
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Busca as permissões extras no Firestore
                const doc = await db.collection('usuarios').doc(user.uid).get();
                if(doc.exists) {
                    this.userDoc = { uid: user.uid, email: user.email, ...doc.data() };
                } else {
                    // Primeiro login via Google!
                    const newUserDoc = { 
                        login: user.displayName || user.email.split('@')[0],
                        email: user.email, 
                        role: 'COMUM', 
                        permissoes: {} 
                    };
                    await db.collection('usuarios').doc(user.uid).set(newUserDoc);
                    this.userDoc = { uid: user.uid, ...newUserDoc };
                }
                this.showApp();
            } else {
                this.userDoc = null;
                this.showLogin();
            }
        });
    },

    showLogin() {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('app-container').style.display = 'none';
    },

    showApp() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-container').style.display = 'flex';
        
        document.getElementById('user-name-display').innerText = this.userDoc.login || this.userDoc.email;
        document.getElementById('user-avatar-initial').innerText = (this.userDoc.login || this.userDoc.email).charAt(0).toUpperCase();
        
        if (this.userDoc.role === 'ADM') {
            document.getElementById('menu-usuarios').style.display = 'flex';
        } else {
            document.getElementById('menu-usuarios').style.display = 'none';
        }
        
        this.loadView(this.currentView);
    },

    async doLogin() {
        const email = document.getElementById('login_user').value;
        const pass = document.getElementById('login_pass').value;
        const errDiv = document.getElementById('login_error');
        errDiv.innerText = '';
        
        try {
            await auth.signInWithEmailAndPassword(email, pass);
            // onAuthStateChanged cuidará do redirecionamento
        } catch (error) {
            errDiv.innerText = "Erro: " + error.message;
        }
    },

    async doLoginGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        const errDiv = document.getElementById('login_error');
        errDiv.innerText = '';
        try {
            await auth.signInWithPopup(provider);
        } catch (error) {
            errDiv.innerText = "Erro: " + error.message;
        }
    },

    async doLogout() {
        await auth.signOut();
    },

    // Segurança Frontend (Opcional, pois as regras do Firestore devem ser configuradas depois)
    temPermissao(acao) {
        if (!this.userDoc) return false;
        if (this.userDoc.role === 'ADM') return true;
        return !!this.userDoc.permissoes[acao];
    },

    startClock() {
        setInterval(() => {
            const now = new Date();
            document.getElementById('clockDisplay').innerText = now.toLocaleTimeString('pt-BR');
        }, 1000);
    },

    bindNav() {
        const links = document.querySelectorAll('.sidebar-nav li');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                links.forEach(l => l.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                const view = target.getAttribute('data-view');
                this.loadView(view);
            });
        });
    },

    loadView(view) {
        // Bloqueia visão de usuários se não for ADM
        if (view === 'usuarios' && (!this.userDoc || this.userDoc.role !== 'ADM')) return;

        this.currentView = view;
        const container = document.getElementById('contentArea');
        const template = document.getElementById(`view-${view}`);
        container.innerHTML = template.innerHTML;

        const titles = {
            'dashboard': 'Dashboard',
            'demandas': 'Demandas',
            'kanban': 'Quadro Kanban',
            'calendario': 'Calendário de Ações',
            'cadastros': 'Cadastros Básicos',
            'usuarios': 'Gerenciamento de Usuários'
        };
        document.getElementById('page-title').innerText = titles[view] || view;

        if (view === 'dashboard') this.initDashboard();
        if (view === 'demandas') this.initDemandas();
        if (view === 'kanban') this.initKanban();
        if (view === 'calendario') this.initCalendario();
        if (view === 'cadastros') this.initCadastros();
        if (view === 'usuarios') this.initUsuarios();
    },

    // --- DASHBOARD ---
    async initDashboard() {
        const snap = await db.collection('demandas').get();
        const demandas = snap.docs.map(d => d.data());
        
        let finalizadas = 0, andamento = 0, arquivadas = 0;
        const statusCount = {};
        const tipoCount = {};

        demandas.forEach(d => {
            if (d.arquivada) arquivadas++;
            else {
                if (d.status_nome === 'FINALIZADA') finalizadas++;
                if (d.status_nome === 'EM ANDAMENTO') andamento++;
            }
            statusCount[d.status_nome] = (statusCount[d.status_nome] || 0) + 1;
            tipoCount[d.tipo_nome] = (tipoCount[d.tipo_nome] || 0) + 1;
        });

        document.getElementById('kpi-total').innerText = demandas.length;
        document.getElementById('kpi-finalizadas').innerText = finalizadas;
        document.getElementById('kpi-andamento').innerText = andamento;
        document.getElementById('kpi-arquivadas').innerText = arquivadas;

        const graficoStatus = Object.keys(statusCount).map(k => ({label: k || 'S/N', value: statusCount[k]}));
        const graficoTipo = Object.keys(tipoCount).map(k => ({label: k || 'S/N', value: tipoCount[k]}));

        this.renderChart('chartStatus', graficoStatus, 'bar');
        this.renderChart('chartTipo', graficoTipo, 'pie');
        
        document.getElementById('chart-status-type').addEventListener('change', (e) => {
            this.renderChart('chartStatus', graficoStatus, e.target.value);
        });
        document.getElementById('chart-tipo-type').addEventListener('change', (e) => {
            this.renderChart('chartTipo', graficoTipo, e.target.value);
        });
    },

    renderChart(canvasId, dataArr, type) {
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const ctx = document.getElementById(canvasId).getContext('2d');
        const labels = dataArr.map(d => d.label);
        const values = dataArr.map(d => d.value);
        
        this.charts[canvasId] = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade',
                    data: values,
                    backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#64748b', '#8b5cf6'],
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    },

    // --- DEMANDAS ---
    async initDemandas() {
        await this.loadFiltrosDemandas();
        this.carregarDemandas();
        
        document.getElementById('filter-search').addEventListener('input', () => this.filtrarTabelaDemandas());
        document.getElementById('filter-escola').addEventListener('change', () => this.filtrarTabelaDemandas());
        document.getElementById('filter-tipo').addEventListener('change', () => this.filtrarTabelaDemandas());
        document.getElementById('filter-status').addEventListener('change', () => this.filtrarTabelaDemandas());
        document.getElementById('filter-arquivadas').addEventListener('change', () => this.carregarDemandas());
    },

    async loadFiltrosDemandas() {
        const escolas = (await db.collection('escolas').get()).docs.map(d => d.data());
        const tipos = (await db.collection('tipos_demanda').get()).docs.map(d => d.data());
        const status = (await db.collection('status_atendimento').get()).docs.map(d => d.data());
        
        const selEscola = document.getElementById('filter-escola');
        const selTipo = document.getElementById('filter-tipo');
        const selStatus = document.getElementById('filter-status');
        
        escolas.forEach(e => selEscola.innerHTML += `<option value="${e.nome}">${e.nome}</option>`);
        tipos.forEach(t => selTipo.innerHTML += `<option value="${t.nome}">${t.nome}</option>`);
        status.forEach(s => selStatus.innerHTML += `<option value="${s.nome}">${s.nome}</option>`);
    },

    async carregarDemandas() {
        const showArchived = document.getElementById('filter-arquivadas').checked;
        const snap = await db.collection('demandas').where('arquivada', '==', showArchived).orderBy('data_registro', 'desc').get();
        window.todasDemandas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderTabelaDemandas(window.todasDemandas);
    },

    renderTabelaDemandas(demandas) {
        const tbody = document.getElementById('demandas-tbody');
        tbody.innerHTML = '';
        demandas.forEach(d => {
            const tr = document.createElement('tr');
            const cssStatus = d.status_nome ? d.status_nome.replace(/\s+/g, '-').toUpperCase() : '';
            tr.innerHTML = `
                <td>#${d.numero_registro || d.id.substring(0,5)}</td>
                <td>${d.data_registro || '-'}</td>
                <td>${d.demandante_nome || '-'}</td>
                <td>${d.escola_nome || '-'}</td>
                <td>${d.tipo_nome || '-'}</td>
                <td><span class="badge badge-${cssStatus}">${d.status_nome || '-'}</span></td>
                <td>${d.funcionario_nome || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="app.editarDemanda('${d.id}')"><i class="ri-edit-line"></i></button>
                    ${d.arquivada 
                        ? `<button class="btn btn-sm btn-secondary" onclick="app.desarquivarDemanda('${d.id}')"><i class="ri-inbox-unarchive-line"></i></button>`
                        : `<button class="btn btn-sm btn-secondary" onclick="app.arquivarDemanda('${d.id}')"><i class="ri-inbox-archive-line"></i></button>`
                    }
                    <button class="btn btn-sm btn-primary" onclick="app.verAcoes('${d.id}')"><i class="ri-history-line"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    filtrarTabelaDemandas() {
        const term = document.getElementById('filter-search').value.toLowerCase();
        const escola = document.getElementById('filter-escola').value;
        const tipo = document.getElementById('filter-tipo').value;
        const status = document.getElementById('filter-status').value;
        
        const filtradas = window.todasDemandas.filter(d => {
            const matchTerm = Object.values(d).join(' ').toLowerCase().includes(term);
            const matchEscola = escola ? d.escola_nome === escola : true;
            const matchTipo = tipo ? d.tipo_nome === tipo : true;
            const matchStatus = status ? d.status_nome === status : true;
            return matchTerm && matchEscola && matchTipo && matchStatus;
        });
        this.renderTabelaDemandas(filtradas);
    },

    exportExcel() {
        let csvContent = "data:text/csv;charset=utf-8,";
        const rows = window.todasDemandas;
        if(rows.length === 0) return alert('Sem dados para exportar');
        
        const header = Object.keys(rows[0]).join(";");
        csvContent += header + "\r\n";
        
        rows.forEach(row => {
            const values = Object.values(row).map(v => `"${(v||'').toString().replace(/"/g, '""')}"`);
            csvContent += values.join(";") + "\r\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "demandas.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    async arquivarDemanda(id) {
        if(!this.temPermissao('excluir_demandas')) return alert("Sem permissão");
        if(confirm('Arquivar esta demanda?')) {
            await db.collection('demandas').doc(id).update({ arquivada: true });
            this.carregarDemandas();
        }
    },
    
    async desarquivarDemanda(id) {
        if(!this.temPermissao('excluir_demandas')) return alert("Sem permissão");
        if(confirm('Desarquivar esta demanda?')) {
            await db.collection('demandas').doc(id).update({ arquivada: false });
            this.carregarDemandas();
        }
    },

    // Ações da Demanda
    async verAcoes(id) {
        const snap = await db.collection('acoes').where('demanda_id', '==', id).orderBy('data_acao', 'asc').get();
        const acoes = snap.docs.map(d => d.data());
        let html = `
            <div style="margin-bottom: 15px;">
                <button class="btn btn-sm btn-primary" onclick="app.novaAcao('${id}')"><i class="ri-add-line"></i> Nova Ação</button>
            </div>
            <table class="data-table">
                <thead><tr><th>Data</th><th>Descrição</th><th>Funcionário</th><th>Status Momento</th></tr></thead>
                <tbody>
        `;
        acoes.forEach(a => {
            html += `<tr>
                <td>${a.data_acao}</td>
                <td>${a.descricao}</td>
                <td>${a.funcionario_nome || ''}</td>
                <td>${a.status_nome || ''}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
        this.openModal('Histórico de Ações', html, []);
    },

    async novaAcao(demanda_id) {
        if(!this.temPermissao('editar_demandas')) return alert("Sem permissão");

        const funcSnap = await db.collection('funcionarios').get();
        const funcionarios = funcSnap.docs.map(d => ({id: d.id, ...d.data()}));
        const statSnap = await db.collection('status_atendimento').get();
        const status = statSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        const html = `
            <form id="acaoForm">
                <input type="hidden" name="demanda_id" value="${demanda_id}">
                <div class="form-group">
                    <label>Descrição da Ação</label>
                    <textarea class="form-control" name="descricao" rows="2" required></textarea>
                </div>
                <div class="form-group">
                    <label>Responsável (Funcionário)</label>
                    <select class="form-control" name="funcionario_nome">
                        <option value="">Selecione...</option>
                        ${funcionarios.map(x => `<option value="${x.nome}">${x.nome}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Mudar Status da Demanda para (Opcional)</label>
                    <select class="form-control" name="status_nome">
                        <option value="">Manter Status Atual</option>
                        ${status.map(x => `<option value="${x.nome}">${x.nome}</option>`).join('')}
                    </select>
                </div>
            </form>
        `;
        
        this.openModal('Registrar Ação', html, [
            { label: 'Salvar', class: 'btn-primary', action: async () => {
                const form = document.getElementById('acaoForm');
                if(!form.checkValidity()) return form.reportValidity();
                const fd = new FormData(form);
                
                await db.collection('acoes').add({
                    demanda_id: demanda_id,
                    descricao: fd.get('descricao'),
                    funcionario_nome: fd.get('funcionario_nome'),
                    status_nome: fd.get('status_nome'),
                    data_acao: new Date().toISOString().split('T')[0]
                });

                if (fd.get('status_nome')) {
                    await db.collection('demandas').doc(demanda_id).update({ status_nome: fd.get('status_nome') });
                }
                
                this.closeModal();
                this.verAcoes(demanda_id);
            } }
        ]);
    },

    // Nova Demanda
    async openModalDemanda() {
        if(!this.temPermissao('criar_demandas')) return alert("Sem permissão");

        const escolas = (await db.collection('escolas').get()).docs.map(d => d.data());
        const tipos = (await db.collection('tipos_demanda').get()).docs.map(d => d.data());
        const status = (await db.collection('status_atendimento').get()).docs.map(d => d.data());
        const func = (await db.collection('funcionarios').get()).docs.map(d => d.data());
        const dem = (await db.collection('demandantes').get()).docs.map(d => d.data());

        const html = `
            <form id="demandaForm">
                <div class="form-group">
                    <label>Descrição</label>
                    <textarea class="form-control" name="descricao" rows="3" required></textarea>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Demandante</label>
                        <select class="form-control" name="demandante_nome">
                            <option value="">Selecione...</option>
                            ${dem.map(x => `<option value="${x.nome}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Escola</label>
                        <select class="form-control" name="escola_nome">
                            <option value="">Selecione...</option>
                            ${escolas.map(x => `<option value="${x.nome}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tipo</label>
                        <select class="form-control" name="tipo_nome">
                            <option value="">Selecione...</option>
                            ${tipos.map(x => `<option value="${x.nome}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Status Inicial</label>
                        <select class="form-control" name="status_nome">
                            <option value="">Selecione...</option>
                            ${status.map(x => `<option value="${x.nome}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Responsável</label>
                        <select class="form-control" name="funcionario_nome">
                            <option value="">Selecione...</option>
                            ${func.map(x => `<option value="${x.nome}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Processo SIGED</label>
                        <input class="form-control" name="processo_siged">
                    </div>
                </div>
            </form>
        `;

        this.openModal('Nova Demanda', html, [
            { label: 'Salvar', class: 'btn-primary', action: () => this.salvarDemanda() }
        ]);
    },

    async salvarDemanda() {
        const form = document.getElementById('demandaForm');
        if(!form.checkValidity()) return form.reportValidity();
        const data = Object.fromEntries(new FormData(form));
        data.arquivada = false;
        data.data_registro = new Date().toISOString().split('T')[0];
        data.numero_registro = Math.floor(Math.random() * 90000) + 10000; // Mock ID

        await db.collection('demandas').add(data);
        this.closeModal();
        this.carregarDemandas();
    },

    editarDemanda(id) {
        if(!this.temPermissao('editar_demandas')) return alert("Sem permissão");
        alert('Edição: Na versão completa isso abrirá os detalhes.');
    },

    // --- KANBAN ---
    async initKanban() {
        const board = document.getElementById('kanbanBoard');
        board.innerHTML = '';
        this.kanbanSortables.forEach(s => s.destroy());
        this.kanbanSortables = [];

        const statusSnap = await db.collection('status_atendimento').get();
        const statusList = statusSnap.docs.map(d => d.data());

        const demSnap = await db.collection('demandas').where('arquivada', '==', false).get();
        const demandas = demSnap.docs.map(d => ({id: d.id, ...d.data()}));

        statusList.forEach(s => {
            const colDemandas = demandas.filter(d => d.status_nome == s.nome);
            const col = document.createElement('div');
            col.className = 'kanban-column';
            col.innerHTML = `
                <div class="kanban-header">${s.nome} <span>${colDemandas.length}</span></div>
                <div class="kanban-items" data-status="${s.nome}">
                    ${colDemandas.map(d => `
                        <div class="kanban-card" data-id="${d.id}">
                            <div class="kanban-card-title">#${d.numero_registro || d.id.substring(0,5)} - ${d.escola_nome || 'Sem escola'}</div>
                            <div class="kanban-card-meta">${d.tipo_nome || 'Sem tipo'}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            board.appendChild(col);
        });

        if(this.temPermissao('editar_demandas')) {
            document.querySelectorAll('.kanban-items').forEach(el => {
                this.kanbanSortables.push(new Sortable(el, {
                    group: 'kanban',
                    animation: 150,
                    onEnd: async (evt) => {
                        const itemEl = evt.item;
                        const toList = evt.to;
                        const newStatus = toList.getAttribute('data-status');
                        const demandaId = itemEl.getAttribute('data-id');
                        
                        await db.collection('demandas').doc(demandaId).update({ status_nome: newStatus });
                        this.initKanban(); // Recalcula totais
                    }
                }));
            });
        }
    },

    // --- CALENDÁRIO ---
    async initCalendario() {
        const container = document.getElementById('calendar-container');
        const snap = await db.collection('demandas').where('arquivada', '==', false).get();
        const demandas = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        const events = demandas.filter(d => d.data_registro).map(d => ({
            title: `#${d.numero_registro} ${d.escola_nome}`,
            start: d.data_registro,
            url: `javascript:app.editarDemanda('${d.id}')`
        }));

        this.calendar = new FullCalendar.Calendar(container, {
            initialView: 'dayGridMonth',
            locale: 'pt-br',
            events: events
        });
        this.calendar.render();
    },

    // --- CADASTROS BASE ---
    async initCadastros() {
        const tabs = document.querySelectorAll('#cadastros-tabs li');
        tabs.forEach(t => t.addEventListener('click', (e) => {
            tabs.forEach(li => li.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this.loadCadastroTable(e.currentTarget.getAttribute('data-table'));
        }));
        this.loadCadastroTable('escolas');
    },

    async loadCadastroTable(tabela) {
        window.currentCadastroTable = tabela;
        const snap = await db.collection(tabela).get();
        const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        const thead = document.getElementById('cadastro-thead');
        const tbody = document.getElementById('cadastro-tbody');
        thead.innerHTML = ''; tbody.innerHTML = '';
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td>Nenhum registro encontrado.</td></tr>';
            return;
        }

        const keys = Object.keys(data[0]).filter(k => k !== 'id');
        let ths = keys.map(k => `<th>${k}</th>`).join('');
        thead.innerHTML = `<tr>${ths}<th>Ações</th></tr>`;

        data.forEach(row => {
            let tds = keys.map(k => `<td>${row[k]}</td>`).join('');
            tbody.innerHTML += `<tr>${tds}<td>
                <button class="btn btn-sm btn-danger" onclick="app.deletarCadastro('${row.id}')"><i class="ri-delete-bin-line"></i></button>
            </td></tr>`;
        });
    },

    openModalCadastro() {
        if(!this.temPermissao('gerenciar_cadastros')) return alert("Sem permissão");
        const tabela = window.currentCadastroTable;
        let html = `<form id="cadastroForm">`;
        
        const fields = {
            'escolas': ['nome', 'sigeam', 'inep'],
            'funcionarios': ['nome', 'cargo', 'funcao', 'matricula', 'portaria'],
            'demandantes': ['nome', 'cargo', 'funcao', 'rg', 'cpf', 'matricula', 'endereco', 'contato'],
            'setores': ['nome'],
            'tipos_demanda': ['nome'],
            'status_atendimento': ['nome']
        };

        (fields[tabela] || ['nome']).forEach(f => {
            html += `<div class="form-group"><label>${f.toUpperCase()}</label><input class="form-control" name="${f}" required></div>`;
        });
        html += `</form>`;

        this.openModal('Novo Cadastro: ' + tabela, html, [
            { label: 'Salvar', class: 'btn-primary', action: () => this.salvarCadastro() }
        ]);
    },

    async salvarCadastro() {
        const form = document.getElementById('cadastroForm');
        if(!form.checkValidity()) return form.reportValidity();
        const data = Object.fromEntries(new FormData(form).entries());
        
        await db.collection(window.currentCadastroTable).add(data);
        this.closeModal();
        this.loadCadastroTable(window.currentCadastroTable);
    },

    async deletarCadastro(id) {
        if(!this.temPermissao('gerenciar_cadastros')) return alert("Sem permissão");
        if(confirm('Excluir este registro?')) {
            await db.collection(window.currentCadastroTable).doc(id).delete();
            this.loadCadastroTable(window.currentCadastroTable);
        }
    },

    // --- USUARIOS (ADM) ---
    async initUsuarios() {
        const tbody = document.getElementById('usuarios-tbody');
        tbody.innerHTML = '';
        const snap = await db.collection('usuarios').get();
        const usuarios = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        usuarios.forEach(u => {
            const btnExcluir = u.login === 'admin' ? '' : `<button class="btn btn-sm btn-danger" onclick="app.deletarUsuario('${u.id}')"><i class="ri-delete-bin-line"></i></button>`;
            
            let badges = '';
            if (u.role === 'ADM') badges = '<span class="badge badge-FINALIZADA">Acesso Total</span>';
            else {
                const p = u.permissoes || {};
                if(p.criar_demandas) badges += '<span class="badge" style="background:#e2e8f0; color:#333;">Criar</span> ';
                if(p.editar_demandas) badges += '<span class="badge" style="background:#e2e8f0; color:#333;">Editar</span> ';
                if(p.excluir_demandas) badges += '<span class="badge" style="background:#e2e8f0; color:#333;">Excluir</span> ';
                if(p.gerenciar_cadastros) badges += '<span class="badge" style="background:#e2e8f0; color:#333;">Cadastros</span> ';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id.substring(0,5)}...</td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td>${badges}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick='app.editarUsuario(${JSON.stringify(u)})'><i class="ri-edit-line"></i></button>
                    ${btnExcluir}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openModalUsuario(u = null) {
        const isEdit = !!u;
        const html = `
            <form id="userForm">
                ${isEdit ? `<input type="hidden" name="id" value="${u.id}">` : ''}
                <div class="form-group">
                    <label>E-mail</label>
                    <input type="email" class="form-control" name="email" value="${u ? u.email : ''}" ${isEdit ? 'readonly' : 'required'}>
                </div>
                <div class="form-group">
                    <label>${isEdit ? 'Nova Senha (o usuário deve redefinir pelo Firebase)' : 'Senha Inicial'}</label>
                    <input type="password" class="form-control" name="senha" ${!isEdit ? 'required' : 'disabled'}>
                </div>
                <div class="form-group">
                    <label>Perfil</label>
                    <select class="form-control" name="role" id="roleSelect" onchange="document.getElementById('permissoesBox').style.display = this.value === 'COMUM' ? 'block' : 'none'">
                        <option value="COMUM" ${u && u.role === 'COMUM' ? 'selected' : ''}>Comum</option>
                        <option value="ADM" ${u && u.role === 'ADM' ? 'selected' : ''}>Administrador</option>
                    </select>
                </div>
                <div id="permissoesBox" style="display: ${!u || u.role === 'COMUM' ? 'block' : 'none'}; background: var(--background); padding: 15px; border-radius: var(--radius-md);">
                    <strong>Permissões Específicas (Para perfil comum)</strong><br><br>
                    <label><input type="checkbox" name="perm_criar" value="1" ${u && u.permissoes && u.permissoes.criar_demandas ? 'checked' : ''}> Pode Criar Demandas</label><br>
                    <label><input type="checkbox" name="perm_editar" value="1" ${u && u.permissoes && u.permissoes.editar_demandas ? 'checked' : ''}> Pode Editar Demandas e Ações</label><br>
                    <label><input type="checkbox" name="perm_excluir" value="1" ${u && u.permissoes && u.permissoes.excluir_demandas ? 'checked' : ''}> Pode Excluir e Arquivar Demandas</label><br>
                    <label><input type="checkbox" name="perm_cadastros" value="1" ${u && u.permissoes && u.permissoes.gerenciar_cadastros ? 'checked' : ''}> Pode Gerenciar Cadastros Base</label>
                </div>
            </form>
        `;

        this.openModal(isEdit ? 'Editar Permissões' : 'Novo Usuário', html, [
            { label: 'Salvar', class: 'btn-primary', action: () => this.salvarUsuario(isEdit) }
        ]);
    },

    editarUsuario(u) {
        this.openModalUsuario(u);
    },

    async salvarUsuario(isEdit) {
        const form = document.getElementById('userForm');
        if(!form.checkValidity()) return form.reportValidity();
        
        const fd = new FormData(form);
        const role = fd.get('role');
        const email = fd.get('email');
        const permissoes = {
            criar_demandas: !!fd.get('perm_criar'),
            editar_demandas: !!fd.get('perm_editar'),
            excluir_demandas: !!fd.get('perm_excluir'),
            gerenciar_cadastros: !!fd.get('perm_cadastros')
        };

        if(isEdit) {
            const id = fd.get('id');
            await db.collection('usuarios').doc(id).update({ role, permissoes });
            this.closeModal();
            this.initUsuarios();
        } else {
            const senha = fd.get('senha');
            try {
                // Cria uma app Firebase secundária para não deslogar o ADM
                const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
                const res = await secondaryApp.auth().createUserWithEmailAndPassword(email, senha);
                
                await db.collection('usuarios').doc(res.user.uid).set({
                    login: email.split('@')[0],
                    email: email,
                    role: role,
                    permissoes: permissoes
                });
                
                secondaryApp.auth().signOut();
                secondaryApp.delete();

                this.closeModal();
                this.initUsuarios();
            } catch (e) {
                alert("Erro ao criar usuário: " + e.message);
            }
        }
    },

    async deletarUsuario(id) {
        if(confirm('Remover acesso deste usuário?')) {
            await db.collection('usuarios').doc(id).delete();
            this.initUsuarios();
        }
    },

    // --- SETUP INICIAL FIREBASE ---
    async setupFirebaseBase() {
        try {
            // Cria os status padrões
            const statusList = ['EM ANDAMENTO', 'FINALIZADA', 'ARQUIVADA', 'Não Resolvido', 'Não se aplica'];
            for(let s of statusList) { await db.collection('status_atendimento').add({ nome: s }); }
            
            // Cria tipos padrões
            const tiposList = ['Elétrica', 'Hidráulica', 'Telhado', 'Forro', 'Poço Artesiano', 'Fossa Séptica'];
            for(let t of tiposList) { await db.collection('tipos_demanda').add({ nome: t }); }
            
            // Cria conta Admin Inicial via Auth
            // IMPORTANTE: Isso registrará admin@admin.com com a senha admin123
            const cred = await auth.createUserWithEmailAndPassword('admin@admin.com', 'admin123');
            
            // Grava documento do admin
            await db.collection('usuarios').doc(cred.user.uid).set({
                login: 'admin',
                email: 'admin@admin.com',
                role: 'ADM',
                permissoes: {}
            });

            alert('Banco e Admin mestre configurados com sucesso! Entre usando email admin@admin.com e senha admin123');
        } catch(e) {
            alert('Erro no setup: ' + e.message);
        }
    },

    // --- MODAL BASE ---
    openModal(title, html, buttons = []) {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalBody').innerHTML = html;
        const footer = document.getElementById('modalFooter');
        footer.innerHTML = '';
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.className = `btn ${b.class}`;
            btn.innerText = b.label;
            btn.onclick = b.action;
            footer.appendChild(btn);
        });
        document.getElementById('globalModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('globalModal').classList.remove('active');
    }
};

window.onload = () => app.init();
