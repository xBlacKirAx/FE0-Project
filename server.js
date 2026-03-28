const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const EVT = require('./shared/socketEvents');
const { registerGameplayHandlers } = require('./server/socket/registerGameplayHandlers');
const { registerBattleHandlers } = require('./server/socket/registerBattleHandlers');
const { registerSyncHandlers } = require('./server/socket/registerSyncHandlers');
const { registerTurnModeHandlers } = require('./server/socket/registerTurnModeHandlers');
const { createConnectionRegistry } = require('./server/socket/connectionRegistry');
const { createDeckRouter } = require('./server/decks/deckRoutes');
const { createAiRouter } = require('./server/ai/aiRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));
const cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_b01.json'), 'utf-8'));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/api/cards', (req, res) => { res.json(cardsData); });
app.use('/api/decks', createDeckRouter({ cardPool: cardsData }));
app.use('/api/ai', createAiRouter({ cardPool: cardsData }));

const connectionRegistry = createConnectionRegistry(io, EVT);
const { log } = connectionRegistry;

// 暂存每场战斗的攻击方数据，等防御支援到来后合并成一条日志
const combatState = { pendingCombat: null };

io.on('connection', (socket) => {
    connectionRegistry.onConnect(socket);

    socket.on(EVT.ROOM_CREATE, (payload = {}) => {
        connectionRegistry.createRoom(socket, payload);
    });

    socket.on(EVT.ROOM_JOIN, (payload = {}) => {
        connectionRegistry.joinRoom(socket, payload.roomId, payload);
    });

    socket.on(EVT.ROOM_QUICK_MATCH, () => {
        connectionRegistry.quickMatch(socket);
    });

    socket.on(EVT.ROOM_LEAVE, () => {
        connectionRegistry.leaveCurrentRoom(socket);
    });

    socket.on(EVT.ROOM_START_GAME, () => {
        connectionRegistry.startRoomGame(socket);
    });

    socket.on('disconnect', () => {
        connectionRegistry.onDisconnect(socket.id);
    });

    registerGameplayHandlers({ socket, EVT, log, relayToRoomPeers: connectionRegistry.relayToRoomPeers });
    registerBattleHandlers({ socket, EVT, log, combatState, relayToRoomPeers: connectionRegistry.relayToRoomPeers });
    registerSyncHandlers({ socket, EVT, log, relayToRoomPeers: connectionRegistry.relayToRoomPeers });
    registerTurnModeHandlers({ socket, EVT, log, relayToRoomPeers: connectionRegistry.relayToRoomPeers });
});

function resolvePort() {
    const argvPort = process.argv.find(arg => arg.startsWith('--port='));
    if (argvPort) {
        const parsed = Number(argvPort.split('=')[1]);
        if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    const envPort = Number(process.env.PORT);
    if (Number.isInteger(envPort) && envPort > 0) return envPort;
    return 3000;
}

function printPortInUseHelp(port, host) {
    console.error('');
    console.error('启动失败：端口被占用。');
    console.error(`监听地址 ${host}:${port} 已被其他进程使用（常见于旧版 server.js 仍在运行）。`);
    console.error('');
    console.error('建议操作（Windows PowerShell）：');
    console.error(`1) 查询占用进程: netstat -ano | findstr :${port}`);
    console.error('2) 根据 PID 结束进程: taskkill /PID <PID> /F');
    console.error(`3) 重新启动: node server.js --port=${port}`);
    console.error('');
}

function startServer({ port = resolvePort(), host = '0.0.0.0' } = {}) {
    server.removeAllListeners('error');
    server.once('error', (error) => {
        if (error?.code === 'EADDRINUSE') {
            printPortInUseHelp(port, host);
            process.exitCode = 1;
            return;
        }

        console.error('服务器启动失败：', error);
        process.exitCode = 1;
    });

    server.listen(port, host, () => {
        console.log(`服务器已启动：http://localhost:${port}`);
    });
    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    io,
    server,
    startServer,
    resolvePort
};