const express = require('express');
const repository = require('./deckRepository');
const identityStore = require('./identityStore');
const { normalizeDeckInput, validateDeck, expandDeckCards } = require('./deckRules');

function getPasswordScope(req) {
    const password = String(req.query.password || '').trim();
    return password ? { password } : {};
}

function ensureAccessForScope(req, res) {
    const password = String(req.query.password || '').trim();
    if (!password) return true;
    const accessPassword = String(req.query.accessPassword || '');
    if (identityStore.hasIdentity(password) && !identityStore.verifyIdentity(password, accessPassword)) {
        res.status(401).json({ message: '该用户名目录需要密码，验证失败。' });
        return false;
    }
    return true;
}

function createDeckRouter({ cardPool }) {
    const router = express.Router();

    router.get('/', (req, res) => {
        const decks = repository.readAll();
        res.json(decks);
    });

    router.get('/hidden', (req, res) => {
        const password = String(req.query.password || '').trim();
        const accessPassword = String(req.query.accessPassword || '');
        if (!password) {
            return res.status(400).json({ message: '口令不能为空。' });
        }
        if (identityStore.hasIdentity(password) && !identityStore.verifyIdentity(password, accessPassword)) {
            return res.status(401).json({ message: '该用户名目录需要密码，验证失败。' });
        }
        repository.ensureHiddenStore(password);
        const decks = repository.readAll({ password });
        return res.json(decks);
    });

    router.post('/hidden/rename', (req, res) => {
        const oldPassword = String(req.body?.oldPassword || '').trim();
        const newPassword = String(req.body?.newPassword || '').trim();
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: '旧口令和新口令不能为空。' });
        }
        const result = repository.renameHiddenStore(oldPassword, newPassword);
        if (!result?.ok) {
            return res.status(400).json({ message: '重命名隐藏卡组目录失败。' });
        }
        return res.json({ ok: true, moved: !!result.moved });
    });

    router.post('/identity/switch', (req, res) => {
        const oldUsername = String(req.body?.oldUsername || '').trim();
        const newUsername = String(req.body?.newUsername || '').trim();
        const password = String(req.body?.password || '');
        if (!newUsername) {
            return res.status(400).json({ message: '用户名不能为空。' });
        }
        if (!password) {
            return res.status(400).json({ message: '密码不能为空。' });
        }

        const hasIdentity = identityStore.hasIdentity(newUsername);
        if (hasIdentity && !identityStore.verifyIdentity(newUsername, password)) {
            return res.status(409).json({ message: '该用户名已被占用，密码不正确。' });
        }

        if (!hasIdentity) {
            identityStore.upsertIdentity(newUsername, password);
        }
        repository.ensureHiddenStore(newUsername);

        if (oldUsername && oldUsername !== newUsername) {
            repository.renameHiddenStore(oldUsername, newUsername);
        }

        return res.json({ ok: true });
    });

    router.get('/identity/requirements', (req, res) => {
        const username = String(req.query.username || '').trim();
        if (!username) return res.status(400).json({ message: '用户名不能为空。' });
        const exists = identityStore.hasIdentity(username);
        return res.json({ username, exists, requiresPassword: exists });
    });

    router.post('/identity/verify', (req, res) => {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        if (!username) return res.status(400).json({ message: '用户名不能为空。' });
        if (!identityStore.hasIdentity(username)) {
            return res.status(404).json({ message: '用户名不存在。' });
        }
        const ok = identityStore.verifyIdentity(username, password);
        if (!ok) return res.status(401).json({ message: '密码不正确。' });
        return res.json({ ok: true });
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
        if (!ensureAccessForScope(req, res)) return;
        const deck = repository.getById(req.params.id, getPasswordScope(req));
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        return res.json(deck);
    });

    router.put('/:id', (req, res) => {
        if (!ensureAccessForScope(req, res)) return;
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
        if (!ensureAccessForScope(req, res)) return;
        const ok = repository.remove(req.params.id, getPasswordScope(req));
        if (!ok) return res.status(404).json({ message: '卡组不存在。' });
        return res.status(204).send();
    });

    router.post('/:id/validate', (req, res) => {
        if (!ensureAccessForScope(req, res)) return;
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
        if (!ensureAccessForScope(req, res)) return;
        const deck = repository.getById(req.params.id, getPasswordScope(req));
        if (!deck) return res.status(404).json({ message: '卡组不存在。' });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(deck, null, 2));
    });

    router.get('/:id/expanded-cards', (req, res) => {
        if (!ensureAccessForScope(req, res)) return;
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
