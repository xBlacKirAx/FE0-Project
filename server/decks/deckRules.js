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
        protagonistCardId: String(input.protagonistCardId || '').trim(),
        protagonistCharaName: String(input.protagonistCharaName || '').trim(),
        cards: cards
            .map(item => ({
                cardId: String(item?.cardId || '').trim(),
                count: Number(item?.count || 0)
            }))
            .filter(item => item.cardId && Number.isFinite(item.count) && item.count > 0)
    };
}

function sortDeckCardEntries(cards, protagonistCardId, protagonistCharaName, cardPool) {
    const poolById = new Map((cardPool || []).map(c => [String(c.id), c]));
    const protId = String(protagonistCardId || '').trim();
    const protChara = String(protagonistCharaName || '').trim();

    const normalized = (Array.isArray(cards) ? cards : [])
        .map(item => ({
            cardId: String(item?.cardId || '').trim(),
            count: Number(item?.count || 0)
        }))
        .filter(item => item.cardId && Number.isFinite(item.count) && item.count > 0);

    const cmpId = (a, b) => {
        const idA = String(a.cardId);
        const idB = String(b.cardId);
        try {
            return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
        } catch {
            return idA.localeCompare(idB);
        }
    };

    const groupKey = cardId => {
        const c = poolById.get(cardId);
        const cn = String(c?.charaName || '').trim();
        if (cn) return `\u0001${cn}`;
        const nm = String(c?.cardName || '').trim();
        if (nm) return `\u0002${nm}`;
        return `\u0000${cardId}`;
    };

    const list = normalized.slice();
    const protagonistIdx = list.findIndex(x => x.cardId === protId);
    const protagonistEntry = protagonistIdx >= 0 ? list.splice(protagonistIdx, 1)[0] : null;

    const sameChara = [];
    const rest = [];
    for (const item of list) {
        const c = poolById.get(item.cardId);
        const cn = String(c?.charaName || '').trim();
        if (protChara && cn === protChara) {
            sameChara.push(item);
        } else {
            rest.push(item);
        }
    }
    sameChara.sort(cmpId);

    const byKey = new Map();
    for (const item of rest) {
        const k = groupKey(item.cardId);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(item);
    }
    const groups = [...byKey.values()];
    for (const g of groups) {
        g.sort(cmpId);
    }
    groups.sort((ga, gb) => cmpId(ga[0], gb[0]));

    const out = [];
    if (protagonistEntry) out.push(protagonistEntry);
    out.push(...sameChara, ...groups.flat());
    return out;
}

function normalizeAndSortDeckBody(body, cardPool) {
    const normalized = normalizeDeckInput(body || {});
    normalized.cards = sortDeckCardEntries(
        normalized.cards,
        normalized.protagonistCardId,
        normalized.protagonistCharaName,
        cardPool
    );
    return normalized;
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

function validateDeck(rawDeck, cardPool, rules = DEFAULT_RULES, options = {}) {
    const { allowDraft = false } = options;
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
    if (!allowDraft && summary.totalCards < rules.exactDeckSize) {
        errors.push(`卡组总数至少需要 ${rules.exactDeckSize} 张，当前 ${summary.totalCards} 张。`);
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

function expandDeckCards(rawDeck, cardPool) {
    const deck = normalizeDeckInput(rawDeck);
    const cardPoolById = new Map((cardPool || []).map(card => [String(card.id), card]));
    const cards = [];

    for (const item of deck.cards) {
        const base = cardPoolById.get(item.cardId);
        if (!base) continue;
        for (let i = 0; i < item.count; i++) {
            cards.push({ ...base });
        }
    }

    return cards;
}

module.exports = {
    DEFAULT_RULES,
    normalizeDeckInput,
    sortDeckCardEntries,
    normalizeAndSortDeckBody,
    validateDeck,
    expandDeckCards
};
