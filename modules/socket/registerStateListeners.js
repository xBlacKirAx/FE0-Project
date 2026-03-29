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

    const normalizeIncomingAreaCards = (cards) =>
        Array.isArray(cards)
            ? cards.map(card => areaStore.normalizeCard(card, areaStore.find(card?.instanceId))).filter(Boolean)
            : [];

    socket.on(EVT.OPPONENT_DRAW_CARD, (data) => {
        state.oppStats.value.hand++;
        if (data?.card) {
            const fallbackCard = areaStore.find(data.card.instanceId);
            const normalized = areaStore.normalizeCard(data.card, fallbackCard);
            if (normalized) state.oppHand.value = [...state.oppHand.value, normalized];
        }
    });

    socket.on(EVT.OPPONENT_BOND_FLIPPED, ({ instanceId, isFaceDown }) => {
        const card = state.oppBonds.value.find(c => c.instanceId === instanceId);
        if (card) card.isFaceDown = isFaceDown;
    });

    socket.on(EVT.OPPONENT_CARD_MOVED, (data) => {
        const fallbackCard = areaStore.find(data?.card?.instanceId);
        areaStore.remove(data.from, data.card.instanceId);
        areaStore.add(data.to, data.card, fallbackCard);
    });

    socket.on(EVT.REQUEST_SYNC, () => {
        if (getMySyncData) socket.emit(EVT.FULL_STATE_SYNC, getMySyncData());
    });

    socket.on(EVT.FULL_STATE_SYNC, (data) => {
        state.opponentFront.value = normalizeIncomingAreaCards(data.front);
        state.opponentRear.value = normalizeIncomingAreaCards(data.rear);
        state.oppBonds.value = normalizeIncomingAreaCards(data.bonds);
        state.oppJewels.value = normalizeIncomingAreaCards(data.jewels);
        state.oppGraveyard.value = normalizeIncomingAreaCards(data.graveyard);
        state.oppHand.value = normalizeIncomingAreaCards(data.hand);
        state.oppDeck.value = normalizeIncomingAreaCards(data.deck);
        state.oppBoundless.value = normalizeIncomingAreaCards(data.boundless);
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

    socket.on(EVT.OPPONENT_MULLIGAN_DECISION, ({ state: oppState }) => {
        if (state.opponentMulliganState) {
            state.opponentMulliganState.value = oppState || 'done';
        }
    });

    const requestSync = () => socket.emit(EVT.REQUEST_SYNC);
    if (socket.connected) {
        requestSync();
    } else {
        socket.on('connect', requestSync);
    }
}
