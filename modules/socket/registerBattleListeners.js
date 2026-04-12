// modules/socket/registerBattleListeners.js

import { resolveSupportEffectResult, isSupportFailed } from '../engine/supportEffectEngine.js';
import {
    applyAutoSupportEmblemAtSupportFlip,
    resetSupportEmblemCombatFields,
    serializeSupportEffectResult
} from '../engine/supportEmblemPhase.js';
import { computePassivePowerBonus, buildPassiveContext } from '../engine/abilityEngine.js';

function pushCombatPowerBreakdown(cs, side, label, value) {
    const v = Number(value) || 0;
    if (!v) return;
    const key = side === 'opp' ? 'oppPowerBreakdown' : 'myPowerBreakdown';
    if (!cs[key]) cs[key] = [];
    cs[key].push({ label: String(label || '').trim().slice(0, 20) || '加成', value: v });
}

function applyCombatSupportEffectResult(state, result, role) {
    if (!result) return;
    if (result.timingMismatch) {
        const name = result.effectName || '支援纹章';
        const timingLabel = result.timing === '〖攻击型〗' ? '攻击型' : result.timing === '〖防御型〗' ? '防御型' : result.timing || '';
        const roleLabel = role === 'attacker' ? '进攻方' : '防御方';
        state.combatStats.value.supportNotice = `${name}（${timingLabel}）：时机不符，仅在${result.timing === '〖攻击型〗' ? '进攻方' : '防御方'}翻出时发动，本次由${roleLabel}翻出，效果无效。`;
        return;
    }
    if (result.powerDelta) {
        const cs = state.combatStats.value;
        const emblemLabel = result.effectName || '纹章';
        if (role === 'attacker') {
            cs.myTotalPower += result.powerDelta;
            pushCombatPowerBreakdown(cs, 'my', emblemLabel, result.powerDelta);
        } else {
            cs.oppTotalPower += result.powerDelta;
            pushCombatPowerBreakdown(cs, 'opp', emblemLabel, result.powerDelta);
        }
    }
    if (result.lockAttackerCritical) {
        state.combatStats.value.attackerCriticalLocked = true;
        state.combatStats.value.supportNotice = '祈祷之纹章生效：攻击方本次战斗不能发动必杀。';
    }
    if (result.lockDefenderEvasion) {
        state.combatStats.value.defenderEvasionLocked = true;
        state.combatStats.value.supportNotice = '必中之纹章生效：该防御单位本次战斗不能进行神速回避。';
    }
    if (result.jewelBreakCount) {
        state.combatStats.value.jewelBreakCount = Math.max(
            state.combatStats.value.jewelBreakCount || 1,
            result.jewelBreakCount
        );
    }
}

export function registerBattleListeners({
    state,
    socket,
    EVT,
    applyCombatDecision,
    handleIncomingSupportInteractionRequest,
    handleIncomingSupportInteractionResolve,
    tryEnterSupportEmblemPhase,
    mergeRemoteSupportEmblemChoice
}) {
    socket.on(EVT.OPPONENT_ATTACK, (data) => {
        const {
            attacker,
            defender,
            supportCard,
            supportFailed
        } = data || {};
        if (state.hasBattledThisTurn) {
            state.hasBattledThisTurn.value = true;
        }
        const oppAttacker = [...state.opponentFront.value, ...state.opponentRear.value]
            .find(c => c.instanceId === attacker.instanceId);
        if (oppAttacker) oppAttacker.isTapped = true;

        ['opponentFront', 'opponentRear'].forEach(areaName => {
            const area = state[areaName];
            const idx = area.value.findIndex(c => c.instanceId === attacker.instanceId);
            if (idx > -1) {
                area.value[idx].isTapped = true;
                area.value = [...area.value];
            }
        });

        state.attacker.value = attacker;
        state.mySupportCard.value = supportCard;
        state.defender.value = defender;
        const csInit = {
            myCardPower: attacker.attack || 0,
            mySupportPower: supportFailed ? 0 : (supportCard?.support || 0),
            myTotalPower: (attacker.attack || 0) + (supportFailed ? 0 : (supportCard?.support || 0)),
            oppTotalPower: defender.attack || 0,
            attackerCriticalLocked: false,
            defenderEvasionLocked: false,
            encourageDrawOnBreakMainCharacter: false,
            opponentSupportEffectSealed: false,
            jewelBreakCount: 1,
            attackerSupportApplied: supportFailed ? 0 : (supportCard?.support || 0),
            defenderSupportApplied: 0,
            postBattleEffects: [],
            supportNotice: supportFailed ? '支援失效：支援单位与被支援单位角色名相同。' : null,
            myPowerBreakdown: [
                { label: '战', value: Number(attacker.attack) || 0 },
                ...(!supportFailed && (supportCard?.support || 0)
                    ? [{ label: '支', value: Number(supportCard.support) || 0 }]
                    : [])
            ],
            oppPowerBreakdown: [{ label: '战', value: Number(defender.attack) || 0 }]
        };
        state.combatStats.value = csInit;
        resetSupportEmblemCombatFields(state.combatStats.value);
        if (state.combatAuxPrompt) state.combatAuxPrompt.value = null;

        const cs = state.combatStats.value;
        const attackerTemp = parseInt(attacker?._tempAbilityPowerThisTurn || 0, 10) || 0;
        const defenderTemp = parseInt(defender?._tempAbilityPowerThisTurn || 0, 10) || 0;
        if (attackerTemp) {
            cs.myTotalPower += attackerTemp;
            pushCombatPowerBreakdown(cs, 'my', '战前加算', attackerTemp);
        }
        if (defenderTemp) {
            cs.oppTotalPower += defenderTemp;
            pushCombatPowerBreakdown(cs, 'opp', '战前加算', defenderTemp);
        }
        if (attacker?._tempCannotBeEvadedThisTurn) {
            state.combatStats.value.defenderEvasionLocked = true;
        }
        if (attacker?._tempJewelBreak2ThisTurn) {
            state.combatStats.value.jewelBreakCount = Math.max(state.combatStats.value.jewelBreakCount || 1, 2);
        }

        const attackerPassiveCtx = buildPassiveContext(state, attacker, attacker, defender, supportCard || null);
        const attackerPassive = computePassivePowerBonus(attacker, attackerPassiveCtx);
        if (attackerPassive.totalDelta) {
            cs.myTotalPower += attackerPassive.totalDelta;
            attackerPassive.breakdown
                .filter((b) => b.powerDelta)
                .forEach((b) => pushCombatPowerBreakdown(cs, 'my', b.title, b.powerDelta));
        }

        const defenderPassiveCtx = buildPassiveContext(state, defender, attacker, defender, supportCard || null);
        const defenderPassive = computePassivePowerBonus(defender, defenderPassiveCtx);
        if (defenderPassive.totalDelta) {
            cs.oppTotalPower += defenderPassive.totalDelta;
            defenderPassive.breakdown
                .filter((b) => b.powerDelta)
                .forEach((b) => pushCombatPowerBreakdown(cs, 'opp', b.title, b.powerDelta));
        }
        state.combatDecision.value = {
            stage: 'idle',
            promptOwner: null,
            criticalPower: 0,
            criticalUsed: false,
            evaded: false,
            finalAttackerWins: null
        };

        state.combatStats.value.attackerSupportRevealDone = true;
        if (!supportFailed && supportCard) {
            const attackerSupportEffect = resolveSupportEffectResult({
                supportCard,
                role: 'attacker',
                state
            });
            applyAutoSupportEmblemAtSupportFlip(state, attackerSupportEffect, 'attacker', applyCombatSupportEffectResult);
            state.combatStats.value.pendingAttackerSupportEffect = serializeSupportEffectResult(attackerSupportEffect);
        }

        state.isCombatActive.value = true;

        setTimeout(() => {
            let defenseSupport = null;
            state.combatStats.value.defenderSupportRevealDone = true;
            if (state.deck.value.length > 0) {
                defenseSupport = state.deck.value.pop();
                state.oppSupportCard.value = defenseSupport;
                const defenseSupportFailed = isSupportFailed(defenseSupport, state.defender.value);
                const appliedSupport = defenseSupportFailed ? 0 : (defenseSupport.support || 0);
                state.combatStats.value.defenderSupportApplied = appliedSupport;
                state.combatStats.value.oppTotalPower += appliedSupport;
                if (appliedSupport) {
                    pushCombatPowerBreakdown(state.combatStats.value, 'opp', '支', appliedSupport);
                }

                if (defenseSupportFailed) {
                    state.combatStats.value.supportNotice = '支援失效：支援单位与被支援单位角色名相同。';
                    state.combatStats.value.pendingDefenderSupportEffect = null;
                } else if (state.combatStats.value.opponentSupportEffectSealed) {
                    state.combatStats.value.supportNotice = '封咒之纹章生效：本次防御方支援能力无效。';
                    state.combatStats.value.pendingDefenderSupportEffect = null;
                } else {
                    const supportEffectResult = resolveSupportEffectResult({
                        supportCard: defenseSupport,
                        role: 'defender',
                        state
                    });
                    applyAutoSupportEmblemAtSupportFlip(state, supportEffectResult, 'defender', applyCombatSupportEffectResult);
                    state.combatStats.value.pendingDefenderSupportEffect = serializeSupportEffectResult(supportEffectResult);
                }
            } else {
                state.combatStats.value.pendingDefenderSupportEffect = null;
            }
            socket.emit(EVT.SYNC_DEFENSE_SUPPORT, { supportCard: defenseSupport });
            if (tryEnterSupportEmblemPhase) tryEnterSupportEmblemPhase(state);
        }, 800);
    });

    socket.on(EVT.OPPONENT_CARD_UNTAP, ({ instanceId }) => {
        const oppCard = [...state.opponentFront.value, ...state.opponentRear.value]
            .find(c => c.instanceId === instanceId);
        if (oppCard) oppCard.isTapped = false;

        ['opponentFront', 'opponentRear'].forEach(areaName => {
            const area = state[areaName];
            const idx = area.value.findIndex(c => c.instanceId === instanceId);
            if (idx > -1) {
                area.value[idx].isTapped = false;
                area.value = [...area.value];
            }
        });
    });

    socket.on(EVT.OPPONENT_UNTAP_ALL, () => {
        ['opponentFront', 'opponentRear'].forEach(areaName => {
            const area = state[areaName];
            if (!area?.value?.length) return;
            area.value.forEach(card => {
                card.isTapped = false;
            });
            area.value = [...area.value];
        });
    });

    socket.on(EVT.OPPONENT_DEFENSE_SUPPORT, ({ supportCard }) => {
        const supportFailed = isSupportFailed(supportCard, state.defender.value);
        state.oppSupportCard.value = supportCard;
        state.combatStats.value.defenderSupportRevealDone = true;
        const appliedSupport = supportFailed ? 0 : (supportCard?.support || 0);
        state.combatStats.value.defenderSupportApplied = appliedSupport;
        state.combatStats.value.oppTotalPower += appliedSupport;
        if (supportFailed) {
            state.combatStats.value.supportNotice = '支援失效：支援单位与被支援单位角色名相同。';
            state.combatStats.value.pendingDefenderSupportEffect = null;
        } else if (state.combatStats.value.opponentSupportEffectSealed) {
            state.combatStats.value.supportNotice = '封咒之纹章生效：本次防御方支援能力无效。';
            state.combatStats.value.pendingDefenderSupportEffect = null;
        } else {
            const supportEffectResult = resolveSupportEffectResult({
                supportCard,
                role: 'defender',
                state
            });
            applyAutoSupportEmblemAtSupportFlip(state, supportEffectResult, 'defender', applyCombatSupportEffectResult);
            state.combatStats.value.pendingDefenderSupportEffect = serializeSupportEffectResult(supportEffectResult);
        }
        if (tryEnterSupportEmblemPhase) tryEnterSupportEmblemPhase(state);
    });

    socket.on(EVT.OPPONENT_COMBAT_SUPPORT_EMBLEM_CHOICE, (payload) => {
        if (mergeRemoteSupportEmblemChoice) mergeRemoteSupportEmblemChoice(state, payload);
    });

    socket.on(EVT.OPPONENT_COMBAT_DECISION, (payload) => {
        if (applyCombatDecision) applyCombatDecision(state, payload);
    });

    socket.on(EVT.OPPONENT_SUPPORT_INTERACTION_REQUEST, (payload) => {
        if (handleIncomingSupportInteractionRequest) {
            handleIncomingSupportInteractionRequest(state, payload);
        }
    });

    socket.on(EVT.OPPONENT_SUPPORT_INTERACTION_RESOLVE, (payload) => {
        if (handleIncomingSupportInteractionResolve) {
            handleIncomingSupportInteractionResolve(state, payload);
        }
    });
}
