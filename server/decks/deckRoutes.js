const express = require('express');
const repository = require('./deckRepository');
const { normalizeDeckInput, validateDeck } = require('./deckRules');

function createDeckRouter({ cardPool }) {
    const router = express.Router();

    router.get('/', (req, res) => {
        const decks = repository.readAll();
        res.json(decks);
    });

    router.post('/', (req, res) => {
        const normalized = normalizeDeckInput(req.body || {});
        const result = validateDeck(normalized, cardPool);
        if (!result.valid) {
            return res.status(400).json({
                message: '卡组不合法，创建失败。',
                validation: result
            });
        }

        const created = repository.create(result.normalizedDeck);
        return res.status(201).json({ deck: created, validation: result });
    });

    router.get('/:id', (req, res) => {
        const deck = repository.getById(req.params.id);
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        return res.json(deck);
    });

    router.put('/:id', (req, res) => {
        const normalized = normalizeDeckInput(req.body || {});
        const result = validateDeck(normalized, cardPool);
        if (!result.valid) {
            return res.status(400).json({
                message: '卡组不合法，更新失败。',
                validation: result
            });
        }

        const updated = repository.update(req.params.id, result.normalizedDeck);
        if (!updated) return res.status(404).json({ message: '卡组不存在。' });
        return res.json({ deck: updated, validation: result });
    });

    router.delete('/:id', (req, res) => {
        const ok = repository.remove(req.params.id);
        if (!ok) return res.status(404).json({ message: '卡组不存在。' });
        return res.status(204).send();
    });

    router.post('/:id/validate', (req, res) => {
        const deck = repository.getById(req.params.id);
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        const result = validateDeck(deck, cardPool);
        return res.json(result);
    });

    router.post('/import/json', (req, res) => {
        const normalized = normalizeDeckInput(req.body || {});
        const result = validateDeck(normalized, cardPool);
        if (!result.valid) {
            return res.status(400).json({
                message: '导入失败：卡组不合法。',
                validation: result
            });
        }

        const created = repository.create(result.normalizedDeck);
        return res.status(201).json({ deck: created, validation: result });
    });

    router.get('/:id/export/json', (req, res) => {
        const deck = repository.getById(req.params.id);
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(deck, null, 2));
    });

    return router;
}

module.exports = {
    createDeckRouter
};
