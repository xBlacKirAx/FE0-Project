// modules/commands/turnCommands.js

export function setBeginningPhaseState(state) {
    state.currentPhase.value = 'BEGINNING';
    state.hasPlacedBond.value = false;
}

export function clearTurnUsageState(state) {
    if (state.usedBondsThisTurn) state.usedBondsThisTurn.value = 0;
    if (state.undoStack) state.undoStack.value = [];
}

export function untapArea(areaRef) {
    if (!areaRef?.value?.length) return;
    areaRef.value.forEach(card => {
        card.isTapped = false;
    });
    areaRef.value = [...areaRef.value];
}
