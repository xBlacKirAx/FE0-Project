const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const identityFile = path.join(__dirname, '..', '..', 'data', 'deck-identities.json');

function normalizeName(name) {
    return String(name || '').trim();
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex');
}

function ensureStore() {
    fs.mkdirSync(path.dirname(identityFile), { recursive: true });
    if (!fs.existsSync(identityFile)) {
        fs.writeFileSync(identityFile, '{}\n', 'utf8');
        return;
    }
    const raw = fs.readFileSync(identityFile, 'utf8').trim();
    if (!raw) fs.writeFileSync(identityFile, '{}\n', 'utf8');
}

function readAll() {
    ensureStore();
    const raw = fs.readFileSync(identityFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function writeAll(map) {
    ensureStore();
    fs.writeFileSync(identityFile, `${JSON.stringify(map || {}, null, 2)}\n`, 'utf8');
}

function hasIdentity(username) {
    const key = normalizeName(username);
    if (!key) return false;
    const all = readAll();
    return !!all[key];
}

function verifyIdentity(username, password) {
    const key = normalizeName(username);
    if (!key) return false;
    const all = readAll();
    const record = all[key];
    if (!record?.passwordHash) return false;
    return String(record.passwordHash) === hashPassword(password);
}

function upsertIdentity(username, password) {
    const key = normalizeName(username);
    if (!key) return false;
    const all = readAll();
    all[key] = {
        passwordHash: hashPassword(password),
        updatedAt: new Date().toISOString()
    };
    writeAll(all);
    return true;
}

module.exports = {
    hasIdentity,
    verifyIdentity,
    upsertIdentity
};
