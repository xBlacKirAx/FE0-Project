const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function resolveLogPath() {
    const rawArg = String(process.argv[2] || '').trim();
    if (rawArg) {
        return path.isAbsolute(rawArg) ? rawArg : path.join(projectRoot, rawArg);
    }

    const logDir = path.join(projectRoot, 'data', 'ai-duel-logs');
    const latest = fs.readdirSync(logDir)
        .filter(name => name.endsWith('.json'))
        .map(name => {
            const full = path.join(logDir, name);
            const stat = fs.statSync(full);
            return { full, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

    if (!latest?.full) {
        throw new Error('未找到可用的 AI 回放日志');
    }

    return latest.full;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function getCardKey(card, fallback = '') {
    const instanceId = String(card?.instanceId || '').trim();
    if (instanceId) return instanceId;
    const id = String(card?.id || '').trim();
    if (id) return id;
    return fallback;
}

function hydrateCard(cardRef, fallbackCard = null) {
    if (!cardRef && !fallbackCard) return null;
    const source = cardRef && typeof cardRef === 'object' ? cardRef : {};
    const fallback = fallbackCard && typeof fallbackCard === 'object' ? fallbackCard : {};
    const stacks = Object.prototype.hasOwnProperty.call(source, '_stackedCards') ? source._stackedCards : fallback._stackedCards;
    const fallbackStacks = Array.isArray(fallback._stackedCards) ? fallback._stackedCards : [];

    return {
        ...fallback,
        ...source,
        isTapped: Object.prototype.hasOwnProperty.call(source, 'isTapped') ? !!source.isTapped : !!fallback.isTapped,
        isMainCharacter: Object.prototype.hasOwnProperty.call(source, 'isMainCharacter') ? !!source.isMainCharacter : !!fallback.isMainCharacter,
        _stackedCards: Array.isArray(stacks)
            ? stacks.map((stackedCard, index) => hydrateCard(stackedCard, fallbackStacks[index] || null)).filter(Boolean)
            : []
    };
}

function cloneCards(cards) {
    return Array.isArray(cards) ? cards.map(card => hydrateCard(card)).filter(Boolean) : [];
}

function applyZonePatch(currentList, zonePatch) {
    const currentMap = new Map((Array.isArray(currentList) ? currentList : []).map((card, idx) => [getCardKey(card, `current-${idx}`), card]));

    for (const key of Array.isArray(zonePatch?.remove) ? zonePatch.remove : []) {
        currentMap.delete(String(key || '').trim());
    }

    for (const cardRef of Array.isArray(zonePatch?.update) ? zonePatch.update : []) {
        const key = getCardKey(cardRef);
        if (!key) continue;
        currentMap.set(key, hydrateCard(cardRef, currentMap.get(key) || null));
    }

    for (const cardRef of Array.isArray(zonePatch?.add) ? zonePatch.add : []) {
        const key = getCardKey(cardRef);
        if (!key) continue;
        currentMap.set(key, hydrateCard(cardRef, currentMap.get(key) || null));
    }

    const nextList = [];
    const order = Array.isArray(zonePatch?.order) ? zonePatch.order : [];
    for (const rawKey of order) {
        const key = String(rawKey || '').trim();
        if (!key) continue;
        const card = currentMap.get(key);
        if (!card) continue;
        nextList.push(card);
        currentMap.delete(key);
    }
    if (currentMap.size > 0) nextList.push(...currentMap.values());
    return nextList;
}

function main() {
    const logPath = resolveLogPath();
    const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const game = data.games.find(item => (item.timeline || []).some(event => JSON.stringify(event.extra?.replayPatch || {}).includes('_stackedCards')));
    assert(game, '未找到包含堆叠补丁的对局');

    const attackDeclareEvent = (game.timeline || []).find(event => event.tag === 'attack-declare');
    assert(attackDeclareEvent, '未找到宣言攻击事件');
    assert(
        JSON.stringify(attackDeclareEvent.extra?.replayPatch || {}).includes('"isTapped":true'),
        '宣言攻击事件应携带攻击者横置状态补丁'
    );
    assert(!!attackDeclareEvent.extra?.attacker?.instanceId, '宣言攻击事件应携带攻击者卡牌数据');
    assert(!!attackDeclareEvent.extra?.defender?.instanceId, '宣言攻击事件应携带防御者卡牌数据');

    const battlePreviewEvent = (game.timeline || []).find(event => event.tag === 'battle-preview');
    assert(battlePreviewEvent, '未找到战斗预览事件');
    assert(!!battlePreviewEvent.extra?.attacker?.instanceId, '战斗预览事件应携带攻击者卡牌数据');
    assert(!!battlePreviewEvent.extra?.defender?.instanceId, '战斗预览事件应携带防御者卡牌数据');
    assert(
        battlePreviewEvent.extra?.attackerSupportCard === null || !!battlePreviewEvent.extra?.attackerSupportCard?.instanceId,
        '战斗预览事件应携带攻击方支援卡数据'
    );
    assert(
        battlePreviewEvent.extra?.defenderSupportCard === null || !!battlePreviewEvent.extra?.defenderSupportCard?.instanceId,
        '战斗预览事件应携带防御方支援卡数据'
    );

    const state = {
        frontA: cloneCards(game.initialSnapshot?.seatAState?.front),
        rearA: cloneCards(game.initialSnapshot?.seatAState?.rear),
        frontB: cloneCards(game.initialSnapshot?.seatBState?.front),
        rearB: cloneCards(game.initialSnapshot?.seatBState?.rear)
    };

    let validated = false;
    for (const event of game.timeline || []) {
        const patch = event.extra?.replayPatch;
        if (!patch) continue;
        if (patch.seatAState?.front) state.frontA = applyZonePatch(state.frontA, patch.seatAState.front);
        if (patch.seatAState?.rear) state.rearA = applyZonePatch(state.rearA, patch.seatAState.rear);
        if (patch.seatBState?.front) state.frontB = applyZonePatch(state.frontB, patch.seatBState.front);
        if (patch.seatBState?.rear) state.rearB = applyZonePatch(state.rearB, patch.seatBState.rear);

        const frontUnits = [...state.frontA, ...state.frontB, ...state.rearA, ...state.rearB];
        const stackedUnit = frontUnits.find(card => Array.isArray(card._stackedCards) && card._stackedCards.length > 0);
        const mainCharacter = frontUnits.find(card => card.isMainCharacter);
        if (stackedUnit && mainCharacter) {
            assert(stackedUnit._stackedCards.length > 0, '回放重建后堆叠卡数量丢失');
            assert(mainCharacter.isMainCharacter === true, '回放重建后主人公标识丢失');
            validated = true;
            break;
        }
    }

    assert(validated, '未能在回放重建过程中同时验证堆叠信息和主人公标识');
    console.log('回放补丁烟测检查通过');
}

try {
    main();
} catch (error) {
    console.error(`回放补丁烟测检查失败: ${error.message}`);
    process.exit(1);
}
