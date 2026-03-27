// modules/engine/combatDecisionEngine.js

export function createInitialCombatDecision() {
    return {
        stage: 'idle',
        promptOwner: null,
        criticalPower: 0,
        criticalUsed: false,
        evaded: false,
        finalAttackerWins: null
    };
}

export function getInitialCombatDecisionContext(myCardPower, mySupportPower, oppTotalPower) {
    const cardPower = myCardPower || 0;
    const supportPower = mySupportPower || 0;
    const attackPower = cardPower + supportPower;
    const defensePower = oppTotalPower || 0;
    // 必杀：只翻倍卡片本身战力，支援战力不翻倍
    const criticalPower = cardPower * 2 + supportPower;
    const baseAttackerWins = attackPower >= defensePower;
    const criticalAttackerWins = criticalPower >= defensePower;

    if (baseAttackerWins) {
        return {
            stage: 'awaiting-defender-evasion',
            promptOwner: 'defender',
            criticalPower,
            criticalUsed: false,
            evaded: false,
            finalAttackerWins: null
        };
    }

    if (criticalAttackerWins) {
        return {
            stage: 'awaiting-attacker-critical',
            promptOwner: 'attacker',
            criticalPower,
            criticalUsed: false,
            evaded: false,
            finalAttackerWins: null
        };
    }

    return {
        stage: 'auto-miss',
        promptOwner: null,
        criticalPower,
        criticalUsed: false,
        evaded: false,
        finalAttackerWins: false
    };
}
