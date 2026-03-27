// modules/state/uiState.js

const { ref } = Vue;

export function createUiState() {
    const selectedCard = ref(null);
    const activePanel = ref(null);
    const showFullImage = ref(false);
    const allCards = ref([]);

    const isDrawingAnimationActive = ref(false);
    const currentDrawCardImage = ref('/images/card_back.jpg');

    return {
        selectedCard,
        activePanel,
        showFullImage,
        allCards,
        isDrawingAnimationActive,
        currentDrawCardImage
    };
}
