// modules/state/gameState.js

const { ref } = Vue;

export function createGameFlowState() {
    const isDevMode = ref(true);
    const currentPhase = ref('BEGINNING');
    const isMyTurn = ref(true);
    const hasPlacedBond = ref(false);

    const oppStats = ref({ hand: 6, bonds: 0, active: 0 });
    const usedBondsThisTurn = ref(0);

    const PHASES = {
        BEGINNING: { name: '开始阶段' },
        BOND: { name: '羁绊阶段' },
        DEPLOY: { name: '出击阶段' },
        ATTACK: { name: '攻击阶段' },
        END: { name: '结束阶段' }
    };

    const isCombatActive = ref(false);
    const combatPhase = ref('NONE');
    const attacker = ref(null);
    const defender = ref(null);
    const mySupportCard = ref(null);
    const oppSupportCard = ref(null);
    const combatStats = ref({ myTotalPower: 0, oppTotalPower: 0 });

    return {
        isDevMode,
        currentPhase,
        isMyTurn,
        hasPlacedBond,
        oppStats,
        usedBondsThisTurn,
        PHASES,
        isCombatActive,
        combatPhase,
        attacker,
        defender,
        mySupportCard,
        oppSupportCard,
        combatStats
    };
}
