// modules/socketHandler.js
import { createOpponentAreaStore } from './socket/opponentAreaStore.js';
import { registerBattleListeners } from './socket/registerBattleListeners.js';
import { registerStateListeners } from './socket/registerStateListeners.js';

export function createSocketHandler(state, cardOps) {
    const { socket } = state;
    const EVT = globalThis.SOCKET_EVENTS;
    if (!EVT) {
        throw new Error('SOCKET_EVENTS is missing. Load /shared/socketEvents.js before app.js.');
    }

    const { resolveCombat, getMySyncData, resetGame } = cardOps;
    const areaStore = createOpponentAreaStore(state);

    const setupSocketListeners = () => {
        registerStateListeners({ state, socket, EVT, getMySyncData, resetGame, areaStore });
        registerBattleListeners({ state, socket, EVT, resolveCombat });
    };

    return { setupSocketListeners };
}