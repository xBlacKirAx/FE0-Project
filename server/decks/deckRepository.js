const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataFile = path.join(__dirname, '..', '..', 'data', 'decks.json');

function ensureStore() {
    if (!fs.existsSync(dataFile)) {
        fs.writeFileSync(dataFile, '[]\n', 'utf8');
        return;
    }

    const raw = fs.readFileSync(dataFile, 'utf8').trim();
    if (!raw) {
        fs.writeFileSync(dataFile, '[]\n', 'utf8');
    }
}

function readAll() {
    ensureStore();
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
}

function writeAll(decks) {
    const normalized = Array.isArray(decks) ? decks : [];
    fs.writeFileSync(dataFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

function makeId() {
    return `deck_${crypto.randomBytes(6).toString('hex')}`;
}

function create(deckInput) {
    const decks = readAll();
    const now = new Date().toISOString();
    const deck = {
        id: makeId(),
        name: deckInput.name,
        format: deckInput.format,
        notes: deckInput.notes,
        cards: deckInput.cards,
        createdAt: now,
        updatedAt: now
    };
    decks.push(deck);
    writeAll(decks);
    return deck;
}

function update(id, patch) {
    const decks = readAll();
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
    writeAll(decks);
    return next;
}

function remove(id) {
    const decks = readAll();
    const idx = decks.findIndex(deck => deck.id === id);
    if (idx === -1) return false;
    decks.splice(idx, 1);
    writeAll(decks);
    return true;
}

function getById(id) {
    return readAll().find(deck => deck.id === id) || null;
}

module.exports = {
    readAll,
    create,
    update,
    remove,
    getById
};
