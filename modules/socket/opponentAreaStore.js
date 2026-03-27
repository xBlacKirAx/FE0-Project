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

    const oppAreaRefs = {
        graveyard: oppGraveyard,
        jewels: oppJewels,
        bonds: oppBonds,
        front: opponentFront,
        rear: opponentRear,
        deck: oppDeck,
        boundless: oppBoundless
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

    const add = (areaName, card) => {
        if (areaName === 'hand') {
            oppStats.value.hand++;
            oppHand.value = [...oppHand.value, card];
            return;
        }

        const areaRef = oppAreaRefs[areaName];
        if (!areaRef) return;
        areaRef.value = [...areaRef.value, card];
    };

    return { add, remove };
}
