const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'ai-duel-logs');

function ensureLogDir() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function createLogId() {
    const ts = Date.now();
    const rand = crypto.randomBytes(3).toString('hex');
    return `ai_duel_${ts}_${rand}`;
}

function getLogPathById(logId) {
    return path.join(LOG_DIR, `${String(logId || '').trim()}.json`);
}

function saveDuelLog(payload) {
    ensureLogDir();
    const id = createLogId();
    const filePath = getLogPathById(id);
    const normalized = {
        id,
        createdAt: new Date().toISOString(),
        ...payload
    };
    fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return { id, filePath, createdAt: normalized.createdAt };
}

function readDuelLog(logId) {
    ensureLogDir();
    const filePath = getLogPathById(logId);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function listDuelLogs(limit = 20) {
    ensureLogDir();
    const files = fs.readdirSync(LOG_DIR)
        .filter(name => name.endsWith('.json'))
        .map(name => {
            const full = path.join(LOG_DIR, name);
            const stat = fs.statSync(full);
            return {
                name,
                full,
                mtimeMs: stat.mtimeMs
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, Math.max(1, Number.parseInt(limit, 10) || 20));

    const items = [];
    for (const file of files) {
        try {
            const parsed = JSON.parse(fs.readFileSync(file.full, 'utf8'));
            items.push({
                id: parsed.id,
                createdAt: parsed.createdAt,
                deckA: parsed.deckA,
                deckB: parsed.deckB,
                totalGames: parsed.totalGames,
                wins: parsed.wins,
                fileName: file.name
            });
        } catch {
            // ignore corrupted file
        }
    }

    return items;
}

module.exports = {
    saveDuelLog,
    readDuelLog,
    listDuelLogs
};
