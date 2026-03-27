// modules/engine/combatEngine.js

export function isAttackerFromMyField(attackerInstanceId, myFrontCards, myRearCards) {
    if (!attackerInstanceId) return false;
    const allMyCards = [...(myFrontCards || []), ...(myRearCards || [])];
    return allMyCards.some(card => card.instanceId === attackerInstanceId);
}

export function getCombatWinner(myTotalPower, oppTotalPower) {
    return (myTotalPower || 0) >= (oppTotalPower || 0);
}
