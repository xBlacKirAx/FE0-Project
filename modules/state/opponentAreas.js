// modules/state/opponentAreas.js

const { ref } = Vue;

export function createOpponentAreasState() {
    const opponentFront = ref([]);
    const opponentRear = ref([]);
    const oppHand = ref([]);
    const oppJewels = ref([]);
    const oppGraveyard = ref([]);
    const oppBonds = ref([]);
    const oppDeck = ref([]);
    const oppBoundless = ref([]);

    return {
        opponentFront,
        opponentRear,
        oppHand,
        oppJewels,
        oppGraveyard,
        oppBonds,
        oppDeck,
        oppBoundless
    };
}
