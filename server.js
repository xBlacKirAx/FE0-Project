const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));
const cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_b01.json'), 'utf-8'));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/api/cards', (req, res) => { res.json(cardsData); });

io.on('connection', (socket) => {
    socket.on('play-to-field', (data) => socket.broadcast.emit('opponent-played-to-field', data));
    socket.on('play-to-bond', (card) => socket.broadcast.emit('opponent-played-to-bond', card));
    socket.on('return-to-hand', (card) => socket.broadcast.emit('opponent-returned-card', card));
    socket.on('player-draw', () => socket.broadcast.emit('opponent-draw-card'));
    socket.on('sync-card-move', (data) => socket.broadcast.emit('opponent-card-moved', data));
    socket.on('sync-bond-flip', (data) => socket.broadcast.emit('opponent-bond-flipped', data));

    // ====== ⚔️ 战斗系统同步 ======
    socket.on('sync-attack', (data) => socket.broadcast.emit('opponent-attack', data));
    socket.on('sync-defense-support', (data) => socket.broadcast.emit('opponent-defense-support', data));
    // 👇 新增：监听卡牌恢复直立
    socket.on('sync-card-untap', (data) => socket.broadcast.emit('opponent-card-untap', data));
    // ====== 🔄 断线重连与状态同步 ======
    socket.on('request-sync', () => socket.broadcast.emit('request-sync'));
    socket.on('full-state-sync', (data) => socket.broadcast.emit('full-state-sync', data));
    socket.on('sync-reset', () => socket.broadcast.emit('sync-reset'));
    // ====== 🔄 回合与模式同步 ======
    socket.on('turn-end', () => socket.broadcast.emit('opponent-turn-end'));
    socket.on('sync-dev-mode', (data) => socket.broadcast.emit('opponent-dev-mode-changed', data));
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器已启动：http://localhost:${PORT}`);
});