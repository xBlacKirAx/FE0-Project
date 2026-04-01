const {
    toInt,
    isFlying,
    decide,
    isMainChara,
    isRanged,
    predictAttackSuccess
} = require('./deckAiProfileUtils');

const geminiMidrangeProfile = {
    key: 'sacred-midrange',
    label: 'Gemini圣痕中速压制',

    chooseBondCard({ player }) {
        const handCount = player.hand.length;
        const bondCount = player.bonds.length;
        if (handCount <= 2 && bondCount >= 3) return null;

        const maxCostInHand = Math.max(...player.hand.map(c => toInt(c.cost, 0)), 0);
        if (bondCount >= 6 || (bondCount >= maxCostInHand && bondCount >= 4)) return null;

        return [...player.hand].sort((a, b) => {
            const aMain = isMainChara(a, player) ? 1 : 0;
            const bMain = isMainChara(b, player) ? 1 : 0;
            if (aMain !== bMain) return aMain - bMain;
            const aSup = toInt(a.support, 0);
            const bSup = toInt(b.support, 0);
            if (aSup !== bSup) return aSup - bSup;
            return toInt(b.cost, 0) - toInt(a.cost, 0);
        })[0];
    },

    rankDeployCandidate({ card, sameNameOnField, targetArea }) {
        if (!isRanged(card) && targetArea === 'rear') {
            return -5000;
        }

        let score = toInt(card.attack, 0) + toInt(card.support, 0);
        if (sameNameOnField && toInt(card.cost, 0) > toInt(sameNameOnField.cost, 0)) {
            return 10000 + toInt(card.cost, 0);
        }
        if (sameNameOnField) return -1000;
        score += (toInt(card.cost, 0) * 10);
        if (isRanged(card)) score += 50;
        return score;
    },

    chooseAttackers({ player, opponent }) {
        const attackers = [...player.front, ...player.rear].filter(card => !card.isTapped);
        const validAttackers = attackers.filter(c => {
            if (player.rear.includes(c) && !isRanged(c)) return false;
            return true;
        });

        if ((opponent.jewels || 0) === 0) {
            return validAttackers.sort((a, b) => toInt(b.attack, 0) - toInt(a.attack, 0));
        }
        return validAttackers.sort((a, b) => toInt(a.attack, 0) - toInt(b.attack, 0));
    },

    chooseTarget({ attacker, legalTargets }) {
        if (!legalTargets || legalTargets.length === 0) return null;
        const mcTarget = legalTargets.find(t => t.isMainCharacter);
        if (mcTarget && predictAttackSuccess({ attackerBasePower: attacker.attack, attackerSupportPower: 15, defenderPower: mcTarget.attack, hasSameNameInHand: true })) {
            return mcTarget;
        }
        return [...legalTargets].sort((a, b) => (b.attack || 0) - (a.attack || 0))[0];
    },

    shouldUseCritical(ctx) {
        if (ctx.attackerCriticalLocked || !ctx.canPay) return false;
        const currentPower = toInt(ctx.attackerBasePower) + toInt(ctx.attackerSupportPower);
        if (currentPower >= toInt(ctx.defenderPower) && ctx.defenderJewels > 1) return false;
        if (ctx.canLethalNow) return true;
        if (ctx.defenderIsMainCharacter) return true;
        return false;
    },

    shouldUseEvasion(ctx) {
        if (ctx.defenderEvasionLocked || !ctx.canPay) return false;
        if (ctx.defenderIsMainCharacter) return true;
        return false;
    },

    shouldUseSupportEffect(ctx) {
        if (!ctx.canUse) return decide(false, '', '条件不成立');

        const type = ctx.sideEffectType;
        if (type === 'dark-emblem' || type === 'discard-opponent') {
            return decide(true, '黑暗纹章强制发动', '');
        }

        if (type === 'hero-emblem' || type === 'double-break') {
            const isLikelyToHit = predictAttackSuccess(ctx);
            return decide(isLikelyToHit, '预测命中，发动英雄纹章', '命中可能低，节省纹章');
        }

        if (type === 'move-enemy') return decide(true, '站位压制', '');
        if (type === 'draw-discard') return decide(ctx.ownerHandCount <= 5, '优化手牌', '');
        return decide(false, '', '无明显收益');
    }
};

const geminiAggroProfile = {
    key: 'light-sword-aggro',
    label: 'Gemini光剑快攻',

    chooseBondCard({ player }) {
        const bondCount = player.bonds.length;
        if (player.hand.length <= 1 || bondCount >= 4) return null;
        return [...player.hand].sort((a, b) => toInt(b.cost, 0) - toInt(a.cost, 0))[0];
    },

    rankDeployCandidate({ card, sameNameOnField, targetArea }) {
        if (!isRanged(card) && targetArea === 'rear') return -9999;

        if (sameNameOnField && toInt(card.cost, 0) > toInt(sameNameOnField.cost, 0)) return 10000;
        if (sameNameOnField) return -1000;
        let score = 100 - (toInt(card.cost, 0) * 20);
        if (isFlying(card)) score += 50;
        return score;
    },

    chooseAttackers({ player }) {
        return [...player.front, ...player.rear].filter(card => {
            if (!card.isTapped) {
                if (player.rear.includes(card) && !isRanged(card)) return false;
                return true;
            }
            return false;
        }).sort((a, b) => toInt(b.attack, 0) - toInt(a.attack, 0));
    },

    chooseTarget({ legalTargets }) {
        if (!legalTargets || legalTargets.length === 0) return null;
        const mcTarget = legalTargets.find(t => t.isMainCharacter);
        return mcTarget || [...legalTargets].sort((a, b) => toInt(a.attack, 0) - toInt(b.attack, 0))[0];
    },

    shouldUseCritical(ctx) {
        if (ctx.attackerCriticalLocked || !ctx.canPay) return false;
        return ctx.defenderIsMainCharacter;
    },

    shouldUseEvasion(ctx) {
        if (ctx.defenderEvasionLocked || !ctx.canPay) return false;
        return ctx.defenderIsMainCharacter;
    },

    shouldUseSupportEffect(ctx) {
        if (!ctx.canUse) return decide(false, '', '');
        const type = ctx.sideEffectType;
        if (type === 'dark-emblem' || type === 'discard-opponent') return decide(true, '黑暗纹章', '');
        if (type === 'hero-emblem' || type === 'double-break') {
            return decide(predictAttackSuccess(ctx), '预测命中，发动英雄纹章', '');
        }

        if (ctx.sideEffectType.includes('move')) return decide(true, '快攻位移', '');
        return decide(false, '', '');
    }
};

module.exports = {
    geminiMidrangeProfile,
    geminiAggroProfile
};
