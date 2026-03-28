const express = require('express');
const repository = require('../decks/deckRepository');
const { validateDeck, expandDeckCards } = require('../decks/deckRules');
const { inferProfileByDeckName } = require('./deckAiProfiles');
const { runAIDuel } = require('./duelEngine');
const { saveDuelLog, listDuelLogs, readDuelLog } = require('./duelLogStore');

function pickDecksByName(decks) {
    const sacred = decks.find(deck => String(deck.name || '').includes('圣痕中速压制')) || null;
    const lightSword = decks.find(deck => String(deck.name || '').includes('光剑飞兵速攻')) || null;
    if (!sacred || !lightSword) {
        return { error: '未找到目标隐藏卡组：AI 圣痕中速压制 / AI 光剑飞兵速攻。' };
    }
    return { sacred, lightSword };
}

function createAiRouter({ cardPool }) {
    const router = express.Router();

    router.get('/duel/logs', (req, res) => {
        const limit = Math.max(1, Number.parseInt(req.query.limit, 10) || 20);
        return res.json({ items: listDuelLogs(limit) });
    });

    router.get('/duel/logs/:id', (req, res) => {
        const log = readDuelLog(req.params.id);
        if (!log) {
            return res.status(404).json({ message: '对战日志不存在。' });
        }
        return res.json(log);
    });

    router.post('/duel', (req, res) => {
        const password = String(req.body?.password || 'AI').trim() || 'AI';
        const games = Math.max(1, Number.parseInt(req.body?.games, 10) || 10);
        const maxTurns = Math.max(10, Number.parseInt(req.body?.maxTurns, 10) || 35);

        const hiddenDecks = repository.readAll({ password });
        const picked = pickDecksByName(hiddenDecks);
        if (picked.error) {
            return res.status(404).json({ message: picked.error });
        }

        const { sacred, lightSword } = picked;

        const sacredValidation = validateDeck(sacred, cardPool);
        const lightValidation = validateDeck(lightSword, cardPool);

        if (!sacredValidation.valid || !lightValidation.valid) {
            return res.status(400).json({
                message: '隐藏卡组不合法，无法执行 AI 对战。',
                validations: {
                    [sacred.name]: sacredValidation,
                    [lightSword.name]: lightValidation
                }
            });
        }

        const stats = runAIDuel({
            deckA: sacred,
            deckB: lightSword,
            profileA: inferProfileByDeckName(sacred.name),
            profileB: inferProfileByDeckName(lightSword.name),
            expandedA: expandDeckCards(sacred, cardPool),
            expandedB: expandDeckCards(lightSword, cardPool),
            games,
            maxTurns,
            verbose: false
        });

        const saved = saveDuelLog({
            source: 'api',
            password,
            deckA: sacred.name,
            deckB: lightSword.name,
            totalGames: stats.totalGames,
            maxTurns,
            wins: stats.wins,
            games: stats.details
        });

        return res.json({
            deckA: sacred.name,
            deckB: lightSword.name,
            totalGames: stats.totalGames,
            maxTurns,
            wins: stats.wins,
            firstGames: stats.details.slice(0, 3),
            logId: saved.id,
            logCreatedAt: saved.createdAt
        });
    });

    return router;
}

module.exports = {
    createAiRouter
};
