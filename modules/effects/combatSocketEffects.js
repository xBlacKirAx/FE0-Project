// modules/effects/combatSocketEffects.js

const getEvents = () => globalThis.SOCKET_EVENTS || {
    SYNC_COMBAT_DECISION: 'sync-combat-decision'
};

export function emitSyncCombatDecision(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_COMBAT_DECISION, payload);
}
