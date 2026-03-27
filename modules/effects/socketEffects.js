// modules/effects/socketEffects.js

export function emitSyncPhase(socket, payload) {
    socket.emit('sync-phase', payload);
}

export function emitTurnEnd(socket) {
    socket.emit('turn-end');
}

export function emitSyncUntapAll(socket) {
    socket.emit('sync-untap-all');
}
