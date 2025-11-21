document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); 

    // --- Variáveis de Estado ---
    let heaps = [];
    let myPlayerId = null;
    let currentTurnId = null; // Em offline: 1 = Player, 2 = PC
    let roomID = null;
    let isMyTurn = false;
    let selectedHeapIndex = null;
    let gameOver = false;
    
    // NOVO: Variável para saber o modo atual
    let gameMode = null; // 'ONLINE' ou 'OFFLINE'

    // --- Elementos DOM ---
    const menuOverlay = document.getElementById('menu-overlay');
    const startOnlineBtn = document.getElementById('start-online-btn');
    const startOfflineBtn = document.getElementById('start-offline-btn'); // Novo
    const gameContainer = document.getElementById('game-container');
    const heapsContainer = document.getElementById('heaps-container');
    const statusMessage = document.getElementById('status-message');
    const confirmMoveBtn = document.getElementById('confirm-move-btn');
    const exitBtn = document.getElementById('exit-btn');
    
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const connStatus = document.getElementById('connection-status');
    const connDot = document.querySelector('.dot');

    // =========================================================
    // 1. MENU E SELEÇÃO DE MODO
    // =========================================================

    // --- MODO ONLINE ---
    startOnlineBtn.addEventListener('click', () => {
        gameMode = 'ONLINE';
        startOnlineBtn.disabled = true;
        startOfflineBtn.disabled = true;
        startOnlineBtn.textContent = "Procurando...";
        
        addSystemMessage("Conectando ao saguão online...");
        socket.emit('findGame');
    });

    // --- MODO OFFLINE (CONTRA PC) ---
    startOfflineBtn.addEventListener('click', () => {
        gameMode = 'OFFLINE';
        startGameOffline();
    });

    // --- Botão Sair (Voltar ao menu) ---
    exitBtn.addEventListener('click', () => {
        location.reload(); // Maneira mais simples de resetar tudo
    });

    // =========================================================
    // 2. LÓGICA ONLINE (SOCKET)
    // =========================================================

    socket.on('connect', () => {
        connStatus.textContent = "Conectado";
        connDot.style.background = "#2ecc71";
    });

    socket.on('disconnect', () => {
        connStatus.textContent = "Desconectado";
        connDot.style.background = "#e74c3c";
    });

    socket.on('waitingForOpponent', () => {
        statusMessage.textContent = "Aguardando jogador online...";
    });

    socket.on('gameStart', (data) => {
        roomID = data.roomID;
        heaps = data.state.heaps;
        currentTurnId = data.state.turn;
        myPlayerId = socket.id;
        gameOver = false;

        // Esconde menu
        menuOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        exitBtn.classList.add('hidden'); // Não pode sair no meio do online (simplificação)

        addSystemMessage("Oponente encontrado! Partida Online iniciada.");
        updateGameState();
    });

    socket.on('opponentMove', (data) => {
        if (gameMode !== 'ONLINE') return;
        
        heaps[data.heapIndex] -= data.numToRemove;
        const total = heaps.reduce((a,b) => a+b, 0);
        
        if (total === 0) {
            endGame(false); // Perdi
        } else {
            currentTurnId = socket.id;
            updateGameState();
        }
    });

    // =========================================================
    // 3. LÓGICA OFFLINE (PC / IA)
    // =========================================================

    function startGameOffline() {
        heaps = [3, 5, 7];
        currentTurnId = 1; // 1 = Humano, 2 = PC
        gameOver = false;
        myPlayerId = 1; // Apenas para consistência lógica

        menuOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        exitBtn.classList.remove('hidden'); // Mostra botão de sair

        addSystemMessage("Modo Offline iniciado contra a IA.");
        updateGameState();
    }

    function executeComputerMove() {
        if (gameOver) return;

        // Estratégia Matemática (XOR / Nim-Sum)
        const move = findOptimalMove(heaps);
        
        heaps[move.heapIndex] -= move.numToRemove;
        addSystemMessage(`PC removeu ${move.numToRemove} peça(s) do monte ${move.heapIndex + 1}`);

        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) {
            endGame(false); // PC ganhou (eu perdi)
        } else {
            currentTurnId = 1; // Volta para o humano
            updateGameState();
        }
    }

    // Lógica da IA (XOR)
    function findOptimalMove(currentHeaps) {
        const nimSum = currentHeaps.reduce((sum, heapSize) => sum ^ heapSize, 0);

        // Se NimSum != 0, existe jogada vencedora
        if (nimSum !== 0) {
            for (let i = 0; i < currentHeaps.length; i++) {
                const targetSize = currentHeaps[i] ^ nimSum;
                if (targetSize < currentHeaps[i]) {
                    return { heapIndex: i, numToRemove: currentHeaps[i] - targetSize };
                }
            }
        }
        
        // Se NimSum == 0 (posição perdedora) ou falha, joga aleatório
        const nonEmpty = currentHeaps.map((s, i) => ({s, i})).filter(h => h.s > 0);
        const randomHeap = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
        return { heapIndex: randomHeap.i, numToRemove: 1 };
    }


    // =========================================================
    // 4. CONTROLE DE ESTADO E RENDERIZAÇÃO (COMUM)
    // =========================================================

    function updateGameState() {
        renderHeaps();
        
        // Verifica de quem é a vez
        if (gameMode === 'ONLINE') {
            isMyTurn = (socket.id === currentTurnId);
        } else {
            // Offline: Turno 1 é meu
            isMyTurn = (currentTurnId === 1);
        }
        
        if (isMyTurn) {
            statusMessage.textContent = "Sua Vez!";
            statusMessage.style.color = "#2ecc71";
            enableControls(true);
        } else {
            statusMessage.textContent = (gameMode === 'ONLINE') ? "Vez do Oponente..." : "Computador pensando...";
            statusMessage.style.color = "#e74c3c";
            enableControls(false);

            // Se for Offline e vez do PC, chama a IA
            if (gameMode === 'OFFLINE' && !gameOver) {
                setTimeout(executeComputerMove, 1500); // Delay para parecer que pensa
            }
        }
    }

    // Ação de Confirmar Jogada
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
        
        // AÇÃO ESPECÍFICA POR MODO
        if (gameMode === 'ONLINE') {
            socket.emit('makeMove', {
                roomID: roomID,
                heapIndex: selectedHeapIndex,
                numToRemove: numToRemove
            });
        } else {
            // Offline: nada a enviar, apenas logar
            // (A troca de turno acontece na verificação de vitória abaixo)
        }

        selectedHeapIndex = null;
        
        // Verifica vitória
        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) {
            endGame(true); // Eu ganhei
        } else {
            isMyTurn = false;
            // Troca o ID do turno
            if (gameMode === 'ONLINE') {
                currentTurnId = "opponent"; 
            } else {
                currentTurnId = 2; // Passa para o PC
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
            statusMessage.style.color = "#f1c40f";
            addSystemMessage("Fim de jogo: Vitória!");
        } else {
            statusMessage.textContent = (gameMode === 'ONLINE') ? "Oponente Venceu." : "Computador Venceu.";
            statusMessage.style.color = "#95a5a6";
            addSystemMessage("Fim de jogo: Derrota.");
        }
        
        // Mostra botão de sair se estiver online e acabou
        if (gameMode === 'ONLINE') {
            exitBtn.classList.remove('hidden');
            exitBtn.textContent = "Voltar ao Menu";
            exitBtn.onclick = () => location.reload();
        }
    }

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

    function handleObjectClick(e) {
        if (!isMyTurn || gameOver) return;

        const obj = e.target;
        const hIndex = parseInt(obj.dataset.heapIndex);

        if (selectedHeapIndex !== null && selectedHeapIndex !== hIndex) {
            alert("Você só pode remover peças de um único monte!");
            return;
        }
        selectedHeapIndex = hIndex;
        obj.classList.toggle('selected');

        if (document.querySelectorAll('.object.selected').length === 0) {
            selectedHeapIndex = null;
        }
    }

    function enableControls(enable) {
        confirmMoveBtn.disabled = !enable;
        heapsContainer.style.pointerEvents = enable ? 'auto' : 'none';
    }

    // =========================================================
    // 5. CHAT (Híbrido)
    // =========================================================

    function sendMessage() {
        const text = chatInput.value.trim();
        if (text) {
            if (gameMode === 'ONLINE') {
                socket.emit('chatMessage', text);
            } else {
                // Modo Offline: Apenas exibe sua mensagem e uma resposta fake do PC
                addMessageToChat(text, 'Você', 'mine');
                if(text.toLowerCase().includes('ola') || text.toLowerCase().includes('oi')) {
                    setTimeout(() => addMessageToChat("Bip Bop... Olá Humano.", "Computador", "other"), 800);
                }
            }
            chatInput.value = '';
        }
    }

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
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addSystemMessage(text) {
        addMessageToChat(text, 'Sistema', 'system');
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});