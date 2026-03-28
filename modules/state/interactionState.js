// modules/state/interactionState.js

const { ref } = Vue;

export function createInteractionState() {
    const isDraggingOver = ref(null);
    const hoveredAttackTargetId = ref(null);
    const hoveredAttackTargetRect = ref(null);
    const attackRangeTargetIds = ref([]);
    const draggedCard = ref(null);
    const undoStack = ref([]);

    return {
        isDraggingOver,
        hoveredAttackTargetId,
        hoveredAttackTargetRect,
        attackRangeTargetIds,
        draggedCard,
        undoStack
    };
}
