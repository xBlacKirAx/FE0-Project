const fs = require('fs');
const path = require('path');

const { validateDeck } = require('./server/decks/deckRules.js');
const deckRepository = require('./server/decks/deckRepository.js');

const projectRoot = __dirname;
const defaultPoolPath = path.join(projectRoot, 'cards_b01.json');

function loadCardPool(poolPath = defaultPoolPath) {
    const raw = fs.readFileSync(poolPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function getAbilityText(card) {
    return normalizeText(card?.ability?.text || '');
}

function getSupportText(card) {
    return normalizeText(card?.supportAbility?.text || '');
}

function getAbilityEntries(card) {
    return Array.isArray(card?.ability?.entries) ? card.ability.entries : [];
}

function hasEntry(card, pattern) {
    return getAbilityEntries(card).some(entry => pattern.test(normalizeText(entry.effectText || '')));
}

function countMatching(cards, predicate) {
    return cards.reduce((sum, card) => sum + (predicate(card) ? 1 : 0), 0);
}

function getCharaLine(cardPool, charaName) {
    return cardPool.filter(card => (card.charaName || '') === charaName);
}

function scoreCard(card, context = {}) {
    const selectedForce = context.selectedForce || '';
    const pool = context.pool || [];
    const charaLine = getCharaLine(pool, card.charaName || '');
    const abilityText = getAbilityText(card);
    const supportText = getSupportText(card);
    const attack = Number(card.attack || 0);
    const support = Number(card.support || 0);
    const cost = Number(card.cost || 0);
    const isLowRank = /下级职业|固定职业/.test(card.rank || '');
    const isHighRank = /上级职业/.test(card.rank || '');
    const isSameForce = !selectedForce || (card.force || '') === selectedForce;
    const traits = Array.isArray(card.traits) ? card.traits : [];

    let score = 0;
    const reasons = [];

    if (isSameForce) {
        score += 18;
        reasons.push('同势力基础分');
    }

    score += attack * 0.65;
    score += support * 0.75;

    if (isLowRank && cost <= 1) {
        score += 14;
        reasons.push('低费展开');
    }

    if (isHighRank && attack >= 60) {
        score += 10;
        reasons.push('高质量上级打点');
    }

    if (String(card.range || '').includes('2')) {
        score += 5;
        reasons.push('远程压制');
    }

    if (traits.includes('飞行')) {
        score += 6;
        reasons.push('飞行机动');
    }

    if (traits.includes('龙')) {
        score += 4;
        reasons.push('龙系上限');
    }

    if (hasEntry(card, /战斗力\+30|战斗力\+40|战斗力\+50|战斗力变为2倍/)) {
        score += 12;
        reasons.push('高爆发能力');
    }

    if (hasEntry(card, /抽1张卡|抽2张卡|抽卡3张|加入手牌/)) {
        score += 9;
        reasons.push('资源获取');
    }

    if (hasEntry(card, /选择1名敌方单位，将其移动|选择任意名敌方单位，将其移动|将其移动/)) {
        score += 8;
        reasons.push('位置控制');
    }

    if (hasEntry(card, /攻击所将破坏的宝玉变为2颗|不能被神速回避/)) {
        score += 10;
        reasons.push('终结压力');
    }

    if (hasEntry(card, /从自己的卡组中选择1张.*将其出击/)) {
        score += 11;
        reasons.push('展开引擎');
    }

    if (hasEntry(card, /从自己的退避区中选择.*加入手牌|从自己的退避区中选择.*将其出击/)) {
        score += 9;
        reasons.push('墓地续航');
    }

    if (/攻击之纹章|英雄之纹章|天空之纹章|祈祷之纹章|魔术之纹章|黑暗之纹章|龙人之纹章|计略之纹章/.test(supportText)) {
        score += 10;
        reasons.push('优质支援纹章');
    }

    if (support >= 30) {
        score += 10;
        reasons.push('高支援值');
    } else if (support >= 20) {
        score += 5;
        reasons.push('稳定支援值');
    }

    if (charaLine.length >= 2) {
        score += 4;
        reasons.push('角色线完整');
    }

    if (/三角攻击/.test(abilityText)) {
        score += 14;
        reasons.push('阵型爆发');
    }

    if (/舞蹈|将其转为未行动状态/.test(abilityText)) {
        score += 8;
        reasons.push('再动支援');
    }

    if (/不能放置到羁绊区/.test(abilityText)) {
        score -= 5;
        reasons.push('羁绊限制');
    }

    if (/我方战场上有2名以上其他/.test(abilityText) || /每有1名其他/.test(abilityText)) {
        score += 5;
        reasons.push('群体协同');
    }

    return {
        card,
        score: Number(score.toFixed(2)),
        reasons
    };
}

function summarizeForce(cardPool, force) {
    const forceCards = cardPool.filter(card => (card.force || '') === force);
    const scored = forceCards.map(card => scoreCard(card, { selectedForce: force, pool: cardPool }));
    const sorted = scored.sort((a, b) => b.score - a.score);
    const topSlice = sorted.slice(0, 12);
    const totalTopScore = topSlice.reduce((sum, item) => sum + item.score, 0);
    const avgTopSupport = topSlice.reduce((sum, item) => sum + Number(item.card.support || 0), 0) / Math.max(topSlice.length, 1);
    const avgTopAttack = topSlice.reduce((sum, item) => sum + Number(item.card.attack || 0), 0) / Math.max(topSlice.length, 1);

    return {
        force,
        count: forceCards.length,
        totalTopScore,
        avgTopSupport: Number(avgTopSupport.toFixed(2)),
        avgTopAttack: Number(avgTopAttack.toFixed(2)),
        topCards: topSlice
    };
}

function buildLineSummaries(cardPool, selectedForce) {
    const forceCards = cardPool.filter(card => (card.force || '') === selectedForce);
    const lines = new Map();

    for (const card of forceCards) {
        const key = card.charaName || card.cardName || card.id;
        if (!lines.has(key)) {
            lines.set(key, []);
        }
        lines.get(key).push(card);
    }

    const summaries = [...lines.entries()].map(([charaName, cards]) => {
        const scored = cards
            .map(card => scoreCard(card, { selectedForce, pool: cardPool }))
            .sort((a, b) => b.score - a.score);
        const lowCards = scored.filter(item => /下级职业|固定职业/.test(item.card.rank || ''));
        const highCards = scored.filter(item => /上级职业/.test(item.card.rank || ''));
        const lineScore = scored.reduce((sum, item) => sum + item.score, 0)
            + (lowCards.length > 0 ? 8 : 0)
            + (highCards.length > 0 ? 8 : 0)
            + (cards.some(card => Number(card.support || 0) >= 30) ? 6 : 0)
            + (cards.some(card => /三角攻击/.test(getAbilityText(card))) ? 10 : 0)
            + (cards.some(card => /英雄之纹章|天空之纹章|攻击之纹章/.test(getSupportText(card))) ? 6 : 0);

        return {
            charaName,
            cards,
            scored,
            lowCards,
            highCards,
            bestLow: lowCards[0]?.card || null,
            bestHigh: highCards[0]?.card || null,
            lineScore: Number(lineScore.toFixed(2))
        };
    });

    return summaries.sort((a, b) => b.lineScore - a.lineScore);
}

function chooseBestForce(cardPool, preferredForce = '') {
    if (preferredForce) {
        return preferredForce;
    }

    const forces = [...new Set(cardPool.map(card => card.force).filter(Boolean))];
    const summaries = forces.map(force => summarizeForce(cardPool, force));
    summaries.sort((a, b) => {
        if (b.totalTopScore !== a.totalTopScore) return b.totalTopScore - a.totalTopScore;
        if (b.avgTopSupport !== a.avgTopSupport) return b.avgTopSupport - a.avgTopSupport;
        return b.avgTopAttack - a.avgTopAttack;
    });
    return summaries[0]?.force || '';
}

function chooseProtagonist(cardPool, selectedForce) {
    const lineSummaries = buildLineSummaries(cardPool, selectedForce);
    const preferredHeroNames = new Set(['马尔斯', '库洛姆', '露琪娜', '罗伊', '艾瑞珂', '艾弗拉姆', '神威']);
    const candidates = lineSummaries
        .filter(line => line.bestLow && Number(line.bestLow.cost || 99) <= 1)
        .map(line => {
            const card = line.bestLow;
            let score = line.lineScore;
            score += Number(card.support || 0) * 0.6;
            score += Number(card.attack || 0) * 0.45;
            if ((card.weapon || '') === '剑') score += 8;
            if (!Array.isArray(card.traits) || !card.traits.includes('飞行')) score += 4;
            if (Number(card.attack || 0) >= 40) score += 6;
            if (preferredHeroNames.has(card.charaName || '')) score += 14;
            if (/英雄之纹章|攻击之纹章|天空之纹章|祈祷之纹章|黑暗之纹章|魔术之纹章/.test(getSupportText(card))) score += 10;
            if (hasEntry(card, /选择1名敌方单位，将其移动|选择1名其他我方单位，将其移动/)) score += 7;
            return { card, score };
        })
        .sort((a, b) => b.score - a.score);

    return candidates[0]?.card || lineSummaries[0]?.bestLow || null;
}

function buildCoreRecommendations(cardPool, selectedForce) {
    const scored = cardPool
        .filter(card => (card.force || '') === selectedForce)
        .map(card => scoreCard(card, { selectedForce, pool: cardPool }))
        .sort((a, b) => b.score - a.score);
    const lineSummaries = buildLineSummaries(cardPool, selectedForce);
    const chosenCounts = new Map();

    const addCopies = (card, count) => {
        if (!card || count <= 0) return;
        const current = chosenCounts.get(card.id) || 0;
        const next = Math.min(4, current + count);
        chosenCounts.set(card.id, next);
    };

    for (const line of lineSummaries.slice(0, 5)) {
        const lowCard = line.bestLow;
        const highCard = line.bestHigh;
        const isTrioLine = /三角攻击|天马三姐妹/.test(line.cards.map(card => getAbilityText(card)).join(' '));

        if (lowCard) {
            let lowCopies = 3;
            if (Number(lowCard.cost || 0) <= 1 && Number(lowCard.support || 0) >= 20) lowCopies = 4;
            if (isTrioLine) lowCopies = 4;
            addCopies(lowCard, lowCopies);
        }

        if (highCard) {
            let highCopies = Number(highCard.attack || 0) >= 60 ? 3 : 2;
            if (isTrioLine) highCopies = 3;
            if (/战斗力变为2倍|战斗力\+50|战斗力\+40/.test(getAbilityText(highCard))) highCopies += 1;
            addCopies(highCard, Math.min(4, highCopies));
        }
    }

    for (const item of scored) {
        const card = item.card;
        const already = chosenCounts.get(card.id) || 0;
        const supportText = getSupportText(card);
        if (already > 0) continue;
        if (/攻击之纹章|英雄之纹章|天空之纹章|祈祷之纹章|黑暗之纹章|魔术之纹章|龙人之纹章/.test(supportText)
            && Number(card.cost || 99) <= 1
            && Number(card.support || 0) >= 20) {
            addCopies(card, Number(card.cost || 0) <= 1 ? 2 : 1);
        }
    }

    return { scored, chosenCounts, lineSummaries };
}

function fillDeckToExactSize(chosenCounts, scored, targetSize = 50, preferredChara = new Set()) {
    const getTotal = () => [...chosenCounts.values()].reduce((sum, count) => sum + count, 0);

    while (getTotal() < targetSize) {
        let expanded = false;
        const prioritized = [...scored].sort((a, b) => {
            const aPref = preferredChara.has(a.card.charaName || '') ? 1 : 0;
            const bPref = preferredChara.has(b.card.charaName || '') ? 1 : 0;
            if (bPref !== aPref) return bPref - aPref;
            return b.score - a.score;
        });

        for (const item of prioritized) {
            const current = chosenCounts.get(item.card.id) || 0;
            if (current >= 4) continue;
            chosenCounts.set(item.card.id, current + 1);
            expanded = true;
            if (getTotal() >= targetSize) break;
        }
        if (!expanded) break;
    }

    while (getTotal() > targetSize) {
        const removable = [...chosenCounts.entries()]
            .filter(([, count]) => count > 1)
            .map(([cardId, count]) => ({
                cardId,
                count,
                score: scored.find(item => item.card.id === cardId)?.score || 0
            }))
            .sort((a, b) => a.score - b.score);
        const target = removable[0];
        if (!target) break;
        chosenCounts.set(target.cardId, target.count - 1);
    }
}

function materializeDeck(cardPool, selectedForce, deckName = '') {
    const protagonist = chooseProtagonist(cardPool, selectedForce);
    const { scored, chosenCounts, lineSummaries } = buildCoreRecommendations(cardPool, selectedForce);
    const preferredChara = new Set(lineSummaries.slice(0, 6).map(line => line.charaName));

    if (protagonist) {
        const current = chosenCounts.get(protagonist.id) || 0;
        chosenCounts.set(protagonist.id, Math.max(4, current));
        preferredChara.add(protagonist.charaName || '');

        const protagonistHigh = lineSummaries.find(line => line.charaName === protagonist.charaName)?.bestHigh || null;
        if (protagonistHigh) {
            const highCurrent = chosenCounts.get(protagonistHigh.id) || 0;
            chosenCounts.set(protagonistHigh.id, Math.max(4, highCurrent));
        }
    }

    fillDeckToExactSize(chosenCounts, scored, 50, preferredChara);

    const cards = [...chosenCounts.entries()]
        .filter(([, count]) => count > 0)
        .map(([cardId, count]) => ({ cardId, count }))
        .sort((a, b) => a.cardId.localeCompare(b.cardId));

    const deck = {
        name: deckName || `AI ${selectedForce} 推荐卡组`,
        format: 'standard',
        notes: `由 deckBuilder.js 基于 FE0 规则与启发式评分自动生成。势力=${selectedForce}。`,
        protagonistCardId: protagonist?.id || '',
        protagonistCharaName: protagonist?.charaName || '',
        cards
    };

    return {
        deck,
        protagonist,
        scored
    };
}

function recommendDeck(options = {}) {
    const poolPath = options.poolPath || defaultPoolPath;
    const cardPool = loadCardPool(poolPath);
    const selectedForce = chooseBestForce(cardPool, options.force || '');
    const built = materializeDeck(cardPool, selectedForce, options.name || '');
    const validation = validateDeck(built.deck, cardPool);

    return {
        poolPath,
        selectedForce,
        cardPool,
        protagonist: built.protagonist,
        scored: built.scored,
        deck: built.deck,
        validation
    };
}

function analyzePool(options = {}) {
    const poolPath = options.poolPath || defaultPoolPath;
    const cardPool = loadCardPool(poolPath);
    const selectedForce = chooseBestForce(cardPool, options.force || '');
    const forceSummary = summarizeForce(cardPool, selectedForce);
    return {
        poolPath,
        selectedForce,
        forceSummary,
        topCards: forceSummary.topCards.map(item => ({
            id: item.card.id,
            cardName: item.card.cardName,
            attack: item.card.attack,
            support: item.card.support,
            cost: item.card.cost,
            score: item.score,
            reasons: item.reasons
        }))
    };
}

function saveRecommendedDeck(result, options = {}) {
    const password = String(options.password || '').trim();
    const deckName = String(options.name || result.deck.name || '').trim();
    const repositoryOptions = password ? { password } : {};
    const decks = deckRepository.readAll(repositoryOptions);
    const same = decks.find(deck => deck.name === deckName);
    const payload = {
        ...result.deck,
        name: deckName || result.deck.name
    };

    if (same) {
        return deckRepository.update(same.id, payload, repositoryOptions);
    }
    return deckRepository.create(payload, repositoryOptions);
}

function parseArgs(argv) {
    const options = {
        mode: 'build',
        force: '',
        poolPath: defaultPoolPath,
        password: '',
        save: false,
        json: false,
        name: ''
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--analyze') options.mode = 'analyze';
        else if (arg === '--build') options.mode = 'build';
        else if (arg === '--force' && next) {
            options.force = next;
            i += 1;
        } else if (arg === '--pool' && next) {
            options.poolPath = path.resolve(projectRoot, next);
            i += 1;
        } else if (arg === '--password' && next) {
            options.password = next;
            i += 1;
        } else if (arg === '--save') {
            options.save = true;
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--name' && next) {
            options.name = next;
            i += 1;
        }
    }

    return options;
}

function printAnalyzeResult(result, asJson = false) {
    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log(`推荐势力: ${result.selectedForce}`);
    console.log(`样本数量: ${result.forceSummary.count}`);
    console.log(`Top12 综合分: ${result.forceSummary.totalTopScore.toFixed(2)}`);
    console.log(`Top12 平均战力: ${result.forceSummary.avgTopAttack}`);
    console.log(`Top12 平均支援: ${result.forceSummary.avgTopSupport}`);
    console.log('Top 候选:');
    result.topCards.slice(0, 12).forEach((item, index) => {
        console.log(`${index + 1}. ${item.id} ${item.cardName} cost=${item.cost} atk=${item.attack} sup=${item.support} score=${item.score}`);
    });
}

function printBuildResult(result, asJson = false) {
    const summary = result.validation.summary;
    if (asJson) {
        console.log(JSON.stringify({
            selectedForce: result.selectedForce,
            protagonist: result.protagonist,
            deck: result.deck,
            validation: result.validation
        }, null, 2));
        return;
    }

    console.log(`推荐势力: ${result.selectedForce}`);
    console.log(`主人公: ${result.protagonist?.cardName || '未选出'}`);
    console.log(`卡组名称: ${result.deck.name}`);
    console.log(`总张数: ${summary.totalCards}`);
    console.log(`按费用分布: ${JSON.stringify(summary.byCost)}`);
    console.log('构筑列表:');
    result.deck.cards.forEach(item => {
        const card = result.cardPool.find(candidate => candidate.id === item.cardId);
        console.log(`- ${item.cardId} x${item.count} ${card?.cardName || ''}`);
    });
    if (result.validation.warnings.length > 0) {
        console.log(`警告: ${result.validation.warnings.join(' | ')}`);
    }
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === 'analyze') {
        const result = analyzePool(options);
        printAnalyzeResult(result, options.json);
        return;
    }

    const result = recommendDeck(options);
    if (!result.validation.valid) {
        console.error(`推荐卡组不合法: ${result.validation.errors.join(' | ')}`);
        process.exit(1);
    }

    if (options.save) {
        const saved = saveRecommendedDeck(result, options);
        console.log(`已保存卡组: ${saved.name}${options.password ? ` (隐藏口令=${options.password})` : ''}`);
    }

    printBuildResult(result, options.json);
}

if (require.main === module) {
    main();
}

module.exports = {
    loadCardPool,
    scoreCard,
    summarizeForce,
    buildLineSummaries,
    chooseBestForce,
    chooseProtagonist,
    recommendDeck,
    analyzePool,
    saveRecommendedDeck,
    parseArgs
};