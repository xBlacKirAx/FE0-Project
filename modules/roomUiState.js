export function normalizeRoomPayload(payload = {}) {
    return {
        roomId: String(payload.roomId || ''),
        hostId: payload.hostId || null,
        guestId: payload.guestId || null,
        hostName: String(payload.hostName || ''),
        guestName: String(payload.guestName || ''),
        playerCount: Number(payload.playerCount || 0),
        queueing: !!payload.queueing,
        ready: !!payload.ready,
        gameInProgress: !!payload.gameInProgress,
        isPrivate: !!payload.isPrivate
    };
}

export function deriveRoomRole({ roomId, hostId, guestId, myId }) {
    if (!roomId || !myId) return '';
    if (hostId === myId) return 'host';
    if (guestId === myId) return 'guest';
    return '';
}

export function deriveRoomStatusText(roomState) {
    if (roomState.queueing) return '匹配中...';
    if (!roomState.roomId) return '未加入房间';
    return `房间 ${roomState.roomId}`;
}

export function didOpponentLeaveRoom(prevRoomState, nextRoomState) {
    return prevRoomState.roomId
        && prevRoomState.roomId === nextRoomState.roomId
        && prevRoomState.ready
        && prevRoomState.playerCount === 2
        && nextRoomState.playerCount === 1;
}

export function deriveRoomScene({ connectionScene, roomId, roomQueueing, roomReady, roomGameInProgress }) {
    if (connectionScene === 'recovering' && roomId) return 'recovering';
    if (roomGameInProgress && roomId) return 'in-game';
    if (roomQueueing) return 'matching';
    if (!roomId) return 'idle';
    if (roomReady) return 'ready';
    return 'waiting';
}

export function deriveTopBarUi({ roomScene, roomGameInProgress, showNextPhaseButton, startRoomButtonConsumed, isCompactMobile = false }) {
    const battleVisible = roomGameInProgress;
    const roomWaiting = roomScene === 'waiting';
    const roomReady = roomScene === 'ready';
    const roomInGame = roomScene === 'in-game';
    const roomRecovering = roomScene === 'recovering';
    const compactBattleUi = isCompactMobile && roomInGame;
    const showRoomEntryButtons = roomScene === 'idle';
    const showCreateRoomButton = showRoomEntryButtons;
    const showJoinRoomButton = showRoomEntryButtons;
    const showQuickMatchButton = showRoomEntryButtons && !isCompactMobile;

    return {
        showResetButton: battleVisible && !compactBattleUi,
        showDeckManagerButton: !compactBattleUi,
        showCostCounter: battleVisible,
        showTurnOwner: battleVisible,
        showPhaseName: battleVisible,
        showNextPhaseButton: battleVisible && showNextPhaseButton,
        showCreateRoomButton,
        showJoinRoomButton,
        showQuickMatchButton,
        showLeaveRoomButton: roomWaiting || roomReady || roomInGame,
        showStartRoomButton: roomReady && !roomRecovering && !startRoomButtonConsumed
    };
}