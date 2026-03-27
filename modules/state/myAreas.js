// modules/state/myAreas.js

const { ref } = Vue;

export function createMyAreasState() {
    const hand = ref([]);
    const fieldFront = ref([]);
    const fieldRear = ref([]);
    const bonds = ref([]);
    const jewels = ref([]);
    const graveyard = ref([]);
    const boundless = ref([]);
    const deck = ref([]);

    return {
        hand,
        fieldFront,
        fieldRear,
        bonds,
        jewels,
        graveyard,
        boundless,
        deck
    };
}
