const fs = require('fs');
const path = require('path');

function safeReadJson(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`[tutorialRegistry] 读取失败: ${filePath}`, error?.message || error);
        return null;
    }
}

function normalizeTutorial(raw = {}) {
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const title = String(raw.title || id).trim();
    const snapshot = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : {};
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    return { id, title, snapshot, steps };
}

function createTutorialRegistry(options = {}) {
    const baseDir = options.baseDir || path.join(process.cwd(), 'data', 'tutorials');
    const tutorials = new Map();

    const loadAll = () => {
        tutorials.clear();
        if (!fs.existsSync(baseDir)) {
            console.warn(`[tutorialRegistry] 目录不存在: ${baseDir}`);
            return;
        }
        const files = fs.readdirSync(baseDir).filter(name => name.toLowerCase().endsWith('.json'));
        for (const fileName of files) {
            const filePath = path.join(baseDir, fileName);
            const parsed = safeReadJson(filePath);
            const normalized = normalizeTutorial(parsed || {});
            if (!normalized) continue;
            tutorials.set(normalized.id, normalized);
        }
        console.log(`[tutorialRegistry] 已加载教程: ${tutorials.size}`);
    };

    const getTutorial = (tutorialId) => {
        const id = String(tutorialId || '').trim();
        if (!id) return null;
        return tutorials.get(id) || null;
    };

    const listTutorials = () => {
        return [...tutorials.values()].map(t => ({ id: t.id, title: t.title }));
    };

    loadAll();

    return {
        loadAll,
        getTutorial,
        listTutorials
    };
}

module.exports = { createTutorialRegistry };
