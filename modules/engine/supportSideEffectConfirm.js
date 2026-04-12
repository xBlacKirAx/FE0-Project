// 支援纹章展示名称（发动与否由战斗 UI 阶段处理）。

const EFFECT_ID_FALLBACK_LABEL = Object.freeze({
    EMBLEM_SKY: '天空之纹章',
    EMBLEM_COMMAND: '指挥之纹章',
    EMBLEM_DANCE: '歌舞之纹章',
    EMBLEM_STRATEGY: '计略之纹章',
    EMBLEM_MAGIC: '魔术之纹章',
    EMBLEM_COURAGE: '勇气之纹章',
    EMBLEM_FATE: '命运之纹章',
    EMBLEM_MANAKETE: '龙人之纹章',
    EMBLEM_DRAGON_BLOOD: '龙血之纹章',
    EMBLEM_DRAGON_SCALE: '龙鳞之纹章',
    EMBLEM_HOLY_BLOOD: '圣血之纹章',
    EMBLEM_LIGHT: '光明之纹章',
    EMBLEM_HOPE: '希望之纹章',
    EMBLEM_PROCUREMENT: '筹措之纹章',
    EMBLEM_SEAL_CURSE: '封咒之纹章',
    EMBLEM_ENCOURAGE: '激励之纹章',
    EMBLEM_PROPHECY: '预言之纹章',
    EMBLEM_DARK: '黑暗之纹章',
    EMBLEM_RESISTANCE: '抵抗之纹章',
    EMBLEM_TRAINING: '锻炼之纹章',
    EMBLEM_SUPPORT: '援护之纹章',
    EMBLEM_PHANTOM: '幻影之纹章',
    EMBLEM_DESPAIR: '绝望之纹章',
    EMBLEM_PRAYER: '祈祷之纹章',
    EMBLEM_CERTAINTY: '必中之纹章',
    EMBLEM_HERO: '英雄之纹章'
});

export function getSupportEffectDisplayLabel(result) {
    if (!result) return '支援纹章';
    const name = result.effectName || EFFECT_ID_FALLBACK_LABEL[result.effectId];
    return name || '支援纹章';
}
