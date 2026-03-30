const express = require('express');
const repository = require('../decks/deckRepository');
const { validateDeck, expandDeckCards } = require('../decks/deckRules');
const { inferProfileByDeckName, aiProfiles } = require('./deckAiProfiles');
const { runAIDuel } = require('./duelEngine');
const { saveDuelLog, listDuelLogs, readDuelLog } = require('./duelLogStore');

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
        const deckAId = req.body?.deckA;
        const deckBId = req.body?.deckB;
        const authorA = req.body?.authorA;
        const authorB = req.body?.authorB;

        // 严格限定：对战时仅从 AI 隐藏目录校验请求的卡组
        const aiDecks = repository.readAll({ password });
        const sacred = aiDecks.find(d => String(d.id) === String(deckAId));
        const lightSword = aiDecks.find(d => String(d.id) === String(deckBId));

        if (!sacred || !lightSword) {
             return res.status(404).json({ message: '未找到指定的对战卡组。' });
        }

        const sacredValidation = validateDeck(sacred, cardPool);
        const lightValidation = validateDeck(lightSword, cardPool);

        if (!sacredValidation.valid || !lightValidation.valid) {
            return res.status(400).json({
                message: '选定的卡组不合法，无法执行 AI 对战。',
                validations: {
                    [sacred.name]: sacredValidation,
                    [lightSword.name]: lightValidation
                }
            });
        }

        const profileA = inferProfileByDeckName(sacred.name, authorA);
        const profileB = inferProfileByDeckName(lightSword.name, authorB);

        const stats = runAIDuel({
            deckA: sacred,
            deckB: lightSword,
            profileA,
            profileB,
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
            profileALabel: profileA.label,
            profileBLabel: profileB.label,
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
