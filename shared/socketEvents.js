(function initSocketEvents(globalScope, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    globalScope.SOCKET_EVENTS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSocketEvents() {
    return Object.freeze({
        PLAY_TO_FIELD: 'play-to-field',
        OPPONENT_PLAYED_TO_FIELD: 'opponent-played-to-field',
        PLAY_TO_BOND: 'play-to-bond',
        OPPONENT_PLAYED_TO_BOND: 'opponent-played-to-bond',
        RETURN_TO_HAND: 'return-to-hand',
        OPPONENT_RETURNED_CARD: 'opponent-returned-card',
        PLAYER_DRAW: 'player-draw',
        OPPONENT_DRAW_CARD: 'opponent-draw-card',
        SYNC_CARD_MOVE: 'sync-card-move',
        OPPONENT_CARD_MOVED: 'opponent-card-moved',
        SYNC_BOND_FLIP: 'sync-bond-flip',
        OPPONENT_BOND_FLIPPED: 'opponent-bond-flipped',
        SYNC_ATTACK: 'sync-attack',
        OPPONENT_ATTACK: 'opponent-attack',
        SYNC_DEFENSE_SUPPORT: 'sync-defense-support',
        OPPONENT_DEFENSE_SUPPORT: 'opponent-defense-support',
        SYNC_COMBAT_DECISION: 'sync-combat-decision',
        OPPONENT_COMBAT_DECISION: 'opponent-combat-decision',
        SYNC_SUPPORT_INTERACTION_REQUEST: 'sync-support-interaction-request',
        OPPONENT_SUPPORT_INTERACTION_REQUEST: 'opponent-support-interaction-request',
        SYNC_SUPPORT_INTERACTION_RESOLVE: 'sync-support-interaction-resolve',
        OPPONENT_SUPPORT_INTERACTION_RESOLVE: 'opponent-support-interaction-resolve',
        SYNC_CARD_UNTAP: 'sync-card-untap',
        OPPONENT_CARD_UNTAP: 'opponent-card-untap',
        SYNC_UNTAP_ALL: 'sync-untap-all',
        OPPONENT_UNTAP_ALL: 'opponent-untap-all',
        REQUEST_SYNC: 'request-sync',
        FULL_STATE_SYNC: 'full-state-sync',
        SYNC_RESET: 'sync-reset',
        SYNC_PHASE: 'sync-phase',
        TURN_END: 'turn-end',
        OPPONENT_TURN_END: 'opponent-turn-end',
        SYNC_DEV_MODE: 'sync-dev-mode',
        OPPONENT_DEV_MODE_CHANGED: 'opponent-dev-mode-changed',
        ROOM_CREATE: 'room-create',
        ROOM_JOIN: 'room-join',
        ROOM_QUICK_MATCH: 'room-quick-match',
        ROOM_LEAVE: 'room-leave',
        ROOM_STATE: 'room-state',
        ROOM_ERROR: 'room-error',
        ROOM_START_GAME: 'room-start-game',
        ROOM_GAME_STARTED: 'room-game-started'
    });
});