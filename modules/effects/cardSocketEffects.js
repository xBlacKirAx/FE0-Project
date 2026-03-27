// modules/effects/cardSocketEffects.js

const getEvents = () => globalThis.SOCKET_EVENTS || {
    SYNC_CARD_MOVE: 'sync-card-move',
    PLAYER_DRAW: 'player-draw',
    SYNC_BOND_FLIP: 'sync-bond-flip',
    SYNC_ATTACK: 'sync-attack',
    SYNC_COMBAT_DECISION: 'sync-combat-decision',
    SYNC_CARD_UNTAP: 'sync-card-untap',
    SYNC_RESET: 'sync-reset',
    FULL_STATE_SYNC: 'full-state-sync'
};

export function emitSyncCardMove(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_CARD_MOVE, payload);
}

export function emitPlayerDraw(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.PLAYER_DRAW, payload);
}

export function emitSyncBondFlip(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_BOND_FLIP, payload);
}

export function emitSyncAttack(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_ATTACK, payload);
}

export function emitSyncCardUntap(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_CARD_UNTAP, payload);
}

export function emitSyncReset(socket) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_RESET);
}

export function emitFullStateSync(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.FULL_STATE_SYNC, payload);
}
