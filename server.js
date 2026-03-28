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

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));
const cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_b01.json'), 'utf-8'));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/api/cards', (req, res) => { res.json(cardsData); });
app.use('/api/decks', createDeckRouter({ cardPool: cardsData }));

const connectionRegistry = createConnectionRegistry(io);
const { log } = connectionRegistry;

// 暂存每场战斗的攻击方数据，等防御支援到来后合并成一条日志
const combatState = { pendingCombat: null };

io.on('connection', (socket) => {
    connectionRegistry.onConnect(socket);
    socket.on('disconnect', () => {
        connectionRegistry.onDisconnect(socket.id);
    });

    registerGameplayHandlers({ socket, EVT, log });
    registerBattleHandlers({ socket, EVT, log, combatState });
    registerSyncHandlers({ socket, EVT, log });
    registerTurnModeHandlers({ socket, EVT, log });
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

function startServer({ port = resolvePort(), host = '0.0.0.0' } = {}) {
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