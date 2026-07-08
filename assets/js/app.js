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

// ==========================================
// RESTRIÇÃO DE DOMÍNIO (Opcional)
// ==========================================
// Se quiser permitir apenas e-mails de uma empresa, coloque aqui (ex: "@mpu.mp.br").
// Deixe em branco ("") para permitir qualquer e-mail do Google.
const DOMINIO_AUTORIZADO = "@educacao.am.gov.br"; 

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
    demandasFiltradas: [],
    colunasVisiveis: [
        { key: 'numero', label: 'Nº', show: true },
        { key: 'data', label: 'Data', show: true },
        { key: 'status', label: 'Status', show: true },
        { key: 'tipo', label: 'Tipo', show: true },
        { key: 'demandante', label: 'Demandante', show: true },
        { key: 'escola', label: 'Escola', show: true },
        { key: 'responsavel', label: 'Responsável', show: true },
        { key: 'coordenacao', label: 'Coordenação', show: true },
        { key: 'processo', label: 'Processo', show: true }
    ],
    pagination: {
        currentPage: 1,
        itemsPerPage: 10
    },
    savedFilters: {},

    init() {
        this.initColunasVisiveis();
        this.initTheme();
        this.bindNav();
        this.startClock();
        
        // Modal events
        document.getElementById('globalModal').addEventListener('click', (e) => {
            if (e.target.id === 'globalModal') this.closeModal();
        });
        
        window.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('customPopupOverlay');
            const isPopupActive = overlay && overlay.classList.contains('active');
            
            if (e.key === 'Escape') {
                this.closeModal();
                if (isPopupActive) {
                    overlay.classList.remove('active');
                    if(this._popupResolve) { 
                        this._popupResolve(false); 
                        this._popupResolve = null; 
                    }
                }
            } else if (e.key === 'Enter') {
                if (isPopupActive) {
                    e.preventDefault();
                    const btns = document.getElementById('customPopupActions').querySelectorAll('button');
                    if (btns.length > 0) {
                        btns[btns.length - 1].click();
                    }
                }
            } else if (e.key === 'Backspace') {
                const tag = e.target ? e.target.tagName : '';
                const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
                const isGlobalModalActive = document.getElementById('globalModal') && document.getElementById('globalModal').style.display === 'flex';
                
                if (!isInput && !isPopupActive && !isGlobalModalActive) {
                    if (this.currentView === 'demanda-detalhe') {
                        e.preventDefault();
                        this.voltarDemandas();
                    }
                }
            }
        });
        
        // Monitora o status de login via Firebase Auth
        auth.onAuthStateChanged(async (user) => {
            try {
                if (user) {
                    // Busca as permissões pelo UID
                    const doc = await db.collection('usuarios').doc(user.uid).get();
                    if(doc.exists) {
                        this.userDoc = { uid: user.uid, email: user.email, ...doc.data() };
                        this.showApp();
                    } else {
                        // Se não existe pelo UID, procura se o Admin pré-autorizou o e-mail
                        const snap = await db.collection('usuarios').where('email', '==', user.email).get();
                        
                        if (snap.empty && user.email !== 'admin@admin.com') {
                            // Não está na whitelist!
                            await auth.signOut();
                            document.getElementById('login_error').innerText = "Acesso Negado: Sua conta Google não foi autorizada pelo Administrador.";
                            this.showLogin();
                            return;
                        }

                        // Está na whitelist! Migra os dados pré-cadastrados para o UID correto definitivo.
                        let newUserDoc = {
                            login: user.displayName || user.email.split('@')[0],
                            email: user.email, 
                            role: 'COMUM', 
                            permissoes: {}
                        };

                        if(!snap.empty) {
                            const prData = snap.docs[0].data();
                            newUserDoc.role = prData.role || 'COMUM';
                            newUserDoc.permissoes = prData.permissoes || {};
                            await db.collection('usuarios').doc(snap.docs[0].id).delete();
                        } else if (user.email === 'admin@admin.com') {
                            newUserDoc.role = 'ADM';
                        }

                        await db.collection('usuarios').doc(user.uid).set(newUserDoc);
                        this.userDoc = { uid: user.uid, ...newUserDoc };
                    }
                    
                    if (this.userDoc.primeiro_login) {
                        this.showApp();
                        this.abrirModalTrocarSenha(true);
                    } else {
                        this.showApp();
                    }
                } else {
                    this.userDoc = null;
                    this.showLogin();
                }
            } catch (err) {
                await this.showAlert("Erro crítico no login: " + err.message + "\n\nStack: " + err.stack);
                console.error(err);
                document.getElementById('login_error').innerText = "Erro Crítico: " + err.message;
            }
        });
    },

    initColunasVisiveis() {
        const saved = localStorage.getItem('colunas_visiveis');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.colunasVisiveis.forEach(col => {
                    if (parsed[col.key] !== undefined) col.show = parsed[col.key];
                });
            } catch(e) { console.error(e); }
        }
    },

    initTheme() {
        const saved = localStorage.getItem('tema_app') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        this._updateThemeIcon(saved);
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('tema_app', next);
        this._updateThemeIcon(next);
    },

    _updateThemeIcon(theme) {
        const icon = document.getElementById('themeToggleIcon');
        if (!icon) return;
        if (theme === 'dark') {
            icon.className = 'ri-sun-line';
            const btn = document.getElementById('themeToggleBtn');
            if (btn) btn.title = 'Mudar para Modo Claro';
        } else {
            icon.className = 'ri-moon-line';
            const btn = document.getElementById('themeToggleBtn');
            if (btn) btn.title = 'Mudar para Modo Dark';
        }
    },

    saveColunasVisiveis() {
        const obj = {};
        this.colunasVisiveis.forEach(col => obj[col.key] = col.show);
        localStorage.setItem('colunas_visiveis', JSON.stringify(obj));
    },

    toggleColumnSelector() {
        const menu = document.getElementById('column-selector-menu');
        const wrapper = menu?.closest('.column-selector-dropdown');
        if (!menu) return;

        const isOpen = menu.style.display === 'flex';
        if (isOpen) {
            menu.style.display = 'none';
            return;
        }

        // Renderiza os checkboxes
        menu.innerHTML = this.colunasVisiveis.map(col => `
            <label>
                <input type="checkbox" ${col.show ? 'checked' : ''} onchange="app.toggleColumn('${col.key}', this.checked)">
                ${col.label}
            </label>
        `).join('');
        menu.style.display = 'flex';

        // Fecha ao clicar fora — listener único e auto-removível
        const fecharFora = (e) => {
            if (wrapper && !wrapper.contains(e.target)) {
                menu.style.display = 'none';
                document.removeEventListener('click', fecharFora, true);
            }
        };
        // Usa capture para capturar antes do bubbling; setTimeout evita fechar no mesmo clique
        setTimeout(() => document.addEventListener('click', fecharFora, true), 0);
    },

    toggleColumn(key, show) {
        const col = this.colunasVisiveis.find(c => c.key === key);
        if (col) {
            col.show = show;
            this.saveColunasVisiveis();
            this.renderPaginatedTabela();
        }
    },

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if(sidebar) sidebar.classList.toggle('hidden');
    },

    toggleFilterBtn(id, callback) {
        const btn = document.getElementById(id);
        if(!btn) return;
        const isActive = btn.getAttribute('data-active') === 'true';
        btn.setAttribute('data-active', !isActive);
        if (callback) callback();
    },

    abrirModalTrocarSenha(isFirstLogin) {
        const html = `
            <div class="alert alert-warning" style="margin-bottom: 15px; background: #fffbeb; color: #b45309; padding: 15px; border-radius: 4px; border: 1px solid #fde68a;">
                ${isFirstLogin ? 'Bem-vindo! No seu primeiro acesso, é obrigatório criar uma nova senha.' : 'Digite sua nova senha abaixo.'}
            </div>
            <form id="trocarSenhaForm" onsubmit="event.preventDefault(); app.salvarNovaSenha(${isFirstLogin});">
                <div class="form-group">
                    <label>Nova Senha</label>
                    <input type="password" id="novaSenha" class="form-control" required minlength="6">
                </div>
                <div class="form-group">
                    <label>Confirmar Nova Senha</label>
                    <input type="password" id="confirmaSenha" class="form-control" required minlength="6">
                </div>
                <div id="erroSenha" style="color:var(--danger-color); margin-bottom: 15px; font-size: 0.85rem;"></div>
                <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">Confirmar Senha</button>
            </form>
        `;
        this.openModal('Alterar Senha', html, isFirstLogin ? [] : [
            { label: 'Cancelar', class: 'btn-secondary', action: () => this.closeModal() }
        ]);
        if(isFirstLogin) {
            const btnClose = document.querySelector('.btn-close');
            if(btnClose) btnClose.style.display = 'none';
        }
    },

    async salvarNovaSenha(isFirstLogin) {
        const p1 = document.getElementById('novaSenha').value;
        const p2 = document.getElementById('confirmaSenha').value;
        const erro = document.getElementById('erroSenha');
        if(p1 !== p2) {
            erro.innerText = "As senhas não coincidem.";
            return;
        }
        document.getElementById('erroSenha').innerText = "Atualizando...";
        try {
            await auth.currentUser.updatePassword(p1);
            await db.collection('usuarios').doc(this.userDoc.uid).update({ primeiro_login: false });
            this.userDoc.primeiro_login = false;
            await this.showAlert("Senha alterada com sucesso!");
            this.closeModal();
            const btnClose = document.querySelector('.btn-close');
            if(btnClose) btnClose.style.display = 'block';
        } catch(e) {
            if(e.code === 'auth/requires-recent-login') {
                erro.innerText = "Sua sessão expirou. Por favor, faça login novamente para alterar a senha.";
                setTimeout(() => this.doLogout(), 3000);
            } else {
                erro.innerText = "Erro: " + e.message;
            }
        }
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
        return !!(this.userDoc.permissoes && this.userDoc.permissoes[acao]);
    },

    // Verifica se o usuário pode ver demandas sigilosas
    podeVerSigilosa() {
        if (!this.userDoc) return false;
        if (this.userDoc.role === 'ADM') return true;
        return !!(this.userDoc.permissoes && this.userDoc.permissoes.ver_sigilosas);
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

    async loadView(view) {
        // Bloqueia visão de usuários se não for ADM
        if (view === 'usuarios' && (!this.userDoc || this.userDoc.role !== 'ADM')) return;
        
        // Bloqueia telas com base nas novas permissões
        if (view === 'demandas' && !this.temPermissao('visualizar_demandas')) {
            await this.showAlert("Sem permissão para visualizar demandas."); return;
        }
        if (view === 'cadastros' && !this.temPermissao('gerenciar_cadastros')) {
            await this.showAlert("Sem permissão para visualizar cadastros."); return;
        }

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
            'usuarios': 'Gerenciamento de Usuários',
            'contatos': 'Agenda de Contatos',
            'sugestoes': 'Sugestões',
            'creditos': 'Créditos'
        };
        document.getElementById('page-title').innerText = titles[view] || view;

        if (view === 'dashboard') this.initDashboard();
        if (view === 'demandas') this.initDemandas();
        if (view === 'kanban') this.initKanban();
        if (view === 'calendario') this.initCalendario();
        if (view === 'cadastros') this.initCadastros();
        if (view === 'usuarios') this.initUsuarios();
        if (view === 'contatos') this.initContatos();
        if (view === 'sugestoes') this.initSugestoes();
    },

    refreshView() {
        const btn = document.getElementById('btnRefreshView');
        if (btn) {
            btn.disabled = true;
            const icon = btn.querySelector('i');
            if (icon) icon.style.animation = 'spin 0.6s linear infinite';
        }

        // Recarrega a view atual preservando o estado do template
        const view = this.currentView;
        const container = document.getElementById('contentArea');
        const template = document.getElementById(`view-${view}`);
        if (template && container) {
            container.innerHTML = template.innerHTML;
        }

        const initMap = {
            'dashboard':       () => this.initDashboard(),
            'demandas':        () => this.initDemandas(),
            'kanban':          () => this.initKanban(),
            'calendario':      () => this.initCalendario(),
            'cadastros':       () => this.initCadastros(),
            'usuarios':        () => this.initUsuarios(),
            'contatos':        () => this.initContatos(),
            'sugestoes':       () => this.initSugestoes(),
            'demanda-detalhe': () => this.abrirDetalhesDemanda(this.demandaAbertaId),
        };

        const initFn = initMap[view];
        const done = () => {
            if (btn) {
                btn.disabled = false;
                const icon = btn.querySelector('i');
                if (icon) icon.style.animation = '';
            }
        };

        if (initFn) {
            const result = initFn();
            if (result && typeof result.then === 'function') {
                result.then(done).catch(done);
            } else {
                done();
            }
        } else {
            done();
        }
    },

    // --- DASHBOARD ---
    async initDashboard() {
        this._dashCoordFilter = 'TODAS'; // Estado do filtro de coordenação

        // Carrega os status cadastrados para KPIs dinâmicos
        try {
            const statusSnap = await db.collection('status_atendimento').get();
            this._dashStatusList = statusSnap.docs.map(d => d.data().nome).filter(Boolean);
        } catch(e) {
            this._dashStatusList = [];
        }

        let query = db.collection('demandas');
        if (this.userDoc && this.userDoc.role === 'COMUM' && this.userDoc.coordenadoria_nome !== 'REGIONAL / GABINETE') {
            query = query.where('coordenadoria_nome', '==', this.userDoc.coordenadoria_nome);
        }
        const snap = await query.get();
        // Filtra sigilosas se o usuário não tem permissão
        this._todasDemandasDash = snap.docs.map(d => d.data()).filter(d => {
            if (d.sigilosa) return this.podeVerSigilosa();
            return true;
        });

        this._renderDashboard();

        // Filtro de Coordenação
        document.querySelectorAll('#coordFilterTabs .coord-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#coordFilterTabs .coord-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._dashCoordFilter = btn.getAttribute('data-coord');
                this._renderDashboard();
            });
        });

        // Seletor do gráfico de barras
        const barSel = document.getElementById('barChartSelector');
        if (barSel) barSel.addEventListener('change', (e) => {
            this._activeBarChart = e.target.value;
            this._renderBarChart();
        });
    },

    _getDashDemandas() {
        const all = this._todasDemandasDash || [];
        if (this._dashCoordFilter === 'TODAS') return all;
        return all.filter(d => (d.coordenadoria_nome || '').toUpperCase().includes(this._dashCoordFilter.toUpperCase()));
    },

    // Mapa de ícones e cores para status conhecidos
    _getStatusKpiConfig(statusNome) {
        const sn = (statusNome || '').toUpperCase().trim();
        const configs = [
            { match: sn => sn === 'FINALIZADA',                         icon: 'ri-checkbox-circle-line',   bg: '#10b981' },
            { match: sn => sn === 'EM ANDAMENTO',                        icon: 'ri-time-line',               bg: '#f59e0b' },
            { match: sn => sn.includes('AGUARDANDO') && sn.includes('SEDE'), icon: 'ri-building-2-line',    bg: '#8b5cf6' },
            { match: sn => sn.includes('AGUARDANDO'),                    icon: 'ri-user-received-line',      bg: '#3b82f6' },
            { match: sn => sn.includes('SIGED') || sn.includes('TRAMI'), icon: 'ri-file-text-line',         bg: '#06b6d4' },
            { match: sn => sn.includes('TREINAMENTO'),                   icon: 'ri-graduation-cap-line',    bg: '#6366f1' },
            { match: sn => sn.includes('CANCELAD'),                      icon: 'ri-close-circle-line',       bg: '#ef4444' },
            { match: sn => sn.includes('PENDENTE'),                      icon: 'ri-error-warning-line',      bg: '#f97316' },
            { match: sn => sn.includes('ABERTA'),                        icon: 'ri-folder-open-line',        bg: '#14b8a6' },
        ];
        const fallbackColors = ['#0ea5e9','#84cc16','#a855f7','#ec4899','#f59e0b','#10b981','#06b6d4','#6366f1','#ef4444'];
        for (const cfg of configs) {
            if (cfg.match(sn)) return { icon: cfg.icon, bg: cfg.bg };
        }
        // Cor automática baseada em hash do nome
        let hash = 0;
        for (let i = 0; i < statusNome.length; i++) hash = statusNome.charCodeAt(i) + ((hash << 5) - hash);
        return { icon: 'ri-file-list-line', bg: fallbackColors[Math.abs(hash) % fallbackColors.length] };
    },

    _renderDashboard() {
        const demandas = this._getDashDemandas();
        const statusList = this._dashStatusList || [];

        // Contagem por status e outros agrupamentos
        let totalGeral = demandas.length;
        let arquivadas = 0;
        const statusCount = {}; // inclui arquivadas via label especial
        const tipoCount = {}, respCount = {}, escolaCount = {}, setorCount = {};

        // Inicializa contagem de todos os status conhecidos com 0
        statusList.forEach(s => { statusCount[s] = 0; });

        demandas.forEach(d => {
            if (d.arquivada) {
                arquivadas++;
                // Conta arquivadas no gráfico de status
                statusCount['ARQUIVADAS'] = (statusCount['ARQUIVADAS'] || 0) + 1;
            } else {
                const sn = d.status_nome || 'Sem Status';
                statusCount[sn] = (statusCount[sn] || 0) + 1;
            }
            tipoCount[d.tipo_nome] = (tipoCount[d.tipo_nome] || 0) + 1;
            respCount[d.funcionario_nome] = (respCount[d.funcionario_nome] || 0) + 1;
            escolaCount[d.escola_nome] = (escolaCount[d.escola_nome] || 0) + 1;
            setorCount[d.setor_nome] = (setorCount[d.setor_nome] || 0) + 1;
        });

        // ==== KPIs DINÂMICOS ====
        const kpiContainer = document.getElementById('dashboard-kpis-container');
        if (kpiContainer) {
            let kpiHtml = '';

            // Card 1: Total de Demandas (sempre primeiro)
            kpiHtml += `
                <div class="kpi-card">
                    <div class="kpi-icon box-primary"><i class="ri-file-copy-2-line"></i></div>
                    <div class="kpi-data">
                        <h3>DEMANDAS</h3>
                        <div class="kpi-value">${totalGeral}</div>
                    </div>
                </div>
            `;

            // Cards por status cadastrado no banco
            statusList.forEach(statusNome => {
                const count = statusCount[statusNome] || 0;
                const cfg = this._getStatusKpiConfig(statusNome);
                // Abreviação para label longo
                let label = statusNome.toUpperCase();
                if (label.length > 20) label = label.substring(0, 18) + '…';
                kpiHtml += `
                    <div class="kpi-card">
                        <div class="kpi-icon" style="background:${cfg.bg};"><i class="${cfg.icon}"></i></div>
                        <div class="kpi-data">
                            <h3 title="${statusNome}">${label}</h3>
                            <div class="kpi-value">${count}</div>
                        </div>
                    </div>
                `;
            });

            // Card Arquivadas (sempre por último)
            kpiHtml += `
                <div class="kpi-card">
                    <div class="kpi-icon box-secondary"><i class="ri-inbox-archive-line"></i></div>
                    <div class="kpi-data">
                        <h3>ARQUIVADAS</h3>
                        <div class="kpi-value">${arquivadas}</div>
                    </div>
                </div>
            `;

            kpiContainer.innerHTML = kpiHtml;
        }

        // Armazena os datasets filtrados
        // Para o gráfico de status: filtra zeros e inclui arquivadas
        const statusChartData = Object.keys(statusCount)
            .filter(k => statusCount[k] > 0)
            .map(k => ({label: k || 'S/N', value: statusCount[k]}));

        this._dashChartData = {
            status:      statusChartData,
            tipo:        Object.keys(tipoCount).map(k   => ({label: k || 'S/N', value: tipoCount[k]})),
            responsavel: Object.keys(respCount).map(k   => ({label: k || 'S/N', value: respCount[k]})),
            escola:      Object.keys(escolaCount).map(k => ({label: k || 'S/N', value: escolaCount[k]})),
            setor:       Object.keys(setorCount).map(k  => ({label: k || 'S/N', value: setorCount[k]}))
        };

        this._renderStatusChart();
        this._renderBarChart();
    },

    _renderStatusChart() {
        const data = this._dashChartData.status || [];
        this.renderDonutChart('chartStatusCanvas', data);
    },

    _renderBarChart() {
        const key = this._activeBarChart || (document.getElementById('barChartSelector') ? document.getElementById('barChartSelector').value : 'setor') || 'setor';
        this._activeBarChart = key;
        const data = (this._dashChartData || {})[key] || [];

        const titles = { setor: 'Por Setor', tipo: 'Por Tipo', responsavel: 'Por Responsável', escola: 'Por Escola' };
        const icons  = { setor: 'ri-layout-grid-line', tipo: 'ri-list-check', responsavel: 'ri-user-line', escola: 'ri-building-line' };

        const titleEl = document.getElementById('barChartTitle');
        const iconEl  = document.getElementById('barChartIconBadge');
        if (titleEl) titleEl.innerText = titles[key] || key;
        if (iconEl)  iconEl.innerHTML  = `<i class="${icons[key] || 'ri-bar-chart-horizontal-line'}"></i>`;

        this.renderHorizontalBarChart('chartBarCanvas', data);
    },

    renderDonutChart(canvasId, dataArr) {
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const labels = dataArr.map(d => d.label);
        const values = dataArr.map(d => d.value);
        const total  = values.reduce((s, v) => s + v, 0);

        const vibrantColors = [
            '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6',
            '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16','#06b6d4','#a855f7'
        ];

        // Plugin para texto central
        const centerTextPlugin = {
            id: 'centerText',
            beforeDraw(chart) {
                const { width, height, ctx } = chart;
                ctx.restore();
                const chartArea = chart.chartArea;
                const cx = (chartArea.left + chartArea.right) / 2;
                const cy = (chartArea.top + chartArea.bottom) / 2;

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Número grande
                ctx.font = "bold 28px 'Inter', sans-serif";
                ctx.fillStyle = '#1e293b';
                ctx.fillText(total, cx, cy - 10);

                // Rótulo menor
                ctx.font = "500 11px 'Inter', sans-serif";
                ctx.fillStyle = '#64748b';
                ctx.fillText('demandas', cx, cy + 14);

                ctx.restore();
            }
        };

        this.charts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: labels.map((_, i) => vibrantColors[i % vibrantColors.length]),
                    borderColor: '#fff',
                    borderWidth: 3,
                    hoverOffset: 14
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                animation: { duration: 700, easing: 'easeInOutQuart' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: "'Inter', sans-serif", size: 11 },
                            padding: 12,
                            usePointStyle: true,
                            pointStyleWidth: 9,
                            generateLabels: (chart) => {
                                const data = chart.data;
                                return data.labels.map((label, i) => {
                                    const val = data.datasets[0].data[i];
                                    const pct = total > 0 ? Math.round(val / total * 100) : 0;
                                    return {
                                        text: `${label}  ${val} (${pct}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: '#fff',
                                        lineWidth: 2,
                                        pointStyle: 'circle',
                                        index: i
                                    };
                                });
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.raw;
                                const pct = total > 0 ? Math.round(val / total * 100) : 0;
                                return ` ${ctx.label}: ${val} (${pct}%)`;
                            }
                        }
                    }
                }
            },
            plugins: [centerTextPlugin]
        });
    },

    renderHorizontalBarChart(canvasId, dataArr) {
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Ordena do maior para o menor
        const sorted = [...dataArr].sort((a, b) => b.value - a.value);
        const labels = sorted.map(d => d.label);
        const values = sorted.map(d => d.value);
        const total  = values.reduce((s, v) => s + v, 0);

        const vibrantColors = [
            '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6',
            '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16','#06b6d4','#a855f7'
        ];

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade',
                    data: values,
                    backgroundColor: labels.map((_, i) => vibrantColors[i % vibrantColors.length]),
                    borderColor: 'transparent',
                    borderWidth: 0,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 700, easing: 'easeInOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.raw;
                                const pct = total > 0 ? Math.round(val / total * 100) : 0;
                                return ` ${val} demandas (${pct}%)`;
                            }
                        }
                    },
                    datalabels: false
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { family: "'Inter', sans-serif", size: 11 },
                            callback: (val) => {
                                const pct = total > 0 ? Math.round(val / total * 100) : 0;
                                return val;
                            }
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { family: "'Inter', sans-serif", size: 11 },
                            maxRotation: 0
                        }
                    }
                }
            },
            plugins: [{
                id: 'barLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data, scales } = chart;
                    const dataset = data.datasets[0];
                    const vals = dataset.data;
                    const tot = vals.reduce((s, v) => s + v, 0);
                    ctx.save();
                    ctx.font = "bold 11px 'Inter', sans-serif";
                    ctx.fillStyle = '#1e293b';
                    chart.getDatasetMeta(0).data.forEach((bar, i) => {
                        const val = vals[i];
                        const pct = tot > 0 ? Math.round(val / tot * 100) : 0;
                        const x = bar.x + 6;
                        const y = bar.y;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${val} (${pct}%)`, x, y);
                    });
                    ctx.restore();
                }
            }]
        });
    },

    renderChart(canvasId, dataArr, type) {
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const labels = dataArr.map(d => d.label);
        const values = dataArr.map(d => d.value);

        const vibrantColors = [
            '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
            '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
            '#06b6d4', '#a855f7'
        ];

        const isMultiColor = (type === 'pie' || type === 'doughnut' || type === 'polarArea');

        this.charts[canvasId] = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade',
                    data: values,
                    backgroundColor: labels.map((_, i) => vibrantColors[i % vibrantColors.length]),
                    borderColor: isMultiColor ? '#fff' : 'transparent',
                    borderWidth: isMultiColor ? 2 : 0,
                    borderRadius: (!isMultiColor) ? 8 : 0,
                    hoverOffset: isMultiColor ? 10 : 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: 'easeInOutQuart' },
                plugins: {
                    legend: {
                        position: isMultiColor ? 'right' : 'top',
                        labels: {
                            font: { family: "'Inter', sans-serif", size: 12 },
                            padding: 16,
                            usePointStyle: true,
                            pointStyleWidth: 10
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: ${ctx.parsed || ctx.raw} demandas`
                        }
                    }
                },
                scales: (!isMultiColor) ? {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: "'Inter', sans-serif" } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: "'Inter', sans-serif" }, maxRotation: 35, minRotation: 0 }
                    }
                } : {}
            }
        });
    },

    // --- DEMANDAS ---
    async initDemandas() {
        await this.loadFiltrosDemandas();
        
        // Restore filters
        if(this.savedFilters.demandas) {
            const f = this.savedFilters.demandas;
            if(document.getElementById('filter-search')) document.getElementById('filter-search').value = f.search || '';
            if(document.getElementById('filter-coordenadoria')) document.getElementById('filter-coordenadoria').value = f.coord || '';
            if(document.getElementById('filter-escola')) document.getElementById('filter-escola').value = f.escola || '';
            if(document.getElementById('filter-tipo')) document.getElementById('filter-tipo').value = f.tipo || '';
            if(document.getElementById('filter-status')) document.getElementById('filter-status').value = f.status || '';
            if(document.getElementById('filter-data-inicio')) document.getElementById('filter-data-inicio').value = f.dataInicio || '';
            if(document.getElementById('filter-data-fim')) document.getElementById('filter-data-fim').value = f.dataFim || '';
        }
        
        this.carregarDemandas();
        
        const saveAndFilter = () => {
            this.savedFilters.demandas = {
                search: document.getElementById('filter-search') ? document.getElementById('filter-search').value : '',
                coord: document.getElementById('filter-coordenadoria') ? document.getElementById('filter-coordenadoria').value : '',
                escola: document.getElementById('filter-escola') ? document.getElementById('filter-escola').value : '',
                tipo: document.getElementById('filter-tipo') ? document.getElementById('filter-tipo').value : '',
                status: document.getElementById('filter-status') ? document.getElementById('filter-status').value : '',
                dataInicio: document.getElementById('filter-data-inicio') ? document.getElementById('filter-data-inicio').value : '',
                dataFim: document.getElementById('filter-data-fim') ? document.getElementById('filter-data-fim').value : '',
            };
            this.filtrarTabelaDemandas();
        };

        const fSearch = document.getElementById('filter-search');
        if(fSearch) fSearch.addEventListener('input', saveAndFilter);
        
        ['filter-coordenadoria','filter-escola','filter-tipo','filter-status','filter-data-inicio','filter-data-fim'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('change', saveAndFilter);
        });
    },

    async loadFiltrosDemandas() {
        try {
            const escolas = (await db.collection('escolas').get()).docs.map(d => d.data());
            const selEscola = document.getElementById('filter-escola');
            if(selEscola) escolas.forEach(e => selEscola.innerHTML += `<option value="${e.nome}">${e.nome}</option>`);
        } catch(e) { console.error("Erro ao carregar escolas", e); }

        try {
            const tipos = (await db.collection('tipos_demanda').get()).docs.map(d => d.data());
            const selTipo = document.getElementById('filter-tipo');
            if(selTipo) tipos.forEach(t => selTipo.innerHTML += `<option value="${t.nome}">${t.nome}</option>`);
        } catch(e) { console.error("Erro ao carregar tipos", e); }

        try {
            const status = (await db.collection('status_atendimento').get()).docs.map(d => d.data());
            const selStatus = document.getElementById('filter-status');
            if(selStatus) status.forEach(s => selStatus.innerHTML += `<option value="${s.nome}">${s.nome}</option>`);
        } catch(e) { console.error("Erro ao carregar status", e); }

        try {
            const coord = (await db.collection('coordenadorias').get()).docs.map(d => d.data());
            const selCoord = document.getElementById('filter-coordenadoria');
            if(selCoord) coord.forEach(c => selCoord.innerHTML += `<option value="${c.nome}">${c.nome}</option>`);
        } catch(e) { console.error("Erro ao carregar coordenadorias", e); }
    },

    async carregarDemandas() {
        try {
            document.body.style.cursor = 'wait';
            let query = db.collection('demandas');
            
            const btnArquivadas = document.getElementById('filter-arquivadas');
            const btnLixeira = document.getElementById('filter-lixeira');
            const isArquivadas = btnArquivadas && btnArquivadas.getAttribute('data-active') === 'true';
            const isLixeira = btnLixeira && btnLixeira.getAttribute('data-active') === 'true';

            if (isLixeira) {
                query = query.where('excluida', '==', true);
            } else if (isArquivadas) {
                query = query.where('arquivada', '==', true);
            } else {
                query = query.where('arquivada', '==', false);
            }
            
            const snap = await query.get();
            let demandas = snap.docs.map(d => ({id: d.id, ...d.data()}));
            
            if (!isLixeira) {
                demandas = demandas.filter(d => d.excluida !== true);
            }
            
            const order = document.getElementById('filter-order') ? document.getElementById('filter-order').value : 'desc';
            
            // Ordena
            demandas.sort((a, b) => {
                const dateA = new Date(a.data_registro || 0);
                const dateB = new Date(b.data_registro || 0);
                if (order === 'asc') return dateA - dateB;
                return dateB - dateA;
            });
            
            window.todasDemandas = demandas;
            this.filtrarTabelaDemandas();
            document.body.style.cursor = 'default';
        } catch(e) {
            document.body.style.cursor = 'default';
            console.error("Erro ao carregar demandas:", e);
        }
    },

    formatarDataBR(dataISO) {
        if(!dataISO || typeof dataISO !== 'string') return '-';
        const p = dataISO.split('-');
        if(p.length !== 3) return dataISO;
        return `${p[2]}/${p[1]}/${p[0]}`;
    },

    getBadgeColor(tipo) {
        if(!tipo || typeof tipo !== 'string') return '#64748b';
        const t = tipo.toLowerCase();
        if(t.includes('manutenção')) return '#eab308';
        if(t.includes('pedagógic')) return '#8b5cf6';
        if(t.includes('tecnologia') || t.includes('ti')) return '#06b6d4';
        if(t.includes('infraestrutura')) return '#f97316';
        return '#64748b';
    },

    renderTabelaDemandas(demandas) {
        const theadTr = document.getElementById('demandas-thead-tr');
        if(theadTr) {
            theadTr.innerHTML = this.colunasVisiveis.filter(c => c.show).map(c => `<th>${c.label}</th>`).join('') + `<th>Ações</th>`;
        }

        const tbody = document.getElementById('demandas-tbody');
        tbody.innerHTML = '';
        
        if (demandas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${this.colunasVisiveis.filter(c=>c.show).length + 1}" style="text-align: center; padding: 20px;">Nenhuma demanda encontrada.</td></tr>`;
            return;
        }

        demandas.forEach(d => {
            try {
                const tr = document.createElement('tr');
                if (d.sigilosa) tr.classList.add('row-sigilosa');
                const cssStatus = (typeof d.status_nome === 'string') ? d.status_nome.replace(/\s+/g, '-').toUpperCase() : '';
                
                let tdHtml = '';
                this.colunasVisiveis.filter(c => c.show).forEach(c => {
                    switch(c.key) {
                        case 'numero': 
                            tdHtml += `<td>${d.numero_registro || '-'}${d.sigilosa ? ' <span class="badge-sigilosa"><i class="ri-lock-line"></i>SIGILOSA</span>' : ''}</td>`; 
                            break;
                        case 'data': tdHtml += `<td>${this.formatarDataBR(d.data_registro)}</td>`; break;
                        case 'demandante': tdHtml += `<td>${d.demandante_nome || '-'}</td>`; break;
                        case 'coordenacao': tdHtml += `<td>${d.coordenadoria_nome || '-'}</td>`; break;
                        case 'escola': tdHtml += `<td>${d.escola_nome || '-'}</td>`; break;
                        case 'tipo': tdHtml += `<td>${d.tipo_nome || '-'}</td>`; break;
                        case 'status': tdHtml += `<td>${d.status_nome ? `<span class="badge badge-${cssStatus}">${d.status_nome}</span>` : '-'}</td>`; break;
                        case 'responsavel': tdHtml += `<td>${d.funcionario_nome || '-'}</td>`; break;
                        case 'processo': tdHtml += `<td>${d.processo_siged || '-'}</td>`; break;
                    }
                });

                if (d.excluida) {
                    tdHtml += `
                    <td>
                        ${this.temPermissao('visualizar_demandas') ? `<button class="btn btn-sm btn-info" onclick="app.abrirDetalhesDemanda('${d.id}')" title="Visualizar Detalhes"><i class="ri-eye-line"></i></button>` : ''}
                        ${this.temPermissao('excluir_demandas') ? `<button class="btn btn-sm btn-primary" onclick="app.restaurarDemanda('${d.id}')" title="Restaurar"><i class="ri-arrow-go-back-line"></i></button>` : ''}
                        ${this.temPermissao('excluir_demandas') ? `<button class="btn btn-sm" style="background:#dc2626; color:white; border:none;" onclick="app.excluirDemandaDefinitivamente('${d.id}')" title="Excluir Definitivamente"><i class="ri-delete-bin-fill"></i></button>` : ''}
                    </td>
                    `;
                } else {
                    tdHtml += `
                    <td>
                        ${this.temPermissao('visualizar_demandas') ? `<button class="btn btn-sm btn-info" onclick="app.abrirDetalhesDemanda('${d.id}')" title="Visualizar Detalhes"><i class="ri-eye-line"></i></button>` : ''}
                        ${this.temPermissao('editar_demandas') ? `<button class="btn btn-sm btn-secondary" onclick="app.editarDemanda('${d.id}')" title="Editar"><i class="ri-edit-line"></i></button>` : ''}
                        ${this.temPermissao('excluir_demandas') ? `<button class="btn btn-sm" style="background:#dc2626; color:white; border:none;" onclick="app.excluirDemanda('${d.id}')" title="Excluir"><i class="ri-delete-bin-line"></i></button>` : ''}
                        ${this.temPermissao('imprimir_demandas') ? `<button class="btn btn-sm" style="background:#10b981; color:white; border:none;" onclick="app.gerarPdfDemandaNovaGuia('${d.id}')" title="Gerar PDF (Nova Guia)"><i class="ri-file-pdf-2-line"></i></button>` : ''}
                        ${this.temPermissao('arquivar_demandas') ? (d.arquivada 
                            ? `<button class="btn btn-sm btn-secondary" onclick="app.desarquivarDemanda('${d.id}')" title="Desarquivar"><i class="ri-inbox-unarchive-line"></i></button>`
                            : `<button class="btn btn-sm btn-secondary" onclick="app.arquivarDemanda('${d.id}')" title="Arquivar"><i class="ri-inbox-archive-line"></i></button>`
                        ) : ''}
                    </td>
                    `;
                }
                tr.innerHTML = tdHtml;
                tbody.appendChild(tr);
            } catch(e) { 
                const errTr = document.createElement('tr');
                errTr.innerHTML = `<td colspan="9" style="color:red;">Erro ao renderizar: ${e.message} - ${e.stack}</td>`;
                tbody.appendChild(errTr);
                console.error("Erro ao renderizar linha:", d, e); 
            }
        });
    },

    filtrarTabelaDemandas() {
        const term = document.getElementById('filter-search').value.toLowerCase();
        const comProc = document.getElementById('filter-com-processo').getAttribute('data-active') === 'true';
        const escola = document.getElementById('filter-escola').value;
        const tipo = document.getElementById('filter-tipo').value;
        const status = document.getElementById('filter-status').value;
        const coord = document.getElementById('filter-coordenadoria').value;
        const dataInicio = document.getElementById('filter-data-inicio') ? document.getElementById('filter-data-inicio').value : '';
        const dataFim = document.getElementById('filter-data-fim') ? document.getElementById('filter-data-fim').value : '';
        
        let filtradas = window.todasDemandas.filter(d => {
            // Filtro de demandas sigilosas
            if (d.sigilosa && !this.podeVerSigilosa()) return false;

            const matchTerm = Object.values(d).join(' ').toLowerCase().includes(term);
            const strProc = (d.processo_siged || '').toString().trim().toLowerCase();
            const isInvalid = strProc === '' || strProc === '-' || strProc === 's/n' || strProc === 'n/a' || strProc === 'não' || strProc === 'nao';
            const matchProc = comProc ? !isInvalid : true;
            const matchEscola = escola ? d.escola_nome === escola : true;
            const matchTipo = tipo ? d.tipo_nome === tipo : true;
            const matchStatus = status ? d.status_nome === status : true;
            const matchCoord = coord ? d.coordenadoria_nome === coord : true;
            
            let matchData = true;
            if (dataInicio || dataFim) {
                // Formato assumido para data_registro: YYYY-MM-DDTHH:mm...
                const dData = new Date(d.data_registro);
                if (dataInicio) {
                    const dtIni = new Date(dataInicio + 'T00:00:00');
                    if (dData < dtIni) matchData = false;
                }
                if (dataFim) {
                    const dtFim = new Date(dataFim + 'T23:59:59');
                    if (dData > dtFim) matchData = false;
                }
            }

            return matchTerm && matchProc && matchEscola && matchTipo && matchStatus && matchCoord && matchData;
        });
        
        if (this.userDoc && this.userDoc.role === 'COMUM' && this.userDoc.coordenadoria_nome !== 'REGIONAL / GABINETE') {
            filtradas = filtradas.filter(d => d.coordenadoria_nome === this.userDoc.coordenadoria_nome);
        }

        this.demandasFiltradas = filtradas;
        this.pagination.currentPage = 1;
        this.renderPaginatedTabela();
    },

    changeItemsPerPage(val) {
        this.pagination.itemsPerPage = parseInt(val);
        this.pagination.currentPage = 1;
        this.renderPaginatedTabela();
    },
    
    changePage(page) {
        this.pagination.currentPage = page;
        this.renderPaginatedTabela();
    },
    
    renderPaginatedTabela() {
        const total = this.demandasFiltradas.length;
        const totalPages = Math.ceil(total / this.pagination.itemsPerPage) || 1;
        
        if (this.pagination.currentPage > totalPages) this.pagination.currentPage = totalPages;
        if (this.pagination.currentPage < 1) this.pagination.currentPage = 1;
        
        const start = (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
        const paged = this.demandasFiltradas.slice(start, start + this.pagination.itemsPerPage);
        
        this.renderTabelaDemandas(paged);
        this.renderPaginationControls(totalPages);
    },
    
    renderPaginationControls(totalPages) {
        const container = document.getElementById('pagination-buttons');
        if (!container) return;
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        const cur = this.pagination.currentPage;
        
        html += `<button class="btn btn-sm ${cur === 1 ? 'btn-secondary disabled' : 'btn-primary'}" ${cur === 1 ? 'disabled' : ''} onclick="app.changePage(1)">&lt;&lt; Primeiro</button>`;
        html += `<button class="btn btn-sm ${cur === 1 ? 'btn-secondary disabled' : 'btn-primary'}" ${cur === 1 ? 'disabled' : ''} onclick="app.changePage(${cur - 1})">&lt; Anterior</button>`;
        
        let startPage = Math.max(1, cur - 2);
        let endPage = Math.min(totalPages, cur + 2);
        if (endPage - startPage < 4) {
            if (startPage === 1) endPage = Math.min(totalPages, 5);
            else if (endPage === totalPages) startPage = Math.max(1, totalPages - 4);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            if (i === cur) html += `<button class="btn btn-sm" style="background:var(--primary); color:white;">${i}</button>`;
            else html += `<button class="btn btn-sm btn-secondary" onclick="app.changePage(${i})">${i}</button>`;
        }
        
        html += `<button class="btn btn-sm ${cur === totalPages ? 'btn-secondary disabled' : 'btn-primary'}" ${cur === totalPages ? 'disabled' : ''} onclick="app.changePage(${cur + 1})">Próximo &gt;</button>`;
        html += `<button class="btn btn-sm ${cur === totalPages ? 'btn-secondary disabled' : 'btn-primary'}" ${cur === totalPages ? 'disabled' : ''} onclick="app.changePage(${totalPages})">Último &gt;&gt;</button>`;
        
        container.innerHTML = html;
    },

    async visualizarDemanda(id) {
        const doc = await db.collection('demandas').doc(id).get();
        if(!doc.exists) return;
        const d = doc.data();

        // Busca o histórico de ações para incluir na ficha
        const acoesSnap = await db.collection('acoes').where('demanda_id', '==', id).get();
        let acoes = acoesSnap.docs.map(a => a.data());
        acoes.sort((a, b) => {
            const timeDiff = new Date(b.data_acao || 0) - new Date(a.data_acao || 0);
            if(timeDiff !== 0) return timeDiff;
            return new Date(b.criado_em || 0) - new Date(a.criado_em || 0);
        });

        let html = `
            <div id="ficha-demanda-pdf" style="padding: 20px; font-family: 'Inter', sans-serif; color: #333;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #0ea5e9; padding-bottom: 15px;">
                    <img src="assets/img/logo.png" style="height: 60px; object-fit: contain;" alt="Logo" onerror="this.style.display='none'">
                    <div style="text-align: center;">
                        <h2 style="margin:0; font-size: 18px; color: #1e293b;">Sistema de Gestão de Demandas</h2>
                        <h3 style="margin:2px 0; font-size: 14px; color: #475569; font-weight: normal;">Coordenadoria Regional de Educação de Manacapuru</h3>
                        <h4 style="margin:10px 0 0 0; font-size: 16px; color: #0ea5e9;">Ficha da Demanda - Nº ${d.numero_registro || '-'}</h4>
                    </div>
                    <img src="assets/img/brasao.png" style="height: 60px; object-fit: contain;" alt="Brasão" onerror="this.style.display='none'">
                </div>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd; width: 30%;"><strong>Data de Registro:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${this.formatarDataBR(d.data_registro)}</td></tr>
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Demandante:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.demandante_nome || '-'}</td></tr>
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Coordenação:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.coordenadoria_nome || '-'}</td></tr>
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Escola:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.escola_nome || '-'}</td></tr>
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tipo da Demanda:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.tipo_nome || '-'}</td></tr>
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status Atual:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.status_nome || '-'}</td></tr>
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Processo SIGED:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.processo_siged || '-'}</td></tr>
                    <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Responsável:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.funcionario_nome || '-'}</td></tr>
                </table>
                
                <div style="margin-bottom: 20px; page-break-inside: avoid;">
                    <h4 style="margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #eee;">Descrição</h4>
                    <p style="background: #f8fafc; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; white-space: pre-wrap;">${d.descricao || 'Sem descrição.'}</p>
                </div>
                
                <h4 style="margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #eee;">Histórico de Ações</h4>
                <table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed;">
                    <colgroup><col style="width:15%"><col style="width:60%"><col style="width:13%"><col style="width:12%"></colgroup>
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:8px; border:1px solid #ddd; text-align:left;">Data</th>
                            <th style="padding:8px; border:1px solid #ddd; text-align:left;">Ação</th>
                            <th style="padding:8px; border:1px solid #ddd; text-align:left;">Responsável</th>
                            <th style="padding:8px; border:1px solid #ddd; text-align:left;">Status Mudou</th>
                        </tr>
                    </thead>
                </table>
                ${acoes.length === 0
                    ? `<table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; margin-top:-1px; page-break-inside:avoid;"><colgroup><col style="width:15%"><col style="width:60%"><col style="width:13%"><col style="width:12%"></colgroup><tbody><tr><td colspan="4" style="padding:8px; border:1px solid #ddd; text-align:center;">Nenhuma ação registrada.</td></tr></tbody></table>`
                    : acoes.map(a => `<table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; margin-top:-1px; page-break-inside:avoid;"><colgroup><col style="width:15%"><col style="width:60%"><col style="width:13%"><col style="width:12%"></colgroup><tbody><tr><td style="padding:8px; border:1px solid #ddd; word-wrap:break-word;">${this.formatarDataBR(a.data_acao)}</td><td style="padding:8px; border:1px solid #ddd; word-wrap:break-word; overflow-wrap:break-word;">${a.descricao || '-'}</td><td style="padding:8px; border:1px solid #ddd; word-wrap:break-word;">${a.funcionario_nome || '-'}</td><td style="padding:8px; border:1px solid #ddd; word-wrap:break-word;">${a.status_nome || '-'}</td></tr></tbody></table>`).join('')
                }
            </div>
        `;

        this.openModal('Ficha da Demanda', html, [
            { label: 'Cancelar', class: 'btn-secondary', action: () => this.closeModal() },
            { label: 'Exportar PDF', class: 'btn-primary', action: () => {
                const element = document.getElementById('ficha-demanda-pdf');
                html2pdf().from(element).set({
                    margin: 10,
                    filename: `Demanda_${d.numero_registro.replace('/','_')}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                }).save();
            } }
        ]);
    },

    async exportExcel() {
        let csvContent = "data:text/csv;charset=utf-8,";
        const rows = window.todasDemandas;
        if(rows.length === 0) { await this.showAlert('Sem dados para exportar'); return; }
        
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

    async exportarRelatorioPDF() {
        const rows = this.demandasFiltradas || [];
        if (rows.length === 0) { await this.showAlert("Nenhuma demanda na tabela para exportar."); return; }

        const colsVisiveis = this.colunasVisiveis.filter(c => c.show && c.key !== 'processo');

        // Calcula larguras proporcionais para as colunas
        const colWidths = colsVisiveis.map(c => {
            if (c.key === 'numero') return '6%';
            if (c.key === 'data') return '8%';
            if (c.key === 'status') return '12%';
            if (c.key === 'coordenacao') return '14%';
            if (c.key === 'tipo') return '12%';
            if (c.key === 'responsavel') return '13%';
            if (c.key === 'escola') return '20%';
            if (c.key === 'demandante') return '15%';
            return '10%';
        });

        const colgroupHtml = colWidths.map(w => `<col style="width:${w}">`).join('');
        const theadCols = colsVisiveis.map((c, i) =>
            `<th style="padding:6px 8px; border:1px solid #ccc; background:#f1f5f9; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; width:${colWidths[i]}">${c.label}</th>`
        ).join('');

        // Cada linha vira sua própria <table> com page-break-inside:avoid
        const rowTablesHtml = rows.map(d => {
            const tds = colsVisiveis.map((c, i) => {
                let val = '-';
                switch(c.key) {
                    case 'numero': val = d.numero_registro || '-'; break;
                    case 'data': val = this.formatarDataBR(d.data_registro); break;
                    case 'demandante': val = d.demandante_nome || '-'; break;
                    case 'coordenacao': val = d.coordenadoria_nome || '-'; break;
                    case 'escola': val = d.escola_nome || '-'; break;
                    case 'tipo': val = d.tipo_nome || '-'; break;
                    case 'status': val = d.status_nome || '-'; break;
                    case 'responsavel': val = d.funcionario_nome || '-'; break;
                    case 'processo': val = d.processo_siged || '-'; break;
                }
                return `<td style="padding:6px 8px; border:1px solid #ddd; font-size:10px; word-wrap:break-word; overflow-wrap:break-word; width:${colWidths[i]}">${val}</td>`;
            }).join('');
            return `<table style="width:100%; border-collapse:collapse; table-layout:fixed; margin-top:-1px; page-break-inside:avoid;"><colgroup>${colgroupHtml}</colgroup><tbody><tr>${tds}</tr></tbody></table>`;
        }).join('');

        let htmlContent = `
            <div id="relatorio-pdf" style="padding: 20px; font-family: 'Inter', sans-serif; color:#333;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #0ea5e9; padding-bottom: 15px;">
                    <img src="assets/img/logo.png" style="height: 60px; object-fit: contain;" alt="Logo" onerror="this.style.display='none'">
                    <div style="text-align: center;">
                        <h2 style="margin:0; font-size: 18px; color: #1e293b;">Sistema de Gestão de Demandas</h2>
                        <h3 style="margin:2px 0; font-size: 14px; color: #475569; font-weight: normal;">Coordenadoria Regional de Educação de Manacapuru</h3>
                        <h4 style="margin:10px 0 0 0; font-size: 16px; color: #0ea5e9;">Relatório de Demandas</h4>
                        <p style="margin:5px 0 0 0; color: #64748b; font-size: 12px;">Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    <img src="assets/img/brasao.png" style="height: 60px; object-fit: contain;" alt="Brasão" onerror="this.style.display='none'">
                </div>
                <table style="width:100%; border-collapse:collapse; table-layout:fixed;"><colgroup>${colgroupHtml}</colgroup><thead><tr>${theadCols}</tr></thead></table>
                ${rowTablesHtml}
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);

        html2pdf().from(tempDiv.firstElementChild).set({
            margin: 10,
            filename: `Relatorio_Demandas_${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).save().then(() => {
            document.body.removeChild(tempDiv);
        });
    },


    async arquivarDemanda(id) {
        if(!this.temPermissao('excluir_demandas')) { await this.showAlert("Sem permissão"); return; }
        if(await this.showConfirm('Arquivar esta demanda?', 'Arquivar', 'Cancelar', false)) {
            await db.collection('demandas').doc(id).update({ arquivada: true });
            this.carregarDemandas();
        }
    },
    
    async desarquivarDemanda(id) {
        if(!this.temPermissao('excluir_demandas')) { await this.showAlert("Sem permissão"); return; }
        if(await this.showConfirm('Desarquivar esta demanda?', 'Desarquivar', 'Cancelar', false)) {
            await db.collection('demandas').doc(id).update({ arquivada: false });
            this.carregarDemandas();
        }
    },

    // Ações da Demanda
    async verAcoes(id) {
        // Obsoleto: Substituído por abrirDetalhesDemanda
        this.abrirDetalhesDemanda(id);
    },

    // --- NOVA TELA DE DETALHES ---
    async excluirDemandaEVoltar(id) {
        if(!this.temPermissao('excluir_demandas')) { await this.showAlert("Sem permissão."); return; }
        if(await this.showConfirm("Tem certeza que deseja mover esta demanda para a lixeira?", "Mover para Lixeira", "Cancelar")) {
            try {
                await db.collection('demandas').doc(id).update({ excluida: true, data_exclusao: new Date().toISOString() });
                await this.showAlert("Movida para a lixeira com sucesso.");
                this.voltarDemandas();
            } catch(e) { console.error(e); }
        }
    },
    
    async restaurarDemanda(id) {
        if(!this.temPermissao('excluir_demandas')) { await this.showAlert("Sem permissão."); return; }
        try {
            await db.collection('demandas').doc(id).update({ excluida: false });
            await this.showAlert("Demanda restaurada com sucesso!");
            if(this.currentView === 'demanda-detalhe') {
                this.abrirDetalhesDemanda(id);
            } else {
                this.carregarDemandas();
            }
        } catch(e) { console.error(e); }
    },
    
    async excluirDemandaDefinitivamente(id) {
        if(!this.temPermissao('excluir_demandas')) { await this.showAlert("Sem permissão."); return; }
        if(await this.showConfirm("Tem certeza que deseja EXCLUIR DEFINITIVAMENTE esta demanda? O histórico de ações também será apagado. Essa ação não pode ser desfeita.", "Excluir Definitivamente", "Cancelar")) {
            try {
                await db.collection('demandas').doc(id).delete();
                const acoes = await db.collection('acoes').where('demanda_id', '==', id).get();
                const batch = db.batch();
                acoes.forEach(a => batch.delete(a.ref));
                await batch.commit();
                await this.showAlert("Excluída permanentemente com sucesso.");
                
                if(this.currentView === 'demanda-detalhe' && this.demandaAbertaId === id) {
                    this.voltarDemandas();
                } else {
                    this.carregarDemandas();
                }
            } catch(e) { console.error(e); }
        }
    },

    async abrirDetalhesDemanda(id) {
        document.body.style.cursor = 'wait';
        this.currentView = 'demanda-detalhe';
        this.demandaAbertaId = id;
        try {
            const doc = await db.collection('demandas').doc(id).get();
            if(!doc.exists) return;
            const d = doc.data();

            // Bloqueia acesso a demandas sigilosas para quem não tem permissão
            if (d.sigilosa && !this.podeVerSigilosa()) {
                document.body.style.cursor = 'default';
                await this.showAlert('🔒 Acesso Negado: Esta é uma Demanda Sigilosa. Você não possui permissão para visualizá-la.');
                this.voltarDemandas();
                return;
            }

            // Carrega o template primeiro
            document.getElementById('contentArea').innerHTML = document.getElementById('view-demanda-detalhe').innerHTML;

            // Preenche dados
            const actionsDiv = document.getElementById('detalhe-actions');
            if (d.excluida) {
                actionsDiv.innerHTML = `
                    <button class="btn btn-primary" onclick="app.restaurarDemanda('${id}')"><i class="ri-arrow-go-back-line"></i> Restaurar</button>
                    <button class="btn btn-danger-outline" onclick="app.excluirDemandaDefinitivamente('${id}')"><i class="ri-delete-bin-fill"></i> Excluir Definitivamente</button>
                `;
            } else {
                actionsDiv.innerHTML = `
                    <button class="btn btn-secondary" onclick="app.editarDemanda('${id}')"><i class="ri-edit-line"></i> Editar</button>
                    ${d.arquivada 
                        ? `<button class="btn btn-secondary" onclick="app.desarquivarDemanda('${id}'); app.abrirDetalhesDemanda('${id}')"><i class="ri-inbox-unarchive-line"></i> Desarquivar</button>`
                        : `<button class="btn btn-secondary" onclick="app.arquivarDemanda('${id}'); app.abrirDetalhesDemanda('${id}')"><i class="ri-inbox-archive-line"></i> Arquivar</button>`
                    }
                    <button class="btn btn-secondary" onclick="app.gerarPdfDemandaNovaGuia('${id}')"><i class="ri-printer-line"></i> Imprimir</button>
                    <button class="btn btn-danger-outline" onclick="app.excluirDemandaEVoltar('${id}')"><i class="ri-delete-bin-line"></i> Excluir</button>
                `;
            }

            document.getElementById('detalhe-numero').innerText = `Nº ${d.numero_registro || '-'}`;
            document.getElementById('detalhe-status').innerText = d.status_nome || 'SEM STATUS';
            document.getElementById('detalhe-status').className = 'badge badge-' + this.getBadgeColor(d.status_nome);
            
            document.getElementById('detalhe-descricao').innerText = d.descricao || 'Sem descrição';
            document.getElementById('detalhe-data').innerText = this.formatarDataBR(d.data_registro);
            document.getElementById('detalhe-processo').innerText = d.processo_siged || '-';
            document.getElementById('detalhe-tipo').innerText = d.tipo_nome || '-';
            document.getElementById('detalhe-demandante').innerText = d.demandante_nome || '-';
            document.getElementById('detalhe-escola').innerText = d.escola_nome || '-';
            document.getElementById('detalhe-responsavel').innerText = d.funcionario_nome || '-';

            // Selects do form de ação
            const funcSnap = await db.collection('funcionarios').get();
            const statSnap = await db.collection('status_atendimento').get();
            const selResp = document.getElementById('detalhe-acao-responsavel');
            const selStat = document.getElementById('detalhe-acao-status');
            
            selResp.innerHTML = '<option value="">Selecione</option>' + funcSnap.docs.map(x => `<option value="${x.data().nome}">${x.data().nome}</option>`).join('');
            selStat.innerHTML = '<option value="">Selecione o status</option>' + statSnap.docs.map(x => `<option value="${x.data().nome}">${x.data().nome}</option>`).join('');
            document.getElementById('detalhe-acao-data').value = new Date().toISOString().split('T')[0];

            await this.carregarAcoesDetalhe(id);
        } catch(e) { console.error(e); }
        document.body.style.cursor = 'default';
    },

    voltarDemandas() {
        this.loadView('demandas');
    },

    async abrirFormNovaAcao(isEdit = false) {
        if(!isEdit && !this.temPermissao('criar_acoes')) { await this.showAlert("Sem permissão para criar ações"); return; }
        document.getElementById('detalhe-acao-form-container').style.display = 'block';
        document.getElementById('detalhe-acao-id').value = '';
        document.getElementById('detalhe-acao-descricao').value = '';
    },
    fecharFormNovaAcao() {
        document.getElementById('detalhe-acao-form-container').style.display = 'none';
    },

    async carregarAcoesDetalhe(id) {
        const snap = await db.collection('acoes').where('demanda_id', '==', id).get();
        let acoes = snap.docs.map(d => ({id: d.id, ...d.data()}));
        acoes.sort((a, b) => {
            const timeDiff = new Date(b.data_acao || 0) - new Date(a.data_acao || 0);
            if(timeDiff !== 0) return timeDiff;
            return new Date(b.criado_em || 0) - new Date(a.criado_em || 0);
        });

        const tbody = document.getElementById('detalhe-acoes-tbody');
        if(!tbody) return;

        if(acoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma ação registrada.</td></tr>';
            return;
        }

        tbody.innerHTML = acoes.map(a => `
            <tr>
                <td>${this.formatarDataBR(a.data_acao)}</td>
                <td>${a.descricao}</td>
                <td>${a.funcionario_nome || '-'}</td>
                <td>${a.status_nome ? `<span class="badge" style="background:var(--primary); color:white;">${a.status_nome}</span>` : '-'}</td>
                <td>
                    ${this.temPermissao('editar_acoes') ? `<button class="btn btn-sm btn-secondary" onclick="app.editarAcaoDetalhe('${a.id}')" title="Editar Ação"><i class="ri-edit-line"></i></button>` : ''}
                    ${this.temPermissao('excluir_acoes') ? `<button class="btn btn-sm btn-danger-outline" onclick="app.excluirAcaoDetalhe('${a.id}')" title="Excluir Ação" style="padding:4px 8px;"><i class="ri-delete-bin-line"></i></button>` : ''}
                </td>
            </tr>
        `).join('');
    },

    async editarAcaoDetalhe(idAcao) {
        if(!this.temPermissao('editar_acoes')) { await this.showAlert("Sem permissão"); return; }
        try {
            const doc = await db.collection('acoes').doc(idAcao).get();
            if(!doc.exists) return;
            const a = doc.data();

            this.abrirFormNovaAcao(true);
            document.getElementById('detalhe-acao-id').value = idAcao;
            document.getElementById('detalhe-acao-data').value = a.data_acao;
            document.getElementById('detalhe-acao-responsavel').value = a.funcionario_nome || '';
            document.getElementById('detalhe-acao-descricao').value = a.descricao || '';
            document.getElementById('detalhe-acao-status').value = a.status_nome || '';
            
            // Rola suavemente até o form
            document.getElementById('detalhe-acao-form-container').scrollIntoView({ behavior: 'smooth' });
        } catch(e) {
            console.error(e);
        }
    },

    async salvarAcaoDetalhe() {
        if(!this.temPermissao('criar_acoes') && !this.temPermissao('editar_acoes')) { await this.showAlert("Sem permissão"); return; }
        
        const idAcao = document.getElementById('detalhe-acao-id').value;
        const dataAcao = document.getElementById('detalhe-acao-data').value;
        const resp = document.getElementById('detalhe-acao-responsavel').value;
        const desc = document.getElementById('detalhe-acao-descricao').value;
        const status = document.getElementById('detalhe-acao-status').value;
        
        document.getElementById('btn-salvar-acao-detalhe').innerText = 'Salvando...';

        try {
            const acaoData = {
                demanda_id: this.demandaAbertaId,
                data_acao: dataAcao,
                criado_em: new Date().toISOString(),
                funcionario_nome: resp,
                descricao: desc,
                status_nome: status
            };

            if(idAcao) {
                await db.collection('acoes').doc(idAcao).update(acaoData);
            } else {
                await db.collection('acoes').add(acaoData);
            }

            if(status) {
                await db.collection('demandas').doc(this.demandaAbertaId).update({ status_nome: status });
            }

            this.fecharFormNovaAcao();
            await this.abrirDetalhesDemanda(this.demandaAbertaId); // Recarrega tudo
        } catch(e) {
            console.error(e);
            await this.showAlert("Erro ao salvar ação");
        }
        document.getElementById('btn-salvar-acao-detalhe').innerText = 'Registrar Ação';
    },

    async excluirAcaoDetalhe(idAcao) {
        if(!this.temPermissao('excluir_acoes')) { await this.showAlert("Sem permissão"); return; }
        if(await this.showConfirm("Excluir esta ação?", "Excluir", "Cancelar")) {
            await db.collection('acoes').doc(idAcao).delete();
            await this.carregarAcoesDetalhe(this.demandaAbertaId);
        }
    },

    // Nova Demanda
    async openModalDemanda(d = null) {
        if(!this.temPermissao(d ? 'editar_demandas' : 'criar_demandas')) { await this.showAlert("Sem permissão"); return; }

        const escolas = (await db.collection('escolas').get()).docs.map(d => d.data());
        const tipos = (await db.collection('tipos_demanda').get()).docs.map(d => d.data());
        const status = (await db.collection('status_atendimento').get()).docs.map(d => d.data());
        const func = (await db.collection('funcionarios').get()).docs.map(d => d.data());
        const dem = (await db.collection('demandantes').get()).docs.map(d => d.data());
        const coord = (await db.collection('coordenadorias').get()).docs.map(d => d.data());
        const setores = (await db.collection('setores').get()).docs.map(d => d.data());

        // Checkbox sigilosa só aparece para ADM ou quem tem ver_sigilosas
        const podeMarcaSigilosa = this.podeVerSigilosa();
        const isSigilosa = !!(d && d.sigilosa);

        const html = `
            <form id="demandaForm">
                ${d ? `<input type="hidden" name="id" value="${d.id}">` : ''}
                <div class="form-group">
                    <label>Descrição</label>
                    <textarea class="form-control" name="descricao" rows="3" required>${d ? (d.descricao||'') : ''}</textarea>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group" id="demandante-group">
                        <label style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Demandante</span>
                            <button type="button" id="btn-toggle-demandante"
                                onclick="app.toggleDemandanteManual()"
                                style="font-size:0.75rem; background:none; border:1px solid var(--primary-color); color:var(--primary-color); border-radius:20px; padding:2px 10px; cursor:pointer; white-space:nowrap;">
                                <i class="ri-edit-line"></i> Digitar manualmente
                            </button>
                        </label>
                        <select class="form-control" name="demandante_nome" id="demandante-select" required>
                            <option value="">Selecione...</option>
                            ${dem.map(x => `<option value="${x.nome}" ${d && d.demandante_nome === x.nome ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select>
                        <input type="text" class="form-control" name="demandante_nome_manual" id="demandante-input"
                            placeholder="Digite o nome do demandante..."
                            value="${d && !dem.find(x => x.nome === d.demandante_nome) ? (d.demandante_nome || '') : ''}"
                            style="display:none; margin-top:0;">
                    </div>
                    <div class="form-group">
                        <label>Coordenação</label>
                        <select class="form-control" name="coordenadoria_nome" required>
                            <option value="">Selecione...</option>
                            ${coord.map(x => `<option value="${x.nome}" ${d && d.coordenadoria_nome === x.nome ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Escola</label>
                        <select class="form-control" name="escola_nome">
                            <option value="">Selecione...</option>
                            ${escolas.map(x => `<option value="${x.nome}" ${d && d.escola_nome === x.nome ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tipo</label>
                        <select class="form-control" name="tipo_nome">
                            <option value="">Selecione...</option>
                            ${tipos.map(x => `<option value="${x.nome}" ${d && d.tipo_nome === x.nome ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Status Inicial</label>
                        <select class="form-control" name="status_nome">
                            <option value="">Selecione...</option>
                            ${status.map(x => `<option value="${x.nome}" ${d && d.status_nome === x.nome ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Setor</label>
                        <select class="form-control" name="setor_nome">
                            <option value="">Selecione...</option>
                            ${setores.map(x => `<option value="${x.nome}" ${d && d.setor_nome === x.nome ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Responsável</label>
                        <select class="form-control" name="funcionario_nome">
                            <option value="">Selecione...</option>
                            ${func.map(x => `<option value="${x.nome}" ${d && d.funcionario_nome === x.nome ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select>
                    </div>

                    ${podeMarcaSigilosa ? `
                    <div class="sigilosa-form-block" style="grid-column: 1 / -1;">
                        <div class="sigilosa-form-icon"><i class="ri-lock-password-line"></i></div>
                        <div class="sigilosa-form-text">
                            <strong>Demanda Sigilosa</strong>
                            <span>Somente o administrador e usuários autorizados poderão visualizar ou editar esta demanda.</span>
                        </div>
                        <input type="checkbox" class="sigilosa-checkbox" name="sigilosa" id="chk-sigilosa" value="1" ${isSigilosa ? 'checked' : ''}>
                    </div>
                    ` : ''}

                    <div class="form-group" style="grid-column: 1 / -1; border-top: 1px solid var(--border); padding-top: 15px; margin-top: 5px;">
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:600;">
                            <input type="checkbox" id="toggle-siged" name="tem_siged" value="1"
                                ${d && d.processo_siged && d.processo_siged !== '-' ? 'checked' : ''}
                                onchange="document.getElementById('siged-box').style.display = this.checked ? 'block' : 'none'"
                                style="width:18px; height:18px; cursor:pointer;">
                            Esta demanda possui número de processo SIGED
                        </label>
                    </div>
                    <div class="form-group" id="siged-box" style="grid-column: 1 / -1; display: ${d && d.processo_siged && d.processo_siged !== '-' ? 'block' : 'none'}; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-md); padding: 15px;">
                        <label style="font-weight:600; color:#1d4ed8;"><i class="ri-file-text-line"></i> Número do Processo SIGED</label>
                        <input class="form-control" name="processo_siged" id="campo-siged"
                            value="${d ? (d.processo_siged||'') : ''}"
                            placeholder="Ex: 01600.016741/2024-30"
                            style="margin-top:8px;">
                    </div>
                </div>
            </form>
        `;

        this.openModal(d ? 'Editar Demanda' : 'Nova Demanda', html, [
            { label: 'Salvar', class: 'btn-primary', action: () => this.salvarDemanda(!!d) }
        ]);

        // Se estiver editando e o demandante não existir no banco (foi digitado manualmente),
        // ativa automaticamente o modo manual
        if (d && d.demandante_nome && !dem.find(x => x.nome === d.demandante_nome)) {
            setTimeout(() => this.toggleDemandanteManual(true), 50);
        }
    },

    toggleDemandanteManual(forcarManual = false) {
        const sel = document.getElementById('demandante-select');
        const inp = document.getElementById('demandante-input');
        const btn = document.getElementById('btn-toggle-demandante');
        if (!sel || !inp || !btn) return;

        const modoManualAtivo = sel.style.display === 'none';

        if (forcarManual || !modoManualAtivo) {
            // Ativar modo manual
            sel.style.display = 'none';
            sel.removeAttribute('required');
            sel.value = '';
            inp.style.display = 'block';
            inp.setAttribute('required', 'required');
            btn.innerHTML = '<i class="ri-list-unordered"></i> Selecionar do banco';
            btn.style.borderColor = 'var(--warning-color, #f59e0b)';
            btn.style.color = 'var(--warning-color, #f59e0b)';
            inp.focus();
        } else {
            // Voltar para o select
            inp.style.display = 'none';
            inp.removeAttribute('required');
            inp.value = '';
            sel.style.display = 'block';
            sel.setAttribute('required', 'required');
            btn.innerHTML = '<i class="ri-edit-line"></i> Digitar manualmente';
            btn.style.borderColor = 'var(--primary-color)';
            btn.style.color = 'var(--primary-color)';
        }
    },

    async salvarDemanda(isEdit) {
        const form = document.getElementById('demandaForm');

        // Se modo manual estiver ativo, transfere o valor do input para o campo que será salvo
        const sel = document.getElementById('demandante-select');
        const inp = document.getElementById('demandante-input');
        if (sel && inp && sel.style.display === 'none') {
            // Cria um campo oculto temporário com o nome correto para o FormData capturar
            let hiddenField = form.querySelector('input[name="demandante_nome"]');
            if (!hiddenField) {
                hiddenField = document.createElement('input');
                hiddenField.type = 'hidden';
                hiddenField.name = 'demandante_nome';
                form.appendChild(hiddenField);
            }
            hiddenField.value = inp.value.trim();
        }

        if(!form.checkValidity()) return form.reportValidity();
        const data = Object.fromEntries(new FormData(form));

        // Trata o campo sigilosa (checkbox retorna '1' quando marcado, ausente quando desmarcado)
        data.sigilosa = data.sigilosa === '1';

        // Remove o campo auxiliar manual (não deve ser salvo no banco)
        delete data.demandante_nome_manual;
        // Remove campo auxiliar SIGED toggle
        delete data.tem_siged;
        
        if (isEdit) {
            const id = data.id;
            delete data.id;
            await db.collection('demandas').doc(id).update(data);
        } else {
            data.arquivada = false;
            data.data_registro = new Date().toISOString().split('T')[0];
            data.numero_registro = await this.gerarNumeroDemanda();
            await db.collection('demandas').add(data);
        }

        this.closeModal();
        this.carregarDemandas();
    },

    async gerarNumeroDemanda() {
        const anoAtual = new Date().getFullYear();
        const ref = db.collection('configuracoes').doc('contador_demandas');
        
        let novoNumeroStr = '';
        
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            let seq = 1;
            
            if (doc.exists) {
                const data = doc.data();
                if (data.ano === anoAtual) {
                    seq = (data.sequencia || 0) + 1;
                }
            }
            
            transaction.set(ref, { ano: anoAtual, sequencia: seq }, { merge: true });
            
            const seqFormatada = String(seq).padStart(4, '0');
            novoNumeroStr = `${seqFormatada}/${anoAtual}`;
        });
        
        return novoNumeroStr;
    },

    async resetarContadorDemandas() {
        if(!this.temPermissao('gerenciar_cadastros')) { await this.showAlert("Sem permissão"); return; }
        if(await this.showConfirm("ATENÇÃO: Deseja zerar o contador de número das Demandas? A próxima começará com 0001 do ano atual.\\n\\nIsso NÃO afeta nem exclui as demandas já existentes!")) {
            const anoAtual = new Date().getFullYear();
            await db.collection('configuracoes').doc('contador_demandas').set({ ano: anoAtual, sequencia: 0 });
            await this.showAlert("Contador resetado com sucesso! A próxima demanda será a 0001.");
        }
    },

    async renumerarTudo() {
        if(!this.temPermissao('gerenciar_cadastros')) { await this.showAlert("Sem permissão"); return; }
        if(!await this.showConfirm("ALERTA VERMELHO: Isso vai APAGAR a numeração atual de TODAS as demandas existentes na tabela e vai gerar números sequenciais (0001, 0002...) baseados na data de criação.\\n\\nDeseja prosseguir?")) return;
        
        try {
            document.body.style.cursor = 'wait';
            const anoAtual = new Date().getFullYear();
            
            // Busca todas as demandas
            const snap = await db.collection('demandas').get();
            let demandas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Ordena da mais antiga para a mais nova, para numerar em ordem cronológica
            demandas.sort((a, b) => new Date(a.data_registro || 0) - new Date(b.data_registro || 0));
            
            const batch = db.batch();
            let seq = 1;
            
            for(let d of demandas) {
                const seqFormatada = String(seq).padStart(4, '0');
                const novoNumero = `${seqFormatada}/${anoAtual}`;
                
                const docRef = db.collection('demandas').doc(d.id);
                batch.update(docRef, { numero_registro: novoNumero });
                seq++;
            }
            
            // Grava tudo no banco
            await batch.commit();
            
            // Atualiza o contador para a próxima ser a certa
            await db.collection('configuracoes').doc('contador_demandas').set({ ano: anoAtual, sequencia: seq - 1 });
            
            document.body.style.cursor = 'default';
            await this.showAlert(`Sucesso! ${demandas.length} demandas foram renumeradas.`);
            this.carregarDemandas();
            
        } catch(e) {
            document.body.style.cursor = 'default';
            console.error(e);
            await this.showAlert("Erro ao renumerar: " + e.message);
        }
    },

    async gerarPdfDemandaNovaGuia(id) {
        document.body.style.cursor = 'wait';
        try {
            const doc = await db.collection('demandas').doc(id).get();
            if(!doc.exists) return;
            const d = doc.data();

            const acoesSnap = await db.collection('acoes').where('demanda_id', '==', id).get();
            let acoes = acoesSnap.docs.map(a => a.data());
            acoes.sort((a, b) => {
                const timeDiff = new Date(b.data_acao || 0) - new Date(a.data_acao || 0);
                if(timeDiff !== 0) return timeDiff;
                return new Date(b.criado_em || 0) - new Date(a.criado_em || 0);
            });

            let html = `
                <div id="ficha-demanda-pdf" style="padding: 20px; font-family: 'Inter', sans-serif; color: #333;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #0ea5e9; padding-bottom: 15px;">
                        <img src="${window.location.origin}/assets/img/logo.png" style="height: 60px; object-fit: contain;" alt="Logo" onerror="this.style.display='none'">
                        <div style="text-align: center;">
                            <h2 style="margin:0; font-size: 18px; color: #1e293b;">Sistema de Gestão de Demandas</h2>
                            <h3 style="margin:2px 0; font-size: 14px; color: #475569; font-weight: normal;">Coordenadoria Regional de Educação de Manacapuru</h3>
                            <h4 style="margin:10px 0 0 0; font-size: 16px; color: #0ea5e9;">Ficha da Demanda - Nº ${d.numero_registro || '-'}</h4>
                        </div>
                        <img src="${window.location.origin}/assets/img/brasao.png" style="height: 60px; object-fit: contain;" alt="Brasão" onerror="this.style.display='none'">
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd; width: 30%;"><strong>Data de Registro:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${this.formatarDataBR(d.data_registro)}</td></tr>
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Demandante:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.demandante_nome || '-'}</td></tr>
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Coordenação:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.coordenadoria_nome || '-'}</td></tr>
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Escola:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.escola_nome || '-'}</td></tr>
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tipo da Demanda:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.tipo_nome || '-'}</td></tr>
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status Atual:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.status_nome || '-'}</td></tr>
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Processo SIGED:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.processo_siged || '-'}</td></tr>
                        <tr style="page-break-inside: avoid;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Responsável:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${d.funcionario_nome || '-'}</td></tr>
                    </table>
                    
                    <div style="margin-bottom: 20px; page-break-inside: avoid;">
                        <h4 style="margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #eee;">Descrição</h4>
                        <p style="background: #f8fafc; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; white-space: pre-wrap;">${d.descricao || 'Sem descrição.'}</p>
                    </div>
                    
                    <h4 style="margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #eee;">Histórico de Ações</h4>
                    <table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed;">
                        <colgroup><col style="width:15%"><col style="width:65%"><col style="width:20%"></colgroup>
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th style="padding:8px; border:1px solid #ddd;">Data</th>
                                <th style="padding:8px; border:1px solid #ddd;">Ação/Descrição</th>
                                <th style="padding:8px; border:1px solid #ddd;">Usuário</th>
                            </tr>
                        </thead>
                    </table>
                    ${acoes.length
                        ? acoes.map(a => `<table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; margin-top:-1px; page-break-inside:avoid;"><colgroup><col style="width:15%"><col style="width:65%"><col style="width:20%"></colgroup><tbody><tr><td style="padding:8px; border:1px solid #ddd; word-wrap:break-word;">${this.formatarDataBR(a.data_acao)} ${a.hora_acao || ''}</td><td style="padding:8px; border:1px solid #ddd; word-wrap:break-word; overflow-wrap:break-word;">${a.descricao || '-'}</td><td style="padding:8px; border:1px solid #ddd; word-wrap:break-word;">${a.funcionario_nome || '-'}</td></tr></tbody></table>`).join('')
                        : `<table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; margin-top:-1px; page-break-inside:avoid;"><colgroup><col style="width:15%"><col style="width:65%"><col style="width:20%"></colgroup><tbody><tr><td colspan="3" style="padding:8px; border:1px solid #ddd; text-align:center;">Nenhuma ação registrada.</td></tr></tbody></table>`
                    }
                </div>
            `;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            document.body.appendChild(tempDiv);

            const opt = {
                margin: 10,
                filename: `Demanda_${d.numero_registro ? d.numero_registro.replace('/','-') : id}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            const pdfBlobUrl = await html2pdf().from(tempDiv.firstElementChild).set(opt).output('bloburl');
            window.open(pdfBlobUrl, '_blank');
            document.body.removeChild(tempDiv);
        } catch (e) {
            console.error("Erro ao gerar PDF:", e);
            await this.showAlert("Erro ao gerar PDF.");
        }
        document.body.style.cursor = 'default';
    },

    async excluirDemanda(id) {
        if(!this.temPermissao('excluir_demandas')) { await this.showAlert("Sem permissão para excluir demandas."); return; }
        if(await this.showConfirm("Tem certeza que deseja mover esta demanda para a lixeira?", "Mover para Lixeira", "Cancelar")) {
            try {
                await db.collection('demandas').doc(id).update({ excluida: true, data_exclusao: new Date().toISOString() });
                
                await this.showAlert("Demanda movida para a lixeira com sucesso!");
                this.carregarDemandas();
            } catch(e) {
                console.error("Erro ao mover para a lixeira:", e);
                await this.showAlert("Erro ao mover demanda para a lixeira.");
            }
        }
    },

    async openModalImportar() {
        if(!this.temPermissao('criar_demandas')) { await this.showAlert("Sem permissão"); return; }
        
        const html = `
            <div class="alert alert-info" style="margin-bottom: 15px; padding: 15px; background: #e0f2fe; border-radius: 8px; color: #0369a1; border: 1px solid #bae6fd;">
                <strong>Instruções de Importação:</strong><br>
                1. Abra sua planilha do Excel.<br>
                2. Selecione as linhas contendo os dados (copie APENAS as linhas, não copie o cabeçalho).<br>
                3. Cole no campo abaixo (usando Ctrl+V).<br><br>
                <em>Aviso: A ordem esperada das colunas na planilha deve ser exatamente:<br>
                Data | Tipo | Status | Demandante | Função | Escola | Servidor Resp. | Matrícula | Descrição | Arquivada</em>
            </div>
            <textarea id="importText" class="form-control" rows="8" placeholder="Cole os dados do Excel aqui..."></textarea>
        `;

        this.openModal('Importar Demandas em Massa (Excel)', html, [
            { label: 'Cancelar', class: 'btn-secondary', action: () => this.closeModal() },
            { label: 'Processar e Importar', class: 'btn-primary', action: () => this.processarImportacao() }
        ]);
    },

    async processarImportacao() {
        const text = document.getElementById('importText').value.trim();
        if(!text) { await this.showAlert("Cole os dados primeiro!"); return; }

        const linhas = text.split('\n');
        let sucesso = 0;

        document.getElementById('modalFooter').innerHTML = '<span>Importando... aguarde.</span>';

        for(let linha of linhas) {
            const cols = linha.split('\t');
            if(cols.length < 8) continue; // Pula linhas inválidas ou curtas

            // Parse da Data (de DD/MM/YYYY para YYYY-MM-DD)
            let dataFormated = cols[0].trim();
            if (dataFormated.includes('/')) {
                const parts = dataFormated.split('/');
                if (parts.length === 3) dataFormated = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            const tipo = cols[1]?.trim() || '';
            const status = cols[2]?.trim() || '';
            const demandante = cols[3]?.trim() || '';
            const escola = cols[5]?.trim() || '';
            const servidor = cols[6]?.trim() || '';
            const descricao = cols[8]?.trim() || '';
            const arquivadaStr = cols[9]?.trim().toLowerCase() || 'não';
            const arquivada = (arquivadaStr === 'sim' || arquivadaStr === 'true');

            // Gera numeração sequencial
            const numSequencial = await this.gerarNumeroDemanda();

            // Salva a demanda
            await db.collection('demandas').add({
                data_registro: dataFormated,
                numero_registro: numSequencial,
                tipo_nome: tipo,
                status_nome: status,
                demandante_nome: demandante,
                escola_nome: escola,
                funcionario_nome: servidor,
                descricao: descricao,
                arquivada: arquivada
            });

            // Auto-cadastrar nas tabelas base para preencher os dropdowns (se não existirem)
            await this.autoCadastrarBase('tipos_demanda', tipo);
            await this.autoCadastrarBase('status_atendimento', status);
            await this.autoCadastrarBase('escolas', escola);
            await this.autoCadastrarBase('demandantes', demandante);
            await this.autoCadastrarBase('funcionarios', servidor);
            
            sucesso++;
        }

        this.closeModal();
        await this.showAlert(`${sucesso} demandas importadas com sucesso!`);
        this.carregarDemandas();
    },

    async autoCadastrarBase(tabela, nome) {
        if(!nome || nome === '-' || nome.toUpperCase() === 'NÃO SE APLICA') return;
        const snap = await db.collection(tabela).where('nome', '==', nome).get();
        if(snap.empty) {
            await db.collection(tabela).add({ nome: nome });
        }
    },

    async editarDemanda(id) {
        if(!this.temPermissao('editar_demandas')) { await this.showAlert("Sem permissão"); return; }
        const doc = await db.collection('demandas').doc(id).get();
        if(!doc.exists) { await this.showAlert("Demanda não encontrada."); return; }
        const d = doc.data();
        // Bloqueia edição de demandas sigilosas para quem não tem permissão
        if (d.sigilosa && !this.podeVerSigilosa()) {
            await this.showAlert('🔒 Acesso Negado: Esta é uma Demanda Sigilosa. Você não possui permissão para editá-la.');
            return;
        }
        d.id = doc.id;
        this.openModalDemanda(d);
    },

    // Utilidade para gerar cor fixa a partir de uma string
    getColorForText(str) {
        if (!str) return { bg: '#e2e8f0', color: '#475569' };
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        const colors = [
            { bg: '#dbeafe', color: '#1e40af' }, // azul
            { bg: '#dcfce7', color: '#166534' }, // verde
            { bg: '#fef3c7', color: '#92400e' }, // amarelo
            { bg: '#fee2e2', color: '#991b1b' }, // vermelho
            { bg: '#f3e8ff', color: '#6b21a8' }, // roxo
            { bg: '#ffedd5', color: '#9a3412' }, // laranja
            { bg: '#e0e7ff', color: '#3730a3' }  // indigo
        ];
        return colors[Math.abs(hash) % colors.length];
    },

    // --- KANBAN ---
    async initKanban() {
        const board = document.getElementById('kanbanBoard');
        board.innerHTML = '';
        this.kanbanSortables.forEach(s => s.destroy());
        this.kanbanSortables = [];

        const statusSnap = await db.collection('status_atendimento').get();
        const statusList = statusSnap.docs.map(d => d.data());

        let query = db.collection('demandas').where('arquivada', '==', false);
        if (this.userDoc && this.userDoc.role === 'COMUM' && this.userDoc.coordenadoria_nome !== 'REGIONAL / GABINETE') {
            query = query.where('coordenadoria_nome', '==', this.userDoc.coordenadoria_nome);
        }
        const demSnap = await query.get();
        // Filtra sigilosas para quem não tem permissão
        const demandas = demSnap.docs.map(d => ({id: d.id, ...d.data()}))
            .filter(d => d.sigilosa ? this.podeVerSigilosa() : true);

        statusList.forEach(s => {
            const colDemandas = demandas.filter(d => d.status_nome == s.nome);
            const col = document.createElement('div');
            col.className = 'kanban-column';
            col.innerHTML = `
                <div class="kanban-header">${s.nome} <span>${colDemandas.length}</span></div>
                <div class="kanban-items" data-status="${s.nome}">
                    ${colDemandas.map(d => {
                        const coordColor = this.getColorForText(d.coordenadoria_nome);
                        const tipoColor = this.getColorForText(d.tipo_nome);
                        return `
                        <div class="kanban-card" data-id="${d.id}" style="border-left: 4px solid var(--${this.getBadgeColor(d.status_nome)}-color, var(--primary-color));">
                            <div class="kanban-card-title">#${d.numero_registro || d.id.substring(0,5)} - ${d.escola_nome || 'Sem escola'}</div>
                            <div class="kanban-card-meta">
                                <span class="badge" style="background:${coordColor.bg}; color:${coordColor.color};">${d.coordenadoria_nome || '-'}</span> 
                                <span class="badge" style="background:${tipoColor.bg}; color:${tipoColor.color};">${d.tipo_nome || '-'}</span>
                            </div>
                        </div>
                        `}).join('')}
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
        let query = db.collection('demandas').where('arquivada', '==', false);
        if (this.userDoc && this.userDoc.role === 'COMUM' && this.userDoc.coordenadoria_nome) {
            query = query.where('coordenadoria_nome', '==', this.userDoc.coordenadoria_nome);
        }
        const snap = await query.get();
        const demandas = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        const events = demandas.filter(d => d.data_registro).map(d => ({
            title: `#${d.numero_registro} ${d.escola_nome}`,
            start: d.data_registro,
            url: `javascript:app.abrirDetalhesDemanda('${d.id}')`,
            backgroundColor: `var(--${this.getBadgeColor(d.status_nome)}-color, var(--primary-color))`,
            borderColor: `var(--${this.getBadgeColor(d.status_nome)}-color, var(--primary-color))`
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
                <button class="btn btn-sm btn-secondary" onclick='app.editarCadastro(${JSON.stringify(row)})'><i class="ri-edit-line"></i></button>
                <button class="btn btn-sm btn-danger" onclick="app.deletarCadastro('${row.id}')"><i class="ri-delete-bin-line"></i></button>
            </td></tr>`;
        });
    },

    editarCadastro(row) {
        this.openModalCadastro(row);
    },

    async openModalCadastro(row = null) {
        if(!this.temPermissao('gerenciar_cadastros')) { await this.showAlert("Sem permissão"); return; }
        const tabela = window.currentCadastroTable;
        let html = `<form id="cadastroForm">`;
        if (row) html += `<input type="hidden" name="id" value="${row.id}">`;
        
        const fields = {
            'escolas': ['nome', 'sigeam', 'inep'],
            'coordenadorias': ['nome'],
            'funcionarios': ['nome', 'cargo', 'funcao', 'matricula', 'portaria'],
            'demandantes': ['nome', 'cargo', 'funcao', 'rg', 'cpf', 'matricula', 'endereco', 'contato'],
            'setores': ['nome'],
            'tipos_demanda': ['nome'],
            'status_atendimento': ['nome']
        };

        (fields[tabela] || ['nome']).forEach(f => {
            const isRequired = (f === 'nome');
            const requiredAttr = isRequired ? 'required' : '';
            const labelSuffix = isRequired
                ? ' <span style="color:var(--danger-color); font-size:0.8rem;" title="Campo obrigatório">*</span>'
                : ' <span style="color:var(--text-muted); font-size:0.75rem; font-weight:400;">(opcional)</span>';
            html += `<div class="form-group"><label>${f.charAt(0).toUpperCase() + f.slice(1)}${labelSuffix}</label><input class="form-control" name="${f}" value="${row ? (row[f]||'') : ''}" ${requiredAttr} placeholder="${isRequired ? 'Obrigatório' : 'Opcional'}"></div>`;
        });
        html += `</form>`;

        this.openModal(row ? 'Editar Cadastro: ' + tabela : 'Novo Cadastro: ' + tabela, html, [
            { label: 'Salvar', class: 'btn-primary', action: () => this.salvarCadastro(!!row) }
        ]);
    },

    async salvarCadastro(isEdit) {
        const form = document.getElementById('cadastroForm');
        if(!form.checkValidity()) return form.reportValidity();
        const data = Object.fromEntries(new FormData(form).entries());
        
        if (isEdit) {
            const id = data.id;
            delete data.id;
            await db.collection(window.currentCadastroTable).doc(id).update(data);
        } else {
            await db.collection(window.currentCadastroTable).add(data);
        }

        this.closeModal();
        this.loadCadastroTable(window.currentCadastroTable);
    },

    async deletarCadastro(id) {
        if(!this.temPermissao('gerenciar_cadastros')) { await this.showAlert("Sem permissão"); return; }
        if(await this.showConfirm('Excluir este registro?', 'Excluir', 'Cancelar')) {
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
            const btnReset = (u.login === 'admin' || u.metodo_login === 'google') ? '' : `<button class="btn btn-sm btn-warning" onclick="app.resetarSenhaUsuario('${u.email}', '${u.id}')" title="Enviar link de reset e forçar troca de senha"><i class="ri-mail-send-line"></i></button>`;
            
            let badges = '';
            if (u.role === 'ADM') badges = '<span class="badge badge-FINALIZADA">Acesso Total</span>';
            else {
                if(u.coordenadoria_nome) badges += `<span class="badge" style="background:#e0e7ff; color:#3730a3; margin-bottom: 5px;">${u.coordenadoria_nome}</span><br>`;
                const p = u.permissoes || {};
                const checkPerm = (val, label) => val ? `<span class="badge" style="background:#e2e8f0; color:#333; margin-top:2px;">${label}</span> ` : '';
                
                badges += checkPerm(p.criar_demandas, 'Criar Dem');
                badges += checkPerm(p.visualizar_demandas, 'Ver Dem');
                badges += checkPerm(p.editar_demandas, 'Edit Dem');
                if (p.ver_sigilosas) badges += `<span class="badge-sigilosa" style="margin-top:2px;"><i class="ri-lock-line"></i>Sigilosas</span> `;
                badges += checkPerm(p.excluir_demandas, 'Exc Dem');
                badges += checkPerm(p.criar_acoes, 'Criar Ação');
                badges += checkPerm(p.gerenciar_cadastros, 'Cadastros');
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id.substring(0,5)}...</td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td>${badges}</td>
                <td>
                    ${btnReset}
                    <button class="btn btn-sm btn-secondary" onclick='app.editarUsuario(${JSON.stringify(u)})'><i class="ri-edit-line"></i></button>
                    ${btnExcluir}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    async resetarSenhaUsuario(email, userId) {
        if(!await this.showConfirm(`Deseja enviar um e-mail de redefinição de senha para ${email} e forçar troca no login?`, "Enviar", "Cancelar", false)) return;
        try {
            await auth.sendPasswordResetEmail(email);
            await db.collection('usuarios').doc(userId).update({ primeiro_login: true, metodo_login: 'email' });
            await this.showAlert('E-mail enviado e flag de primeiro login ativada para este usuário.');
            this.initUsuarios();
        } catch(e) {
            await this.showAlert("Erro ao enviar reset de senha: " + e.message);
        }
    },

    async openModalUsuario(u = null) {
        document.body.style.cursor = 'wait';
        const isEdit = !!u;
        let coordHtml = '<option value="">Sem Coordenação (Verá tudo)</option>';
        try {
            const coordSnap = await db.collection('coordenadorias').get();
            coordSnap.docs.forEach(doc => {
                const c = doc.data();
                const sel = (u && u.coordenadoria_nome === c.nome) ? 'selected' : '';
                coordHtml += `<option value="${c.nome}" ${sel}>${c.nome}</option>`;
            });
        } catch(e) { console.error(e); }
        document.body.style.cursor = 'default';

        const p = u ? (u.permissoes || {}) : {};
        const chk = (val) => val ? 'checked' : '';

        const html = `
            <form id="userForm">
                ${isEdit ? `<input type="hidden" name="id" value="${u.id}">` : ''}
                <div class="form-group">
                    <label>E-mail (Conta do Google ou Pessoal)</label>
                    <input type="email" class="form-control" name="email" value="${u ? u.email : ''}" ${isEdit ? 'readonly' : 'required'}>
                </div>
                
                ${!isEdit ? `
                <div class="form-group">
                    <label>Método de Acesso</label>
                    <select class="form-control" name="metodo_login" onchange="document.getElementById('senhaBox').style.display = this.value === 'google' ? 'none' : 'block'">
                        <option value="google">Conta Google (Apenas autorizar o email)</option>
                        <option value="email">E-mail com Senha (Criar senha inicial)</option>
                    </select>
                </div>
                <div class="form-group" id="senhaBox" style="display:none;">
                    <label>Senha Inicial</label>
                    <input type="password" class="form-control" name="senha">
                </div>
                ` : ''}

                <div class="form-group">
                    <label>Perfil</label>
                    <select class="form-control" name="role" id="roleSelect" onchange="document.getElementById('permissoesBox').style.display = this.value === 'COMUM' ? 'block' : 'none'">
                        <option value="COMUM" ${u && u.role === 'COMUM' ? 'selected' : ''}>Comum</option>
                        <option value="ADM" ${u && u.role === 'ADM' ? 'selected' : ''}>Administrador</option>
                    </select>
                </div>
                <div id="permissoesBox" style="display: ${!u || u.role === 'COMUM' ? 'block' : 'none'}; background: var(--background); padding: 15px; border-radius: var(--radius-md);">
                    <div class="form-group">
                        <label>Coordenação (Filtra dados do usuário comum)</label>
                        <select class="form-control" name="coordenadoria_nome">
                            ${coordHtml}
                        </select>
                    </div>
                    <strong>Permissões Específicas (Para perfil comum)</strong><br><br>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <label><input type="checkbox" name="p_criar_demandas" value="1" ${chk(p.criar_demandas)}> Pode Criar Demandas</label>
                        <label><input type="checkbox" name="p_visualizar_demandas" value="1" ${chk(p.visualizar_demandas)}> Pode Visualizar Demandas</label>
                        <label><input type="checkbox" name="p_imprimir_demandas" value="1" ${chk(p.imprimir_demandas)}> Pode Imprimir Demandas</label>
                        <label><input type="checkbox" name="p_editar_demandas" value="1" ${chk(p.editar_demandas)}> Pode Editar Demandas</label>
                        <label><input type="checkbox" name="p_excluir_demandas" value="1" ${chk(p.excluir_demandas)}> Pode Excluir Demandas</label>
                        <label><input type="checkbox" name="p_arquivar_demandas" value="1" ${chk(p.arquivar_demandas)}> Pode Arquivar Demandas</label>
                        <label><input type="checkbox" name="p_gerenciar_cadastros" value="1" ${chk(p.gerenciar_cadastros)}> Pode Gerenciar Cadastros Base</label>
                        <label><input type="checkbox" name="p_criar_acoes" value="1" ${chk(p.criar_acoes)}> Pode Criar Ações</label>
                        <label><input type="checkbox" name="p_visualizar_acoes" value="1" ${chk(p.visualizar_acoes)}> Pode Visualizar Ações</label>
                        <label><input type="checkbox" name="p_imprimir_acoes" value="1" ${chk(p.imprimir_acoes)}> Pode Imprimir Ações</label>
                        <label><input type="checkbox" name="p_editar_acoes" value="1" ${chk(p.editar_acoes)}> Pode Editar Ações</label>
                        <label><input type="checkbox" name="p_excluir_acoes" value="1" ${chk(p.excluir_acoes)}> Pode Excluir Ações</label>
                        <label style="grid-column:1/-1; background:#fff1f2; border:1px solid #fca5a5; border-radius:6px; padding:8px 12px;"><input type="checkbox" name="p_ver_sigilosas" value="1" ${chk(p.ver_sigilosas)}> 🔒 Pode Ver/Editar <strong>Demandas Sigilosas</strong></label>
                    </div>
                </div>
            </form>
        `;

        this.openModal(isEdit ? 'Editar Permissões' : 'Autorizar Novo Usuário', html, [
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
        const coord = fd.get('coordenadoria_nome');
        const permissoes = {
            criar_demandas: !!fd.get('p_criar_demandas'),
            visualizar_demandas: !!fd.get('p_visualizar_demandas'),
            imprimir_demandas: !!fd.get('p_imprimir_demandas'),
            editar_demandas: !!fd.get('p_editar_demandas'),
            excluir_demandas: !!fd.get('p_excluir_demandas'),
            arquivar_demandas: !!fd.get('p_arquivar_demandas'),
            gerenciar_cadastros: !!fd.get('p_gerenciar_cadastros'),
            criar_acoes: !!fd.get('p_criar_acoes'),
            visualizar_acoes: !!fd.get('p_visualizar_acoes'),
            imprimir_acoes: !!fd.get('p_imprimir_acoes'),
            editar_acoes: !!fd.get('p_editar_acoes'),
            excluir_acoes: !!fd.get('p_excluir_acoes'),
            ver_sigilosas: !!fd.get('p_ver_sigilosas')
        };

        if(isEdit) {
            const id = fd.get('id');
            await db.collection('usuarios').doc(id).update({ role, permissoes, coordenadoria_nome: coord });
            this.closeModal();
            this.initUsuarios();
        } else {
            const metodo = fd.get('metodo_login');
            try {
                if (metodo === 'google') {
                    await db.collection('usuarios').add({
                        login: email.split('@')[0],
                        email: email,
                        role: role,
                        permissoes: permissoes,
                        coordenadoria_nome: coord
                    });
                } else {
                    const senha = fd.get('senha');
                    if(!senha) { await this.showAlert("Por favor, digite a senha inicial."); return; }
                    
                    const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
                    const res = await secondaryApp.auth().createUserWithEmailAndPassword(email, senha);
                    
                    await db.collection('usuarios').doc(res.user.uid).set({
                        login: email.split('@')[0],
                        email: email,
                        role: role,
                        permissoes: permissoes,
                        coordenadoria_nome: coord
                    });
                    
                    secondaryApp.auth().signOut();
                    secondaryApp.delete();
                }

                this.closeModal();
                this.initUsuarios();
            } catch (e) {
                await this.showAlert("Erro ao criar usuário: " + e.message);
            }
        }
    },

    async deletarUsuario(id) {
        if(await this.showConfirm('Remover acesso deste usuário?', 'Remover', 'Cancelar')) {
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

            await this.showAlert('Banco e Admin mestre configurados com sucesso! Entre usando email admin@admin.com e senha admin123');
        } catch(e) {
            await this.showAlert('Erro no setup: ' + e.message);
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
    },

    // =========================================
    // CUSTOM POPUP (substitui alert/confirm nativos)
    // =========================================

    _popupResolve: null,

    _getPopupType(msg) {
        const m = (msg || '').toLowerCase();
        if (m.includes('sucesso') || m.includes('importad') || m.includes('renumerad') || m.includes('configurad') || m.includes('enviada')) return 'success';
        if (m.includes('erro') || m.includes('falha') || m.includes('negado')) return 'error';
        if (m.includes('atenção') || m.includes('atencao') || m.includes('alerta') || m.includes('cuidado') || m.includes('resetad')) return 'warning';
        if (m.includes('excluir') || m.includes('apagar') || m.includes('remover') || m.includes('deletar') || m.includes('deseja') || m.includes('certeza') || m.includes('zerar') || m.includes('renumerar')) return 'confirm';
        return 'info';
    },

    _getPopupIcon(type) {
        const icons = {
            success: 'ri-checkbox-circle-fill',
            error:   'ri-error-warning-fill',
            warning: 'ri-alert-fill',
            info:    'ri-information-fill',
            confirm: 'ri-question-fill'
        };
        return icons[type] || icons.info;
    },

    _getPopupTitle(type) {
        const titles = {
            success: 'Sucesso',
            error:   'Erro',
            warning: 'Atenção',
            info:    'Informação',
            confirm: 'Confirmação'
        };
        return titles[type] || 'Aviso';
    },

    _showPopup(message, type, buttons) {
        const overlay  = document.getElementById('customPopupOverlay');
        const iconEl   = document.getElementById('customPopupIcon');
        const titleEl  = document.getElementById('customPopupTitle');
        const msgEl    = document.getElementById('customPopupMessage');
        const actionsEl= document.getElementById('customPopupActions');
        if (!overlay) { return; }

        iconEl.className  = `custom-popup-icon popup-icon-${type}`;
        iconEl.innerHTML  = `<i class="${this._getPopupIcon(type)}"></i>`;
        titleEl.innerText = this._getPopupTitle(type);
        msgEl.innerText   = message;

        actionsEl.innerHTML = '';
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.className = `btn ${b.cls}`;
            btn.innerText = b.label;
            btn.onclick = () => {
                overlay.classList.remove('active');
                setTimeout(() => { if (this._popupResolve) { this._popupResolve(b.value); this._popupResolve = null; } }, 220);
            };
            actionsEl.appendChild(btn);
        });

        overlay.classList.add('active');

        // Fecha ao clicar no fundo (apenas para alert, não confirm)
        overlay._bgHandler = (e) => {
            if (e.target === overlay && buttons.length === 1) {
                overlay.classList.remove('active');
                setTimeout(() => { if (this._popupResolve) { this._popupResolve(true); this._popupResolve = null; } }, 220);
            }
        };
        overlay.addEventListener('click', overlay._bgHandler);
    },

    showAlert(message, typeOverride) {
        return new Promise(resolve => {
            this._popupResolve = resolve;
            const type = typeOverride || this._getPopupType(message);
            this._showPopup(message, type, [
                { label: 'OK', cls: 'btn-popup-ok', value: true }
            ]);
        });
    },

    showConfirm(message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', isDanger = true) {
        return new Promise(resolve => {
            this._popupResolve = resolve;
            const type = this._getPopupType(message);
            this._showPopup(message, type === 'info' ? 'confirm' : type, [
                { label: cancelLabel,  cls: 'btn-popup-cancel', value: false },
                { label: confirmLabel, cls: isDanger ? 'btn-popup-danger' : 'btn-popup-ok', value: true }
            ]);
        });
    },


    async initContatos() {
        try {
            document.body.style.cursor = 'wait';
            const snap = await db.collection('contatos').get();
            this.contatosList = snap.docs.map(d => ({id: d.id, ...d.data()}));
            this.renderContatos();
        } catch(e) { console.error(e); }
        document.body.style.cursor = 'default';
    },

    renderContatos() {
        const grid = document.getElementById('contatos-grid');
        if(!grid) return;
        grid.innerHTML = '';
        const term = (document.getElementById('filter-contatos-search')?.value || '').toLowerCase();
        
        let filtered = this.contatosList || [];
        if(term) {
            filtered = filtered.filter(c => Object.values(c).join(' ').toLowerCase().includes(term));
        }

        if(filtered.length === 0) {
            grid.innerHTML = `
                <div class="contatos-empty">
                    <i class="ri-contacts-book-line"></i>
                    <p>Nenhum contato encontrado.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(c => {
            // Gera iniciais do avatar
            const partes = (c.nome || 'S N').trim().split(' ');
            const iniciais = (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();

            // Gera cor baseada no nome
            const cores = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#6366f1'];
            const idx = (c.nome || '').charCodeAt(0) % cores.length;
            const cor = cores[idx];

            const podeEditar = true;
            const podeExcluir = this.temPermissao('gerenciar_cadastros') || this.userDoc.role === 'ADM';

            const emailLink = c.email
                ? `<a href="mailto:${c.email}" class="contato-chip contato-chip-email" title="Enviar e-mail"><i class="ri-mail-line"></i> ${c.email}</a>`
                : '';
            const tel1 = c.contato1
                ? `<span class="contato-chip"><i class="ri-phone-line"></i> ${c.contato1}</span>`
                : '';
            const tel2 = c.contato2
                ? `<span class="contato-chip"><i class="ri-phone-2-line"></i> ${c.contato2}</span>`
                : '';

            const card = document.createElement('div');
            card.className = 'contato-card';
            card.innerHTML = `
                <div class="contato-card-header" style="--card-color: ${cor}">
                    <div class="contato-avatar" style="background: ${cor}">${iniciais}</div>
                    <div class="contato-card-actions">
                        ${podeEditar ? `<button class="btn-icon" onclick='app.openModalContato(${JSON.stringify(c)})' title="Editar"><i class="ri-edit-line"></i></button>` : ''}
                        ${podeExcluir ? `<button class="btn-icon btn-icon-danger" onclick="app.excluirContato('${c.id}')" title="Excluir"><i class="ri-delete-bin-line"></i></button>` : ''}
                    </div>
                </div>
                <div class="contato-card-body">
                    <h3 class="contato-nome">${c.nome || '-'}</h3>
                    ${c.cargo ? `<span class="contato-badge">${c.cargo}</span>` : ''}
                    ${c.funcao ? `<span class="contato-badge contato-badge-alt">${c.funcao}</span>` : ''}
                    <div class="contato-info">
                        ${c.instituicao ? `<div class="contato-info-row"><i class="ri-building-line"></i><span>${c.instituicao}</span></div>` : ''}
                    </div>
                    <div class="contato-chips">
                        ${tel1}${tel2}${emailLink}
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    filtrarContatos() {
        this.renderContatos();
    },

    openModalContato(c = null) {
        const html = `
            <form id="contatoForm">
                ${c ? `<input type="hidden" name="id" value="${c.id}">` : ''}
                <div class="form-group"><label>Nome *</label><input type="text" class="form-control" name="nome" value="${c ? (c.nome||'') : ''}" required placeholder="Nome completo"></div>
                <div class="form-group"><label>Cargo</label><input type="text" class="form-control" name="cargo" value="${c ? (c.cargo||'') : ''}" placeholder="Ex: Diretor, Coordenador..."></div>
                <div class="form-group"><label>Função</label><input type="text" class="form-control" name="funcao" value="${c ? (c.funcao||'') : ''}" placeholder="Ex: Gestão Escolar..."></div>
                <div class="form-group"><label>Instituição</label><input type="text" class="form-control" name="instituicao" value="${c ? (c.instituicao||'') : ''}" placeholder="Ex: Escola Estadual..."></div>
                <div class="form-group"><label>E-mail</label><input type="email" class="form-control" name="email" value="${c ? (c.email||'') : ''}" placeholder="exemplo@email.com"></div>
                <div class="form-group"><label>Contato 1 (Telefone/WhatsApp)</label><input type="text" class="form-control" name="contato1" value="${c ? (c.contato1||'') : ''}" placeholder="(92) 9XXXX-XXXX"></div>
                <div class="form-group"><label>Contato 2</label><input type="text" class="form-control" name="contato2" value="${c ? (c.contato2||'') : ''}" placeholder="(92) 9XXXX-XXXX"></div>
            </form>
        `;
        this.openModal(c ? 'Editar Contato' : 'Novo Contato', html, [
            { label: 'Salvar', class: 'btn-primary', action: () => this.salvarContato(!!c) }
        ]);
    },

    async salvarContato(isEdit) {
        const form = document.getElementById('contatoForm');
        if(!form.checkValidity()) return form.reportValidity();
        const data = Object.fromEntries(new FormData(form));
        try {
            if(isEdit) {
                const id = data.id;
                delete data.id;
                await db.collection('contatos').doc(id).update(data);
            } else {
                await db.collection('contatos').add(data);
            }
            this.closeModal();
            this.initContatos();
        } catch(e) { console.error(e); await this.showAlert("Erro ao salvar contato."); }
    },

    async excluirContato(id) {
        if(await this.showConfirm("Deseja realmente excluir este contato?", "Excluir", "Cancelar")) {
            await db.collection('contatos').doc(id).delete();
            this.initContatos();
        }
    },

    // --- SUGESTOES ---
    async initSugestoes() {
        document.getElementById('sugestao-nome').value = this.userDoc.login || this.userDoc.email || '';
        document.getElementById('sugestao-texto').value = '';
        this.carregarSugestoes();
    },

    async carregarSugestoes() {
        const lista = document.getElementById('lista-sugestoes');
        if(!lista) return;
        lista.innerHTML = 'Carregando...';
        
        try {
            let query = db.collection('sugestoes').orderBy('data', 'desc');
            if (this.userDoc.role !== 'ADM') {
                query = query.where('uid', '==', this.userDoc.uid);
            }
            const snap = await query.get();
            
            if(snap.empty) {
                lista.innerHTML = '<div style="color:var(--text-muted);">Nenhuma sugestão enviada.</div>';
                return;
            }
            
            lista.innerHTML = snap.docs.map(d => {
                const s = d.data();
                return `
                    <div style="background:var(--background); padding:15px; border-radius:var(--radius-md); border:1px solid var(--border);">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <strong><i class="ri-user-line"></i> ${s.nome}</strong>
                            <small style="color:var(--text-muted);">${new Date(s.data).toLocaleString('pt-BR')}</small>
                        </div>
                        <div style="white-space:pre-wrap; color:var(--text-main); font-size:14px;">${s.texto}</div>
                        ${this.userDoc.role === 'ADM' ? `<button class="btn btn-sm btn-danger" style="margin-top:10px;" onclick="app.excluirSugestao('${d.id}')">Excluir</button>` : ''}
                    </div>
                `;
            }).join('');
        } catch(e) { console.error(e); lista.innerHTML = 'Erro ao carregar sugestões.'; }
    },

    async salvarSugestao() {
        const nome = document.getElementById('sugestao-nome').value;
        const texto = document.getElementById('sugestao-texto').value;
        const btn = document.getElementById('btn-enviar-sugestao');
        btn.disabled = true;
        btn.innerText = 'Enviando...';
        
        try {
            await db.collection('sugestoes').add({
                uid: this.userDoc.uid,
                nome: nome,
                texto: texto,
                data: new Date().toISOString()
            });
            document.getElementById('sugestao-texto').value = '';
            await this.showAlert("Sua sugestão foi enviada com sucesso! Muito obrigado.");
            this.carregarSugestoes();
        } catch(e) {
            console.error(e);
            await this.showAlert("Erro ao enviar sugestão.");
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-send-plane-fill"></i> Enviar Sugestão';
    },

    async excluirSugestao(id) {
        if(await this.showConfirm("Apagar esta sugestão?", "Apagar", "Cancelar")) {
            await db.collection('sugestoes').doc(id).delete();
            this.carregarSugestoes();
        }
    }
};

window.onload = () => app.init();



