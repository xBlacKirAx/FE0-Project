// modules/socket/registerBattleListeners.js

import { resolveSupportEffectResult, isSupportFailed } from '../engine/supportEffectEngine.js';
import { emitPlayerDraw } from '../effects/cardSocketEffects.js';

function applyCombatSupportEffectResult(state, result, role) {
    if (!result) return;
    if (result.powerDelta) {
        if (role === 'attacker') {
            state.combatStats.value.myTotalPower += result.powerDelta;
        } else {
            state.combatStats.value.oppTotalPower += result.powerDelta;
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

function applyLocalSupportSideEffect(state, socket, result) {
    if (!result || !result.sideEffect) return;
    if (result.sideEffect === 'draw1Discard1') {
        if (state.deck.value.length > 0) {
            const drawnCard = state.deck.value.pop();
            state.hand.value.push(drawnCard);
            emitPlayerDraw(socket, { card: drawnCard });
        }
        state.supportInteraction.value = {
            type: 'magic-discard',
            source: 'support-effect'
        };
        state.combatStats.value.supportNotice = '魔术之纹章：请从手牌选择1张卡弃置。';
        return;
    }

    if (result.sideEffect === 'draw1Topdeck1') {
        if (state.deck.value.length > 0) {
            const drawnCard = state.deck.value.pop();
            state.hand.value.push(drawnCard);
            emitPlayerDraw(socket, { card: drawnCard });
        }
        state.supportInteraction.value = {
            type: 'courage-topdeck',
            source: 'support-effect'
        };
        state.combatStats.value.supportNotice = '勇气之纹章：请从手牌选择1张卡放回牌组顶。';
        return;
    }

    if (result.sideEffect === 'moveAllyExceptAttacker') {
        state.supportInteraction.value = {
            type: 'sky-move',
            source: 'support-effect',
            excludedId: state.attacker.value?.instanceId || null
        };
        state.combatStats.value.supportNotice = result.effectId === 'EMBLEM_COMMAND'
            ? '指挥之纹章：请选择1名攻击单位以外的我方单位进行移动。'
            : '天空之纹章：请选择1名攻击单位以外的我方单位进行移动。';
    }
}

export function registerBattleListeners({
    state,
    socket,
    EVT,
    beginCombatResolution,
    applyCombatDecision,
    handleIncomingSupportInteractionRequest,
    handleIncomingSupportInteractionResolve
}) {
    socket.on(EVT.OPPONENT_ATTACK, ({ attacker, defender, supportCard, supportFailed }) => {
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
        state.combatStats.value = {
            myCardPower: attacker.attack || 0,
            mySupportPower: supportFailed ? 0 : (supportCard?.support || 0),
            myTotalPower: (attacker.attack || 0) + (supportFailed ? 0 : (supportCard?.support || 0)),
            oppTotalPower: defender.attack || 0,
            attackerCriticalLocked: false,
            defenderEvasionLocked: false,
            jewelBreakCount: 1,
            attackerSupportApplied: supportFailed ? 0 : (supportCard?.support || 0),
            defenderSupportApplied: 0,
            supportNotice: supportFailed ? '支援失效：支援单位与被支援单位角色名相同。' : null
        };
        state.combatDecision.value = {
            stage: 'idle',
            promptOwner: null,
            criticalPower: 0,
            criticalUsed: false,
            evaded: false,
            finalAttackerWins: null
        };

        if (!supportFailed && supportCard) {
            const attackerSupportEffect = resolveSupportEffectResult({
                supportCard,
                role: 'attacker',
                state
            });
            applyCombatSupportEffectResult(state, attackerSupportEffect, 'attacker');
        }

        state.isCombatActive.value = true;

        setTimeout(() => {
            let defenseSupport = null;
            let defenseSupportFailed = false;
            if (state.deck.value.length > 0) {
                defenseSupport = state.deck.value.pop();
                state.oppSupportCard.value = defenseSupport;
                defenseSupportFailed = isSupportFailed(defenseSupport, state.defender.value);
                const appliedSupport = defenseSupportFailed ? 0 : (defenseSupport.support || 0);
                state.combatStats.value.defenderSupportApplied = appliedSupport;
                state.combatStats.value.oppTotalPower += appliedSupport;

                if (defenseSupportFailed) {
                    state.combatStats.value.supportNotice = '支援失效：支援单位与被支援单位角色名相同。';
                }

                if (!defenseSupportFailed) {
                    const supportEffectResult = resolveSupportEffectResult({
                        supportCard: defenseSupport,
                        role: 'defender',
                        state
                    });
                    applyCombatSupportEffectResult(state, supportEffectResult, 'defender');
                    applyLocalSupportSideEffect(state, socket, supportEffectResult);
                }
            }
            socket.emit(EVT.SYNC_DEFENSE_SUPPORT, { supportCard: defenseSupport });
            setTimeout(() => {
                if (beginCombatResolution) beginCombatResolution(state);
            }, 1000);
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
        const appliedSupport = supportFailed ? 0 : (supportCard?.support || 0);
        state.combatStats.value.defenderSupportApplied = appliedSupport;
        state.combatStats.value.oppTotalPower += appliedSupport;
        if (supportFailed) {
            state.combatStats.value.supportNotice = '支援失效：支援单位与被支援单位角色名相同。';
        }
        if (!supportFailed) {
            const supportEffectResult = resolveSupportEffectResult({
                supportCard,
                role: 'defender',
                state
            });
            applyCombatSupportEffectResult(state, supportEffectResult, 'defender');
        }
        setTimeout(() => {
            if (beginCombatResolution) beginCombatResolution(state);
        }, 1000);
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
