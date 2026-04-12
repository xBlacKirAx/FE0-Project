// modules/effects/combatSocketEffects.js

const getEvents = () => globalThis.SOCKET_EVENTS || {
    SYNC_COMBAT_DECISION: 'sync-combat-decision',
    SYNC_COMBAT_SUPPORT_EMBLEM_CHOICE: 'sync-combat-support-emblem-choice',
    SYNC_SUPPORT_INTERACTION_REQUEST: 'sync-support-interaction-request',
    SYNC_SUPPORT_INTERACTION_RESOLVE: 'sync-support-interaction-resolve'
};

export function emitSyncCombatDecision(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_COMBAT_DECISION, payload);
}

export function emitSyncCombatSupportEmblemChoice(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    if (EVT.SYNC_COMBAT_SUPPORT_EMBLEM_CHOICE) {
        socket.emit(EVT.SYNC_COMBAT_SUPPORT_EMBLEM_CHOICE, payload);
    }
}

export function emitSyncSupportInteractionRequest(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_SUPPORT_INTERACTION_REQUEST, payload);
}

export function emitSyncSupportInteractionResolve(socket, payload) {
    if (!socket) return;
    const EVT = getEvents();
    socket.emit(EVT.SYNC_SUPPORT_INTERACTION_RESOLVE, payload);
}
