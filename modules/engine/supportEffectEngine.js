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
    lockDefenderEvasion: false,
    jewelBreakCount: null,
    sideEffect: null,
    effectName: null,
    timingMismatch: false,
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

function isForceMatched(requiredForce, actualForce) {
    const required = String(requiredForce || '').trim();
    const actual = String(actualForce || '').trim();
    if (!required) return false;
    if (!actual) return false;
    return actual.includes(required);
}

function isAnyForceMatched(requiredForces, actualForce) {
    if (!Array.isArray(requiredForces) || requiredForces.length === 0) return false;
    return requiredForces.some(force => isForceMatched(force, actualForce));
}

function hasForce(force) {
    return String(force || '').trim().length > 0;
}

function isSiblingPairMatched(supportCharaName, battleCharaName) {
    const supportName = String(supportCharaName || '').trim();
    const battleName = String(battleCharaName || '').trim();
    if (!supportName || !battleName) return false;

    const siblingPairs = {
        '艾瑞珂': '伊弗列姆',
        '伊弗列姆': '艾瑞珂'
    };

    return siblingPairs[supportName] === battleName;
}

function getBattleUnitByRole(role, state) {
    if (role === 'defender') {
        return state?.defender?.value || null;
    }
    return state?.attacker?.value || null;
}

const SUPPORT_EFFECT_HANDLERS = {
    EMBLEM_ATTACK: () => ({ applied: true, powerDelta: 20 }),
    EMBLEM_SIBLING: ({ supportCard, state, role, meta }) => {
        const battleUnitName = getCardCharaName(getBattleUnitByRole(role, state));
        const requiredNames = Array.isArray(meta?.params?.requiredBattleCharaNames)
            ? meta.params.requiredBattleCharaNames.map(name => String(name || '').trim()).filter(Boolean)
            : null;
        const requiredName = String(meta?.params?.requiredBattleCharaName || '').trim();

        const matched = requiredNames?.length
            ? requiredNames.includes(battleUnitName)
            : (requiredName
                ? requiredName === battleUnitName
                : isSiblingPairMatched(getCardCharaName(supportCard), battleUnitName));

        if (!matched) {
            return { applied: false, note: '兄妹之纹章条件未满足：战斗单位角色名不匹配' };
        }

        return { applied: true, powerDelta: 20 };
    },
    EMBLEM_COOP: ({ state, role, meta }) => {
        const battleForce = getBattleUnitByRole(role, state)?.force || null;
        const requireHasForce = !!meta?.params?.requireHasForce;
        if (requireHasForce && !hasForce(battleForce)) {
            return { applied: false, note: '共斗之纹章条件未满足：战斗单位不具备势力' };
        }
        return { applied: true, powerDelta: 10 };
    },
    EMBLEM_DEFENSE: () => ({ applied: true, powerDelta: 20 }),
    EMBLEM_PRAYER: () => ({ applied: true, lockAttackerCritical: true }),
    EMBLEM_CERTAINTY: ({ state }) => {
        if (state?.defender?.value?.isMainCharacter) {
            return { applied: false, note: '必中之纹章对主人公无效' };
        }
        return { applied: true, lockDefenderEvasion: true };
    },
    EMBLEM_COMMAND: () => ({ applied: true, sideEffect: 'moveAllyExceptAttacker' }),
    EMBLEM_COURAGE: ({ supportCard, state, role }) => {
        const battleUnitForce = getBattleUnitByRole(role, state)?.force || null;
        const requiredForce = supportCard?.force || null;
        if (!isForceMatched(requiredForce, battleUnitForce)) {
            return { applied: false, note: '勇气之纹章条件未满足' };
        }
        return { applied: true, sideEffect: 'draw1Topdeck1' };
    },
    EMBLEM_DANCE: ({ supportCard, state }) => {
        const attackerForce = state?.attacker?.value?.force || null;
        const requiredForce = supportCard?.force || null;
        if (!isForceMatched(requiredForce, attackerForce)) {
            return { applied: false, note: '歌舞之纹章条件未满足' };
        }
        return { applied: true, sideEffect: 'untapAllyCost2OrLess' };
    },
    EMBLEM_ENCOURAGE: () => ({ applied: true, sideEffect: 'drawOnBreakMainCharacter' }),
    EMBLEM_FATE: ({ supportCard, state, meta }) => {
        const attackerForce = state?.attacker?.value?.force || null;
        const requiredForces = meta?.params?.requiredAttackerForces || null;
        const requiredForce = meta?.params?.requiredAttackerForce || supportCard?.force || null;
        const matched = requiredForces ? isAnyForceMatched(requiredForces, attackerForce) : isForceMatched(requiredForce, attackerForce);
        if (!matched) {
            return { applied: false, note: '命运之纹章条件未满足' };
        }
        return { applied: true, sideEffect: 'draw1Topdeck1' };
    },
    EMBLEM_HOLY_BLOOD: ({ state }) => {
        const myBonds = Number(state?.bonds?.value?.length || 0);
        const oppBonds = Number(state?.oppBonds?.value?.length || 0);
        if (myBonds > oppBonds) {
            return { applied: false, note: '圣血之纹章条件未满足：羁绊数领先' };
        }
        return { applied: true, sideEffect: 'putHandCardToBondIfBehindOnBonds' };
    },
    EMBLEM_HERO: ({ supportCard, state, meta }) => {
        const attackerForce = state?.attacker?.value?.force || null;
        const requiredForce = meta?.params?.requiredAttackerForce || supportCard?.force || null;
        if (!isForceMatched(requiredForce, attackerForce)) {
            return { applied: false, note: '英雄之纹章条件未满足' };
        }
        return { applied: true, jewelBreakCount: 2 };
    },
    EMBLEM_MAGIC: () => ({ applied: true, sideEffect: 'draw1Discard1' }),
    EMBLEM_LIGHT: ({ state, meta }) => {
        const attackerForce = state?.attacker?.value?.force || null;
        const requiredForces = meta?.params?.requiredAttackerForces || null;
        const requiredForce = meta?.params?.requiredAttackerForce || null;
        if (requiredForces && !isAnyForceMatched(requiredForces, attackerForce)) {
            return { applied: false, note: '光明之纹章条件未满足' };
        }
        if (!requiredForces && requiredForce && !isForceMatched(requiredForce, attackerForce)) {
            return { applied: false, note: '光明之纹章条件未满足' };
        }
        if (!requiredForces && !requiredForce && !hasForce(attackerForce)) {
            return { applied: false, note: '光明之纹章条件未满足：攻击单位不具备势力' };
        }
        return { applied: true, sideEffect: 'peekOwnJewel' };
    },
    EMBLEM_STRONG: () => ({ applied: true, powerDelta: 30 }),
    EMBLEM_PROPHECY: () => ({ applied: true, sideEffect: 'peekOwnTopDeckOptionalMill' }),
    EMBLEM_HOPE: ({ state, meta }) => {
        const defenderForce = state?.defender?.value?.force || null;
        const requiredForces = meta?.params?.requiredAttackerForces || null;
        const requiredForce = meta?.params?.requiredAttackerForce || null;
        if (requiredForces && !isAnyForceMatched(requiredForces, defenderForce)) {
            return { applied: false, note: '希望之纹章条件未满足' };
        }
        if (!requiredForces && requiredForce && !isForceMatched(requiredForce, defenderForce)) {
            return { applied: false, note: '希望之纹章条件未满足' };
        }
        return { applied: true, sideEffect: 'peekOwnJewel' };
    },
    EMBLEM_PROCUREMENT: ({ state }) => {
        const handCount = Number(state?.hand?.value?.length || 0);
        if (handCount > 4) {
            return { applied: false, note: '筹措之纹章条件未满足：手牌数大于4' };
        }
        return { applied: true, sideEffect: 'drawIfHand4OrLess' };
    },
    EMBLEM_SEAL_CURSE: () => ({ applied: true, sideEffect: 'sealOpponentSupportEffect' }),
    EMBLEM_SKY: () => ({ applied: true, sideEffect: 'moveAllyExceptAttacker' }),
    EMBLEM_MANAKETE: ({ supportCard, state, meta }) => {
        const attackerForce = state?.attacker?.value?.force || null;
        const requiredForce = meta?.params?.requiredAttackerForce || supportCard?.force || null;
        if (!isForceMatched(requiredForce, attackerForce)) {
            return { applied: false, note: '龙人之纹章条件未满足：攻击单位非对应势力' };
        }
        return { applied: true, sideEffect: 'putHandCardToBond' };
    },
    EMBLEM_DRAGON_BLOOD: ({ state }) => {
        const myBonds = Number(state?.bonds?.value?.length || 0);
        const oppBonds = Number(state?.oppBonds?.value?.length || 0);
        if (myBonds > oppBonds) {
            return { applied: false, note: '龙血之纹章条件未满足：羁绊数领先' };
        }
        return { applied: true, sideEffect: 'putHandCardToBondIfBehindOnBonds' };
    },
    EMBLEM_DRAGON_SCALE: ({ state }) => {
        const myBonds = Number(state?.bonds?.value?.length || 0);
        const oppBonds = Number(state?.oppBonds?.value?.length || 0);
        if (myBonds > oppBonds) {
            return { applied: false, note: '龙鳞之纹章条件未满足：羁绊数领先' };
        }
        return { applied: true, sideEffect: 'putHandCardToBondIfBehindOnBonds' };
    },
    EMBLEM_THIEF: () => ({ applied: true, sideEffect: 'opponentTopDeckToGraveOptional' }),
    EMBLEM_DARK: ({ state }) => {
        const oppHandCount = Number(state?.oppStats?.value?.hand || 0);
        if (oppHandCount < 5) {
            return { applied: false, note: '黑暗之纹章条件未满足：对手手牌不足5张' };
        }
        return { applied: true, sideEffect: 'opponentDiscard1IfHand5Plus' };
    },
    EMBLEM_LINK: ({ supportCard, state, role, meta }) => {
        const battleForce = getBattleUnitByRole(role, state)?.force || null;
        const requiredForces = meta?.params?.requiredAttackerForces || null;
        const requiredForce = meta?.params?.requiredAttackerForce || supportCard?.force || null;
        const requireNoForce = !!meta?.params?.requireNoForce;

        if (requireNoForce && hasForce(battleForce)) {
            return { applied: false, note: '连携之纹章条件未满足：战斗单位具备势力' };
        }
        if (!requireNoForce) {
            const matched = requiredForces ? isAnyForceMatched(requiredForces, battleForce) : isForceMatched(requiredForce, battleForce);
            if (!matched) {
                return { applied: false, note: '连携之纹章条件未满足' };
            }
        }
        return { applied: true, powerDelta: 10 };
    },
    EMBLEM_STRATEGY: ({ supportCard, state, meta }) => {
        const attackerForce = state?.attacker?.value?.force || null;
        const requiredForce = meta?.params?.requiredAttackerForce || supportCard?.force || null;
        if (!isForceMatched(requiredForce, attackerForce)) {
            return { applied: false, note: '计略之纹章条件未满足：攻击单位非对应势力' };
        }
        return { applied: true, sideEffect: 'moveEnemyExceptDefender' };
    },
    EMBLEM_DESPAIR: () => {
        return { applied: true, sideEffect: 'resurrectZombieFromGraveyard' };
    },
    EMBLEM_NINJUTSU: () => {
        return { applied: true, sideEffect: 'ninjutsuOptional' };
    },
    EMBLEM_PHANTOM: ({ supportCard }) => {
        const cardCharaName = getCardCharaName(supportCard);
        return { applied: true, sideEffect: 'phantomBattleEndReplace', sideEffectData: { charaName: cardCharaName } };
    },
    EMBLEM_RESISTANCE: () => {
        return { applied: true, sideEffect: 'resistanceBattleEndStay' };
    },
    EMBLEM_SUPPORT: () => {
        return { applied: true, sideEffect: 'supportMoveAttackerPostBattle' };
    },
    EMBLEM_TRAINING: () => {
        return { applied: true, sideEffect: 'trainingDefenderBreakToHand' };
    }
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
            effectName: meta.effectName,
            timing: meta.timing,
            timingMismatch: true,
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
