// modules/cardOps/combatCommands.js

import { isAttackerFromMyField, getCombatWinner } from '../engine/combatEngine.js';
import { createInitialCombatDecision, getInitialCombatDecisionContext } from '../engine/combatDecisionEngine.js';
import { resolveSupportEffectResult, isSupportFailed } from '../engine/supportEffectEngine.js';
import { emitSyncAttack, emitSyncCardMove, emitPlayerDraw, emitSyncCardUntap } from '../effects/cardSocketEffects.js';
import { computePassivePowerBonus, buildPassiveContext, getAutoTriggers } from '../engine/abilityEngine.js';
import {
    emitSyncCombatDecision,
    emitSyncSupportInteractionRequest,
    emitSyncSupportInteractionResolve
} from '../effects/combatSocketEffects.js';

export function createCombatCommands({ state, socket }) {
    const makeSupportRequestId = (tag = 'support') => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
        if (result.lockDefenderEvasion) {
            currentState.combatStats.value.defenderEvasionLocked = true;
            currentState.combatStats.value.supportNotice = '必中之纹章生效：该防御单位本次战斗不能进行神速回避。';
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
        if (result.sideEffect === 'drawOnBreakMainCharacter') {
            currentState.combatStats.value.encourageDrawOnBreakMainCharacter = true;
            currentState.combatStats.value.supportNotice = '激励之纹章：若本次击破对方主人公，战斗结束时抽1张卡。';
            return;
        }

        if (result.sideEffect === 'sealOpponentSupportEffect') {
            currentState.combatStats.value.opponentSupportEffectSealed = true;
            currentState.combatStats.value.supportNotice = '封咒之纹章：对手本次战斗支援能力无效。';
            return;
        }

        if (result.sideEffect === 'drawIfHand4OrLess') {
            if (currentState.hand.value.length > 4) return;
            if (currentState.deck.value.length > 0) {
                const drawnCard = currentState.deck.value.pop();
                currentState.hand.value.push(drawnCard);
                emitPlayerDraw(socket, { card: drawnCard });
                currentState.combatStats.value.supportNotice = '筹措之纹章：已抽1张卡。';
            }
            return;
        }

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
            return;
        }

        if (result.sideEffect === 'draw1Topdeck1') {
            if (currentState.deck.value.length > 0) {
                const drawnCard = currentState.deck.value.pop();
                currentState.hand.value.push(drawnCard);
                emitPlayerDraw(socket, { card: drawnCard });
            }
            currentState.supportInteraction.value = {
                type: 'courage-topdeck',
                source: 'support-effect'
            };
            currentState.combatStats.value.supportNotice = '勇气之纹章：请从手牌选择1张卡放回牌组顶。';
            return;
        }

        if (result.sideEffect === 'putHandCardToBond') {
            currentState.supportInteraction.value = {
                type: 'manakete-hand-to-bond',
                source: 'support-effect'
            };
            currentState.combatStats.value.supportNotice = '龙人之纹章：请选择1张手牌置入羁绊区。';
            return;
        }

        if (result.sideEffect === 'putHandCardToBondIfBehindOnBonds') {
            currentState.supportInteraction.value = {
                type: 'manakete-hand-to-bond',
                source: 'support-effect'
            };
            currentState.combatStats.value.supportNotice = '龙血系纹章：请选择1张手牌置入羁绊区。';
            return;
        }

        if (result.sideEffect === 'peekOwnJewel') {
            if (!currentState.jewels.value.length) return;
            currentState.supportInteraction.value = {
                type: 'peek-own-jewel',
                source: 'support-effect'
            };
            currentState.combatStats.value.supportNotice = '请选择1张自己的宝玉查看正面。';
            return;
        }

        if (result.sideEffect === 'moveAllyExceptAttacker') {
            const effectId = result.effectId || null;
            currentState.supportInteraction.value = {
                type: 'sky-move',
                source: 'support-effect',
                excludedId: currentState.attacker.value?.instanceId || null
            };
            currentState.combatStats.value.supportNotice = effectId === 'EMBLEM_COMMAND'
                ? '指挥之纹章：请选择1名攻击单位以外的我方单位进行移动。'
                : '天空之纹章：请选择1名攻击单位以外的我方单位进行移动。';
            return;
        }

        if (result.sideEffect === 'untapAllyCost2OrLess') {
            currentState.supportInteraction.value = {
                type: 'dance-untap-ally',
                source: 'support-effect',
                excludedId: currentState.attacker.value?.instanceId || null
            };
            currentState.combatStats.value.supportNotice = '歌舞之纹章：请选择1名出击费用2以下的我方单位转为未行动状态。';
            return;
        }

        if (result.sideEffect === 'peekOwnTopDeckOptionalMill') {
            const topCard = currentState.deck.value[currentState.deck.value.length - 1] || null;
            if (!topCard) return;
            const topLabel = topCard.cardName || topCard.name || '未知卡牌';
            const shouldMill = confirm(`预言之纹章：牌组顶为 ${topLabel}，是否将其置入退避区？`);
            if (!shouldMill) {
                currentState.combatStats.value.supportNotice = '预言之纹章：已查看牌组顶。';
                return;
            }
            const milledCard = currentState.deck.value.pop();
            currentState.graveyard.value.push(milledCard);
            emitSyncCardMove(socket, { card: milledCard, from: 'deck', to: 'graveyard' });
            currentState.combatStats.value.supportNotice = '预言之纹章：已将牌组顶置入退避区。';
            return;
        }

        if (result.sideEffect === 'opponentTopDeckToGraveOptional') {
            const shouldApply = confirm('盗贼之纹章：是否将对手牌组顶置入其退避区？');
            if (!shouldApply) return;

            const requestId = makeSupportRequestId('thief');
            const requestPayload = {
                requestId,
                type: 'thief-mill-top-deck'
            };
            emitSyncSupportInteractionRequest(socket, requestPayload);
            currentState.supportInteraction.value = {
                type: 'thief-await-opponent',
                source: 'support-effect',
                requestId,
                requestPayload
            };
            currentState.combatStats.value.supportNotice = '盗贼之纹章：等待对手公开并处理牌组顶。';
            return;
        }

        if (result.sideEffect === 'opponentDiscard1IfHand5Plus') {
            const requestId = makeSupportRequestId('dark');
            const requestPayload = {
                requestId,
                type: 'dark-discard'
            };
            emitSyncSupportInteractionRequest(socket, requestPayload);
            currentState.supportInteraction.value = {
                type: 'dark-await-opponent',
                source: 'support-effect',
                requestId,
                requestPayload
            };
            currentState.combatStats.value.supportNotice = '黑暗之纹章：等待对手选择并弃置1张手牌。';
            return;
        }

        if (result.sideEffect === 'moveEnemyExceptDefender') {
            const requestId = makeSupportRequestId('strategy');
            currentState.supportInteraction.value = {
                type: 'strategy-select-enemy',
                source: 'support-effect',
                requestId,
                excludedId: currentState.defender.value?.instanceId || null
            };
            currentState.combatStats.value.supportNotice = '计略之纹章：请选择1名防御单位以外的敌方单位进行移动。';
            return;
        }

        if (result.sideEffect === 'ninjutsuOptional') {
            const shouldApply = confirm('忍术之纹章：是否从手牌选择1张卡放置到退避区？（战斗结束后将以已行动状态出击）');
            if (!shouldApply) return;
            currentState.supportInteraction.value = {
                type: 'ninjutsu-hand-to-grave',
                source: 'support-effect'
            };
            currentState.combatStats.value.supportNotice = '忍术之纹章：请选择1张手牌放置到退避区。';
            return;
        }

        if (result.sideEffect === 'resistanceBattleEndStay') {
            currentState.combatStats.value.postBattleEffects = currentState.combatStats.value.postBattleEffects || [];
            currentState.combatStats.value.postBattleEffects.push({
                type: 'resistance-defender-stay',
                data: {}
            });
            currentState.combatStats.value.supportNotice = '抵抗之纹章：防御单位击破时可以出击而非进入退避区。';
            return;
        }

        if (result.sideEffect === 'trainingDefenderBreakToHand') {
            currentState.combatStats.value.postBattleEffects = currentState.combatStats.value.postBattleEffects || [];
            currentState.combatStats.value.postBattleEffects.push({
                type: 'training-defender-to-hand',
                data: {}
            });
            currentState.combatStats.value.supportNotice = '锻炼之纹章：防御单位击破时可以进入手牌而非退避区。';
            return;
        }

        if (result.sideEffect === 'supportMoveAttackerPostBattle') {
            currentState.combatStats.value.postBattleEffects = currentState.combatStats.value.postBattleEffects || [];
            currentState.combatStats.value.postBattleEffects.push({
                type: 'support-move-attacker',
                data: {}
            });
            currentState.combatStats.value.supportNotice = '援护之纹章：战斗结束后可以移动攻击单位。';
            return;
        }

        if (result.sideEffect === 'phantomBattleEndReplace') {
            currentState.combatStats.value.postBattleEffects = currentState.combatStats.value.postBattleEffects || [];
            currentState.combatStats.value.postBattleEffects.push({
                type: 'phantom-replace-to-area',
                data: { charaName: result.sideEffectData?.charaName || null }
            });
            const charaName = result.sideEffectData?.charaName || '指定角色';
            currentState.combatStats.value.supportNotice = `幻影之纹章：战斗结束后可以出击到${charaName}所在区域。`;
            return;
        }

        if (result.sideEffect === 'resurrectZombieFromGraveyard') {
            currentState.combatStats.value.postBattleEffects = currentState.combatStats.value.postBattleEffects || [];
            currentState.combatStats.value.postBattleEffects.push({
                type: 'despair-resurrect-zombie',
                data: {}
            });
            currentState.combatStats.value.supportNotice = '绝望之纹章：战斗结束后可从退避区选择1张«尸兵»出击。';
            return;
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

        if (interaction.type === 'manakete-hand-to-bond') {
            const idx = currentState.hand.value.findIndex(c => c.instanceId === targetCardId);
            if (idx === -1) return false;

            const bondCard = currentState.hand.value.splice(idx, 1)[0];
            currentState.bonds.value.push(bondCard);
            emitSyncCardMove(socket, { card: bondCard, from: 'hand', to: 'bonds' });
            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = null;
            return true;
        }

        if (interaction.type === 'peek-own-jewel') {
            const jewel = currentState.jewels.value.find(c => c.instanceId === targetCardId);
            if (!jewel) return false;
            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = `已查看宝玉：${jewel.cardName || jewel.name || '未知卡牌'}`;
            return true;
        }

        if (interaction.type === 'main-character-jewel-select') {
            const idx = currentState.jewels.value.findIndex(c => c.instanceId === targetCardId);
            if (idx === -1) return false;

            const pickedJewel = currentState.jewels.value.splice(idx, 1)[0];
            pickedJewel.isFaceDown = false;
            currentState.hand.value.push(pickedJewel);
            emitSyncCardMove(socket, { card: pickedJewel, from: 'jewels', to: 'hand' });

            const remaining = Math.max(0, (interaction.remainingCount || 1) - 1);
            if (remaining > 0 && currentState.jewels.value.length > 0) {
                interaction.remainingCount = remaining;
                currentState.combatStats.value.supportNotice = `主人公被击破：请继续选择宝玉加入手牌（剩余${remaining}张）`;
                return true;
            }

            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = '主人公被击破：已将选择的宝玉加入手牌。';
            if (currentState.combatDecision.value?.stage === 'resolved') {
                setTimeout(() => {
                    resetCombatState(currentState);
                }, 300);
            }
            return true;
        }

        if (interaction.type === 'courage-topdeck') {
            const idx = currentState.hand.value.findIndex(c => c.instanceId === targetCardId);
            if (idx === -1) return false;

            const topdeckCard = currentState.hand.value.splice(idx, 1)[0];
            currentState.deck.value.push(topdeckCard);
            emitSyncCardMove(socket, { card: topdeckCard, from: 'hand', to: 'deck' });
            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = null;
            return true;
        }

        if (interaction.type === 'dark-self-discard') {
            const idx = currentState.hand.value.findIndex(c => c.instanceId === targetCardId);
            if (idx === -1) return false;

            const discardCard = currentState.hand.value.splice(idx, 1)[0];
            currentState.graveyard.value.push(discardCard);
            emitSyncCardMove(socket, { card: discardCard, from: 'hand', to: 'graveyard' });
            emitSyncSupportInteractionResolve(socket, {
                requestId: interaction.requestId,
                type: 'dark-discard',
                success: true,
                cardId: discardCard.instanceId
            });
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

        if (interaction.type === 'dance-untap-ally') {
            const excludedId = interaction.excludedId;
            if (excludedId && String(targetCardId) === String(excludedId)) return false;
            const targetCard = [...currentState.fieldFront.value, ...currentState.fieldRear.value].find(c => c.instanceId === targetCardId);
            if (!targetCard) return false;
            if ((parseInt(targetCard.cost, 10) || 0) > 2) return false;

            targetCard.isTapped = false;
            emitSyncCardUntap(socket, { instanceId: targetCard.instanceId });
            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = null;
            return true;
        }

        if (interaction.type === 'strategy-select-enemy') {
            const fromFront = currentState.opponentFront.value.some(c => c.instanceId === targetCardId);
            const fromRear = currentState.opponentRear.value.some(c => c.instanceId === targetCardId);
            const excludedId = interaction.excludedId;
            if (excludedId && String(targetCardId) === String(excludedId)) return false;
            if (!fromFront && !fromRear) return false;

            const toArea = fromFront ? 'rear' : 'front';
            const requestPayload = {
                requestId: interaction.requestId,
                type: 'strategy-move-enemy',
                targetCardId,
                toArea
            };
            emitSyncSupportInteractionRequest(socket, requestPayload);
            currentState.supportInteraction.value = {
                type: 'strategy-await-opponent',
                source: 'support-effect',
                requestId: interaction.requestId,
                requestPayload
            };
            currentState.combatStats.value.supportNotice = '计略之纹章：等待对手执行单位移动。';
            return true;
        }

        if (interaction.type === 'ninjutsu-hand-to-grave') {
            const idx = currentState.hand.value.findIndex(c => c.instanceId === targetCardId);
            if (idx === -1) return false;
            const ninjutsuCard = currentState.hand.value.splice(idx, 1)[0];
            ninjutsuCard._ninjutsuRejoin = true; // 标记此卡在战斗结束后需要以已行动状态出击
            currentState.graveyard.value.push(ninjutsuCard);
            emitSyncCardMove(socket, { card: ninjutsuCard, from: 'hand', to: 'graveyard' });
            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = '忍术之纹章：已放置到退避区，战斗结束后以已行动状态出击。';
            return true;
        }

        if (interaction.type === 'despair-select-zombie') {
            const candidates = interaction.candidates || [];
            const selectedCard = candidates.find(c => c.instanceId === targetCardId);
            if (!selectedCard) return false;
            
            const idx = currentState.graveyard.value.findIndex(c => c.instanceId === selectedCard.instanceId);
            if (idx !== -1) {
                const resurrectedCard = currentState.graveyard.value.splice(idx, 1)[0];
                currentState.fieldFront.value.push(resurrectedCard);
                emitSyncCardMove(socket, { card: resurrectedCard, from: 'graveyard', to: 'front' });
            }
            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = '绝望之纹章：已出击«尸兵»。';
            return true;
        }

        if (interaction.type === 'support-move-attacker-post-battle') {
            const attackerId = interaction.attackerId || currentState.attacker.value?.instanceId || null;
            if (!attackerId || String(targetCardId) !== String(attackerId)) return false;

            const fromFront = currentState.fieldFront.value.findIndex(c => c.instanceId === attackerId);
            const fromRear = currentState.fieldRear.value.findIndex(c => c.instanceId === attackerId);

            if (fromFront > -1) {
                const moved = currentState.fieldFront.value.splice(fromFront, 1)[0];
                currentState.fieldRear.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'front', to: 'rear' });
                currentState.supportInteraction.value = null;
                currentState.combatStats.value.supportNotice = '援护之纹章：已移动攻击单位。';
                return true;
            }
            if (fromRear > -1) {
                const moved = currentState.fieldRear.value.splice(fromRear, 1)[0];
                currentState.fieldFront.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'rear', to: 'front' });
                currentState.supportInteraction.value = null;
                currentState.combatStats.value.supportNotice = '援护之纹章：已移动攻击单位。';
                return true;
            }
            return false;
        }

        if (interaction.type === 'phantom-post-battle') {
            const attackerId = interaction.attackerId || currentState.attacker.value?.instanceId || null;
            const targetArea = interaction.targetArea === 'rear' ? 'rear' : 'front';
            const targetCharaName = interaction.targetCharaName || '目标角色';
            if (!attackerId) return false;

            const fromFront = currentState.fieldFront.value.findIndex(c => c.instanceId === attackerId);
            const fromRear = currentState.fieldRear.value.findIndex(c => c.instanceId === attackerId);

            if (targetArea === 'front' && fromRear > -1) {
                const moved = currentState.fieldRear.value.splice(fromRear, 1)[0];
                currentState.fieldFront.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'rear', to: 'front' });
            } else if (targetArea === 'rear' && fromFront > -1) {
                const moved = currentState.fieldFront.value.splice(fromFront, 1)[0];
                currentState.fieldRear.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'front', to: 'rear' });
            }

            currentState.supportInteraction.value = null;
            currentState.combatStats.value.supportNotice = `幻影之纹章：已移动到${targetCharaName}所在区域。`;
            return true;
        }

        return false;
    };

    const handleIncomingSupportInteractionRequest = (currentState, payload = {}) => {
        const requestId = payload.requestId || null;
        const type = payload.type;

        if (type === 'thief-mill-top-deck') {
            let movedCard = null;
            if (currentState.deck.value.length > 0) {
                movedCard = currentState.deck.value.pop();
                currentState.graveyard.value.push(movedCard);
                emitSyncCardMove(socket, { card: movedCard, from: 'deck', to: 'graveyard' });
            }
            emitSyncSupportInteractionResolve(socket, {
                requestId,
                type,
                success: !!movedCard,
                cardId: movedCard?.instanceId || null
            });
            return;
        }

        if (type === 'dark-discard') {
            if (!currentState.hand.value.length) {
                emitSyncSupportInteractionResolve(socket, {
                    requestId,
                    type,
                    success: false,
                    reason: 'no-hand-card'
                });
                return;
            }

            currentState.supportInteraction.value = {
                type: 'dark-self-discard',
                source: 'opponent-request',
                requestId
            };
            currentState.combatStats.value.supportNotice = '黑暗之纹章：请选择1张手牌弃置。';
            return;
        }

        if (type === 'strategy-move-enemy') {
            const targetCardId = payload.targetCardId;
            const requestedToArea = payload.toArea === 'rear' ? 'rear' : 'front';
            const defenderId = currentState.defender.value?.instanceId || null;

            if (defenderId && String(targetCardId) === String(defenderId)) {
                emitSyncSupportInteractionResolve(socket, {
                    requestId,
                    type,
                    success: false,
                    reason: 'target-is-defender'
                });
                return;
            }

            const frontIdx = currentState.fieldFront.value.findIndex(c => c.instanceId === targetCardId);
            const rearIdx = currentState.fieldRear.value.findIndex(c => c.instanceId === targetCardId);

            if (frontIdx === -1 && rearIdx === -1) {
                emitSyncSupportInteractionResolve(socket, {
                    requestId,
                    type,
                    success: false,
                    reason: 'target-not-found'
                });
                return;
            }

            if (frontIdx > -1 && requestedToArea === 'rear') {
                const moved = currentState.fieldFront.value.splice(frontIdx, 1)[0];
                currentState.fieldRear.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'front', to: 'rear' });
                emitSyncSupportInteractionResolve(socket, {
                    requestId,
                    type,
                    success: true,
                    cardId: moved.instanceId,
                    toArea: 'rear'
                });
                return;
            }

            if (rearIdx > -1 && requestedToArea === 'front') {
                const moved = currentState.fieldRear.value.splice(rearIdx, 1)[0];
                currentState.fieldFront.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'rear', to: 'front' });
                emitSyncSupportInteractionResolve(socket, {
                    requestId,
                    type,
                    success: true,
                    cardId: moved.instanceId,
                    toArea: 'front'
                });
                return;
            }

            emitSyncSupportInteractionResolve(socket, {
                requestId,
                type,
                success: false,
                reason: 'invalid-target-area'
            });
        }
    };

    const handleIncomingSupportInteractionResolve = (currentState, payload = {}) => {
        const requestId = payload.requestId || null;
        const interaction = currentState.supportInteraction.value;
        if (!interaction || !interaction.requestId || interaction.requestId !== requestId) return;

        if (payload.success) {
            if (payload.type === 'thief-mill-top-deck') {
                currentState.combatStats.value.supportNotice = '盗贼之纹章：对手已处理牌组顶。';
            } else if (payload.type === 'dark-discard') {
                currentState.combatStats.value.supportNotice = '黑暗之纹章：对手已弃置1张手牌。';
            } else if (payload.type === 'strategy-move-enemy') {
                currentState.combatStats.value.supportNotice = '计略之纹章：敌方单位移动完成。';
            } else {
                currentState.combatStats.value.supportNotice = null;
            }
        } else {
            currentState.combatStats.value.supportNotice = '支援交互未生效。';
        }

        currentState.supportInteraction.value = null;
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

        const postBattleEffects = currentState.combatStats.value.postBattleEffects || [];
        let defenderHandledByPostEffect = false;

        if (attackerWins) {
            const targetId = currentState.defender.value.instanceId;
            const isTargetMC = currentState.defender.value.isMainCharacter;

            if (isTargetMC) {
                if (isMyAttacker) {
                    if (currentState.combatStats.value.encourageDrawOnBreakMainCharacter && currentState.deck.value.length > 0) {
                        const drawnCard = currentState.deck.value.pop();
                        currentState.hand.value.push(drawnCard);
                        emitPlayerDraw(socket, { card: drawnCard });
                    }
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
                    const jewelBreakCount = currentState.combatStats.value.jewelBreakCount || 1;
                    const selectableCount = Math.min(jewelBreakCount, currentState.jewels.value.length);
                    currentState.supportInteraction.value = {
                        type: 'main-character-jewel-select',
                        source: 'combat-main-character-break',
                        remainingCount: selectableCount
                    };
                    currentState.combatStats.value.supportNotice = `主人公被击破：请选择1张宝玉加入手牌（共${selectableCount}张）`;
                } else {
                    setTimeout(() => alert('💀 败北... 你的主人公在没有宝玉的情况下被击破。'), 600);
                }
            } else {
                // 检查是否有post-battle effect改变defender的处理
                const resistanceEffect = postBattleEffects.find(e => e.type === 'resistance-defender-stay');
                const trainingEffect = postBattleEffects.find(e => e.type === 'training-defender-to-hand');

                if (resistanceEffect) {
                    // 抵抗之纹章：防御单位不进graveyard，而是保持（或出击）
                    // 暂时保持在原位，标记为handled
                    defenderHandledByPostEffect = true;
                    const shouldStay = confirm('抵抗之纹章：是否让防御单位出击而非进入退避区？');
                    if (shouldStay) {
                        // 防御单位保持在场，不做任何处理
                    } else {
                        // 正常进入graveyard
                        ['fieldFront', 'fieldRear'].forEach(area => {
                            const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                            if (idx > -1) {
                                const broken = currentState[area].value.splice(idx, 1)[0];
                                currentState.graveyard.value.push(broken);
                                if (broken._stackedCards?.length > 0) {
                                    broken._stackedCards.forEach(sc => currentState.graveyard.value.push(sc));
                                    broken._stackedCards = [];
                                }
                            }
                        });
                        ['opponentFront', 'opponentRear'].forEach(area => {
                            const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                            if (idx > -1) {
                                const broken = currentState[area].value.splice(idx, 1)[0];
                                currentState.oppGraveyard.value.push(broken);
                                if (broken._stackedCards?.length > 0) {
                                    broken._stackedCards.forEach(sc => currentState.oppGraveyard.value.push(sc));
                                    broken._stackedCards = [];
                                }
                            }
                        });
                    }
                } else if (trainingEffect) {
                    // 锻炼之纹章：防御单位进入手牌而不是graveyard
                    const shouldTraining = confirm('锻炼之纹章：是否让防御单位进入手牌而非退避区？');
                    if (shouldTraining) {
                        let defeatedCard = null;
                        ['fieldFront', 'fieldRear'].forEach(area => {
                            const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                            if (idx > -1) defeatedCard = currentState[area].value.splice(idx, 1)[0];
                        });
                        ['opponentFront', 'opponentRear'].forEach(area => {
                            const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                            if (idx > -1) defeatedCard = currentState[area].value.splice(idx, 1)[0];
                        });
                        if (defeatedCard) {
                            // 叠放的下级卡进入退避区，顶部卡进入手牌
                            if (defeatedCard._stackedCards?.length > 0) {
                                defeatedCard._stackedCards.forEach(sc => currentState.graveyard.value.push(sc));
                                defeatedCard._stackedCards = [];
                            }
                            if (isMyAttacker) {
                                currentState.oppHand.value = currentState.oppHand.value || [];
                                currentState.oppHand.value.push(defeatedCard);
                            } else {
                                currentState.hand.value.push(defeatedCard);
                            }
                        }
                        defenderHandledByPostEffect = true;
                    }
                }

                // 如果没有被post-effect处理，正常放入graveyard
                if (!defenderHandledByPostEffect) {
                    ['fieldFront', 'fieldRear'].forEach(area => {
                        const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                        if (idx > -1) {
                            const broken = currentState[area].value.splice(idx, 1)[0];
                            currentState.graveyard.value.push(broken);
                            // 修复1：转职叠放的卡也随之进入退避区
                            if (broken._stackedCards?.length > 0) {
                                broken._stackedCards.forEach(sc => currentState.graveyard.value.push(sc));
                                broken._stackedCards = [];
                            }
                        }
                    });
                    ['opponentFront', 'opponentRear'].forEach(area => {
                        const idx = currentState[area].value.findIndex(c => c.instanceId === targetId);
                        if (idx > -1) {
                            const broken = currentState[area].value.splice(idx, 1)[0];
                            currentState.oppGraveyard.value.push(broken);
                            if (broken._stackedCards?.length > 0) {
                                broken._stackedCards.forEach(sc => currentState.oppGraveyard.value.push(sc));
                                broken._stackedCards = [];
                            }
                        }
                    });
                }
            }
        }

        if (isMyAttacker) {
            if (currentState.mySupportCard.value) currentState.graveyard.value.push(currentState.mySupportCard.value);
            if (currentState.oppSupportCard.value) currentState.oppGraveyard.value.push(currentState.oppSupportCard.value);
        } else {
            if (currentState.mySupportCard.value) currentState.oppGraveyard.value.push(currentState.mySupportCard.value);
            if (currentState.oppSupportCard.value) currentState.graveyard.value.push(currentState.oppSupportCard.value);
        }

        // 处理其他post-battle effects
        postBattleEffects.forEach(effect => {
            if (effect.type === 'support-move-attacker') {
                const shouldMove = confirm('援护之纹章：是否移动攻击单位？');
                if (shouldMove) {
                    currentState.supportInteraction.value = {
                        type: 'support-move-attacker-post-battle',
                        source: 'post-battle-effect',
                        attackerId: currentState.attacker.value?.instanceId || null
                    };
                    // 需要用户选择目标区域，稍后在panel中处理
                }
            }
            if (effect.type === 'despair-resurrect-zombie') {
                const zombieCards = currentState.graveyard.value.filter(c => 
                    (c.cardName || c.name || '').includes('尸兵')
                );
                if (zombieCards.length > 0) {
                    const shouldResurrect = confirm('绝望之纹章：是否从退避区选择1张«尸兵»出击？');
                    if (shouldResurrect) {
                        currentState.supportInteraction.value = {
                            type: 'despair-select-zombie',
                            source: 'post-battle-effect',
                            candidates: zombieCards
                        };
                    }
                }
            }
            if (effect.type === 'phantom-replace-to-area') {
                const charaName = effect.data?.charaName;
                const targetInFront = currentState.fieldFront.value.concat(currentState.opponentFront.value)
                    .find(c => (c.charaName || '').includes(charaName));
                const targetInRear = currentState.fieldRear.value.concat(currentState.opponentRear.value)
                    .find(c => (c.charaName || '').includes(charaName));
                const targetArea = targetInFront ? 'front' : (targetInRear ? 'rear' : null);
                if (targetArea) {
                    const shouldPhantom = confirm(`幻影之纹章：是否将攻击卡出击到${charaName}所在区域？`);
                    if (shouldPhantom) {
                        currentState.supportInteraction.value = {
                            type: 'phantom-post-battle',
                            source: 'post-battle-effect',
                            targetCharaName: charaName,
                            targetArea,
                            attackerId: currentState.attacker.value?.instanceId || null
                        };
                    }
                }
            }
        });

        currentState.combatDecision.value = {
            ...currentState.combatDecision.value,
            stage: 'resolved',
            finalAttackerWins: attackerWins
        };

        if (currentState.supportInteraction.value?.type === 'main-character-jewel-select') {
            return;
        }

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
            if (currentState.combatStats.value.defenderEvasionLocked) {
                currentState.combatDecision.value = {
                    ...currentDecision,
                    criticalUsed: true,
                    finalAttackerWins: true
                };
                resolveCombat(currentState, true);
                return;
            }

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
        const defenderEvasionLocked = !!currentState.combatStats.value.defenderEvasionLocked;
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

        if (defenderEvasionLocked && decisionContext.stage === 'awaiting-defender-evasion') {
            currentState.combatDecision.value = {
                ...decisionContext,
                stage: 'resolved',
                promptOwner: null,
                finalAttackerWins: true
            };
            resolveCombat(currentState, true);
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
        if (!currentState.isDevMode.value && currentState.firstPlayerOpeningTurnLocked?.value) {
            console.warn('[规则拦截] 先攻第一回合不能进行攻击。');
            return;
        }
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
            defenderEvasionLocked: false,
            encourageDrawOnBreakMainCharacter: false,
            opponentSupportEffectSealed: false,
            jewelBreakCount: 1,
            attackerSupportApplied: 0,
            defenderSupportApplied: 0,
            supportNotice: null
        };
        currentState.combatDecision.value = createInitialCombatDecision();
        currentState.isCombatActive.value = true;

        setTimeout(() => {
                // ── 【常】被动战斗力加成（攻击方）
                const attackerPassiveCtx = buildPassiveContext(currentState, attackerCard, attackerCard, defenderCard, null);
                const attackerPassive = computePassivePowerBonus(attackerCard, attackerPassiveCtx);
                if (attackerPassive.totalDelta) {
                    currentState.combatStats.value.myTotalPower += attackerPassive.totalDelta;
                    currentState.combatStats.value.passiveNotice = attackerPassive.breakdown
                        .filter(b => b.powerDelta)
                        .map(b => `${b.title}：+${b.powerDelta}`)
                        .join('；');
                }

                // ── 【常】被动战斗力加成（防御方）
                const defenderPassiveCtx = buildPassiveContext(currentState, defenderCard, attackerCard, defenderCard, null);
                const defenderPassive = computePassivePowerBonus(defenderCard, defenderPassiveCtx);
                if (defenderPassive.totalDelta) {
                    currentState.combatStats.value.oppTotalPower += defenderPassive.totalDelta;
                }

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
            emitSyncAttack(socket, {
                attacker: attackerCard,
                defender: defenderCard,
                supportCard: mySupport,
                supportFailed,
                supportSealCurse: !!currentState.combatStats.value.opponentSupportEffectSealed
            });
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
        handleIncomingSupportInteractionRequest,
        handleIncomingSupportInteractionResolve,
        respondCombatDecision,
        applyCombatDecision
    };
}
