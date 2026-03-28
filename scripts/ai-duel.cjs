const fs = require('fs');
const path = require('path');
const { validateDeck, expandDeckCards } = require('../server/decks/deckRules');
const { readAll } = require('../server/decks/deckRepository');
const { inferProfileByDeckName } = require('../server/ai/deckAiProfiles');
const { runAIDuel } = require('../server/ai/duelEngine');
const { saveDuelLog } = require('../server/ai/duelLogStore');

const cardsPath = path.join(__dirname, '..', 'cards_b01.json');

function parseArgs(argv) {
    const args = {
        games: 20,
        maxTurns: 40,
        verbose: false,
        password: 'AI',
        saveLog: true
    };

    argv.forEach((item) => {
        if (item === '--verbose') args.verbose = true;
        if (item === '--no-save-log') args.saveLog = false;
        if (item.startsWith('--games=')) args.games = Math.max(1, Number.parseInt(item.split('=')[1], 10) || 20);
        if (item.startsWith('--max-turns=')) args.maxTurns = Math.max(10, Number.parseInt(item.split('=')[1], 10) || 40);
        if (item.startsWith('--password=')) args.password = String(item.split('=')[1] || '').trim() || 'AI';
    });

    return args;
}

function pickDecks(hiddenDecks) {
    const sacred = hiddenDecks.find(deck => String(deck.name || '').includes('圣痕中速压制')) || null;
    const lightSword = hiddenDecks.find(deck => String(deck.name || '').includes('光剑飞兵速攻')) || null;

    if (!sacred || !lightSword) {
        throw new Error('未找到目标隐藏卡组：需要 "AI 圣痕中速压制" 与 "AI 光剑飞兵速攻"。');
    }

    return { sacred, lightSword };
}

function formatWinRate(wins, total) {
    if (!total) return '0.00%';
    return `${((wins / total) * 100).toFixed(2)}%`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const cardPool = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
    const hiddenDecks = readAll({ password: args.password });
    const { sacred, lightSword } = pickDecks(hiddenDecks);

    const sacredValidation = validateDeck(sacred, cardPool);
    const lightValidation = validateDeck(lightSword, cardPool);

    if (!sacredValidation.valid) {
        throw new Error(`卡组校验失败(${sacred.name}): ${sacredValidation.errors.join(' | ')}`);
    }
    if (!lightValidation.valid) {
        throw new Error(`卡组校验失败(${lightSword.name}): ${lightValidation.errors.join(' | ')}`);
    }

    const sacredCards = expandDeckCards(sacred, cardPool);
    const lightCards = expandDeckCards(lightSword, cardPool);

    const sacredProfile = inferProfileByDeckName(sacred.name);
    const lightProfile = inferProfileByDeckName(lightSword.name);

    const stats = runAIDuel({
        deckA: sacred,
        deckB: lightSword,
        profileA: sacredProfile,
        profileB: lightProfile,
        expandedA: sacredCards,
        expandedB: lightCards,
        games: args.games,
        maxTurns: args.maxTurns,
        verbose: args.verbose
    });

    let saved = null;
    if (args.saveLog) {
        saved = saveDuelLog({
            source: 'cli',
            password: args.password,
            deckA: sacred.name,
            deckB: lightSword.name,
            totalGames: stats.totalGames,
            maxTurns: args.maxTurns,
            wins: stats.wins,
            games: stats.details
        });
    }

    console.log('\n=== FE0 AI 对战结果 ===');
    console.log(`卡组A: ${sacred.name} | 策略: ${sacredProfile.label}`);
    console.log(`卡组B: ${lightSword.name} | 策略: ${lightProfile.label}`);
    console.log(`总局数: ${stats.totalGames} | 回合上限: ${args.maxTurns}`);
    console.log('-----------------------');
    console.log(`${sacred.name} 胜场: ${stats.wins[sacred.name]} (${formatWinRate(stats.wins[sacred.name], stats.totalGames)})`);
    console.log(`${lightSword.name} 胜场: ${stats.wins[lightSword.name]} (${formatWinRate(stats.wins[lightSword.name], stats.totalGames)})`);
    console.log(`平局: ${stats.wins.draw} (${formatWinRate(stats.wins.draw, stats.totalGames)})`);
    if (saved) {
        console.log(`日志文件: data/ai-duel-logs/${saved.id}.json`);
    }

    const firstThree = stats.details.slice(0, 3);
    firstThree.forEach((item) => {
        console.log(`第${item.game}局 -> 胜者: ${item.winner} | 原因: ${item.reason} | 回合: ${item.turn}`);
        if (args.verbose && item.logs.length) {
            console.log(item.logs.join('\n'));
            console.log('-----------------------');
        }
    });
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[ai-duel] 运行失败:', err.message || err);
        process.exitCode = 1;
    }
}
