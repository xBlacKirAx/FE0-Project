// modules/socket/opponentAreaStore.js

export function createOpponentAreaStore(state) {
    const {
        oppStats,
        oppHand,
        oppGraveyard,
        oppJewels,
        oppBonds,
        oppDeck,
        oppBoundless,
        opponentFront,
        opponentRear
    } = state;

    const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

    const normalizeCard = (card, fallbackCard = null) => {
        const base = fallbackCard && typeof fallbackCard === 'object' ? fallbackCard : {};
        const source = card && typeof card === 'object' ? card : null;
        if (!source && !fallbackCard) return null;

        const next = {
            ...base,
            ...(source || {})
        };

        const nextStacks = hasOwn(source, '_stackedCards')
            ? source._stackedCards
            : fallbackCard?._stackedCards;
        const fallbackStacks = Array.isArray(fallbackCard?._stackedCards) ? fallbackCard._stackedCards : [];

        next._stackedCards = Array.isArray(nextStacks)
            ? nextStacks.map((stackedCard, index) => normalizeCard(stackedCard, fallbackStacks[index] || null)).filter(Boolean)
            : [];

        return next;
    };

    const oppAreaRefs = {
        graveyard: oppGraveyard,
        jewels: oppJewels,
        bonds: oppBonds,
        front: opponentFront,
        rear: opponentRear,
        deck: oppDeck,
        boundless: oppBoundless
    };

    const find = (instanceId) => {
        const targetId = String(instanceId || '').trim();
        if (!targetId) return null;

        const pools = [
            oppHand.value,
            oppGraveyard.value,
            oppJewels.value,
            oppBonds.value,
            opponentFront.value,
            opponentRear.value,
            oppDeck.value,
            oppBoundless.value
        ];

        for (const pool of pools) {
            const found = (Array.isArray(pool) ? pool : []).find(card => String(card?.instanceId || '').trim() === targetId);
            if (found) return found;
        }

        return null;
    };

    const remove = (areaName, cardId) => {
        if (areaName === 'hand') {
            oppStats.value.hand--;
            oppHand.value = oppHand.value.filter(c => c.instanceId !== cardId);
            return;
        }

        const areaRef = oppAreaRefs[areaName];
        if (!areaRef) return;
        areaRef.value = areaRef.value.filter(c => c.instanceId !== cardId);
    };

    const add = (areaName, card, fallbackCard = null) => {
        const normalized = normalizeCard(card, fallbackCard);
        if (!normalized) return;

        if (areaName === 'hand') {
            oppStats.value.hand++;
            oppHand.value = [...oppHand.value, normalized];
            return;
        }

        const areaRef = oppAreaRefs[areaName];
        if (!areaRef) return;
        areaRef.value = [...areaRef.value, normalized];
    };

    return { add, remove, find, normalizeCard };
}
