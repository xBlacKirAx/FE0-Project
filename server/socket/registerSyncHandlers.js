function registerSyncHandlers({ socket, EVT, log }) {
    socket.on(EVT.REQUEST_SYNC, () => {
        log(socket.id, '请求全量同步');
        socket.broadcast.emit(EVT.REQUEST_SYNC);
    });

    socket.on(EVT.FULL_STATE_SYNC, (data) => {
        log(socket.id, `全量同步 → hand:${data?.handCount} bonds:${data?.bondsCount} front:${data?.front?.length} rear:${data?.rear?.length}`);
        socket.broadcast.emit(EVT.FULL_STATE_SYNC, data);
    });

    socket.on(EVT.SYNC_RESET, () => {
        log(socket.id, '重置游戏');
        socket.broadcast.emit(EVT.SYNC_RESET);
    });
}

module.exports = { registerSyncHandlers };
