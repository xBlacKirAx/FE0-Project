// modules/commands/turnCommands.js

export function setBeginningPhaseState(state) {
    state.currentPhase.value = 'BEGINNING';
    state.hasPlacedBond.value = false;
}

export function clearTurnUsageState(state) {
    if (state.usedBondsThisTurn) state.usedBondsThisTurn.value = 0;
    if (state.undoStack) state.undoStack.value = [];

    const clearCardFlags = (card) => {
        if (!card || typeof card !== 'object') return;
        delete card._tempAbilityPowerThisTurn;
        delete card._tempCannotBeEvadedThisTurn;
        delete card._tempJewelBreak2ThisTurn;
        card._abilityUsedThisTurn = {};
    };

    const myCards = [
        ...(state.fieldFront?.value || []),
        ...(state.fieldRear?.value || []),
        ...(state.hand?.value || []),
        ...(state.graveyard?.value || [])
    ];
    myCards.forEach(clearCardFlags);
}

export function untapArea(areaRef) {
    if (!areaRef?.value?.length) return;
    areaRef.value.forEach(card => {
        card.isTapped = false;
    });
    areaRef.value = [...areaRef.value];
}
