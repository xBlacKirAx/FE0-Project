// modules/cardOps/combatCommands.js

import { isAttackerFromMyField, getCombatWinner } from '../engine/combatEngine.js';
import { emitSyncAttack, emitSyncCardUntap } from '../effects/cardSocketEffects.js';

export function createCombatCommands({ state, socket }) {
    const initiateAttack = (currentState, attackerCard, defenderCard) => {
        if (attackerCard.isTapped && !currentState.isDevMode.value) {
            console.warn('[规则拦截] 底层已拒绝：已横置的卡牌无法再次攻击！');
            return;
        }
        attackerCard.isTapped = true;
        currentState.attacker.value = attackerCard;
        currentState.defender.value = defenderCard;
        currentState.combatStats.value = {
            myTotalPower: attackerCard.attack || 0,
            oppTotalPower: defenderCard.attack || 0
        };
        currentState.isCombatActive.value = true;

        setTimeout(() => {
            let mySupport = null;
            if (currentState.deck.value.length > 0) {
                mySupport = currentState.deck.value.pop();
                currentState.mySupportCard.value = mySupport;
                currentState.combatStats.value.myTotalPower += (mySupport.support || 0);
            }
            emitSyncAttack(socket, { attacker: attackerCard, defender: defenderCard, supportCard: mySupport });
        }, 800);
    };

    const untapCard = (card) => {
        if (!card) return;
        card.isTapped = false;
        emitSyncCardUntap(socket, { instanceId: card.instanceId });
        state.selectedCard.value = null;
    };

    const resolveCombat = (currentState) => {
        const isMyAttacker = isAttackerFromMyField(
            currentState.attacker.value?.instanceId,
            currentState.fieldFront.value,
            currentState.fieldRear.value
        );
        const attackerWins = getCombatWinner(
            currentState.combatStats.value.myTotalPower,
            currentState.combatStats.value.oppTotalPower
        );

        if (attackerWins) {
            const targetId = currentState.defender.value.instanceId;
            const isTargetMC = currentState.defender.value.isMainCharacter;

            if (isTargetMC) {
                if (isMyAttacker) {
                    if (currentState.oppJewels.value.length > 0) {
                        currentState.oppJewels.value.pop();
                        currentState.oppStats.value.hand++;
                    } else {
                        setTimeout(() => alert('🏆 决杀！你击破了对手没有宝玉的主人公，获得胜利！'), 600);
                    }
                } else if (currentState.jewels.value.length > 0) {
                    const brokenJewel = currentState.jewels.value.pop();
                    brokenJewel.isFaceDown = false;
                    currentState.hand.value.push(brokenJewel);
                } else {
                    setTimeout(() => alert('💀 败北... 你的主人公在没有宝玉的情况下被击破。'), 600);
                }
            } else {
                ['fieldFront', 'fieldRear'].forEach(area => {
                    const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                    if (idx > -1) currentState.graveyard.value.push(currentState[area].value.splice(idx, 1)[0]);
                });
                ['opponentFront', 'opponentRear'].forEach(area => {
                    const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                    if (idx > -1) currentState.oppGraveyard.value.push(currentState[area].value.splice(idx, 1)[0]);
                });
            }
        }

        if (isMyAttacker) {
            if (currentState.mySupportCard.value) currentState.graveyard.value.push(currentState.mySupportCard.value);
            if (currentState.oppSupportCard.value) currentState.oppGraveyard.value.push(currentState.oppSupportCard.value);
        } else {
            if (currentState.mySupportCard.value) currentState.oppGraveyard.value.push(currentState.mySupportCard.value);
            if (currentState.oppSupportCard.value) currentState.graveyard.value.push(currentState.oppSupportCard.value);
        }

        setTimeout(() => {
            currentState.isCombatActive.value = false;
            currentState.attacker.value = null;
            currentState.defender.value = null;
            currentState.mySupportCard.value = null;
            currentState.oppSupportCard.value = null;
        }, 500);
    };

    return {
        initiateAttack,
        untapCard,
        resolveCombat
    };
}
