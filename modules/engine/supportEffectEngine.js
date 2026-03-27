// modules/engine/supportEffectEngine.js

const EMBLEM_EFFECT_ID_MAP = Object.freeze({
    '兄妹之纹章': 'EMBLEM_SIBLING',
    '光明之纹章': 'EMBLEM_LIGHT',
    '共斗之纹章': 'EMBLEM_COOP',
    '勇气之纹章': 'EMBLEM_COURAGE',
    '命运之纹章': 'EMBLEM_FATE',
    '圣血之纹章': 'EMBLEM_HOLY_BLOOD',
    '天空之纹章': 'EMBLEM_SKY',
    '封咒之纹章': 'EMBLEM_SEAL_CURSE',
    '希望之纹章': 'EMBLEM_HOPE',
    '幻影之纹章': 'EMBLEM_PHANTOM',
    '强者之纹章': 'EMBLEM_STRONG',
    '必中之纹章': 'EMBLEM_CERTAINTY',
    '忍术之纹章': 'EMBLEM_NINJUTSU',
    '抵抗之纹章': 'EMBLEM_RESISTANCE',
    '指挥之纹章': 'EMBLEM_COMMAND',
    '援护之纹章': 'EMBLEM_SUPPORT',
    '攻击之纹章': 'EMBLEM_ATTACK',
    '歌舞之纹章': 'EMBLEM_DANCE',
    '激励之纹章': 'EMBLEM_ENCOURAGE',
    '盗贼之纹章': 'EMBLEM_THIEF',
    '祈祷之纹章': 'EMBLEM_PRAYER',
    '筹措之纹章': 'EMBLEM_PROCUREMENT',
    '绝望之纹章': 'EMBLEM_DESPAIR',
    '英雄之纹章': 'EMBLEM_HERO',
    '计略之纹章': 'EMBLEM_STRATEGY',
    '连携之纹章': 'EMBLEM_LINK',
    '锻炼之纹章': 'EMBLEM_TRAINING',
    '防御之纹章': 'EMBLEM_DEFENSE',
    '预言之纹章': 'EMBLEM_PROPHECY',
    '魔术之纹章': 'EMBLEM_MAGIC',
    '黑暗之纹章': 'EMBLEM_DARK',
    '龙人之纹章': 'EMBLEM_MANAKETE',
    '龙血之纹章': 'EMBLEM_DRAGON_BLOOD',
    '龙鳞之纹章': 'EMBLEM_DRAGON_SCALE'
});

const NO_EFFECT_RESULT = Object.freeze({
    applied: false,
    powerDelta: 0,
    lockAttackerCritical: false,
    jewelBreakCount: null,
    sideEffect: null,
    note: null
});

function normalizeEffectName(rawTitle) {
    if (!rawTitle) return '';
    return String(rawTitle).replace(/[『』]/g, '').trim();
}

export function getCardCharaName(card) {
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
}

export function isSupportFailed(supportCard, targetCard) {
    const supportChara = getCardCharaName(supportCard);
    const targetChara = getCardCharaName(targetCard);
    if (!supportChara || !targetChara) return false;
    return supportChara === targetChara;
}

export function getSupportEffectIdByTitle(rawTitle) {
    const name = normalizeEffectName(rawTitle);
    return EMBLEM_EFFECT_ID_MAP[name] || null;
}

export function resolveSupportEffectMeta(supportAbility) {
    const effectName = supportAbility?.effectName || normalizeEffectName(supportAbility?.keywords?.title?.[0] || '');
    const effectId = supportAbility?.effectId || getSupportEffectIdByTitle(effectName);
    const timing = supportAbility?.effectTiming || supportAbility?.keywords?.timing?.[0] || null;
    const params = supportAbility?.effectParams || {};

    return {
        effectName: effectName || null,
        effectId,
        timing,
        params
    };
}

function isTimingMatched(timing, role) {
    if (!timing) return true;
    if (timing === '〖攻防型〗') return true;
    if (timing === '〖连发技〗') return role === 'attacker';
    if (timing === '〖攻击型〗') return role === 'attacker';
    if (timing === '〖防御型〗') return role === 'defender';
    return true;
}

const SUPPORT_EFFECT_HANDLERS = {
    EMBLEM_ATTACK: () => ({ applied: true, powerDelta: 20 }),
    EMBLEM_DEFENSE: () => ({ applied: true, powerDelta: 20 }),
    EMBLEM_PRAYER: () => ({ applied: true, lockAttackerCritical: true }),
    EMBLEM_HERO: ({ supportCard, state }) => {
        const attackerForce = state?.attacker?.value?.force || null;
        const supportForce = supportCard?.force || null;
        if (!attackerForce || !supportForce || attackerForce !== supportForce) {
            return { applied: false, note: '英雄之纹章条件未满足' };
        }
        return { applied: true, jewelBreakCount: 2 };
    },
    EMBLEM_MAGIC: () => ({ applied: true, sideEffect: 'draw1Discard1' }),
    EMBLEM_SKY: () => ({ applied: true, sideEffect: 'moveAllyExceptAttacker' })
};

export function resolveSupportEffectResult({ supportCard, role, state }) {
    const supportAbility = supportCard?.supportAbility;
    if (!supportAbility) {
        return { ...NO_EFFECT_RESULT, effectId: null, timing: null };
    }

    const meta = resolveSupportEffectMeta(supportAbility);
    const handler = meta.effectId ? SUPPORT_EFFECT_HANDLERS[meta.effectId] : null;
    if (!isTimingMatched(meta.timing, role)) {
        return {
            ...NO_EFFECT_RESULT,
            effectId: meta.effectId,
            timing: meta.timing,
            note: '时机不匹配，支援效果未生效'
        };
    }
    if (!handler) {
        return {
            ...NO_EFFECT_RESULT,
            effectId: meta.effectId,
            timing: meta.timing,
            note: meta.effectId ? `未实现效果处理: ${meta.effectId}` : null
        };
    }

    const result = handler({ supportCard, role, state, meta }) || NO_EFFECT_RESULT;
    return {
        ...NO_EFFECT_RESULT,
        ...result,
        effectId: meta.effectId,
        timing: meta.timing
    };
}

export function getSupportEffectCatalogSize() {
    return Object.keys(EMBLEM_EFFECT_ID_MAP).length;
}
