document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); 

    // =========================================================
    // VARIÁVEIS DE ESTADO
    // =========================================================
    let heaps = [];
    let myPlayerId = null;
    let currentTurnId = null; 
    let roomID = null;
    let isMyTurn = false;
    let selectedHeapIndex = null;
    let gameOver = false;
    let gameMode = null; // 'ONLINE' ou 'OFFLINE'
    let pcDifficulty = 'medium'; 
    
    let rtcManager = null;

    // =========================================================
    // ELEMENTOS DO DOM
    // =========================================================
    
    // Tema
    const themeToggleBtn = document.getElementById('theme-toggle');

    // Menus
    const menuOverlay = document.getElementById('menu-overlay');
    const mainMenu = document.getElementById('main-menu');
    const difficultyMenu = document.getElementById('difficulty-menu');
    
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
    
    // Tela de Fim de Jogo (NOVO)
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const goTitle = document.getElementById('go-title');
    const goMessage = document.getElementById('go-message');
    const goTimerContainer = document.getElementById('go-timer-container');
    const goTimer = document.getElementById('go-timer');
    const goBackBtn = document.getElementById('go-back-btn');
    
    // Chat & Emojis
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const connStatus = document.getElementById('connection-status');
    const connDot = document.querySelector('.dot');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');

    // Câmera (WebRTC)
    const cameraWrapper = document.getElementById('camera-wrapper');
    const initialControls = document.getElementById('initial-controls');
    const activeControls = document.getElementById('active-controls');
    const btnJoinCall = document.getElementById('btn-join-call');
    const btnToggleMic = document.getElementById('btn-toggle-mic');
    const btnToggleCam = document.getElementById('btn-toggle-cam');
    const btnStopCall = document.getElementById('btn-stop-call');


    // =========================================================
    // 1. TEMA (CLARO/ESCURO)
    // =========================================================
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        if (document.body.classList.contains('light-mode')) {
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('theme', 'light');
        } else {
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('theme', 'dark');
        }
    });


    // =========================================================
    // 2. EMOJIS
    // =========================================================

    const emojiList = ['😀','😁','😂','🤣','😉','😊','😍','😎','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','😪','😫','😴','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','😖','😤','😭','🤯','😱','🥵','🥶','😡','🤬','😷','🤒','🤕','🤢','🤮','🤧','😇','🥳','🥺','👍','👎','👊','✌️','👌','✋','💪','🙏','👏','🙌','❤️','🧡','💛','💚','💙','💜','🖤','💔','🔥','✨','🎉','🏆','🎲','🎮','🤖','👻','👽','💩','🤡','🇧🇷'];

    function renderEmojis() {
        emojiPicker.innerHTML = '';
        emojiList.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.className = 'emoji-item';
            span.onclick = () => {
                chatInput.value += emoji;
                chatInput.focus();
            };
            emojiPicker.appendChild(span);
        });
    }

    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.classList.add('hidden');
        }
    });
    renderEmojis();


    // =========================================================
    // 3. MENU E MODOS DE JOGO
    // =========================================================

    // Online
    startOnlineBtn.addEventListener('click', () => {
        gameMode = 'ONLINE';
        startOnlineBtn.disabled = true;
        startOfflineBtn.disabled = true;
        startOnlineBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procurando...';
        addSystemMessage("Conectando ao saguão online...");
        socket.emit('findGame');
    });

    // Offline (Menu)
    startOfflineBtn.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        difficultyMenu.classList.remove('hidden');
    });

    // Voltar
    backToMenuBtn.addEventListener('click', () => {
        difficultyMenu.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    });

    // Selecionar Dificuldade
    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            pcDifficulty = btn.dataset.level;
            gameMode = 'OFFLINE';
            startGameOffline();
        });
    });

    // Sair (Manual durante jogo)
    exitBtn.addEventListener('click', () => {
        if (rtcManager) rtcManager.stopLocalStream();
        location.reload();
    });

    // Botão Voltar (na tela de Game Over Offline)
    goBackBtn.addEventListener('click', () => {
        location.reload();
    });


    // =========================================================
    // 4. ONLINE & WEBRTC
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

        menuOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        exitBtn.classList.add('hidden'); 
        
        // Câmera
        cameraWrapper.classList.remove('hidden');
        initialControls.classList.remove('hidden');
        activeControls.classList.add('hidden');
        
        rtcManager = new WebRTCManager(socket, myPlayerId, roomID);
        rtcManager.createPeerConnection(); 

        addSystemMessage("Partida Online! Entre na chamada para conversar.");
        updateGameState();
    });

    socket.on('opponentMove', (data) => {
        if (gameMode !== 'ONLINE') return;
        
        heaps[data.heapIndex] -= data.numToRemove;
        const total = heaps.reduce((a,b) => a+b, 0);
        
        if (total === 0) endGame(false);
        else {
            currentTurnId = socket.id;
            updateGameState();
        }
    });

    // --- Controles Câmera ---
    btnJoinCall.addEventListener('click', async () => {
        if (!rtcManager) return;
        const success = await rtcManager.startLocalStream();
        if (success) {
            initialControls.classList.add('hidden');
            activeControls.classList.remove('hidden');
            resetControlIcons();
            rtcManager.createOffer();
            addSystemMessage("Você entrou na chamada.");
        }
    });
    btnToggleMic.addEventListener('click', () => {
        if (!rtcManager) return;
        const isEnabled = rtcManager.toggleAudio();
        if (isEnabled) {
            btnToggleMic.classList.remove('off');
            btnToggleMic.innerHTML = '<i class="fas fa-microphone"></i>';
        } else {
            btnToggleMic.classList.add('off');
            btnToggleMic.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        }
    });
    btnToggleCam.addEventListener('click', () => {
        if (!rtcManager) return;
        const isEnabled = rtcManager.toggleVideo();
        if (isEnabled) {
            btnToggleCam.classList.remove('off');
            btnToggleCam.innerHTML = '<i class="fas fa-video"></i>';
        } else {
            btnToggleCam.classList.add('off');
            btnToggleCam.innerHTML = '<i class="fas fa-video-slash"></i>';
        }
    });
    btnStopCall.addEventListener('click', () => {
        if (!rtcManager) return;
        rtcManager.stopLocalStream();
        activeControls.classList.add('hidden');
        initialControls.classList.remove('hidden');
        addSystemMessage("Você saiu da chamada.");
    });
    function resetControlIcons() {
        btnToggleMic.classList.remove('off');
        btnToggleMic.innerHTML = '<i class="fas fa-microphone"></i>';
        btnToggleCam.classList.remove('off');
        btnToggleCam.innerHTML = '<i class="fas fa-video"></i>';
    }


    // =========================================================
    // 5. LÓGICA OFFLINE (IA)
    // =========================================================

    function startGameOffline() {
        heaps = [3, 5, 7];
        currentTurnId = 1; 
        gameOver = false;

        menuOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        exitBtn.classList.remove('hidden');
        cameraWrapper.classList.add('hidden');

        let diffText = (pcDifficulty === 'easy') ? "Fácil" : (pcDifficulty === 'hard') ? "Difícil" : "Médio";
        addSystemMessage(`Modo Offline (Dificuldade: ${diffText}).`);
        updateGameState();
    }

    function executeComputerMove() {
        if (gameOver) return;
        let move;
        const winningMove = findOptimalMove(heaps);
        const randomMove = findRandomMove(heaps);
        if (pcDifficulty === 'easy') move = (Math.random() > 0.1) ? randomMove : winningMove;
        else if (pcDifficulty === 'medium') move = (Math.random() > 0.6) ? winningMove : randomMove;
        else move = winningMove;

        heaps[move.heapIndex] -= move.numToRemove;
        addSystemMessage(`PC removeu ${move.numToRemove} peça(s) do monte ${move.heapIndex + 1}`);

        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) endGame(false);
        else {
            currentTurnId = 1;
            updateGameState();
        }
    }
    function findOptimalMove(currentHeaps) {
        const nimSum = currentHeaps.reduce((sum, heapSize) => sum ^ heapSize, 0);
        if (nimSum !== 0) {
            for (let i = 0; i < currentHeaps.length; i++) {
                const targetSize = currentHeaps[i] ^ nimSum;
                if (targetSize < currentHeaps[i]) return { heapIndex: i, numToRemove: currentHeaps[i] - targetSize };
            }
        }
        return findRandomMove(currentHeaps);
    }
    function findRandomMove(currentHeaps) {
        const nonEmpty = currentHeaps.map((s, i) => ({s, i})).filter(h => h.s > 0);
        const randomHeap = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
        const numToRemove = Math.floor(Math.random() * randomHeap.s) + 1;
        return { heapIndex: randomHeap.i, numToRemove: numToRemove };
    }


    // =========================================================
    // 6. GAMEPLAY GERAL
    // =========================================================

    function updateGameState() {
        renderHeaps();
        if (gameMode === 'ONLINE') isMyTurn = (socket.id === currentTurnId);
        else isMyTurn = (currentTurnId === 1);
        
        if (isMyTurn) {
            statusMessage.textContent = "Sua Vez!";
            statusMessage.style.color = "#2ecc71";
            enableControls(true);
        } else {
            statusMessage.textContent = (gameMode === 'ONLINE') ? "Vez do Oponente..." : "Computador pensando...";
            statusMessage.style.color = "#e74c3c";
            enableControls(false);
            if (gameMode === 'OFFLINE' && !gameOver) setTimeout(executeComputerMove, 1200);
        }
    }

    confirmMoveBtn.addEventListener('click', () => {
        if (!isMyTurn) return;
        const selectedObjects = document.querySelectorAll('.object.selected');
        if (selectedObjects.length === 0) { alert("Selecione pelo menos uma peça!"); return; }

        const numToRemove = selectedObjects.length;
        heaps[selectedHeapIndex] -= numToRemove;
        
        if (gameMode === 'ONLINE') socket.emit('makeMove', { roomID: roomID, heapIndex: selectedHeapIndex, numToRemove: numToRemove });

        selectedHeapIndex = null;
        
        const total = heaps.reduce((a,b) => a+b, 0);
        if (total === 0) endGame(true);
        else {
            isMyTurn = false;
            if (gameMode === 'ONLINE') currentTurnId = "opponent";
            else currentTurnId = 2;
            updateGameState();
        }
    });

    // ---------------------------------------------------------
    // FUNÇÃO DE FIM DE JOGO (OVERLAY + TIMER VISUAL)
    // ---------------------------------------------------------
    function endGame(iWon) {
        gameOver = true;
        renderHeaps();
        enableControls(false);
        
        // Exibe o Overlay de Fim de Jogo
        gameOverOverlay.classList.remove('hidden');

        if (iWon) {
            goTitle.textContent = "VITÓRIA!";
            goTitle.style.color = "#f1c40f"; // Dourado
            goMessage.textContent = "Parabéns! Você dominou a estratégia.";
            addSystemMessage("Fim de jogo: Vitória!");
        } else {
            goTitle.textContent = "DERROTA";
            goTitle.style.color = "#e74c3c"; // Vermelho
            goMessage.textContent = (gameMode === 'ONLINE') 
                ? "O oponente foi mais esperto desta vez." 
                : "A máquina venceu. Tente novamente!";
            addSystemMessage("Fim de jogo: Derrota.");
        }

        if (gameMode === 'ONLINE') {
            // Configuração Online: Timer de 5 segundos
            goTimerContainer.classList.remove('hidden');
            goBackBtn.classList.add('hidden');
            
            let timeLeft = 5;
            goTimer.textContent = timeLeft;

            const countdownInterval = setInterval(() => {
                timeLeft--;
                goTimer.textContent = timeLeft;

                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    
                    // Limpeza Final
                    if (rtcManager) rtcManager.stopLocalStream();
                    location.reload();
                }
            }, 1000);

        } else {
            // Configuração Offline: Botão Manual
            goTimerContainer.classList.add('hidden');
            goBackBtn.classList.remove('hidden');
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
        if (selectedHeapIndex !== null && selectedHeapIndex !== hIndex) { alert("Apenas um monte por vez!"); return; }
        selectedHeapIndex = hIndex;
        obj.classList.toggle('selected');
        if (document.querySelectorAll('.object.selected').length === 0) selectedHeapIndex = null;
    }

    function enableControls(enable) {
        confirmMoveBtn.disabled = !enable;
        heapsContainer.style.pointerEvents = enable ? 'auto' : 'none';
    }


    // =========================================================
    // 7. CHAT
    // =========================================================

    function sendMessage() {
        const text = chatInput.value.trim();
        if (text) {
            if (gameMode === 'ONLINE') socket.emit('chatMessage', text);
            else {
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
    function addSystemMessage(text) { addMessageToChat(text, 'Sistema', 'system'); }
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
});