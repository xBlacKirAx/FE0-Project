function createConnectionRegistry(io) {
    const playerMap = new Map();

    const playerLabel = (socketId) => playerMap.get(socketId) || `(?${socketId.slice(-4)})`;
    const log = (socketId, msg) => {
        console.log(`[LOG ${new Date().toTimeString().slice(0, 8)}] [${playerLabel(socketId)}] ${msg}`);
    };

    const onConnect = (socket) => {
        const label = playerMap.size === 0 ? '玩家A' : playerMap.size === 1 ? '玩家B' : `观战${playerMap.size - 1}`;
        playerMap.set(socket.id, label);
        console.log(`[连接] ${label} (${socket.id.slice(-4)}) 已连接，当前在线: ${io.engine.clientsCount}`);
    };

    const onDisconnect = (socketId) => {
        console.log(`[断连] ${playerLabel(socketId)} 已断开，当前在线: ${io.engine.clientsCount - 1}`);
        playerMap.delete(socketId);
    };

    return {
        log,
        onConnect,
        onDisconnect
    };
}

module.exports = { createConnectionRegistry };
