// modules/cardOps/combatCommands.js

import { isAttackerFromMyField, getCombatWinner } from '../engine/combatEngine.js';
import { createInitialCombatDecision, getInitialCombatDecisionContext } from '../engine/combatDecisionEngine.js';
import { resolveSupportEffectResult, isSupportFailed } from '../engine/supportEffectEngine.js';
import { emitSyncAttack, emitSyncCardMove, emitPlayerDraw, emitSyncCardUntap } from '../effects/cardSocketEffects.js';
import { emitSyncCombatDecision } from '../effects/combatSocketEffects.js';

export function createCombatCommands({ state, socket }) {
    const getCardCharaName = (card) => {
        const direct = (card?.charaName || '').trim();
        if (direct) return direct;

        const fullName = (card?.cardName || card?.name || '').trim();
        if (!fullName) return '';
        const idx = fullName.search(/\s/);
        if (idx > -1) {
            const derived = fullName.slice(idx).trim();
            if (derived) return derived;
        }
        return fullName;
    };

    const getIsMyAttacker = (currentState) => isAttackerFromMyField(
        currentState.attacker.value?.instanceId,
        currentState.fieldFront.value,
        currentState.fieldRear.value
    );

    const canCurrentPlayerAct = (currentState) => {
        const owner = currentState.combatDecision.value?.promptOwner;
        if (!owner) return false;
        const isMyAttacker = getIsMyAttacker(currentState);
        return (owner === 'attacker' && isMyAttacker) || (owner === 'defender' && !isMyAttacker);
    };

    const getRequiredCharaNameByDecision = (currentState) => {
        const stage = currentState.combatDecision.value?.stage;
        if (stage === 'awaiting-attacker-critical') return getCardCharaName(currentState.attacker.value);
        if (stage === 'awaiting-defender-evasion' || stage === 'awaiting-defender-evasion-after-critical') return getCardCharaName(currentState.defender.value);
        return '';
    };

    const consumeDecisionCostCard = (currentState, costCardId) => {
        const requiredCharaName = getRequiredCharaNameByDecision(currentState);
        if (!requiredCharaName) return null;

        const idx = currentState.hand.value.findIndex((card) => {
            if (!costCardId || card.instanceId !== costCardId) return false;
            return getCardCharaName(card) === requiredCharaName;
        });

        if (idx === -1) return null;

        const paidCard = currentState.hand.value.splice(idx, 1)[0];
        currentState.graveyard.value.push(paidCard);
        emitSyncCardMove(socket, { card: paidCard, from: 'hand', to: 'graveyard' });
        return paidCard;
    };

    const applyCombatSupportEffectResult = (currentState, result, role) => {
        if (!result) return;
        if (result.powerDelta) {
            if (role === 'attacker') {
                currentState.combatStats.value.myTotalPower += result.powerDelta;
            } else {
                currentState.combatStats.value.oppTotalPower += result.powerDelta;
            }
        }
        if (result.lockAttackerCritical) {
            currentState.combatStats.value.attackerCriticalLocked = true;
            currentState.combatStats.value.supportNotice = '祈祷之纹章生效：攻击方本次战斗不能发动必杀。';
        }
        if (result.jewelBreakCount) {
            currentState.combatStats.value.jewelBreakCount = Math.max(
                currentState.combatStats.value.jewelBreakCount || 1,
                result.jewelBreakCount
            );
        }
    };

    const applyLocalSupportSideEffect = (currentState, result) => {
        if (!result || !result.sideEffect) return;
        if (result.sideEffect === 'draw1Discard1') {
            if (currentState.deck.value.length > 0) {
                const drawnCard = currentState.deck.value.pop();
                currentState.hand.value.push(drawnCard);
                emitPlayerDraw(socket, { card: drawnCard });
            }
            currentState.supportInteraction.value = {
                type: 'magic-discard',
                source: 'support-effect'
            };
            currentState.combatStats.value.supportNotice = '魔术之纹章：请从手牌选择1张卡弃置。';
        }

        if (result.sideEffect === 'moveAllyExceptAttacker') {
            currentState.supportInteraction.value = {
                type: 'sky-move',
                source: 'support-effect',
                excludedId: currentState.attacker.value?.instanceId || null
            };
            currentState.combatStats.value.supportNotice = '天空之纹章：请选择1名攻击单位以外的我方单位进行移动。';
        }
    };

    const resolveSupportInteraction = (currentState, targetCardId) => {
        const interaction = currentState.supportInteraction.value;
        if (!interaction) return false;

        if (interaction.type === 'magic-discard') {
            const idx = currentState.hand.value.findIndex(c => c.instanceId === targetCardId);
            if (idx === -1) return false;
            const discardCard = currentState.hand.value.splice(idx, 1)[0];
            currentState.graveyard.value.push(discardCard);
            emitSyncCardMove(socket, { card: discardCard, from: 'hand', to: 'graveyard' });
            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = null;
            return true;
        }

        if (interaction.type === 'sky-move') {
            const fromFront = currentState.fieldFront.value.findIndex(c => c.instanceId === targetCardId);
            const fromRear = currentState.fieldRear.value.findIndex(c => c.instanceId === targetCardId);
            const excludedId = interaction.excludedId;
            if (excludedId && String(targetCardId) === String(excludedId)) return false;

            if (fromFront > -1) {
                const moved = currentState.fieldFront.value.splice(fromFront, 1)[0];
                currentState.fieldRear.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'front', to: 'rear' });
                currentState.supportInteraction.value = null;
                currentState.combatStats.value.supportNotice = null;
                return true;
            }
            if (fromRear > -1) {
                const moved = currentState.fieldRear.value.splice(fromRear, 1)[0];
                currentState.fieldFront.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'rear', to: 'front' });
                currentState.supportInteraction.value = null;
                currentState.combatStats.value.supportNotice = null;
                return true;
            }
            return false;
        }

        return false;
    };

    const resetCombatState = (currentState) => {
        currentState.isCombatActive.value = false;
        currentState.attacker.value = null;
        currentState.defender.value = null;
        currentState.mySupportCard.value = null;
        currentState.oppSupportCard.value = null;
        currentState.supportInteraction.value = null;
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
                    const jewelBreakCount = currentState.combatStats.value.jewelBreakCount || 1;
                    if (currentState.oppJewels.value.length > 0) {
                        const breakCount = Math.min(jewelBreakCount, currentState.oppJewels.value.length);
                        for (let i = 0; i < breakCount; i++) {
                            currentState.oppJewels.value.pop();
                            currentState.oppStats.value.hand++;
                        }
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
        const criticalLocked = !!currentState.combatStats.value.attackerCriticalLocked;
        const decisionContext = getInitialCombatDecisionContext(
            currentState.combatStats.value.myCardPower,
            currentState.combatStats.value.mySupportPower,
            currentState.combatStats.value.oppTotalPower
        );

        if (criticalLocked && decisionContext.stage === 'awaiting-attacker-critical') {
            currentState.combatDecision.value = {
                ...decisionContext,
                stage: 'auto-miss',
                promptOwner: null,
                finalAttackerWins: false
            };
            resolveCombat(currentState, false);
            return;
        }

        currentState.combatDecision.value = decisionContext;

        if (decisionContext.stage === 'auto-miss') {
            resolveCombat(currentState, false);
        }
    };

    const respondCombatDecision = (currentState, decisionType, useSkill, costCardId = null) => {
        if (!canCurrentPlayerAct(currentState)) return false;

        const payload = { decisionType, useSkill: !!useSkill };
        if (payload.useSkill) {
            const paidCard = consumeDecisionCostCard(currentState, costCardId);
            if (!paidCard) {
                alert('发动失败：请从手牌中选择1张同角色名卡牌作为代价。');
                return false;
            }
            payload.costCard = paidCard;
            payload.costCardId = paidCard.instanceId;
            payload.costCharaName = getCardCharaName(paidCard);
        }

        emitSyncCombatDecision(socket, payload);
        applyCombatDecision(currentState, payload);
        return true;
    };

    const initiateAttack = (currentState, attackerCard, defenderCard) => {
        if (attackerCard.isTapped && !currentState.isDevMode.value) {
            console.warn('[规则拦截] 底层已拒绝：已横置的卡牌无法再次攻击！');
            return;
        }
        if (currentState.hasBattledThisTurn) {
            currentState.hasBattledThisTurn.value = true;
        }
        attackerCard.isTapped = true;
        currentState.attacker.value = attackerCard;
        currentState.defender.value = defenderCard;
        currentState.combatStats.value = {
            myCardPower: attackerCard.attack || 0,
            mySupportPower: 0,
            myTotalPower: attackerCard.attack || 0,
            oppTotalPower: defenderCard.attack || 0,
            attackerCriticalLocked: false,
            jewelBreakCount: 1,
            attackerSupportApplied: 0,
            defenderSupportApplied: 0,
            supportNotice: null
        };
        currentState.combatDecision.value = createInitialCombatDecision();
        currentState.isCombatActive.value = true;

        setTimeout(() => {
            let mySupport = null;
            let supportFailed = false;
            if (currentState.deck.value.length > 0) {
                mySupport = currentState.deck.value.pop();
                currentState.mySupportCard.value = mySupport;
                supportFailed = isSupportFailed(mySupport, attackerCard);
                const sp = supportFailed ? 0 : (mySupport.support || 0);
                currentState.combatStats.value.mySupportPower = sp;
                currentState.combatStats.value.attackerSupportApplied = sp;
                currentState.combatStats.value.myTotalPower += sp;

                if (supportFailed) {
                    currentState.combatStats.value.supportNotice = '支援失效：支援单位与被支援单位角色名相同。';
                }

                if (!supportFailed) {
                    const supportEffectResult = resolveSupportEffectResult({
                        supportCard: mySupport,
                        role: 'attacker',
                        state: currentState
                    });
                    applyCombatSupportEffectResult(currentState, supportEffectResult, 'attacker');
                    applyLocalSupportSideEffect(currentState, supportEffectResult);
                }
            }
            emitSyncAttack(socket, { attacker: attackerCard, defender: defenderCard, supportCard: mySupport, supportFailed });
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
        resolveSupportInteraction,
        respondCombatDecision,
        applyCombatDecision
    };
}
