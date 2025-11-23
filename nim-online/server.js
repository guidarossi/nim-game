require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const Player = require('./models/Player');

// Declarações Globais (A CORREÇÃO ESTÁ AQUI)
let https;
let server;
let app; // Agora 'app' existe para o arquivo todo

// Tenta carregar os módulos de segurança e chaves
try {
    if (fs.existsSync('server.key') && fs.existsSync('server.cert')) {
        https = require('https');
        const options = {
            key: fs.readFileSync('server.key'),
            cert: fs.readFileSync('server.cert')
        };
        
        // Inicializa app aqui (sem 'const')
        app = express();
        server = https.createServer(options, app);
        console.log('🔒 Modo Seguro (HTTPS) ativado (Certificados encontrados).');
        
        configureApp(app);
    } else {
        throw new Error("Certificados não encontrados.");
    }
} catch (e) {
    // Fallback para HTTP
    const http = require('http');
    
    // Inicializa app aqui (sem 'const')
    app = express();
    server = http.createServer(app);
    console.log('⚠️  Modo Local (HTTP) ativado (Certificados não encontrados).');
    
    configureApp(app);
}

const io = new Server(server);

// Função para configurar o Express
function configureApp(app) {
    app.use(express.static(path.join(__dirname, 'public')));
    // Middleware para ler JSON (Login/Registro)
    app.use(express.json());
}

// === 1. CONEXÃO COM MONGODB ===
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('>> MongoDB Conectado com Sucesso!');
    } catch (err) {
        console.error('Erro ao conectar no MongoDB:', err);
    }
};
connectDB();

// === 2. ROTAS DE AUTENTICAÇÃO (API) ===

// ROTA: Registrar Usuário
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const existingUser = await Player.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Usuário já existe!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newPlayer = new Player({
            username,
            password: hashedPassword
        });

        await newPlayer.save();
        res.status(201).json({ message: 'Usuário criado com sucesso!' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

// ROTA: Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const player = await Player.findOne({ username });
        if (!player) {
            return res.status(400).json({ message: 'Usuário não encontrado.' });
        }

        const isMatch = await bcrypt.compare(password, player.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Senha incorreta.' });
        }

        res.json({ 
            message: 'Login realizado!', 
            user: { 
                username: player.username, 
                wins: player.wins, 
                losses: player.losses 
            } 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});


// === 3. LÓGICA DO JOGO E SOCKET.IO ===
let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Chat Global
    socket.on('chatMessage', (msg) => {
        io.emit('chatMessage', { text: msg, author: 'Jogador', type: 'other', id: socket.id });
    });

    // Sinalização WebRTC (Câmera)
    socket.on('webrtc_signal', (data) => {
        socket.to(data.roomID).emit('webrtc_signal', data);
    });

    // Matchmaking
    socket.on('findGame', () => {
        if (waitingPlayer) {
            const roomID = waitingPlayer.id + '#' + socket.id;
            socket.join(roomID);
            waitingPlayer.join(roomID);

            const initialState = {
                heaps: [3, 5, 7],
                turn: waitingPlayer.id
            };

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

    // Movimento do Jogo
    socket.on('makeMove', (data) => {
        socket.to(data.roomID).emit('opponentMove', data);
    });

    // Desconexão
    socket.on('disconnect', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});