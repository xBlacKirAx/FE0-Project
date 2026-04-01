const {
    toInt,
    isFlying,
    buildCommonRank,
    shouldUseSupportEffectByStyle
} = require('./deckAiProfileUtils');

const copilotMidrangeProfile = {
    key: 'copilotMidrangeProfile',
    label: 'Copilot中速压制',
    chooseBondCard({ player }) {
        if (!player.hand.length) return null;
        const sorted = [...player.hand].sort((a, b) => {
            const aMain = (a.charaName || '') === player.protagonistCharaName ? 1 : 0;
            const bMain = (b.charaName || '') === player.protagonistCharaName ? 1 : 0;
            if (aMain !== bMain) return aMain - bMain;
            const aScore = toInt(a.cost, 0) * 7 - toInt(a.support, 0) * 3 - toInt(a.attack, 0) * 0.2;
            const bScore = toInt(b.cost, 0) * 7 - toInt(b.support, 0) * 3 - toInt(b.attack, 0) * 0.2;
            return bScore - aScore;
        });
        return sorted[0] || null;
    },
    rankDeployCandidate({ card, sameNameOnField }) {
        let score = buildCommonRank(card);
        if ((card.force || '') === '圣痕') score += 14;
        if ((card.charaName || '') === '库洛姆' || (card.charaName || '') === '露琪娜') score += 18;
        if (sameNameOnField) score += 22;
        if (toInt(card.cost, 0) <= 2) score += 7;
        if (toInt(card.attack, 0) >= 60) score += 8;
        return score;
    },
    chooseAttackers({ player }) {
        const all = [...player.front, ...player.rear].filter(card => !card.isTapped);
        return all.sort((a, b) => {
            const aMain = a.isMainCharacter ? 1 : 0;
            const bMain = b.isMainCharacter ? 1 : 0;
            if (aMain !== bMain) return aMain - bMain;
            return toInt(b.attack, 0) - toInt(a.attack, 0);
        });
    },
    chooseTarget({ opponent, legalTargets }) {
        const pool = Array.isArray(legalTargets) && legalTargets.length > 0
            ? legalTargets
            : (opponent.front.length > 0 ? opponent.front : opponent.rear);
        if (!pool.length) return null;
        return [...pool].sort((a, b) => {
            const aMain = a.isMainCharacter ? 1 : 0;
            const bMain = b.isMainCharacter ? 1 : 0;
            if (aMain !== bMain) return bMain - aMain;
            return toInt(a.attack, 0) - toInt(b.attack, 0);
        })[0];
    },
    shouldUseCritical(ctx) {
        if (ctx.attackerCriticalLocked) return false;
        if (!ctx.canPay) return false;
        if (ctx.canLethalNow) return true;
        if (ctx.criticalWouldWin && ctx.handCount >= 4) return true;
        if (ctx.criticalWouldWin && ctx.defenderIsMainCharacter && ctx.defenderJewels <= 2) return true;
        return false;
    },
    shouldUseEvasion(ctx) {
        if (ctx.defenderEvasionLocked) return false;
        if (!ctx.canPay) return false;
        if (ctx.defenderIsMainCharacter && ctx.defenderJewels <= 2) return true;
        if (ctx.wouldLoseWithoutEvasion && ctx.handCount >= 3) return true;
        return false;
    },
    shouldUseSupportEffect(ctx) {
        return shouldUseSupportEffectByStyle(ctx, 'midrange');
    }
};

const copilotAggroProfile = {
    key: 'copilotAggroProfile',
    label: 'Copilot光剑飞兵速攻',
    chooseBondCard({ player }) {
        if (!player.hand.length) return null;
        const sorted = [...player.hand].sort((a, b) => {
            const aMain = (a.charaName || '') === player.protagonistCharaName ? 1 : 0;
            const bMain = (b.charaName || '') === player.protagonistCharaName ? 1 : 0;
            if (aMain !== bMain) return aMain - bMain;
            const aScore = toInt(a.cost, 0) * 9 - toInt(a.attack, 0) * 0.25;
            const bScore = toInt(b.cost, 0) * 9 - toInt(b.attack, 0) * 0.25;
            return bScore - aScore;
        });
        return sorted[0] || null;
    },
    rankDeployCandidate({ card, sameNameOnField }) {
        let score = buildCommonRank(card);
        if ((card.force || '') === '光之剑') score += 18;
        if (isFlying(card)) score += 16;
        if ((card.charaName || '') === '马尔斯' || (card.charaName || '') === '希达') score += 14;
        if (sameNameOnField) score += 15;
        if (toInt(card.cost, 0) <= 2) score += 11;
        return score;
    },
    chooseAttackers({ player }) {
        const all = [...player.front, ...player.rear].filter(card => !card.isTapped);
        return all.sort((a, b) => {
            const aFly = isFlying(a) ? 1 : 0;
            const bFly = isFlying(b) ? 1 : 0;
            if (aFly !== bFly) return bFly - aFly;
            return toInt(b.attack, 0) - toInt(a.attack, 0);
        });
    },
    chooseTarget({ opponent, legalTargets }) {
        const pool = Array.isArray(legalTargets) && legalTargets.length > 0
            ? legalTargets
            : (opponent.front.length > 0 ? opponent.front : opponent.rear);
        if (!pool.length) return null;
        return [...pool].sort((a, b) => {
            const aMain = a.isMainCharacter ? 1 : 0;
            const bMain = b.isMainCharacter ? 1 : 0;
            if (aMain !== bMain) return bMain - aMain;
            const aFly = isFlying(a) ? 1 : 0;
            const bFly = isFlying(b) ? 1 : 0;
            if (aFly !== bFly) return bFly - aFly;
            return toInt(a.attack, 0) - toInt(b.attack, 0);
        })[0];
    },
    shouldUseCritical(ctx) {
        if (ctx.attackerCriticalLocked) return false;
        if (!ctx.canPay) return false;
        if (ctx.canLethalNow) return true;
        if (ctx.criticalWouldWin && ctx.defenderIsMainCharacter) return true;
        if (ctx.criticalWouldWin && ctx.handCount >= 2) return true;
        return false;
    },
    shouldUseEvasion(ctx) {
        if (ctx.defenderEvasionLocked) return false;
        if (!ctx.canPay) return false;
        if (ctx.defenderIsMainCharacter && ctx.defenderJewels <= 1) return true;
        return false;
    },
    shouldUseSupportEffect(ctx) {
        return shouldUseSupportEffectByStyle(ctx, 'aggro');
    }
};

module.exports = {
    copilotMidrangeProfile,
    copilotAggroProfile
};
