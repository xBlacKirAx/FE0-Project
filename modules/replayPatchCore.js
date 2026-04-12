// 与 server/ai/duelEngine 一致的 replayPatch 计算（浏览器端），并增加 currentPhase。

export const REPLAY_PATCH_ZONE_KEYS = ['front', 'rear', 'hand', 'bonds', 'jewels', 'graveyard', 'drawPile'];

export function isDeepEqualByJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function getCardReplayKey(card, fallback = '') {
    const instanceId = String(card?.instanceId || '').trim();
    if (instanceId) return instanceId;
    const id = String(card?.id || '').trim();
    if (id) return id;
    return fallback;
}

export function serializeReplayPatchCard(card) {
    if (!card) return null;
    return {
        id: card.id,
        instanceId: card.instanceId,
        isMainCharacter: !!card.isMainCharacter,
        isTapped: !!card.isTapped,
        ...(Array.isArray(card._stackedCards) && card._stackedCards.length > 0
            ? { _stackedCards: card._stackedCards.map(serializeReplayPatchCard).filter(Boolean) }
            : {})
    };
}

export function serializeCardForSnapshot(card) {
    if (!card) return null;
    return {
        id: card.id,
        instanceId: card.instanceId,
        isMainCharacter: !!card.isMainCharacter,
        isTapped: !!card.isTapped,
        _stackedCards: Array.isArray(card._stackedCards) ? card._stackedCards.map(serializeCardForSnapshot) : []
    };
}

function buildMinimalZonePatch(prevZone, nextZone, zoneKey) {
    const prevList = Array.isArray(prevZone) ? prevZone : [];
    const nextList = Array.isArray(nextZone) ? nextZone : [];

    const prevMap = new Map(prevList.map((card, idx) => [getCardReplayKey(card, `prev-${idx}`), card]));
    const nextMap = new Map(nextList.map((card, idx) => [getCardReplayKey(card, `next-${idx}`), card]));

    const add = [];
    const remove = [];
    const update = [];

    for (const [key, card] of nextMap.entries()) {
        const prevCard = prevMap.get(key);
        if (!prevCard) {
            add.push(serializeReplayPatchCard(card));
            continue;
        }

        const changes = {};
        if (prevCard.id !== card.id) changes.id = card.id;
        if (prevCard.isTapped !== card.isTapped) changes.isTapped = card.isTapped;
        if (prevCard.isMainCharacter !== card.isMainCharacter) changes.isMainCharacter = card.isMainCharacter;
        if (!isDeepEqualByJson(prevCard._stackedCards || [], card._stackedCards || [])) {
            changes._stackedCards = Array.isArray(card._stackedCards)
                ? card._stackedCards.map(serializeReplayPatchCard).filter(Boolean)
                : [];
        }
        if (Object.keys(changes).length > 0) {
            update.push({ instanceId: card.instanceId, ...changes });
        }
    }

    for (const key of prevMap.keys()) {
        if (!nextMap.has(key)) {
            remove.push(key);
        }
    }

    const isDrawPile = zoneKey === 'drawPile';
    let orderData = null;
    if (!isDrawPile) {
        const prevOrder = prevList.map((card, idx) => getCardReplayKey(card, `prev-${idx}`));
        const nextOrder = nextList.map((card, idx) => getCardReplayKey(card, `next-${idx}`));
        const orderChanged = !isDeepEqualByJson(prevOrder, nextOrder);
        if (orderChanged) orderData = nextOrder;
    }

    if (!add.length && !remove.length && !update.length && !orderData) {
        return null;
    }

    return {
        ...(add.length ? { add } : {}),
        ...(remove.length ? { remove } : {}),
        ...(update.length ? { update } : {}),
        ...(orderData ? { order: orderData } : {})
    };
}

export function buildReplayPatch(prevSnapshot, nextSnapshot) {
    if (!nextSnapshot) return null;

    const patch = {};
    const sections = ['seatAState', 'seatBState'];
    for (const section of sections) {
        const prevState = prevSnapshot?.[section] || {};
        const nextState = nextSnapshot?.[section] || {};
        const sectionPatch = {};

        for (const zoneKey of REPLAY_PATCH_ZONE_KEYS) {
            const prevZone = prevState[zoneKey] || [];
            const nextZone = nextState[zoneKey] || [];
            const zonePatch = buildMinimalZonePatch(prevZone, nextZone, zoneKey);
            if (zonePatch) sectionPatch[zoneKey] = zonePatch;
        }

        if (!isDeepEqualByJson(prevState.handCount, nextState.handCount)) sectionPatch.handCount = nextState.handCount;
        if (!isDeepEqualByJson(prevState.drawPileCount, nextState.drawPileCount)) {
            sectionPatch.drawPileCount = nextState.drawPileCount;
        }
        if (!isDeepEqualByJson(prevState.bondsCount, nextState.bondsCount)) sectionPatch.bondsCount = nextState.bondsCount;
        if (!isDeepEqualByJson(prevState.jewelsCount, nextState.jewelsCount)) sectionPatch.jewelsCount = nextState.jewelsCount;
        if (!isDeepEqualByJson(prevState.graveyardCount, nextState.graveyardCount)) {
            sectionPatch.graveyardCount = nextState.graveyardCount;
        }

        if (Object.keys(sectionPatch).length > 0) {
            patch[section] = sectionPatch;
        }
    }

    if (!prevSnapshot || String(prevSnapshot.activeSeat || '') !== String(nextSnapshot.activeSeat || '')) {
        patch.activeSeat = nextSnapshot.activeSeat || null;
    }

    if (!prevSnapshot || prevSnapshot.turn !== nextSnapshot.turn) {
        patch.turn = nextSnapshot.turn;
        patch.turnLabel = `T${nextSnapshot.turn}`;
    }

    if (!prevSnapshot || String(prevSnapshot.currentPhase || '') !== String(nextSnapshot.currentPhase || '')) {
        patch.currentPhase = nextSnapshot.currentPhase || null;
    }

    return Object.keys(patch).length > 0 ? patch : null;
}
