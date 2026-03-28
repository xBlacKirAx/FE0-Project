const express = require('express');
const repository = require('./deckRepository');
const { normalizeDeckInput, validateDeck, expandDeckCards } = require('./deckRules');

function getPasswordScope(req) {
    const password = String(req.query.password || '').trim();
    return password ? { password } : {};
}

function createDeckRouter({ cardPool }) {
    const router = express.Router();

    router.get('/', (req, res) => {
        const decks = repository.readAll();
        res.json(decks);
    });

    router.get('/hidden', (req, res) => {
        const password = String(req.query.password || '').trim();
        if (!password) {
            return res.status(400).json({ message: '口令不能为空。' });
        }
        if (!repository.hiddenPasswordExists(password)) {
            return res.status(404).json({ message: '口令不存在，请确认后重试。' });
        }
        const decks = repository.readAll({ password });
        return res.json(decks);
    });

    router.post('/', (req, res) => {
        const strict = req.query.strict === 'true';
        const normalized = normalizeDeckInput(req.body || {});
        const result = validateDeck(normalized, cardPool, undefined, { allowDraft: !strict });
        if (!result.valid) {
            return res.status(400).json({
                message: '卡组不合法，创建失败。',
                validation: result
            });
        }

        const created = repository.create(result.normalizedDeck);
        return res.status(201).json({ deck: created, validation: result });
    });

    router.post('/hidden', (req, res) => {
        const strict = req.query.strict === 'true';
        const password = String(req.body?.password || '').trim();
        if (!password) {
            return res.status(400).json({ message: '隐藏口令不能为空。' });
        }

        const normalized = normalizeDeckInput(req.body || {});
        const result = validateDeck(normalized, cardPool, undefined, { allowDraft: !strict });
        if (!result.valid) {
            return res.status(400).json({
                message: '卡组不合法，创建失败。',
                validation: result
            });
        }

        const created = repository.create(result.normalizedDeck, { password });
        return res.status(201).json({ deck: created, validation: result });
    });

    router.get('/:id', (req, res) => {
        const deck = repository.getById(req.params.id, getPasswordScope(req));
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        return res.json(deck);
    });

    router.put('/:id', (req, res) => {
        const strict = req.query.strict === 'true';
        const normalized = normalizeDeckInput(req.body || {});
        const result = validateDeck(normalized, cardPool, undefined, { allowDraft: !strict });
        if (!result.valid) {
            return res.status(400).json({
                message: '卡组不合法，更新失败。',
                validation: result
            });
        }

        const updated = repository.update(req.params.id, result.normalizedDeck, getPasswordScope(req));
        if (!updated) return res.status(404).json({ message: '卡组不存在。' });
        return res.json({ deck: updated, validation: result });
    });

    router.delete('/:id', (req, res) => {
        const ok = repository.remove(req.params.id, getPasswordScope(req));
        if (!ok) return res.status(404).json({ message: '卡组不存在。' });
        return res.status(204).send();
    });

    router.post('/:id/validate', (req, res) => {
        const strict = req.query.strict !== 'false';
        const deck = repository.getById(req.params.id, getPasswordScope(req));
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        const result = validateDeck(deck, cardPool, undefined, { allowDraft: !strict });
        return res.json(result);
    });

    router.post('/import/json', (req, res) => {
        const strict = req.query.strict === 'true';
        const normalized = normalizeDeckInput(req.body || {});
        const result = validateDeck(normalized, cardPool, undefined, { allowDraft: !strict });
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
        const deck = repository.getById(req.params.id, getPasswordScope(req));
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(deck, null, 2));
    });

    router.get('/:id/expanded-cards', (req, res) => {
        const deck = repository.getById(req.params.id, getPasswordScope(req));
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });

        const validation = validateDeck(deck, cardPool);
        if (!validation.valid) {
            return res.status(400).json({
                message: '卡组不合法，无法用于对战。',
                validation
            });
        }

        const cards = expandDeckCards(deck, cardPool);
        return res.json({
            deckId: deck.id,
            deckName: deck.name,
            protagonistCardId: String(deck.protagonistCardId || '').trim(),
            protagonistCharaName: String(deck.protagonistCharaName || '').trim(),
            cards
        });
    });

    return router;
}

module.exports = {
    createDeckRouter
};
