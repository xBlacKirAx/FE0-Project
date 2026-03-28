const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const cards = require(path.join(projectRoot, 'cards_b01.json'));
const deckRules = require(path.join(projectRoot, 'server/decks/deckRules.js'));
const repo = require(path.join(projectRoot, 'server/decks/deckRepository.js'));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeLegalDeck() {
    const seed = cards.slice(0, 13);
    const deckCards = seed.map(card => ({ cardId: card.id, count: 4 }));
    // 13*4 = 52, trim two from first card to get 50
    deckCards[0].count = 2;
    return {
        name: '烟测卡组',
        format: 'standard',
        cards: deckCards
    };
}

function main() {
    const legal = makeLegalDeck();
    const result = deckRules.validateDeck(legal, cards);
    assert(result.valid === true, '合法卡组应通过校验');
    assert(result.summary.totalCards === 50, '卡组总数应为 50');

    const illegal = {
        name: '非法卡组',
        cards: [{ cardId: cards[0].id, count: 5 }]
    };
    const illegalResult = deckRules.validateDeck(illegal, cards);
    assert(illegalResult.valid === false, '非法卡组应校验失败');
    assert(illegalResult.errors.some(e => e.includes('同名卡超限')), '应命中同名卡超限错误');

    const before = repo.readAll();
    const created = repo.create(result.normalizedDeck);
    assert(!!created.id, '创建卡组后应有 id');

    const fetched = repo.getById(created.id);
    assert(!!fetched, '创建后应可按 id 读取');
    assert(fetched.cards.length > 0, '读取到的卡组应包含 cards');

    const updated = repo.update(created.id, { ...fetched, name: '烟测卡组-更新' });
    assert(updated.name === '烟测卡组-更新', '更新卡组名称应成功');

    const removed = repo.remove(created.id);
    assert(removed === true, '删除卡组应成功');

    // restore original deck store content to avoid污染仓库数据
    const storePath = path.join(projectRoot, 'data', 'decks.json');
    fs.writeFileSync(storePath, `${JSON.stringify(before, null, 2)}\n`, 'utf8');

    console.log('卡组管理烟测检查通过');
}

try {
    main();
} catch (error) {
    console.error(`卡组管理烟测检查失败: ${error.message}`);
    process.exit(1);
}
