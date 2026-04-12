// modules/state/uiState.js

const { ref } = Vue;

export function createUiState() {
    const selectedCard = ref(null);
    const activePanel = ref(null);
    const pendingUnitAbility = ref(null);
    /** 战斗中【自】费用（翻面等）或效果（退避区选择）的待处理队列 */
    const pendingCombatTriggerPayment = ref(null);
    const showFullImage = ref(false);
    const allCards = ref([]);

    const isDrawingAnimationActive = ref(false);
    const currentDrawCardImage = ref('/images/card_back.jpg');

    return {
        selectedCard,
        activePanel,
        pendingUnitAbility,
        pendingCombatTriggerPayment,
        showFullImage,
        allCards,
        isDrawingAnimationActive,
        currentDrawCardImage
    };
}
