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
    // 必杀：攻击战力与支援战力合计后翻倍
    const criticalPower = (cardPower + supportPower) * 2;
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
