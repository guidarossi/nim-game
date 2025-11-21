const express = require('express');
const https = require('https'); // MUDOU: Agora usamos 'https'
const fs = require('fs');       // NOVO: Para ler os arquivos do certificado
const { Server } = require('socket.io');
const path = require('path');

const app = express();

// === CONFIGURAÇÃO DO HTTPS ===
// Lê os arquivos que criamos no servidor
const options = {
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
};

// Cria o servidor usando HTTPS e as opções
const server = https.createServer(options, app);
const io = new Server(server);

// Serve os arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// ... (O RESTO DO CÓDIGO CONTINUA IGUAL DAQUI PARA BAIXO) ...
// Estado das salas de jogo...
// io.on('connection')...


// Serve os arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Estado das salas de jogo
let waitingPlayer = null; 

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Chat
    socket.on('chatMessage', (msg) => {
        io.emit('chatMessage', { text: msg, author: 'Jogador', type: 'other', id: socket.id });
    });

    // Encontrar Jogo
    socket.on('findGame', () => {
        if (waitingPlayer) {
            const roomID = waitingPlayer.id + '#' + socket.id;
            socket.join(roomID);
            waitingPlayer.join(roomID);

            const initialState = { heaps: [3, 5, 7], turn: waitingPlayer.id };

            io.to(roomID).emit('gameStart', { 
                roomID: roomID,
                state: initialState,
                players: { p1: waitingPlayer.id, p2: socket.id }
            });
            waitingPlayer = null;
        } else {
            waitingPlayer = socket;
            socket.emit('waitingForOpponent');
        }
    });

    // Movimento
    socket.on('makeMove', (data) => {
        socket.to(data.roomID).emit('opponentMove', data);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket) waitingPlayer = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
const express = require('express');
const https = require('https'); // MUDOU: Agora usamos 'https'
const fs = require('fs');       // NOVO: Para ler os arquivos do certificado
const { Server } = require('socket.io');
const path = require('path');

const app = express();

// === CONFIGURAÇÃO DO HTTPS ===
// Lê os arquivos que criamos no servidor
const options = {
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
};

// Cria o servidor usando HTTPS e as opções
const server = https.createServer(options, app);
const io = new Server(server);

// Serve os arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// ... (O RESTO DO CÓDIGO CONTINUA IGUAL DAQUI PARA BAIXO) ...
// Estado das salas de jogo...
// io.on('connection')...


// Serve os arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Estado das salas de jogo
let waitingPlayer = null; 

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Chat
    socket.on('chatMessage', (msg) => {
        io.emit('chatMessage', { text: msg, author: 'Jogador', type: 'other', id: socket.id });
    });

    // Encontrar Jogo
    socket.on('findGame', () => {
        if (waitingPlayer) {
            const roomID = waitingPlayer.id + '#' + socket.id;
            socket.join(roomID);
            waitingPlayer.join(roomID);

            const initialState = { heaps: [3, 5, 7], turn: waitingPlayer.id };

            io.to(roomID).emit('gameStart', { 
                roomID: roomID,
                state: initialState,
                players: { p1: waitingPlayer.id, p2: socket.id }
            });
            waitingPlayer = null;
        } else {
            waitingPlayer = socket;
            socket.emit('waitingForOpponent');
        }
    });

    // Movimento
    socket.on('makeMove', (data) => {
        socket.to(data.roomID).emit('opponentMove', data);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket) waitingPlayer = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});