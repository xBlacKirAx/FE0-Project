// 教学关单人房：无真实对手客户端时，本地模拟防御方支援翻出，并进入与联机一致的纹章发动阶段。

import { isAttackerFromMyField } from '../engine/combatEngine.js';

export function isTutorialSoloRoom(state) {
    return state.roomMode?.value === 'tutorial' && (state.roomPlayerCount?.value || 0) < 2;
}

/**
 * 与联机防守方客户端一致：800ms 后翻对手牌组顶支援，仅加支援力 + 攻击/防御纹章即时战力，其余进入双方纹章询问阶段。
 */
export function scheduleTutorialSoloDefenseSupport(state, deps) {
    if (!isTutorialSoloRoom(state)) return;
    const {
        tryEnterSupportEmblemPhase,
        submitSupportEmblemChoice,
        isSupportFailed,
        resolveSupportEffectResult,
        applyCombatSupportEffectResult,
        applyAutoSupportEmblemAtSupportFlip,
        serializeSupportEffectResult
    } = deps;

    setTimeout(() => {
        state.combatStats.value.defenderSupportRevealDone = true;
        let defenseSupport = null;
        if (state.oppDeck.value.length > 0) {
            defenseSupport = state.oppDeck.value.pop();
            state.oppSupportCard.value = defenseSupport;
            const defenseSupportFailed = isSupportFailed(defenseSupport, state.defender.value);
            const appliedSupport = defenseSupportFailed ? 0 : (defenseSupport.support || 0);
            state.combatStats.value.defenderSupportApplied = appliedSupport;
            state.combatStats.value.oppTotalPower += appliedSupport;
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
                applyAutoSupportEmblemAtSupportFlip(
                    state,
                    supportEffectResult,
                    'defender',
                    applyCombatSupportEffectResult
                );
                state.combatStats.value.pendingDefenderSupportEffect = serializeSupportEffectResult(
                    supportEffectResult
                );
            }
        } else {
            state.combatStats.value.pendingDefenderSupportEffect = null;
        }
        if (tryEnterSupportEmblemPhase) tryEnterSupportEmblemPhase(state);
        scheduleTutorialSoloAiSupportEmblemAnswers(state, submitSupportEmblemChoice);
    }, 800);
}

function scheduleTutorialSoloAiSupportEmblemAnswers(state, submitSupportEmblemChoice) {
    if (typeof submitSupportEmblemChoice !== 'function') return;
    setTimeout(() => {
        if (state.combatDecision.value?.stage !== 'awaiting-support-emblems') return;
        const ans = state.combatStats.value.supportEmblemAnswers;
        if (!ans) return;
        const playerIsAttacker = isAttackerFromMyField(
            state.attacker.value?.instanceId,
            state.fieldFront.value,
            state.fieldRear.value
        );
        if (playerIsAttacker && ans.defender === null) {
            submitSupportEmblemChoice(state, 'defender', 'yes');
        }
        if (!playerIsAttacker && ans.attacker === null) {
            submitSupportEmblemChoice(state, 'attacker', 'yes');
        }
    }, 120);
}
