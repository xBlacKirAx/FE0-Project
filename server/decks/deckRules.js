const DEFAULT_RULES = Object.freeze({
    exactDeckSize: 50,
    maxCopiesPerCard: 4
});

function normalizeDeckInput(input = {}) {
    const cards = Array.isArray(input.cards) ? input.cards : [];
    return {
        name: String(input.name || '未命名卡组').trim(),
        format: String(input.format || 'standard').trim(),
        notes: String(input.notes || '').trim(),
        cards: cards
            .map(item => ({
                cardId: String(item?.cardId || '').trim(),
                count: Number(item?.count || 0)
            }))
            .filter(item => item.cardId && Number.isFinite(item.count) && item.count > 0)
    };
}

function summarizeDeck(deck, cardPoolById) {
    const summary = {
        totalCards: 0,
        uniqueCards: 0,
        byForce: {},
        byRank: {},
        byCost: {}
    };

    for (const item of deck.cards) {
        const count = item.count;
        const card = cardPoolById.get(item.cardId);
        summary.totalCards += count;
        summary.uniqueCards += 1;

        if (card) {
            const force = card.force || '无';
            summary.byForce[force] = (summary.byForce[force] || 0) + count;

            const rank = card.rank || '未知';
            summary.byRank[rank] = (summary.byRank[rank] || 0) + count;

            const cost = String(card.cost ?? '0');
            summary.byCost[cost] = (summary.byCost[cost] || 0) + count;
        }
    }

    return summary;
}

function validateDeck(rawDeck, cardPool, rules = DEFAULT_RULES) {
    const deck = normalizeDeckInput(rawDeck);
    const cardPoolById = new Map((cardPool || []).map(card => [String(card.id), card]));
    const errors = [];
    const warnings = [];

    if (!deck.name) {
        errors.push('卡组名称不能为空。');
    }

    const countsById = new Map();
    for (const item of deck.cards) {
        countsById.set(item.cardId, (countsById.get(item.cardId) || 0) + item.count);

        if (!cardPoolById.has(item.cardId)) {
            errors.push(`卡牌不存在: ${item.cardId}`);
        }
    }

    for (const [cardId, count] of countsById.entries()) {
        if (count > rules.maxCopiesPerCard) {
            errors.push(`同名卡超限: ${cardId} 当前 ${count} 张，最多 ${rules.maxCopiesPerCard} 张。`);
        }
    }

    const summary = summarizeDeck(deck, cardPoolById);
    if (summary.totalCards !== rules.exactDeckSize) {
        errors.push(`卡组总数必须为 ${rules.exactDeckSize} 张，当前 ${summary.totalCards} 张。`);
    }

    if (Object.keys(summary.byForce).length > 3) {
        warnings.push('势力超过 3 种，可能影响费用与颜色一致性。');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary,
        normalizedDeck: deck
    };
}

module.exports = {
    DEFAULT_RULES,
    normalizeDeckInput,
    validateDeck
};
