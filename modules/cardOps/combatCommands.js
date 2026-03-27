// modules/cardOps/combatCommands.js

import { isAttackerFromMyField, getCombatWinner } from '../engine/combatEngine.js';
import { createInitialCombatDecision, getInitialCombatDecisionContext } from '../engine/combatDecisionEngine.js';
import { emitSyncAttack, emitSyncCardUntap } from '../effects/cardSocketEffects.js';
import { emitSyncCombatDecision } from '../effects/combatSocketEffects.js';

export function createCombatCommands({ state, socket }) {
    const getIsMyAttacker = (currentState) => isAttackerFromMyField(
        currentState.attacker.value?.instanceId,
        currentState.fieldFront.value,
        currentState.fieldRear.value
    );

    const resetCombatState = (currentState) => {
        currentState.isCombatActive.value = false;
        currentState.attacker.value = null;
        currentState.defender.value = null;
        currentState.mySupportCard.value = null;
        currentState.oppSupportCard.value = null;
        currentState.combatDecision.value = createInitialCombatDecision();
    };

    const resolveCombat = (currentState, forcedAttackerWins = null) => {
        const isMyAttacker = getIsMyAttacker(currentState);
        const attackerWins = forcedAttackerWins ?? getCombatWinner(
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

        currentState.combatDecision.value = {
            ...currentState.combatDecision.value,
            stage: 'resolved',
            finalAttackerWins: attackerWins
        };

        setTimeout(() => {
            resetCombatState(currentState);
        }, 700);
    };

    const applyCombatDecision = (currentState, payload) => {
        const decisionType = payload?.decisionType;
        const useSkill = !!payload?.useSkill;
        const currentDecision = currentState.combatDecision.value;

        if (decisionType === 'critical') {
            if (!useSkill) {
                resolveCombat(currentState, false);
                return;
            }

            currentState.combatStats.value.myTotalPower = currentDecision.criticalPower;
            currentState.combatDecision.value = {
                ...currentDecision,
                stage: 'awaiting-defender-evasion-after-critical',
                promptOwner: 'defender',
                criticalUsed: true
            };
            return;
        }

        if (decisionType === 'evasion') {
            if (useSkill) {
                currentState.combatDecision.value = {
                    ...currentDecision,
                    evaded: true,
                    finalAttackerWins: false
                };
                resolveCombat(currentState, false);
                return;
            }

            currentState.combatDecision.value = {
                ...currentDecision,
                finalAttackerWins: true
            };
            resolveCombat(currentState, true);
        }
    };

    const beginCombatResolution = (currentState) => {
        const decisionContext = getInitialCombatDecisionContext(
            currentState.combatStats.value.myCardPower,
            currentState.combatStats.value.mySupportPower,
            currentState.combatStats.value.oppTotalPower
        );
        currentState.combatDecision.value = decisionContext;

        if (decisionContext.stage === 'auto-miss') {
            resolveCombat(currentState, false);
        }
    };

    const respondCombatDecision = (currentState, decisionType, useSkill) => {
        emitSyncCombatDecision(socket, { decisionType, useSkill });
        applyCombatDecision(currentState, { decisionType, useSkill });
    };

    const initiateAttack = (currentState, attackerCard, defenderCard) => {
        if (attackerCard.isTapped && !currentState.isDevMode.value) {
            console.warn('[规则拦截] 底层已拒绝：已横置的卡牌无法再次攻击！');
            return;
        }
        attackerCard.isTapped = true;
        currentState.attacker.value = attackerCard;
        currentState.defender.value = defenderCard;
        currentState.combatStats.value = {
            myCardPower: attackerCard.attack || 0,
            mySupportPower: 0,
            myTotalPower: attackerCard.attack || 0,
            oppTotalPower: defenderCard.attack || 0
        };
        currentState.combatDecision.value = createInitialCombatDecision();
        currentState.isCombatActive.value = true;

        setTimeout(() => {
            let mySupport = null;
            if (currentState.deck.value.length > 0) {
                mySupport = currentState.deck.value.pop();
                currentState.mySupportCard.value = mySupport;
                const sp = mySupport.support || 0;
                currentState.combatStats.value.mySupportPower = sp;
                currentState.combatStats.value.myTotalPower += sp;
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

    return {
        initiateAttack,
        untapCard,
        resolveCombat,
        beginCombatResolution,
        respondCombatDecision,
        applyCombatDecision
    };
}
