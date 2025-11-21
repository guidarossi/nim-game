document.addEventListener('DOMContentLoaded', () => {
    // Conexão com o servidor (Socket.io)
    const socket = io(); 

    // =========================================================
    // VARIÁVEIS DE ESTADO
    // =========================================================
    let heaps = [];
    let myPlayerId = null;
    let currentTurnId = null; // Online: SocketID | Offline: 1 (Player), 2 (PC)
    let roomID = null;
    let isMyTurn = false;
    let selectedHeapIndex = null;
    let gameOver = false;
    let gameMode = null; // 'ONLINE' ou 'OFFLINE'
    let pcDifficulty = 'medium'; // 'easy', 'medium', 'hard'

    // =========================================================
    // ELEMENTOS DO DOM
    // =========================================================
    // Botão de Tema
    const themeToggleBtn = document.getElementById('theme-toggle');

    // Menus
    const menuOverlay = document.getElementById('menu-overlay');
    const mainMenu = document.getElementById('main-menu');
    const difficultyMenu = document.getElementById('difficulty-menu');
    
    // Botões do Menu
    const startOnlineBtn = document.getElementById('start-online-btn');
    const startOfflineBtn = document.getElementById('start-offline-btn');
    const difficultyBtns = document.querySelectorAll('.difficulty-btn');
    const backToMenuBtn = document.getElementById('back-to-menu-btn');

    // Jogo
    const gameContainer = document.getElementById('game-container');
    const heapsContainer = document.getElementById('heaps-container');
    const statusMessage = document.getElementById('status-message');
    const confirmMoveBtn = document.getElementById('confirm-move-btn');
    const exitBtn = document.getElementById('exit-btn');
    
    // Chat
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const connStatus = document.getElementById('connection-status');
    const connDot = document.querySelector('.dot');


    // =========================================================
    // 1. LÓGICA DE TEMA (CLARO/ESCURO)
    // =========================================================
    
    // Verifica se já tem preferência salva no navegador
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>'; // Ícone de Sol
    }

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        
        // Troca o ícone e salva na memória
        if (document.body.classList.contains('light-mode')) {
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('theme', 'light');
        } else {
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('theme', 'dark');
        }
    });


    // =========================================================
    // 2. MENU E SELEÇÃO DE MODO
    // =========================================================

    // --- MODO ONLINE ---
    startOnlineBtn.addEventListener('click', () => {
        gameMode = 'ONLINE';
        // Feedback visual de carregamento
        startOnlineBtn.disabled = true;
        startOfflineBtn.disabled = true;
        startOnlineBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procurando...';
        
        addSystemMessage("Conectando ao saguão online...");
        socket.emit('findGame');
    });

    // --- MODO OFFLINE (Botão Inicial) ---
    startOfflineBtn.addEventListener('click', () => {
        // Esconde menu principal, mostra menu de dificuldade
        mainMenu.classList.add('hidden');
        difficultyMenu.classList.remove('hidden');
    });

    // --- VOLTAR (Do submenu para o principal) ---
    backToMenuBtn.addEventListener('click', () => {
        difficultyMenu.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    });

    // --- SELEÇÃO DE DIFICULDADE ---
    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            pcDifficulty = btn.dataset.level; // Lê 'easy', 'medium' ou 'hard' do HTML
            gameMode = 'OFFLINE';
            startGameOffline();
        });
    });

    // --- BOTÃO SAIR (Durante o jogo) ---
    exitBtn.addEventListener('click', () => {
        location.reload(); // Recarrega a página para resetar tudo
    });


    // =========================================================
    // 3. LÓGICA ONLINE (SOCKET.IO)
    // =========================================================

    socket.on('connect', () => {
        connStatus.textContent = "Conectado";
        connDot.style.background = "#2ecc71"; // Verde
    });

    socket.on('disconnect', () => {
        connStatus.textContent = "Desconectado";
        connDot.style.background = "#e74c3c"; // Vermelho
    });

    socket.on('waitingForOpponent', () => {
        statusMessage.textContent = "Aguardando jogador online...";
    });

    // O Jogo Começou (Online)
    socket.on('gameStart', (data) => {
        roomID = data.roomID;
        heaps = data.state.heaps;
        currentTurnId = data.state.turn;
        myPlayerId = socket.id;
        gameOver = false;

        // Transição de UI
        menuOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        exitBtn.classList.add('hidden'); // Simplificação: sem sair no online

        addSystemMessage("Oponente encontrado! Partida Online iniciada.");
        updateGameState();
    });

    // Recebeu movimento do oponente
    socket.on('opponentMove', (data) => {
        if (gameMode !== 'ONLINE') return;
        
        heaps[data.heapIndex] -= data.numToRemove;
        const total = heaps.reduce((a,b) => a+b, 0);
        
        if (total === 0) {
            endGame(false); // Eu perdi (oponente pegou a última)
        } else {
            currentTurnId = socket.id; // Passa a vez para mim
            updateGameState();
        }
    });


    // =========================================================
    // 4. LÓGICA OFFLINE (IA / COMPUTADOR)
    // =========================================================

    function startGameOffline() {
        heaps = [3, 5, 7];
        currentTurnId = 1; // 1 = Humano, 2 = PC
        gameOver = false;

        // Transição de UI
        menuOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        exitBtn.classList.remove('hidden'); // Pode sair no offline

        // Texto amigável da dificuldade
        let diffText = "Médio";
        if(pcDifficulty === 'easy') diffText = "Fácil";
        if(pcDifficulty === 'hard') diffText = "Difícil";

        addSystemMessage(`Modo Offline iniciado (Dificuldade: ${diffText}).`);
        updateGameState();
    }

    function executeComputerMove() {
        if (gameOver) return;

        let move;
        const winningMove = findOptimalMove(heaps);
        const randomMove = findRandomMove(heaps);

        // Lógica de "Erro Proposital" baseada na dificuldade
        if (pcDifficulty === 'easy') {
            // 90% de chance de errar (jogar aleatório)
            move = (Math.random() > 0.1) ? randomMove : winningMove;
        
        } else if (pcDifficulty === 'medium') {
            // 40% de chance de acertar (jogar perfeito)
            move = (Math.random() > 0.6) ? winningMove : randomMove;

        } else {
            // Hard: Sempre tenta ganhar
            move = winningMove;
        }

        // Aplica o movimento
        heaps[move.heapIndex] -= move.numToRemove;
        addSystemMessage(`PC removeu ${move.numToRemove} peça(s) do monte ${move.heapIndex + 1}`);

        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) {
            endGame(false); // PC Venceu (eu perdi)
        } else {
            currentTurnId = 1; // Volta a vez para o Humano
            updateGameState();
        }
    }

    // Estratégia Perfeita (Nim-Sum / XOR)
    function findOptimalMove(currentHeaps) {
        const nimSum = currentHeaps.reduce((sum, heapSize) => sum ^ heapSize, 0);

        if (nimSum !== 0) {
            // Existe jogada vencedora
            for (let i = 0; i < currentHeaps.length; i++) {
                const targetSize = currentHeaps[i] ^ nimSum;
                if (targetSize < currentHeaps[i]) {
                    return { heapIndex: i, numToRemove: currentHeaps[i] - targetSize };
                }
            }
        }
        // Se já estiver perdendo, joga qualquer coisa
        return findRandomMove(currentHeaps);
    }

    // Estratégia Aleatória
    function findRandomMove(currentHeaps) {
        const nonEmpty = currentHeaps.map((s, i) => ({s, i})).filter(h => h.s > 0);
        const randomHeap = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
        const numToRemove = Math.floor(Math.random() * randomHeap.s) + 1;
        return { heapIndex: randomHeap.i, numToRemove: numToRemove };
    }


    // =========================================================
    // 5. CONTROLE DO JOGO (RENDERIZAÇÃO E INTERAÇÃO)
    // =========================================================

    function updateGameState() {
        renderHeaps();
        
        // Define se é minha vez baseada no modo
        if (gameMode === 'ONLINE') {
            isMyTurn = (socket.id === currentTurnId);
        } else {
            isMyTurn = (currentTurnId === 1);
        }
        
        // Atualiza UI
        if (isMyTurn) {
            statusMessage.textContent = "Sua Vez!";
            statusMessage.style.color = "#2ecc71"; // Verde
            enableControls(true);
        } else {
            statusMessage.textContent = (gameMode === 'ONLINE') ? "Vez do Oponente..." : "Computador pensando...";
            statusMessage.style.color = "#e74c3c"; // Vermelho/Laranja
            enableControls(false);

            // Se for offline e vez do PC, agendar jogada
            if (gameMode === 'OFFLINE' && !gameOver) {
                setTimeout(executeComputerMove, 1200); // Delay de 1.2s
            }
        }
    }

    // Botão "Confirmar Jogada"
    confirmMoveBtn.addEventListener('click', () => {
        if (!isMyTurn) return;

        const selectedObjects = document.querySelectorAll('.object.selected');
        if (selectedObjects.length === 0) {
            alert("Selecione pelo menos uma peça!");
            return;
        }

        const numToRemove = selectedObjects.length;
        
        // Atualiza estado local
        heaps[selectedHeapIndex] -= numToRemove;
        
        // Se Online, avisa o servidor
        if (gameMode === 'ONLINE') {
            socket.emit('makeMove', {
                roomID: roomID,
                heapIndex: selectedHeapIndex,
                numToRemove: numToRemove
            });
        }

        selectedHeapIndex = null;
        
        // Verifica vitória imediatamente
        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) {
            endGame(true); // Eu ganhei!
        } else {
            isMyTurn = false;
            // Troca o ID do turno
            if (gameMode === 'ONLINE') {
                currentTurnId = "opponent"; // Espera servidor
            } else {
                currentTurnId = 2; // Passa para PC
            }
            updateGameState();
        }
    });

    function endGame(iWon) {
        gameOver = true;
        renderHeaps();
        enableControls(false);
        
        if (iWon) {
            statusMessage.textContent = "VOCÊ VENCEU!";
            statusMessage.style.color = "#f1c40f"; // Dourado
            addSystemMessage("Fim de jogo: Vitória!");
        } else {
            const loserText = (gameMode === 'ONLINE') ? "Oponente Venceu." : "Computador Venceu.";
            statusMessage.textContent = loserText;
            statusMessage.style.color = "#95a5a6"; // Cinza
            addSystemMessage("Fim de jogo: Derrota.");
        }
        
        // Se estiver Online, mostra botão de sair no final
        if (gameMode === 'ONLINE') {
            exitBtn.classList.remove('hidden');
            exitBtn.textContent = "Voltar ao Menu";
            exitBtn.onclick = () => location.reload();
        }
    }

    // Renderiza o tabuleiro HTML
    function renderHeaps() {
        heapsContainer.innerHTML = '';
        heaps.forEach((count, index) => {
            const heapDiv = document.createElement('div');
            heapDiv.className = 'heap';
            
            const label = document.createElement('div');
            label.className = 'heap-label';
            label.textContent = `Monte ${index + 1} (${count})`;
            heapDiv.appendChild(label);

            for(let i=0; i<count; i++) {
                const obj = document.createElement('div');
                obj.className = 'object';
                obj.dataset.heapIndex = index;
                obj.addEventListener('click', handleObjectClick);
                heapDiv.appendChild(obj);
            }
            heapsContainer.appendChild(heapDiv);
        });
    }

    // Clique nas peças
    function handleObjectClick(e) {
        if (!isMyTurn || gameOver) return;

        const obj = e.target;
        const hIndex = parseInt(obj.dataset.heapIndex);

        // Regra: Só pode pegar de um monte
        if (selectedHeapIndex !== null && selectedHeapIndex !== hIndex) {
            alert("Você só pode remover peças de um único monte!");
            return;
        }
        selectedHeapIndex = hIndex;
        obj.classList.toggle('selected');

        // Se desmarcou tudo, libera seleção de monte
        if (document.querySelectorAll('.object.selected').length === 0) {
            selectedHeapIndex = null;
        }
    }

    function enableControls(enable) {
        confirmMoveBtn.disabled = !enable;
        heapsContainer.style.pointerEvents = enable ? 'auto' : 'none';
    }


    // =========================================================
    // 6. CHAT (HÍBRIDO)
    // =========================================================

    function sendMessage() {
        const text = chatInput.value.trim();
        if (text) {
            if (gameMode === 'ONLINE') {
                socket.emit('chatMessage', text);
            } else {
                // Offline: Adiciona direto
                addMessageToChat(text, 'Você', 'mine');
                
                // Easter Egg Offline
                const lowerText = text.toLowerCase();
                if(lowerText.includes('ola') || lowerText.includes('oi')) {
                    setTimeout(() => addMessageToChat("Bip Bop... Olá Humano.", "Computador", "other"), 800);
                }
            }
            chatInput.value = '';
        }
    }

    // Recebe mensagem do servidor (Online)
    socket.on('chatMessage', (data) => {
        const isMine = data.id === socket.id;
        addMessageToChat(data.text, isMine ? 'Você' : 'Oponente', isMine ? 'mine' : 'other');
    });

    function addMessageToChat(text, author, type) {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', type);

        if (type !== 'system') {
            const authorDiv = document.createElement('div');
            authorDiv.className = 'msg-author';
            authorDiv.textContent = author;
            msgDiv.appendChild(authorDiv);
        }
        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        msgDiv.appendChild(textSpan);

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
    }

    function addSystemMessage(text) {
        addMessageToChat(text, 'Sistema', 'system');
    }

    // Listeners do Chat
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});