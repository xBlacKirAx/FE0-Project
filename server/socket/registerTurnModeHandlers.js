function registerTurnModeHandlers({ socket, EVT, log }) {
    socket.on(EVT.SYNC_PHASE, (data) => {
        log(socket.id, `阶段切换 → ${data?.phaseName || data?.phase}`);
    });

    socket.on(EVT.TURN_END, () => {
        log(socket.id, '结束回合');
        socket.broadcast.emit(EVT.OPPONENT_TURN_END);
    });

    socket.on(EVT.SYNC_DEV_MODE, (data) => {
        log(socket.id, `切换模式 → isDevMode:${data?.isDevMode}`);
        socket.broadcast.emit(EVT.OPPONENT_DEV_MODE_CHANGED, data);
    });
}

module.exports = { registerTurnModeHandlers };
