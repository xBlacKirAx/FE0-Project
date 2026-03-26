const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 修改：将静态资源目录设为当前根目录
app.use(express.static(__dirname));

const cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_b01.json'), 'utf-8'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/cards', (req, res) => {
    res.json(cardsData);
});

io.on('connection', (socket) => {
    socket.on('play-to-field', (data) => socket.broadcast.emit('opponent-played-to-field', data));
    socket.on('play-to-bond', (card) => socket.broadcast.emit('opponent-played-to-bond', card));
    socket.on('return-to-hand', (card) => socket.broadcast.emit('opponent-returned-card', card));
    socket.on('player-draw', () => socket.broadcast.emit('opponent-draw-card'));
	// 监听玩家移动卡片
    socket.on('sync-card-move', (data) => {
        // 广播给房间内的其他玩家（即对手）
        socket.broadcast.emit('opponent-card-moved', data);
    });
	socket.on('sync-bond-flip', (data) => {
		socket.broadcast.emit('opponent-bond-flipped', data);
	});
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器已启动：http://localhost:${PORT}`);
});