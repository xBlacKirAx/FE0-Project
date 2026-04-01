function toInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function hasTrait(card, traitName) {
    return Array.isArray(card?.traits) && card.traits.includes(traitName);
}

function isFlying(card) {
    return hasTrait(card, '飞行');
}

function buildCommonRank(card) {
    return toInt(card?.attack, 0) * 1.05 + toInt(card?.support, 0) * 0.65 - toInt(card?.cost, 0) * 3;
}

function decide(use, reasonUse = '收益成立', reasonSkip = '收益不足') {
    return {
        use: !!use,
        reason: use ? reasonUse : reasonSkip
    };
}

function shouldUseSupportEffectByStyle(ctx, style = 'midrange') {
    if (!ctx?.canUse) return decide(false, '', '条件不成立');

    const role = ctx.role || 'attacker';
    const powerDelta = toInt(ctx.powerDelta, 0);
    const ownerHandCount = toInt(ctx.ownerHandCount, 0);
    const opponentHandCount = toInt(ctx.opponentHandCount, 0);
    const defenderJewels = toInt(ctx.defenderJewels, 0);

    if (ctx.lockAttackerCritical || ctx.lockDefenderEvasion) return decide(true, '关键控制效果', '');

    if (toInt(ctx.jewelBreakCount, 1) > 1) {
        if (role === 'attacker' && ctx.defenderIsMainCharacter && toInt(ctx.defenderJewels, 0) <= 3) {
            return decide(true, '关键斩杀收益', '');
        }
        return decide(!!ctx.attackerWouldWinNow, '收益可兑现', '当前难以兑现收益');
    }

    if (powerDelta > 0) {
        if (role === 'attacker') {
            if (ctx.attackerWouldWinIfUse && !ctx.attackerWouldWinNow) return decide(true, '可由劣转优', '');
            if (ctx.defenderIsMainCharacter && toInt(ctx.defenderJewels, 0) <= 2 && ctx.attackerWouldWinIfUse) return decide(true, '可形成主人公压制', '');
            if (style === 'aggro' && ctx.attackerWouldWinIfUse && ownerHandCount >= 2) return decide(true, '快攻节奏推进', '');
            if (style === 'midrange' && ctx.attackerWouldWinIfUse && ownerHandCount >= 3) return decide(true, '中速节奏推进', '');
            return decide(false, '', '收益不足');
        }

        if (!ctx.defenderSurvivesNow && ctx.defenderSurvivesIfUse) return decide(true, '可避免被击破', '');
        if (ctx.defenderIsMainCharacter && toInt(ctx.defenderJewels, 0) <= 2 && ctx.defenderSurvivesIfUse) return decide(true, '保护主人公收益高', '');
        return decide(false, '', '防守收益不足');
    }

    switch (ctx.sideEffectType) {
    case 'seal-opponent-support':
        return decide(true, '封锁对手支援能力', '');
    case 'move-ally':
        if (!ctx.sideEffectTarget) return decide(false, '', '条件不成立');
        if (style === 'aggro') return decide(true, '快攻站位优化', '');
        return decide(!!ctx.attackerWouldWinNow || ownerHandCount >= 4, '中速站位优化', '资源保留');
    case 'untap-ally':
        if (!ctx.sideEffectTarget) return decide(false, '', '条件不成立');
        return decide(style === 'aggro' ? ownerHandCount >= 2 : ownerHandCount >= 3, '预留后续行动', '资源保留');
    case 'move-enemy':
        if (!ctx.sideEffectTarget) return decide(false, '', '条件不成立');
        if (style === 'aggro') return decide(true, '制造突破路线', '');
        return decide(!!ctx.defenderIsMainCharacter || !ctx.attackerWouldWinNow, '重塑目标站位', '收益不足');
    case 'draw-if-hand-4-or-less':
        return decide(ownerHandCount <= 4, '补充手牌资源', '资源保留');
    case 'draw-discard':
        return decide(style === 'aggro' ? ownerHandCount <= 5 : ownerHandCount <= 4, '手牌质量优化', '资源保留');
    case 'draw-topdeck':
        if (style === 'aggro') return decide(ownerHandCount <= 6, '优化下回合抽牌', '资源保留');
        return decide(ownerHandCount <= 5, '优化下回合抽牌', '资源保留');
    case 'hand-to-bond':
        if (style === 'aggro') return decide(ownerHandCount >= 2, '加速费用成长', '资源保留');
        return decide(ownerHandCount >= 3, '加速费用成长', '资源保留');
    case 'opponent-discard':
        return decide(style === 'aggro' ? opponentHandCount >= 5 : opponentHandCount >= 6, '压制对手手牌', '收益不足');
    case 'opponent-mill-top-deck':
        return decide(style === 'aggro' ? true : opponentHandCount >= 3, '干扰对手资源', '收益不足');
    case 'peek-own-jewel':
    case 'peek-and-optional-mill-self-top':
        return decide(style === 'midrange', '信息收益有效', '收益不足');
    case 'resurrect-zombie':
        return decide(true, '扩大场面单位数', '');
    case 'self-discard':
        return decide(ownerHandCount >= (style === 'aggro' ? 2 : 3), '触发战后收益', '资源保留');
    case 'post-battle-move-attacker':
    case 'post-battle-phantom-move':
        return decide(true, '战后站位优化', '');
    case 'battle-end-stay':
        return decide(true, '维持场面优势', '');
    case 'break-to-hand':
        if (ctx.defenderIsMainCharacter) return decide(false, '', '条件不成立');
        if (style === 'aggro') return decide(true, '节奏换资源', '');
        return decide(ownerHandCount <= 4, '资源转换收益', '收益不足');
    case 'draw-on-break-main-character':
        return decide(!!ctx.defenderIsMainCharacter && defenderJewels <= 2, '斩杀后补牌', '收益不足');
    default:
        return decide(false, '', '条件不成立');
    }
}

function isMainChara(card, player) {
    return (card?.charaName || '') === player.protagonistCharaName;
}

function isRanged(card) {
    const range = String(card?.range || '1');
    return range.includes('2') || range.includes('3');
}

function predictAttackSuccess(ctx) {
    const currentAttackerPower = toInt(ctx.attackerBasePower) + toInt(ctx.attackerSupportPower);
    const defenderPower = toInt(ctx.defenderPower);
    if (currentAttackerPower >= defenderPower) return true;
    if (ctx.hasSameNameInHand && (currentAttackerPower * 2) >= defenderPower) return true;
    return false;
}

module.exports = {
    toInt,
    isFlying,
    buildCommonRank,
    decide,
    shouldUseSupportEffectByStyle,
    isMainChara,
    isRanged,
    predictAttackSuccess
};
