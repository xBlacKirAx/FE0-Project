// 支援纹章：仅攻击/防御纹章在翻出时立即加战力；其余在双方支援均翻出后由玩家选择是否发动。

export function serializeSupportEffectResult(r) {
    if (!r) return null;
    return {
        effectId: r.effectId,
        effectName: r.effectName,
        timing: r.timing,
        applied: r.applied,
        timingMismatch: r.timingMismatch,
        note: r.note,
        powerDelta: r.powerDelta,
        lockAttackerCritical: r.lockAttackerCritical,
        lockDefenderEvasion: r.lockDefenderEvasion,
        jewelBreakCount: r.jewelBreakCount,
        sideEffect: r.sideEffect,
        sideEffectData: r.sideEffectData ? { ...r.sideEffectData } : null
    };
}

export function deserializeSupportEffectResult(o) {
    if (!o) return null;
    return { ...o };
}

/** 是否需要进入「是否发动纹章」询问（攻击/防御纹章除外，已在翻出时处理）。 */
export function requiresEmblemActivationChoice(r) {
    if (!r || r.timingMismatch || r.applied === false) return false;
    if (r.effectId === 'EMBLEM_ATTACK' || r.effectId === 'EMBLEM_DEFENSE') return false;
    return !!(
        r.powerDelta
        || r.lockAttackerCritical
        || r.lockDefenderEvasion
        || r.jewelBreakCount
        || r.sideEffect
    );
}

/** 翻出支援时：仅立即应用攻击/防御纹章战力；时机不符等仍走完整 apply 以显示提示。 */
export function applyAutoSupportEmblemAtSupportFlip(state, r, role, applyCombatSupportEffectResultFn) {
    if (!r) return;
    if (r.timingMismatch || r.applied === false) {
        applyCombatSupportEffectResultFn(state, r, role);
        return;
    }
    if (r.effectId === 'EMBLEM_ATTACK' || r.effectId === 'EMBLEM_DEFENSE') {
        applyCombatSupportEffectResultFn(state, r, role);
    }
}

export function resetSupportEmblemCombatFields(cs) {
    if (!cs) return;
    cs.supportEmblemAnswers = { attacker: null, defender: null };
    cs.supportEmblemFinalized = false;
    cs.pendingAttackerSupportEffect = null;
    cs.pendingDefenderSupportEffect = null;
    cs.attackerSupportRevealDone = false;
    cs.defenderSupportRevealDone = false;
}

export function initialSupportEmblemAnswers(pa, pd) {
    return {
        attacker: requiresEmblemActivationChoice(pa) ? null : 'n/a',
        defender: requiresEmblemActivationChoice(pd) ? null : 'n/a'
    };
}
