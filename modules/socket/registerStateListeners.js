// modules/socket/registerStateListeners.js

export function registerStateListeners({
    state,
    socket,
    EVT,
    getMySyncData,
    resetGame,
    areaStore,
    handleIncomingSupportInteractionRequest
}) {
    let recoveredSupportRequestId = null;

    socket.on(EVT.OPPONENT_DRAW_CARD, (data) => {
        state.oppStats.value.hand++;
        if (data?.card) state.oppHand.value = [...state.oppHand.value, data.card];
    });

    socket.on(EVT.OPPONENT_BOND_FLIPPED, ({ instanceId, isFaceDown }) => {
        const card = state.oppBonds.value.find(c => c.instanceId === instanceId);
        if (card) card.isFaceDown = isFaceDown;
    });

    socket.on(EVT.OPPONENT_CARD_MOVED, (data) => {
        areaStore.remove(data.from, data.card.instanceId);
        areaStore.add(data.to, data.card);
    });

    socket.on(EVT.REQUEST_SYNC, () => {
        if (getMySyncData) socket.emit(EVT.FULL_STATE_SYNC, getMySyncData());
    });

    socket.on(EVT.FULL_STATE_SYNC, (data) => {
        state.opponentFront.value = data.front || [];
        state.opponentRear.value = data.rear || [];
        state.oppBonds.value = data.bonds || [];
        state.oppJewels.value = data.jewels || [];
        state.oppGraveyard.value = data.graveyard || [];
        state.oppHand.value = data.hand || [];
        state.oppDeck.value = data.deck || [];
        state.oppBoundless.value = data.boundless || [];
        state.oppStats.value = {
            hand: data.handCount || 0,
            bonds: data.bondsCount || 0,
            active: 0
        };

        // 断线重连恢复：如果对手正在等待我方处理支援请求，则在全量同步后补收一次。
        const pendingRequest = data?.pendingSupportRequest || null;
        if (
            pendingRequest
            && pendingRequest.requestId
            && pendingRequest.requestId !== recoveredSupportRequestId
            && typeof handleIncomingSupportInteractionRequest === 'function'
        ) {
            recoveredSupportRequestId = pendingRequest.requestId;
            handleIncomingSupportInteractionRequest(state, pendingRequest);
        }
    });

    socket.on(EVT.SYNC_RESET, () => {
        if (resetGame) resetGame(true);
    });

    socket.on(EVT.OPPONENT_DEV_MODE_CHANGED, ({ isDevMode, turnOwner, phase, openingTurnLocked }) => {
        state.isDevMode.value = isDevMode;
        const syncedPhase = phase || state.currentPhase.value || 'BEGINNING';
        const syncedOpeningLock = !!openingTurnLocked;

        if (isDevMode) {
            state.currentPhase.value = syncedPhase;
            if (state.firstPlayerOpeningTurnLocked) {
                state.firstPlayerOpeningTurnLocked.value = false;
            }
            return;
        }

        if (!isDevMode && turnOwner === 'sender') {
            state.isMyTurn.value = false;
            state.currentPhase.value = syncedPhase;
            state.hasPlacedBond.value = false;
            state.usedBondsThisTurn.value = 0;
            if (state.firstPlayerOpeningTurnLocked) {
                state.firstPlayerOpeningTurnLocked.value = false;
            }
            return;
        }

        if (!isDevMode && turnOwner === 'receiver') {
            state.isMyTurn.value = true;
            state.currentPhase.value = syncedPhase;
            state.hasPlacedBond.value = false;
            state.usedBondsThisTurn.value = 0;
            if (state.firstPlayerOpeningTurnLocked) {
                state.firstPlayerOpeningTurnLocked.value = syncedOpeningLock;
            }
            return;
        }

        if (state.firstPlayerOpeningTurnLocked) {
            state.firstPlayerOpeningTurnLocked.value = syncedOpeningLock;
        }
    });

    const requestSync = () => socket.emit(EVT.REQUEST_SYNC);
    if (socket.connected) {
        requestSync();
    } else {
        socket.on('connect', requestSync);
    }
}
