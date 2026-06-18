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

    init() {
        this.initColunasVisiveis();
        this.initTheme();
        this.bindNav();
        this.startClock();
        
        // Modal events
        document.getElementById('globalModal').addEventListener('click', (e) => {
            if (e.target.id === 'globalModal') this.closeModal();
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
                this.customAlert("Erro crítico no login: " + err.message + "\n\nStack: " + err.stack);
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
            this.customAlert("Senha alterada com sucesso!");
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
        
        // Bloqueia telas com base nas novas permissões
        if (view === 'demandas' && !this.temPermissao('visualizar_demandas')) {
            return this.customAlert("Sem permissão para visualizar demandas.");
        }
        if (view === 'cadastros' && !this.temPermissao('gerenciar_cadastros')) {
            return this.customAlert("Sem permissão para visualizar cadastros.");
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

    // --- DASHBOARD ---
    async initDashboard() {
        this._dashCoordFilter = 'TODAS'; // Estado do filtro de coordenação

        let query = db.collection('demandas');
        if (this.userDoc && this.userDoc.role === 'COMUM' && this.userDoc.coordenadoria_nome !== 'REGIONAL / GABINETE') {            query = query.where('coordenadoria_nome', '==', this.userDoc.coordenadoria_nome
(Content truncated due to size limit. Use line ranges to read remaining content)
