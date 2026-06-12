// Construir a URL base dinamicamente para funcionar em qualquer subpasta (com ou sem barra no final)
let basePath = window.location.pathname;
if (basePath.endsWith('index.html')) {
    basePath = basePath.replace('index.html', '');
} else if (!basePath.endsWith('/')) {
    basePath += '/';
}
const API_URL = window.location.origin + basePath + 'api/';
const app = {
    currentView: 'dashboard',
    charts: {},
    calendar: null,
    kanbanSortables: [],
    user: null,

    async init() {
        this.bindNav();
        this.startClock();
        
        // Modal events
        document.getElementById('globalModal').addEventListener('click', (e) => {
            if (e.target.id === 'globalModal') this.closeModal();
        });

        await this.checkSession();
    },

    async checkSession() {
        const res = await fetch(API_URL + 'auth.php?action=check');
        if (res.ok) {
            this.user = await res.json();
            this.showApp();
        } else {
            this.showLogin();
        }
    },

    showLogin() {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('app-container').style.display = 'none';
    },

    showApp() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-container').style.display = 'block';
        
        document.getElementById('user-name-display').innerText = this.user.login;
        document.getElementById('user-avatar-initial').innerText = this.user.login.charAt(0).toUpperCase();
        
        if (this.user.role === 'ADM') {
            document.getElementById('menu-usuarios').style.display = 'flex';
        } else {
            document.getElementById('menu-usuarios').style.display = 'none';
        }
        
        this.loadView(this.currentView);
    },

    async doLogin() {
        const login = document.getElementById('login_user').value;
        const pass = document.getElementById('login_pass').value;
        const errDiv = document.getElementById('login_error');
        errDiv.innerText = '';
        
        try {
            const res = await fetch(API_URL + 'auth.php?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: login, senha: pass })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                this.checkSession();
            } else {
                errDiv.innerText = data.error || 'Erro ao logar';
            }
        } catch (e) {
            errDiv.innerText = 'Erro de comunicação';
        }
    },

    async doLogout() {
        await fetch(API_URL + 'auth.php?action=logout');
        this.user = null;
        this.showLogin();
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

    async request(endpoint, method = 'GET', data = null) {
        const options = { method };
        if (data) {
            options.body = JSON.stringify(data);
            options.headers = { 'Content-Type': 'application/json' };
        }
        try {
            const res = await fetch(API_URL + endpoint, options);
            if (res.status === 401) {
                this.showLogin();
                throw new Error('Não autenticado');
            }
            const resData = await res.json();
            if (!res.ok) {
                alert(resData.error || 'Erro na operação');
                throw new Error(resData.error);
            }
            return resData;
        } catch (err) {
            console.error(err);
            return null;
        }
    },

    loadView(view) {
        this.currentView = view;
        const container = document.getElementById('contentArea');
        const template = document.getElementById(`view-${view}`);
        container.innerHTML = template.innerHTML;

        const titles = {
            'dashboard': 'Dashboard',
            'demandas': 'Demandas',
            'kanban': 'Quadro Kanban',
            'calendario': 'Calendário de Ações',
            'cadastros': 'Cadastros Básicos'
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
        const data = await this.request('demandas.php?action=kpi');
        if (!data) return;

        document.getElementById('kpi-total').innerText = data.TOTAL_DEMANDAS;
        document.getElementById('kpi-finalizadas').innerText = data.FINALIZADAS;
        document.getElementById('kpi-andamento').innerText = data.EM_ANDAMENTO;
        document.getElementById('kpi-arquivadas').innerText = data.ARQUIVADAS;

        this.renderChart('chartStatus', data.grafico_status, 'bar');
        this.renderChart('chartTipo', data.grafico_tipo, 'pie');
        
        document.getElementById('chart-status-type').addEventListener('change', (e) => {
            this.renderChart('chartStatus', data.grafico_status, e.target.value);
        });
        document.getElementById('chart-tipo-type').addEventListener('change', (e) => {
            this.renderChart('chartTipo', data.grafico_tipo, e.target.value);
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
        const escolas = await this.request('cadastros.php?tabela=escolas&action=list');
        const tipos = await this.request('cadastros.php?tabela=tipos_demanda&action=list');
        const status = await this.request('cadastros.php?tabela=status_atendimento&action=list');
        
        const selEscola = document.getElementById('filter-escola');
        const selTipo = document.getElementById('filter-tipo');
        const selStatus = document.getElementById('filter-status');
        
        escolas.forEach(e => selEscola.innerHTML += `<option value="${e.nome}">${e.nome}</option>`);
        tipos.forEach(t => selTipo.innerHTML += `<option value="${t.nome}">${t.nome}</option>`);
        status.forEach(s => selStatus.innerHTML += `<option value="${s.nome}">${s.nome}</option>`);
    },

    async carregarDemandas() {
        const showArchived = document.getElementById('filter-arquivadas').checked ? '1' : '0';
        const demandas = await this.request(`demandas.php?action=list&arquivadas=${showArchived}`);
        window.todasDemandas = demandas; // Cache for filtering
        this.renderTabelaDemandas(demandas);
    },

    renderTabelaDemandas(demandas) {
        const tbody = document.getElementById('demandas-tbody');
        tbody.innerHTML = '';
        demandas.forEach(d => {
            const tr = document.createElement('tr');
            const cssStatus = d.status_nome ? d.status_nome.replace(/\s+/g, '-').toUpperCase() : '';
            tr.innerHTML = `
                <td>#${d.numero_registro || d.id}</td>
                <td>${d.data_registro.split(' ')[0]}</td>
                <td>${d.demandante_nome || '-'}</td>
                <td>${d.escola_nome || '-'}</td>
                <td>${d.tipo_nome || '-'}</td>
                <td><span class="badge badge-${cssStatus}">${d.status_nome || '-'}</span></td>
                <td>${d.funcionario_nome || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="app.editarDemanda(${d.id})"><i class="ri-edit-line"></i></button>
                    ${d.arquivada == 1 
                        ? `<button class="btn btn-sm btn-secondary" onclick="app.desarquivarDemanda(${d.id})"><i class="ri-inbox-unarchive-line"></i></button>`
                        : `<button class="btn btn-sm btn-secondary" onclick="app.arquivarDemanda(${d.id})"><i class="ri-inbox-archive-line"></i></button>`
                    }
                    <button class="btn btn-sm btn-primary" onclick="app.verAcoes(${d.id})"><i class="ri-history-line"></i></button>
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
        if(confirm('Arquivar esta demanda?')) {
            await this.request('demandas.php?action=archive', 'POST', {id});
            this.carregarDemandas();
        }
    },
    
    async desarquivarDemanda(id) {
        if(confirm('Desarquivar esta demanda?')) {
            await this.request('demandas.php?action=unarchive', 'POST', {id});
            this.carregarDemandas();
        }
    },

    async verAcoes(id) {
        const acoes = await this.request(`acoes.php?action=list&demanda_id=${id}`);
        let html = `
            <div style="margin-bottom: 15px;">
                <button class="btn btn-sm btn-primary" onclick="app.novaAcao(${id})"><i class="ri-add-line"></i> Nova Ação</button>
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
        this.openModal('Histórico de Ações (Demanda #' + id + ')', html, []);
    },

    // --- KANBAN ---
    async initKanban() {
        const board = document.getElementById('kanbanBoard');
        board.innerHTML = '';
        this.kanbanSortables.forEach(s => s.destroy());
        this.kanbanSortables = [];

        const statusList = await this.request('cadastros.php?tabela=status_atendimento&action=list');
        const demandas = await this.request('demandas.php?action=list&arquivadas=0');

        statusList.forEach(s => {
            const colDemandas = demandas.filter(d => d.status_id == s.id);
            const col = document.createElement('div');
            col.className = 'kanban-column';
            col.innerHTML = `
                <div class="kanban-header">${s.nome} <span>${colDemandas.length}</span></div>
                <div class="kanban-items" data-status-id="${s.id}">
                    ${colDemandas.map(d => `
                        <div class="kanban-card" data-id="${d.id}">
                            <div class="kanban-card-title">#${d.numero_registro || d.id} - ${d.escola_nome || 'Sem escola'}</div>
                            <div class="kanban-card-meta">${d.tipo_nome || 'Sem tipo'}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            board.appendChild(col);
        });

        // Initialize Sortable
        document.querySelectorAll('.kanban-items').forEach(el => {
            this.kanbanSortables.push(new Sortable(el, {
                group: 'kanban',
                animation: 150,
                onEnd: async (evt) => {
                    const itemEl = evt.item;
                    const toList = evt.to;
                    const newStatusId = toList.getAttribute('data-status-id');
                    const demandaId = itemEl.getAttribute('data-id');
                    
                    await this.request('demandas.php?action=update_status', 'POST', {
                        id: demandaId,
                        status_id: newStatusId
                    });
                    this.initKanban(); // Reload counts
                }
            }));
        });
    },

    // --- CALENDÁRIO ---
    async initCalendario() {
        const container = document.getElementById('calendar-container');
        const acoes = await this.request('acoes.php?action=list_all'); // Precisaria criar endpoint list_all, simplificando:
        // Como o prompt pede calendario de manutenções, usamos a data_registro ou ações.
        const demandas = await this.request('demandas.php?action=list&arquivadas=0');
        
        const events = demandas.map(d => ({
            title: `#${d.numero_registro} ${d.escola_nome}`,
            start: d.data_registro.split(' ')[0],
            url: `javascript:app.editarDemanda(${d.id})`
        }));

        this.calendar = new FullCalendar.Calendar(container, {
            initialView: 'dayGridMonth',
            locale: 'pt-br',
            events: events
        });
        this.calendar.render();
    },

    // --- CADASTROS ---
    async initCadastros() {
        const tabs = document.querySelectorAll('#cadastros-tabs li');
        tabs.forEach(t => t.addEventListener('click', (e) => {
            tabs.forEach(li => li.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this.loadCadastroTable(e.currentTarget.getAttribute('data-table'));
        }));
        this.loadCadastroTable('escolas'); // Default
    },

    async loadCadastroTable(tabela) {
        window.currentCadastroTable = tabela;
        const data = await this.request(`cadastros.php?tabela=${tabela}&action=list`);
        
        const thead = document.getElementById('cadastro-thead');
        const tbody = document.getElementById('cadastro-tbody');
        thead.innerHTML = ''; tbody.innerHTML = '';
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td>Nenhum registro encontrado.</td></tr>';
            return;
        }

        const keys = Object.keys(data[0]);
        let ths = keys.map(k => `<th>${k}</th>`).join('');
        thead.innerHTML = `<tr>${ths}<th>Ações</th></tr>`;

        data.forEach(row => {
            let tds = keys.map(k => `<td>${row[k]}</td>`).join('');
            tbody.innerHTML += `<tr>${tds}<td>
                <button class="btn btn-sm btn-danger" onclick="app.deletarCadastro(${row.id})"><i class="ri-delete-bin-line"></i></button>
            </td></tr>`;
        });
    },

    async openModalCadastro() {
        const tabela = window.currentCadastroTable;
        let html = `<form id="cadastroForm">`;
        
        // Simples form builder dependendo da tabela
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
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        await this.request(`cadastros.php?tabela=${window.currentCadastroTable}&action=create`, 'POST', data);
        this.closeModal();
        this.loadCadastroTable(window.currentCadastroTable);
    },

    async deletarCadastro(id) {
        if(confirm('Excluir este registro?')) {
            await this.request(`cadastros.php?tabela=${window.currentCadastroTable}&action=delete`, 'POST', {id});
            this.loadCadastroTable(window.currentCadastroTable);
        }
    },

    // --- MODAL UTIL ---
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

    // --- USUARIOS (ADM) ---
    async initUsuarios() {
        const tbody = document.getElementById('usuarios-tbody');
        tbody.innerHTML = '';
        const usuarios = await this.request('usuarios.php?action=list');
        if (!usuarios) return;
        
        usuarios.forEach(u => {
            const btnExcluir = u.login === 'admin' ? '' : `<button class="btn btn-sm btn-danger" onclick="app.deletarUsuario(${u.id})"><i class="ri-delete-bin-line"></i></button>`;
            
            let badges = '';
            if (u.role === 'ADM') badges = '<span class="badge badge-FINALIZADA">Acesso Total</span>';
            else {
                const p = u.permissoes;
                if(p.criar_demandas) badges += '<span class="badge" style="background:#e2e8f0;">Criar</span> ';
                if(p.editar_demandas) badges += '<span class="badge" style="background:#e2e8f0;">Editar</span> ';
                if(p.excluir_demandas) badges += '<span class="badge" style="background:#e2e8f0;">Excluir</span> ';
                if(p.gerenciar_cadastros) badges += '<span class="badge" style="background:#e2e8f0;">Cadastros</span> ';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id}</td>
                <td>${u.login}</td>
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
                    <label>Login</label>
                    <input type="text" class="form-control" name="login" value="${u ? u.login : ''}" required>
                </div>
                <div class="form-group">
                    <label>${isEdit ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}</label>
                    <input type="password" class="form-control" name="senha" ${!isEdit ? 'required' : ''}>
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
                    <label><input type="checkbox" name="perm_criar" value="1" ${u && u.permissoes.criar_demandas ? 'checked' : ''}> Pode Criar Demandas</label><br>
                    <label><input type="checkbox" name="perm_editar" value="1" ${u && u.permissoes.editar_demandas ? 'checked' : ''}> Pode Editar Demandas e Ações</label><br>
                    <label><input type="checkbox" name="perm_excluir" value="1" ${u && u.permissoes.excluir_demandas ? 'checked' : ''}> Pode Excluir e Arquivar Demandas</label><br>
                    <label><input type="checkbox" name="perm_cadastros" value="1" ${u && u.permissoes.gerenciar_cadastros ? 'checked' : ''}> Pode Gerenciar Cadastros Base</label>
                </div>
            </form>
        `;

        this.openModal(isEdit ? 'Editar Usuário' : 'Novo Usuário', html, [
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
        const data = {
            login: fd.get('login'),
            senha: fd.get('senha'),
            role: fd.get('role'),
            permissoes: {
                criar_demandas: !!fd.get('perm_criar'),
                editar_demandas: !!fd.get('perm_editar'),
                excluir_demandas: !!fd.get('perm_excluir'),
                gerenciar_cadastros: !!fd.get('perm_cadastros')
            }
        };
        if(isEdit) data.id = fd.get('id');

        const endpoint = isEdit ? 'usuarios.php?action=update' : 'usuarios.php?action=create';
        const res = await this.request(endpoint, 'POST', data);
        
        if (res && res.success) {
            this.closeModal();
            this.initUsuarios();
        }
    },

    async deletarUsuario(id) {
        if(confirm('Tem certeza que deseja excluir este usuário?')) {
            const res = await this.request('usuarios.php?action=delete', 'POST', {id});
            if (res && res.success) this.initUsuarios();
        }
    },

    closeModal() {
        document.getElementById('globalModal').classList.remove('active');
    },

    // --- FORMS DEMANDA ---
    async openModalDemanda() {
        const escolas = await this.request('cadastros.php?tabela=escolas&action=list');
        const tipos = await this.request('cadastros.php?tabela=tipos_demanda&action=list');
        const status = await this.request('cadastros.php?tabela=status_atendimento&action=list');
        const funcionarios = await this.request('cadastros.php?tabela=funcionarios&action=list');
        const demandantes = await this.request('cadastros.php?tabela=demandantes&action=list');

        const html = `
            <form id="demandaForm">
                <div class="form-group">
                    <label>Descrição</label>
                    <textarea class="form-control" name="descricao" rows="3" required></textarea>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Demandante</label>
                        <select class="form-control" name="demandante_id">
                            <option value="">Selecione...</option>
                            ${demandantes.map(x => `<option value="${x.id}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Escola</label>
                        <select class="form-control" name="escola_id">
                            <option value="">Selecione...</option>
                            ${escolas.map(x => `<option value="${x.id}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tipo</label>
                        <select class="form-control" name="tipo_id">
                            <option value="">Selecione...</option>
                            ${tipos.map(x => `<option value="${x.id}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Status Inicial</label>
                        <select class="form-control" name="status_id">
                            <option value="">Selecione...</option>
                            ${status.map(x => `<option value="${x.id}">${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Responsável</label>
                        <select class="form-control" name="funcionario_id">
                            <option value="">Selecione...</option>
                            ${funcionarios.map(x => `<option value="${x.id}">${x.nome}</option>`).join('')}
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
        
        await this.request('demandas.php?action=create', 'POST', data);
        this.closeModal();
        this.carregarDemandas();
    },
    
    // Simplificando edição para o MVP
    editarDemanda(id) {
        alert('Edição de demanda #' + id + ' (a implementar expansão visual)');
    },
    
    async novaAcao(demanda_id) {
        const funcionarios = await this.request('cadastros.php?tabela=funcionarios&action=list');
        const status = await this.request('cadastros.php?tabela=status_atendimento&action=list');
        
        const html = `
            <form id="acaoForm">
                <input type="hidden" name="demanda_id" value="${demanda_id}">
                <div class="form-group">
                    <label>Descrição da Ação</label>
                    <textarea class="form-control" name="descricao" rows="2" required></textarea>
                </div>
                <div class="form-group">
                    <label>Responsável (Funcionário)</label>
                    <select class="form-control" name="funcionario_id">
                        <option value="">Selecione...</option>
                        ${funcionarios.map(x => `<option value="${x.id}">${x.nome}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Mudar Status da Demanda para (Opcional)</label>
                    <select class="form-control" name="status_id_momento">
                        <option value="">Manter Status Atual</option>
                        ${status.map(x => `<option value="${x.id}">${x.nome}</option>`).join('')}
                    </select>
                </div>
            </form>
        `;
        
        this.openModal('Registrar Ação', html, [
            { label: 'Salvar', class: 'btn-primary', action: async () => {
                const form = document.getElementById('acaoForm');
                if(!form.checkValidity()) return form.reportValidity();
                await this.request('acoes.php?action=create', 'POST', Object.fromEntries(new FormData(form)));
                this.closeModal();
                this.verAcoes(demanda_id); // Reload list
            } }
        ]);
    }
};

window.onload = () => app.init();
