// ==========================================
// CONFIGURAÇÃO DO FIREBASE
// ==========================================
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
// DESATIVE A RESTRIÇÃO DE DOMÍNIO PARA TESTES
// ==========================================
const DOMINIO_AUTORIZADO = ""; // Deixe vazio para permitir qualquer e-mail

// ==========================================
// INICIALIZA O FIREBASE (COM VERIFICAÇÃO)
// ==========================================
console.log("🚀 Inicializando Firebase...");

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("✅ Firebase inicializado com sucesso!");
    } else {
        console.log("ℹ️ Firebase já estava inicializado.");
    }
} catch (err) {
    console.error("❌ ERRO ao inicializar Firebase:", err);
    alert("Erro ao inicializar Firebase: " + err.message);
}

const db = firebase.firestore();
const auth = firebase.auth();

// ==========================================
// TESTE DE CONEXÃO (opcional)
// ==========================================
db.collection('usuarios').limit(1).get()
    .then(() => console.log("✅ Firestore conectado com sucesso!"))
    .catch(err => console.warn("⚠️ Firestore: erro de conexão (pode ser normal)", err));

// ==========================================
// OBJETO PRINCIPAL DA APLICAÇÃO
// ==========================================
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

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================
    init() {
        console.log("🚀 Inicializando App...");
        
        this.initColunasVisiveis();
        this.initTheme();
        this.bindNav();
        this.startClock();
        
        // Modal events
        document.getElementById('globalModal').addEventListener('click', (e) => {
            if (e.target.id === 'globalModal') this.closeModal();
        });
        
        // ==========================================
        // BOTÃO DE LOGIN MANUAL - DEBUG
        // ==========================================
        const loginBtn = document.querySelector('#formLogin button[type="submit"]');
        if (loginBtn) {
            console.log("✅ Botão 'Entrar' encontrado, adicionando listener...");
            // Remove o listener inline e adiciona um novo com debug
            loginBtn.removeEventListener('click', app.doLogin);
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log("🖱️ Botão 'Entrar' clicado!");
                app.doLogin();
            });
        } else {
            console.warn("⚠️ Botão 'Entrar' não encontrado!");
        }
        
        // ==========================================
        // BOTÃO GOOGLE - DEBUG
        // ==========================================
        const googleBtn = document.querySelector('button[onclick*="doLoginGoogle"]');
        if (googleBtn) {
            console.log("✅ Botão 'Google' encontrado, adicionando listener...");
            googleBtn.removeEventListener('click', app.doLoginGoogle);
            googleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log("🖱️ Botão 'Google' clicado!");
                app.doLoginGoogle();
            });
        } else {
            console.warn("⚠️ Botão 'Google' não encontrado!");
        }

        // ==========================================
        // MONITOR DE AUTENTICAÇÃO
        // ==========================================
        auth.onAuthStateChanged(async (user) => {
            console.log("🔐 Auth state changed:", user ? user.email : "null");
            
            try {
                if (user) {
                    // Verifica domínio
                    if (DOMINIO_AUTORIZADO && !user.email.endsWith(DOMINIO_AUTORIZADO) && user.email !== 'admin@admin.com') {
                        console.warn("⛔ Domínio não autorizado:", user.email);
                        await auth.signOut();
                        document.getElementById('login_error').innerText = 
                            `Acesso restrito para e-mails com domínio: ${DOMINIO_AUTORIZADO}`;
                        this.showLogin();
                        return;
                    }

                    // Busca ou cria usuário
                    const userRef = db.collection('usuarios').doc(user.uid);
                    let doc = await userRef.get();
                    let userData = doc.exists ? doc.data() : null;

                    // Migração por e-mail
                    if (!userData) {
                        console.log("📂 Usuário não encontrado pelo UID, buscando por e-mail...");
                        const snap = await db.collection('usuarios').where('email', '==', user.email).get();
                        if (!snap.empty) {
                            const oldDoc = snap.docs[0];
                            userData = oldDoc.data();
                            await userRef.set(userData);
                            await oldDoc.ref.delete();
                            console.log("✅ Dados migrados com sucesso!");
                        }
                    }

                    // Criação de novo usuário
                    if (!userData) {
                        console.log("🆕 Criando novo usuário para:", user.email);
                        const isAdminMaster = user.email === 'admin@admin.com';
                        userData = {
                            login: user.displayName || user.email.split('@')[0],
                            email: user.email,
                            role: isAdminMaster ? 'ADM' : 'COMUM',
                            permissoes: {},
                            primeiro_login: isAdminMaster ? false : true,
                            criado_em: new Date().toISOString()
                        };
                        await userRef.set(userData);
                        console.log("✅ Novo usuário criado com perfil:", userData.role);
                    }

                    this.userDoc = { uid: user.uid, ...userData };
                    
                    // Atualiza interface
                    document.getElementById('user-name-display').innerText = this.userDoc.login || this.userDoc.email;
                    document.getElementById('user-avatar-initial').innerText = 
                        (this.userDoc.login || this.userDoc.email).charAt(0).toUpperCase();
                    
                    if (this.userDoc.role === 'ADM') {
                        document.getElementById('menu-usuarios').style.display = 'flex';
                    } else {
                        document.getElementById('menu-usuarios').style.display = 'none';
                    }

                    this.showApp();
                    
                    if (this.userDoc.primeiro_login && this.userDoc.email !== 'admin@admin.com') {
                        setTimeout(() => this.abrirModalTrocarSenha(true), 500);
                    }
                    
                } else {
                    this.userDoc = null;
                    this.showLogin();
                }
            } catch (err) {
                console.error("❌ Erro no onAuthStateChanged:", err);
                document.getElementById('login_error').innerText = "Erro: " + err.message;
                this.showLogin();
            }
        });
        
        console.log("✅ App inicializado com sucesso!");
    },

    // ==========================================
    // LOGIN COM EMAIL/SENHA (COM DEBUG)
    // ==========================================
    async doLogin() {
        console.log("🔐 Tentando login com email/senha...");
        
        const email = document.getElementById('login_user').value;
        const pass = document.getElementById('login_pass').value;
        const errDiv = document.getElementById('login_error');
        
        if (!email || !pass) {
            errDiv.innerText = "Preencha e-mail e senha.";
            return;
        }
        
        console.log("📧 Email:", email);
        console.log("🔑 Senha:", pass.length > 0 ? "******" : "vazia");
        
        errDiv.innerText = 'Autenticando...';
        
        try {
            const result = await auth.signInWithEmailAndPassword(email, pass);
            console.log("✅ Login bem-sucedido:", result.user.email);
            errDiv.innerText = '';
            // O onAuthStateChanged cuidará do redirecionamento
        } catch (error) {
            console.error("❌ Erro no login:", error.code, error.message);
            errDiv.innerText = this._getFirebaseErrorMessage(error);
        }
    },

    // ==========================================
    // LOGIN COM GOOGLE (COM DEBUG)
    // ==========================================
    async doLoginGoogle() {
        console.log("🔐 Tentando login com Google...");
        
        const provider = new firebase.auth.GoogleAuthProvider();
        const errDiv = document.getElementById('login_error');
        errDiv.innerText = 'Abrindo popup do Google...';
        
        try {
            const result = await auth.signInWithPopup(provider);
            console.log("✅ Login Google bem-sucedido:", result.user.email);
            errDiv.innerText = '';
            // O onAuthStateChanged cuidará do redirecionamento
        } catch (error) {
            console.error("❌ Erro no login Google:", error.code, error.message);
            
            if (error.code === 'auth/popup-blocked') {
                errDiv.innerText = "Popup bloqueado! Permita popups para este site.";
            } else if (error.code === 'auth/popup-closed-by-user') {
                errDiv.innerText = "Popup fechado antes de concluir o login.";
            } else {
                errDiv.innerText = this._getFirebaseErrorMessage(error);
            }
        }
    },

    // ==========================================
    // TRADUTOR DE ERROS DO FIREBASE
    // ==========================================
    _getFirebaseErrorMessage(error) {
        const messages = {
            'auth/user-not-found': 'Usuário não encontrado. Verifique o e-mail.',
            'auth/wrong-password': 'Senha incorreta.',
            'auth/invalid-email': 'E-mail inválido.',
            'auth/user-disabled': 'Esta conta foi desativada.',
            'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
            'auth/network-request-failed': 'Erro de rede. Verifique sua conexão.',
            'auth/internal-error': 'Erro interno do Firebase. Tente novamente.',
            'auth/email-already-in-use': 'E-mail já está em uso.',
            'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).',
            'auth/operation-not-allowed': 'Login com email/senha não está habilitado no Firebase Console.',
            'auth/popup-blocked': 'Popup bloqueado pelo navegador. Permita popups.',
            'auth/popup-closed-by-user': 'Popup fechado antes de concluir o login.'
        };
        return messages[error.code] || error.message || 'Erro desconhecido no login.';
    },

    // ==========================================
    // DO LOGOUT
    // ==========================================
    async doLogout() {
        console.log("🔓 Fazendo logout...");
        try {
            await auth.signOut();
            console.log("✅ Logout realizado.");
        } catch (err) {
            console.error("❌ Erro no logout:", err);
        }
    },

    // ==========================================
    // RESTO DO CÓDIGO (MANTER O MESMO)
    // ==========================================
    // ... (todos os outros métodos permanecem iguais)
    
    // ==========================================
    // CRIA ADMIN MASTER (EMERGÊNCIA)
    // ==========================================
    async criarAdminMaster() {
        console.log("👑 Criando Admin Master...");
        try {
            const email = "admin@admin.com";
            const senha = "admin123";
            
            // Verifica se já existe
            try {
                const user = await auth.signInWithEmailAndPassword(email, senha);
                console.log("✅ Admin já existe:", user.user.email);
                await auth.signOut();
                return;
            } catch (e) {
                if (e.code !== 'auth/user-not-found' && e.code !== 'auth/wrong-password') {
                    throw e;
                }
            }
            
            // Cria o usuário
            const cred = await auth.createUserWithEmailAndPassword(email, senha);
            console.log("✅ Admin criado:", cred.user.email);
            
            // Salva no Firestore
            await db.collection('usuarios').doc(cred.user.uid).set({
                login: 'admin',
                email: email,
                role: 'ADM',
                permissoes: {},
                primeiro_login: false,
                criado_em: new Date().toISOString()
            });
            
            await auth.signOut();
            console.log("✅ Admin master configurado! Use: admin@admin.com / admin123");
            alert("Admin master criado!\n\nE-mail: admin@admin.com\nSenha: admin123");
        } catch (err) {
            console.error("❌ Erro ao criar admin:", err);
            alert("Erro ao criar admin: " + err.message);
        }
    }
};

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.onload = () => {
    console.log("📄 Página carregada, iniciando app...");
    app.init();
    
    // ==========================================
    // BOTÃO DE EMERGÊNCIA (CRIAR ADMIN)
    // ==========================================
    // Adiciona um botão secreto no login (clique duplo no título)
    const loginBox = document.querySelector('.login-box h2');
    if (loginBox) {
        loginBox.style.cursor = 'pointer';
        loginBox.title = 'Clique duas vezes para criar Admin Master';
        loginBox.addEventListener('dblclick', () => {
            if (confirm("Deseja criar o Admin Master? (admin@admin.com / admin123)")) {
                app.criarAdminMaster();
            }
        });
        console.log("✅ Botão secreto 'Admin Master' ativado (clique duplo no título)");
    }
};

// ==========================================
// EXPÕE O APP GLOBALMENTE (para onclicks)
// ==========================================
window.app = app;

console.log("✅ app.js carregado com sucesso!");
console.log("📋 Para debug, use:");
console.log("  - app.doLogin() - tentar login com email/senha");
console.log("  - app.doLoginGoogle() - tentar login com Google");
console.log("  - app.criarAdminMaster() - criar admin master");
console.log("  - app.userDoc - dados do usuário logado");
