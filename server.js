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

const areaLabel = (a) => ({ hand:'手牌', front:'前排', rear:'后排', bonds:'羁绊区', jewels:'宝玉区', graveyard:'弃牌区', deck:'牌组', boundless:'无限区' }[a] || a);
const cardName = (c) => c?.name || c?.id || '未知卡牌';

// 按连接顺序分配 玩家A / 玩家B 标签
const playerMap = new Map();
const playerLabel = (socketId) => playerMap.get(socketId) || `(?${socketId.slice(-4)})`;
const log = (socketId, msg) => console.log(`[LOG ${new Date().toTimeString().slice(0,8)}] [${playerLabel(socketId)}] ${msg}`);

// 暂存每场战斗的攻击方数据，等防御支援到来后合并成一条日志
let pendingCombat = null;

io.on('connection', (socket) => {
    const label = playerMap.size === 0 ? '玩家A' : playerMap.size === 1 ? '玩家B' : `观战${playerMap.size - 1}`;
    playerMap.set(socket.id, label);
    console.log(`[连接] ${label} (${socket.id.slice(-4)}) 已连接，当前在线: ${io.engine.clientsCount}`);
    socket.on('disconnect', () => {
        console.log(`[断连] ${playerLabel(socket.id)} 已断开，当前在线: ${io.engine.clientsCount - 1}`);
        playerMap.delete(socket.id);
    });

    socket.on('play-to-field', (data) => socket.broadcast.emit('opponent-played-to-field', data));
    socket.on('play-to-bond', (card) => socket.broadcast.emit('opponent-played-to-bond', card));
    socket.on('return-to-hand', (card) => socket.broadcast.emit('opponent-returned-card', card));
    socket.on('player-draw', (data) => {
        log(socket.id, `抽牌 → ${cardName(data?.card)}`);
        socket.broadcast.emit('opponent-draw-card', data);
    });
    socket.on('sync-card-move', (data) => {
        const from = areaLabel(data?.from), to = areaLabel(data?.to), name = cardName(data?.card);
        if (data?.to === 'bonds') log(socket.id, `放置羁绊 → ${name}`);
        else if (data?.from === 'hand' && (data?.to === 'front' || data?.to === 'rear')) log(socket.id, `出击 → ${name} 到 ${to}`);
        else log(socket.id, `移动 → ${name} [${from}→${to}]`);
        socket.broadcast.emit('opponent-card-moved', data);
    });
    socket.on('sync-bond-flip', (data) => {
        log(socket.id, `羁绊翻面 → instanceId:${data?.instanceId} isFaceDown:${data?.isFaceDown}`);
        socket.broadcast.emit('opponent-bond-flipped', data);
    });

    // ====== ⚔️ 战斗系统同步 ======
    socket.on('sync-attack', (data) => {
        // 暂存攻击方信息，等防御支援到来后输出完整战斗日志
        pendingCombat = {
            atkName: cardName(data?.attacker),
            defName: cardName(data?.defender),
            atkBase: data?.attacker?.attack || 0,
            atkSupport: data?.supportCard?.support || 0,
            defBase: data?.defender?.attack || 0
        };
        socket.broadcast.emit('opponent-attack', data);
    });
    socket.on('sync-defense-support', (data) => {
        const defSupport = data?.supportCard?.support || 0;
        if (pendingCombat) {
            const atkTotal = pendingCombat.atkBase + pendingCombat.atkSupport;
            const defTotal = pendingCombat.defBase + defSupport;
            const result = atkTotal >= defTotal ? '击破' : '未击破';
            log(socket.id, `战斗 → ${pendingCombat.atkName}(${atkTotal}) 攻击 ${pendingCombat.defName}(${defTotal}) → ${result}`);
            pendingCombat = null;
        }
        socket.broadcast.emit('opponent-defense-support', data);
    });
    socket.on('sync-card-untap', (data) => {
        log(socket.id, `回正 → instanceId:${data?.instanceId}`);
        socket.broadcast.emit('opponent-card-untap', data);
    });
    socket.on('sync-untap-all', () => {
        log(socket.id, `全体回正`);
        socket.broadcast.emit('opponent-untap-all');
    });

    // ====== 🔄 断线重连与状态同步 ======
    socket.on('request-sync', () => {
        log(socket.id, `请求全量同步`);
        socket.broadcast.emit('request-sync');
    });
    socket.on('full-state-sync', (data) => {
        log(socket.id, `全量同步 → hand:${data?.handCount} bonds:${data?.bondsCount} front:${data?.front?.length} rear:${data?.rear?.length}`);
        socket.broadcast.emit('full-state-sync', data);
    });
    socket.on('sync-reset', () => {
        log(socket.id, `重置游戏`);
        socket.broadcast.emit('sync-reset');
    });

    // ====== 🔄 回合与模式同步 ======
    socket.on('sync-phase', (data) => {
        log(socket.id, `阶段切换 → ${data?.phaseName || data?.phase}`);
        // 仅记录，不转发（阶段是本地状态）
    });
    socket.on('turn-end', () => {
        log(socket.id, `结束回合`);
        socket.broadcast.emit('opponent-turn-end');
    });
    socket.on('sync-dev-mode', (data) => {
        log(socket.id, `切换模式 → isDevMode:${data?.isDevMode}`);
        socket.broadcast.emit('opponent-dev-mode-changed', data);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器已启动：http://localhost:${PORT}`);
});