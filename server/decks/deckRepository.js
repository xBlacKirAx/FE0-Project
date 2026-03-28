const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const publicDataFile = path.join(__dirname, '..', '..', 'data', 'decks.json');
const hiddenDeckRoot = path.join(__dirname, '..', '..', 'data', 'hidden-decks');

function normalizePassword(password) {
    return String(password || '').trim();
}

function encodePasswordFolder(password) {
    return encodeURIComponent(normalizePassword(password));
}

function getStoreInfo(options = {}) {
    const password = normalizePassword(options.password);
    if (!password) {
        return {
            filePath: publicDataFile,
            password: '',
            isHidden: false
        };
    }

    const folderPath = path.join(hiddenDeckRoot, encodePasswordFolder(password));
    return {
        filePath: path.join(folderPath, 'decks.json'),
        folderPath,
        password,
        isHidden: true
    };
}

function ensureStore(options = {}) {
    const { filePath } = getStoreInfo(options);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]\n', 'utf8');
        return;
    }

    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
        fs.writeFileSync(filePath, '[]\n', 'utf8');
    }
}

function readAll(options = {}) {
    ensureStore(options);
    const { filePath } = getStoreInfo(options);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
}

function writeAll(decks, options = {}) {
    ensureStore(options);
    const { filePath } = getStoreInfo(options);
    const normalized = Array.isArray(decks) ? decks : [];
    fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

function makeId() {
    return `deck_${crypto.randomBytes(6).toString('hex')}`;
}

function create(deckInput, options = {}) {
    const decks = readAll(options);
    const now = new Date().toISOString();
    const deck = {
        id: makeId(),
        name: deckInput.name,
        format: deckInput.format,
        notes: deckInput.notes,
        protagonistCardId: deckInput.protagonistCardId || '',
        protagonistCharaName: deckInput.protagonistCharaName || '',
        cards: deckInput.cards,
        createdAt: now,
        updatedAt: now
    };
    decks.push(deck);
    writeAll(decks, options);
    return deck;
}

function update(id, patch, options = {}) {
    const decks = readAll(options);
    const idx = decks.findIndex(deck => deck.id === id);
    if (idx === -1) return null;

    const current = decks[idx];
    const next = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
    };

    decks[idx] = next;
    writeAll(decks, options);
    return next;
}

function remove(id, options = {}) {
    const decks = readAll(options);
    const idx = decks.findIndex(deck => deck.id === id);
    if (idx === -1) return false;
    decks.splice(idx, 1);
    writeAll(decks, options);
    return true;
}

function getById(id, options = {}) {
    return readAll(options).find(deck => deck.id === id) || null;
}

function hiddenPasswordExists(password) {
    const normalized = normalizePassword(password);
    if (!normalized) return false;
    const { folderPath } = getStoreInfo({ password: normalized });
    return fs.existsSync(folderPath);
}

module.exports = {
    readAll,
    writeAll,
    create,
    update,
    remove,
    getById,
    hiddenPasswordExists
};
