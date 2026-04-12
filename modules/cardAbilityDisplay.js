// 卡片详情/预览：单位能力与支援能力文案（去重纹章【支】、多段换行）。

export function formatAbilityEntryLine(entry) {
    const title = String(entry?.title || '').trim();
    const type = String(entry?.type || '').trim();
    const effect = String(entry?.effectText || entry?.rawText || '').trim();
    const head = `${title ? `『${title}』` : ''}${type}`.trim();
    return `${head}${head && effect ? ' ' : ''}${effect}`.trim();
}

function stripOverlapSupportFromUnitText(unitText, card) {
    const sup = String(card?.supportAbility?.text || '').trim();
    if (!sup) return String(unitText || '').trim();
    const u = String(unitText || '').trim();
    if (!u.includes(sup)) return u;
    return u.split(sup).join('').replace(/\s{2,}/g, ' ').trim();
}

export function getUnitAbilityDisplayText(card) {
    if (!card) return '';
    if (typeof card.ability === 'string') {
        return stripOverlapSupportFromUnitText(card.ability, card);
    }
    const entries = Array.isArray(card.ability?.entries) ? card.ability.entries : [];
    if (entries.length) {
        return entries
            .filter((e) => String(e?.type || '').trim() !== '【支】')
            .map(formatAbilityEntryLine)
            .filter(Boolean)
            .join('\n');
    }
    const direct = String(card.ability?.text || '').trim();
    if (!direct) return '';
    return stripOverlapSupportFromUnitText(direct, card);
}

export function getSupportAbilityDisplayText(card) {
    if (!card) return '';
    if (typeof card.supportAbility === 'string') return card.supportAbility;
    const direct = String(card.supportAbility?.text || '').trim();
    if (direct) return direct;

    const effectName = String(card.supportAbility?.effectName || '').trim();
    const effectText = String(card.supportAbility?.effectText || '').trim();
    const fromStructured = `${effectName ? `『${effectName}』` : ''}${effectText ? (effectName ? ' ' : '') + effectText : ''}`.trim();
    if (fromStructured) return fromStructured;

    const entries = Array.isArray(card.ability?.entries) ? card.ability.entries : [];
    return entries
        .filter((e) => String(e?.type || '').trim() === '【支】')
        .map(formatAbilityEntryLine)
        .filter(Boolean)
        .join('\n');
}
