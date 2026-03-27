// modules/cardOps.js
import { createAreaCommands } from './cardOps/areaCommands.js';
import { createCombatCommands } from './cardOps/combatCommands.js';

export function createCardOperations(state) {
    const refs = {
        hand: state.hand,
        fieldFront: state.fieldFront,
        fieldRear: state.fieldRear,
        bonds: state.bonds,
        jewels: state.jewels,
        graveyard: state.graveyard,
        boundless: state.boundless,
        deck: state.deck,
        undoStack: state.undoStack,
        selectedCard: state.selectedCard,
        hasPlacedBond: state.hasPlacedBond
    };

    const areaCommands = createAreaCommands({ state, socket: state.socket, refs });
    const combatCommands = createCombatCommands({ state, socket: state.socket });

    // 💡 导出时，直接导出原生的 playToField 即可
    return {
        ...areaCommands,
        ...combatCommands
    };
}