document.addEventListener('DOMContentLoaded', () => {
    // Conecta ao servidor (Socket.io)
    const socket = io(); 

    // --- Estado Local ---
    let heaps = [];
    let myPlayerId = null;
    let currentTurnId = null;
    let roomID = null;
    let isMyTurn = false;
    let selectedHeapIndex = null;
    let gameOver = false;

    // --- Elementos DOM ---
    const menuOverlay = document.getElementById('menu-overlay');
    const startGameBtn = document.getElementById('start-game-btn');
    const gameContainer = document.getElementById('game-container');
    const heapsContainer = document.getElementById('heaps-container');
    const statusMessage = document.getElementById('status-message');
    const confirmMoveBtn = document.getElementById('confirm-move-btn');
    
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');

    // =========================================================
    // 1. MENU E CONEXÃO
    // =========================================================

    startGameBtn.addEventListener('click', () => {
        // Ao clicar, pedimos ao servidor para encontrar um jogo
        socket.emit('findGame');
        
        // Atualiza UI
        startGameBtn.disabled = true;
        startGameBtn.textContent = "Procurando oponente...";
        addSystemMessage("Conectando ao saguão...");
    });

    // Servidor: "Espere um pouco"
    socket.on('waitingForOpponent', () => {
        statusMessage.textContent = "Aguardando outro jogador entrar...";
    });

    // Servidor: "Jogo Encontrado!"
    socket.on('gameStart', (data) => {
        // Recebe dados iniciais do servidor
        roomID = data.roomID;
        heaps = data.state.heaps;
        currentTurnId = data.state.turn;
        myPlayerId = socket.id;
        gameOver = false;

        // UI: Esconde menu, mostra jogo
        menuOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');

        addSystemMessage("Oponente encontrado! A partida começou.");
        updateGameState();
    });

    // =========================================================
    // 2. LÓGICA DO JOGO
    // =========================================================

    function updateGameState() {
        renderHeaps();
        
        isMyTurn = (socket.id === currentTurnId);
        
        if (isMyTurn) {
            statusMessage.textContent = "Sua Vez! Selecione peças e confirme.";
            statusMessage.style.color = "#2ecc71"; // Verde
            enableControls(true);
        } else {
            statusMessage.textContent = "Vez do Oponente...";
            statusMessage.style.color = "#e74c3c"; // Vermelho
            enableControls(false);
        }
    }

    // Servidor: "Oponente fez um movimento"
    socket.on('opponentMove', (data) => {
        heaps[data.heapIndex] -= data.numToRemove;
        
        // Verifica se o oponente ganhou (pegou a última peça)
        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) {
            endGame(false); // Eu perdi
        } else {
            // Passa a vez para mim
            currentTurnId = socket.id;
            updateGameState();
        }
    });

    // Ação: Jogador clicou em "Confirmar Jogada"
    confirmMoveBtn.addEventListener('click', () => {
        if (!isMyTurn) return;

        const selectedObjects = document.querySelectorAll('.object.selected');
        if (selectedObjects.length === 0) {
            alert("Selecione pelo menos uma peça!");
            return;
        }

        const numToRemove = selectedObjects.length;
        
        // Atualiza localmente
        heaps[selectedHeapIndex] -= numToRemove;
        
        // Envia para o servidor
        socket.emit('makeMove', {
            roomID: roomID,
            heapIndex: selectedHeapIndex,
            numToRemove: numToRemove
        });

        selectedHeapIndex = null;

        // Verifica se eu ganhei
        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) {
            endGame(true); // Eu ganhei
        } else {
            // Passa a vez (visualmente espera o servidor, mas já bloqueia)
            isMyTurn = false;
            currentTurnId = "opponent"; 
            updateGameState();
        }
    });

    function endGame(iWon) {
        gameOver = true;
        renderHeaps(); // Atualiza visual para mostrar tabuleiro vazio
        enableControls(false);
        
        if (iWon) {
            statusMessage.textContent = "PARABÉNS! VOCÊ VENCEU!";
            statusMessage.style.color = "#f1c40f";
            addSystemMessage("Fim de jogo: Você venceu!");
        } else {
            statusMessage.textContent = "Você perdeu. Mais sorte na próxima!";
            statusMessage.style.color = "#95a5a6";
            addSystemMessage("Fim de jogo: Você perdeu.");
        }
        
        // Botão para recarregar página após um tempo (simples reinício)
        setTimeout(() => {
             if(confirm("Jogar novamente?")) location.reload();
        }, 2000);
    }

    // =========================================================
    // 3. RENDERIZAÇÃO E INTERAÇÃO
    // =========================================================

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

        // Regra: Só pode pegar de um monte por vez
        if (selectedHeapIndex !== null && selectedHeapIndex !== hIndex) {
            alert("Você só pode remover peças de um único monte!");
            return;
        }

        selectedHeapIndex = hIndex;
        obj.classList.toggle('selected');

        // Se desmarcar tudo, libera a seleção de monte
        const hasSelection = document.querySelectorAll('.object.selected').length > 0;
        if (!hasSelection) {
            selectedHeapIndex = null;
        }
    }

    function enableControls(enable) {
        confirmMoveBtn.disabled = !enable;
        // Controla cliques visuais
        heapsContainer.style.pointerEvents = enable ? 'auto' : 'none';
    }

    // =========================================================
    // 4. SISTEMA DE CHAT
    // =========================================================

    function sendMessage() {
        const text = chatInput.value.trim();
        if (text) {
            socket.emit('chatMessage', text);
            chatInput.value = '';
        }
    }

    // Recebe mensagem do servidor
    socket.on('chatMessage', (data) => {
        const isMine = data.id === socket.id;
        const type = isMine ? 'mine' : 'other';
        const author = isMine ? 'Você' : 'Oponente';
        addMessageToChat(data.text, author, type);
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

    // Listeners do Chat
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});