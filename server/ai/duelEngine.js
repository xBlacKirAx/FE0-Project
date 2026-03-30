const fs = require('fs');
const path = require('path');
const { toInt, cardBrief } = require('./deckAiProfiles');
const { normalizeRange, canHitByRange } = require('../../shared/rangeModel.js');

const MAX_FRONT = 5;
const MAX_REAR = 5;

function loadEffectTimingById() {
    try {
        const catalogPath = path.join(__dirname, '../../data/support_effect_catalog_full.json');
        const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        const map = new Map();
        for (const item of Array.isArray(catalog) ? catalog : []) {
            const effectId = String(item?.effectId || '').trim();
            if (!effectId) continue;
            const timing = Array.isArray(item?.timings)
                ? item.timings.map(text => String(text || '').trim()).find(Boolean)
                : '';
            if (timing) map.set(effectId, timing);
        }
        return map;
    } catch (_error) {
        return new Map();
    }
}

const EFFECT_TIMING_BY_ID = loadEffectTimingById();

function shuffleInPlace(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
}

function cloneCard(card, instanceId) {
    return {
        ...card,
        instanceId,
        isTapped: false,
        isMainCharacter: false,
        _stackedCards: []
    };
}

function removeFromArea(area, instanceId) {
    const idx = area.findIndex(card => card.instanceId === instanceId);
    if (idx === -1) return null;
    return area.splice(idx, 1)[0];
}

function forceMatched(required, actual) {
    if (!required) return true;
    return String(required) === String(actual || '');
}

function getCardCharaName(card) {
    const direct = String(card?.charaName || '').trim();
    if (direct) return direct;

    const fullName = String(card?.cardName || card?.name || '').trim();
    if (!fullName) return '';
    const idx = fullName.search(/\s/);
    if (idx > -1) {
        const derived = fullName.slice(idx).trim();
        if (derived) return derived;
    }
    return fullName;
}

function isSupportFailed(supportCard, targetCard) {
    const supportChara = getCardCharaName(supportCard);
    const targetChara = getCardCharaName(targetCard);
    if (!supportChara || !targetChara) return false;
    return supportChara === targetChara;
}

function getSupportEffectTiming(supportCard) {
    const effectId = String(supportCard?.supportAbility?.effectId || '').trim();
    return String(
        supportCard?.supportAbility?.effectTiming
        || supportCard?.supportAbility?.keywords?.timing?.[0]
        || EFFECT_TIMING_BY_ID.get(effectId)
        || ''
    ).trim();
}

function isSupportTimingMatched(timing, role) {
    if (!timing) return true;
    if (timing === '〖攻防型〗') return true;
    if (timing === '〖连发技〗') return role === 'attacker';
    if (timing === '〖攻击型〗') return role === 'attacker';
    if (timing === '〖防御型〗') return role === 'defender';
    return false;
}

function getAttackerArea(player, attacker) {
    const id = String(attacker?.instanceId || '');
    if (player.front.some(card => String(card.instanceId) === id)) return 'my-front';
    if (player.rear.some(card => String(card.instanceId) === id)) return 'my-rear';
    return null;
}

function getDefenderArea(opponent, defender) {
    const id = String(defender?.instanceId || '');
    if (opponent.front.some(card => String(card.instanceId) === id)) return 'opp-front';
    if (opponent.rear.some(card => String(card.instanceId) === id)) return 'opp-rear';
    return null;
}

function canAttackTargetByRangeInAI(player, opponent, attacker, defender) {
    const attackerArea = getAttackerArea(player, attacker);
    const defenderArea = getDefenderArea(opponent, defender);
    const range = normalizeRange(attacker?.range);

    if (!attackerArea || !defenderArea) return false;
    return canHitByRange(range, attackerArea, defenderArea).valid;
}

function collectLegalTargets(player, opponent, attacker) {
    const pool = [...opponent.front, ...opponent.rear];
    return pool.filter(defender => canAttackTargetByRangeInAI(player, opponent, attacker, defender));
}

function setupPlayer({ deckDef, expandedCards, profile, seatName }) {
    const lib = expandedCards.map((card, idx) => cloneCard(card, `${seatName}-${idx + 1}-${Math.random().toString(36).slice(2, 8)}`));
    shuffleInPlace(lib);

    let protagonist = null;
    if (deckDef.protagonistCardId) {
        const targetIdx = lib.findIndex(card => String(card.id) === String(deckDef.protagonistCardId));
        if (targetIdx >= 0) protagonist = lib.splice(targetIdx, 1)[0];
    }
    if (!protagonist) protagonist = lib.pop();
    protagonist.isMainCharacter = true;

    const player = {
        seatName,
        deckName: deckDef.name,
        protagonistCharaName: String(deckDef.protagonistCharaName || protagonist?.charaName || ''),
        profile,
        drawPile: lib,
        hand: [],
        front: protagonist ? [protagonist] : [],
        rear: [],
        bonds: [],
        jewels: [],
        graveyard: [],
        usedBondsThisTurn: 0,
        turnIndex: 0
    };

    for (let i = 0; i < 5; i++) {
        const jewel = drawOneRaw(player);
        if (!jewel) break;
        player.jewels.push(jewel);
    }

    for (let i = 0; i < 6; i++) {
        const card = drawOneRaw(player);
        if (!card) break;
        player.hand.push(card);
    }

    return player;
}

function drawOneRaw(player) {
    if (player.drawPile.length === 0 && player.graveyard.length > 0) {
        player.drawPile.push(...player.graveyard.splice(0, player.graveyard.length));
        shuffleInPlace(player.drawPile);
    }
    if (player.drawPile.length === 0) return null;
    return player.drawPile.pop();
}

function drawToHand(player, count = 1) {
    let drawn = 0;
    for (let i = 0; i < count; i++) {
        const card = drawOneRaw(player);
        if (!card) break;
        player.hand.push(card);
        drawn += 1;
    }
    return drawn;
}

function autoMarch(player) {
    if (player.front.length > 0 || player.rear.length === 0) return [];
    const moved = player.rear.splice(0, player.rear.length);
    player.front.push(...moved);
    return moved;
}

function hasSkillCostCard(player, charaName) {
    if (!charaName) return false;
    return player.hand.some(card => String(card.charaName || '') === String(charaName));
}

function paySkillCostCard(player, charaName) {
    const idx = player.hand.findIndex(card => String(card.charaName || '') === String(charaName));
    if (idx === -1) return false;
    const paid = player.hand.splice(idx, 1)[0];
    player.graveyard.push(paid);
    return true;
}

function applyBondPhase(player, logger) {
    if (!player.hand.length) return;
    const bondCard = player.profile.chooseBondCard({ player }) || null;
    if (!bondCard) return;
    const idx = player.hand.findIndex(card => card.instanceId === bondCard.instanceId);
    if (idx === -1) return;
    const moved = player.hand.splice(idx, 1)[0];
    player.bonds.push(moved);
    logger(`${player.seatName} 羁绊放置: ${cardBrief(moved)}`);
}

function evaluateDeployActions(player) {
    const remainingCost = Math.max(0, player.bonds.length - player.usedBondsThisTurn);
    if (remainingCost <= 0) return [];

    const result = [];
    for (const handCard of player.hand) {
        const sameNameOnField = [...player.front, ...player.rear].find(card => String(card.charaName || '') === String(handCard.charaName || ''));
        const promoteCost = toInt(handCard.promoteCost, -1);
        const normalCost = toInt(handCard.cost, 0);
        const isUpgrade = !!sameNameOnField;
        const cost = isUpgrade && promoteCost >= 0 ? promoteCost : normalCost;

        if (cost > remainingCost) continue;

        const profileScore = player.profile.rankDeployCandidate({
            card: handCard,
            sameNameOnField,
            player
        });

        const targetArea = chooseDeployArea(player, handCard, sameNameOnField);
        if (targetArea === 'front' && player.front.length >= MAX_FRONT && !isUpgrade) continue;
        if (targetArea === 'rear' && player.rear.length >= MAX_REAR && !isUpgrade) continue;

        result.push({ handCard, sameNameOnField, cost, score: profileScore, targetArea, isUpgrade });
    }

    return result.sort((a, b) => b.score - a.score);
}

function chooseDeployArea(player, handCard, sameNameOnField) {
    if (sameNameOnField) {
        return player.front.some(card => card.instanceId === sameNameOnField.instanceId) ? 'front' : 'rear';
    }
    const flying = Array.isArray(handCard.traits) && handCard.traits.includes('飞行');
    if (player.front.length < 2) return 'front';
    if (flying && player.front.length < MAX_FRONT) return 'front';
    return 'rear';
}

function performDeploy(player, action, logger) {
    const handIdx = player.hand.findIndex(card => card.instanceId === action.handCard.instanceId);
    if (handIdx === -1) return false;

    const newCard = player.hand.splice(handIdx, 1)[0];
    player.usedBondsThisTurn += action.cost;

    if (action.isUpgrade && action.sameNameOnField) {
        const fieldArea = player.front.some(card => card.instanceId === action.sameNameOnField.instanceId) ? player.front : player.rear;
        const oldIdx = fieldArea.findIndex(card => card.instanceId === action.sameNameOnField.instanceId);
        if (oldIdx >= 0) {
            const oldTop = fieldArea.splice(oldIdx, 1)[0];
            newCard._stackedCards = [oldTop, ...(oldTop._stackedCards || [])];
            oldTop._stackedCards = [];
            newCard.isMainCharacter = !!oldTop.isMainCharacter;
            fieldArea.push(newCard);
            logger(`${player.seatName} 转职/升级: ${cardBrief(oldTop)} -> ${cardBrief(newCard)} (费用${action.cost})`);
            return true;
        }
    }

    if (action.targetArea === 'front') {
        player.front.push(newCard);
    } else {
        player.rear.push(newCard);
    }
    logger(`${player.seatName} 出击: ${cardBrief(newCard)} -> ${action.targetArea}`);
    return true;
}

function applyDeployPhase(player, logger) {
    player.usedBondsThisTurn = 0;
    for (let guard = 0; guard < 20; guard++) {
        const actions = evaluateDeployActions(player);
        if (!actions.length) break;
        const best = actions[0];
        if (best.score < 8) break;
        if (!performDeploy(player, best, logger)) break;
    }
}

function serializeCard(card) {
    if (!card) return null;

    return {
        id: card.id,
        instanceId: card.instanceId,
        isMainCharacter: !!card.isMainCharacter,
        isTapped: !!card.isTapped,
        _stackedCards: Array.isArray(card._stackedCards)
            ? card._stackedCards.map(serializeCard)
            : []
    };
}

function serializeReplayPatchCard(card) {
    if (!card) return null;

    return {
        id: card.id,
        instanceId: card.instanceId,
        isMainCharacter: !!card.isMainCharacter,
        isTapped: !!card.isTapped,
        ...(Array.isArray(card._stackedCards) && card._stackedCards.length > 0
            ? { _stackedCards: card._stackedCards.map(serializeReplayPatchCard).filter(Boolean) }
            : {})
    };
}

function serializePlayerForReplay(player) {
    return {
        seatName: player.seatName,
        deckName: player.deckName,
        protagonistCharaName: player.protagonistCharaName,
        hand: player.hand.map(serializeCard),
        front: player.front.map(serializeCard),
        rear: player.rear.map(serializeCard),
        bonds: player.bonds.map(serializeCard),
        jewels: player.jewels.map(serializeCard),
        graveyard: player.graveyard.map(serializeCard),
        drawPile: player.drawPile.map(serializeCard),
        handCount: player.hand.length,
        drawPileCount: player.drawPile.length,
        bondsCount: player.bonds.length,
        jewelsCount: player.jewels.length,
        graveyardCount: player.graveyard.length
    };
}

function createReplaySnapshot({ playerA, playerB, activeSeat, turn }) {
    return {
        turn,
        activeSeat: activeSeat || null,
        seatA: playerA.seatName,
        seatB: playerB.seatName,
        seatAState: serializePlayerForReplay(playerA),
        seatBState: serializePlayerForReplay(playerB)
    };
}

const REPLAY_PATCH_ZONE_KEYS = ['front', 'rear', 'hand', 'bonds', 'jewels', 'graveyard', 'drawPile'];

function isDeepEqualByJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function getCardReplayKey(card, fallback = '') {
    const instanceId = String(card?.instanceId || '').trim();
    if (instanceId) return instanceId;
    const id = String(card?.id || '').trim();
    if (id) return id;
    return fallback;
}

function buildZonePatch(prevZone, nextZone) {
    const prevList = Array.isArray(prevZone) ? prevZone : [];
    const nextList = Array.isArray(nextZone) ? nextZone : [];

    const prevMap = new Map(prevList.map((card, idx) => [getCardReplayKey(card, `prev-${idx}`), card]));
    const nextMap = new Map(nextList.map((card, idx) => [getCardReplayKey(card, `next-${idx}`), card]));

    const add = [];
    const remove = [];
    const update = [];

    for (const [key, card] of nextMap.entries()) {
        const prevCard = prevMap.get(key);
        if (!prevCard) {
            add.push(card);
            continue;
        }
        if (!isDeepEqualByJson(prevCard, card)) {
            update.push(card);
        }
    }

    for (const key of prevMap.keys()) {
        if (!nextMap.has(key)) {
            remove.push(key);
        }
    }

    const prevOrder = prevList.map((card, idx) => getCardReplayKey(card, `prev-${idx}`));
    const nextOrder = nextList.map((card, idx) => getCardReplayKey(card, `next-${idx}`));
    const orderChanged = !isDeepEqualByJson(prevOrder, nextOrder);

    if (!add.length && !remove.length && !update.length && !orderChanged) {
        return null;
    }

    return {
        ...(add.length ? { add } : {}),
        ...(remove.length ? { remove } : {}),
        ...(update.length ? { update } : {}),
        ...(orderChanged ? { order: nextOrder } : {})
    };
}

// 构建最小化的增量补丁 - 只保留必要的变化数据
function buildMinimalZonePatch(prevZone, nextZone, zoneKey) {
    const prevList = Array.isArray(prevZone) ? prevZone : [];
    const nextList = Array.isArray(nextZone) ? nextZone : [];

    const prevMap = new Map(prevList.map((card, idx) => [getCardReplayKey(card, `prev-${idx}`), card]));
    const nextMap = new Map(nextList.map((card, idx) => [getCardReplayKey(card, `next-${idx}`), card]));

    const add = [];
    const remove = [];
    const update = [];

    for (const [key, card] of nextMap.entries()) {
        const prevCard = prevMap.get(key);
        if (!prevCard) {
            add.push(serializeReplayPatchCard(card));
            continue;
        }

        const changes = {};
        if (prevCard.id !== card.id) changes.id = card.id;
        if (prevCard.isTapped !== card.isTapped) changes.isTapped = card.isTapped;
        if (prevCard.isMainCharacter !== card.isMainCharacter) changes.isMainCharacter = card.isMainCharacter;
        if (!isDeepEqualByJson(prevCard._stackedCards || [], card._stackedCards || [])) {
            changes._stackedCards = Array.isArray(card._stackedCards)
                ? card._stackedCards.map(serializeReplayPatchCard).filter(Boolean)
                : [];
        }
        if (Object.keys(changes).length > 0) {
            update.push({ instanceId: card.instanceId, ...changes });
        }
    }

    for (const key of prevMap.keys()) {
        if (!nextMap.has(key)) {
            remove.push(key);
        }
    }

    // drawPile 不需要记录完整的顺序（对战斗无影响），只记录变化数量
    const isDrawPile = zoneKey === 'drawPile';
    let orderChanged = false;
    let orderData = null;

    if (!isDrawPile) {
        const prevOrder = prevList.map((card, idx) => getCardReplayKey(card, `prev-${idx}`));
        const nextOrder = nextList.map((card, idx) => getCardReplayKey(card, `next-${idx}`));
        orderChanged = !isDeepEqualByJson(prevOrder, nextOrder);
        if (orderChanged) orderData = nextOrder;
    }

    if (!add.length && !remove.length && !update.length && !orderChanged) {
        return null;
    }

    return {
        ...(add.length ? { add } : {}),
        ...(remove.length ? { remove } : {}),
        ...(update.length ? { update } : {}),
        ...(orderData ? { order: orderData } : {})
    };
}

function buildReplayPatch(prevSnapshot, nextSnapshot) {
    if (!nextSnapshot) return null;

    const patch = {};
    const sections = ['seatAState', 'seatBState'];
    for (const section of sections) {
        const prevState = prevSnapshot?.[section] || {};
        const nextState = nextSnapshot?.[section] || {};
        const sectionPatch = {};

        for (const zoneKey of REPLAY_PATCH_ZONE_KEYS) {
            const prevZone = prevState[zoneKey] || [];
            const nextZone = nextState[zoneKey] || [];
            const zonePatch = buildMinimalZonePatch(prevZone, nextZone, zoneKey);
            if (zonePatch) sectionPatch[zoneKey] = zonePatch;
        }

        if (!isDeepEqualByJson(prevState.handCount, nextState.handCount)) sectionPatch.handCount = nextState.handCount;
        if (!isDeepEqualByJson(prevState.drawPileCount, nextState.drawPileCount)) sectionPatch.drawPileCount = nextState.drawPileCount;
        if (!isDeepEqualByJson(prevState.bondsCount, nextState.bondsCount)) sectionPatch.bondsCount = nextState.bondsCount;
        if (!isDeepEqualByJson(prevState.jewelsCount, nextState.jewelsCount)) sectionPatch.jewelsCount = nextState.jewelsCount;
        if (!isDeepEqualByJson(prevState.graveyardCount, nextState.graveyardCount)) sectionPatch.graveyardCount = nextState.graveyardCount;

        if (Object.keys(sectionPatch).length > 0) {
            patch[section] = sectionPatch;
        }
    }

    if (!prevSnapshot || String(prevSnapshot.activeSeat || '') !== String(nextSnapshot.activeSeat || '')) {
        patch.activeSeat = nextSnapshot.activeSeat || null;
    }

    if (!prevSnapshot || prevSnapshot.turn !== nextSnapshot.turn) {
        patch.turn = nextSnapshot.turn;
        patch.turnLabel = `T${nextSnapshot.turn}`;
    }

    return Object.keys(patch).length > 0 ? patch : null;
}

function buildBattleSnapshot({ attackerOwner, defenderOwner, attacker, defender }) {
    const attackerSupport = drawOneRaw(attackerOwner);
    const defenderSupport = drawOneRaw(defenderOwner);
    const attackerSupportFailed = isSupportFailed(attackerSupport, attacker);
    const defenderSupportFailed = isSupportFailed(defenderSupport, defender);
    const attackerSupportValue = attackerSupportFailed ? 0 : toInt(attackerSupport?.support, 0);
    const defenderSupportValue = defenderSupportFailed ? 0 : toInt(defenderSupport?.support, 0);

    const result = {
        attackerPower: toInt(attacker.attack, 0) + attackerSupportValue,
        defenderPower: toInt(defender.attack, 0) + defenderSupportValue,
        attackerSupport,
        defenderSupport,
        attackerSupportFailed,
        defenderSupportFailed,
        attackerCriticalLocked: false,
        defenderEvasionLocked: false,
        jewelBreakCount: 1
    };

    return result;
}

function handleMainCharacterBreak(defenderOwner, jewelBreakCount, logger) {
    if (defenderOwner.jewels.length <= 0) {
        return { gameOver: true };
    }

    const broken = Math.min(defenderOwner.jewels.length, jewelBreakCount);
    const initialJewelCount = defenderOwner.jewels.length;

    logger(`${defenderOwner.seatName} 主人公被击破，失去 ${broken} 宝玉，剩余 ${initialJewelCount - broken}`);

    const gained = defenderOwner.jewels.splice(initialJewelCount - broken, broken);
    defenderOwner.hand.push(...gained);

    for (let i = 0; i < gained.length; i++) {
        const card = gained[i];
        const jewelIndex = initialJewelCount - i;
        logger(`${defenderOwner.seatName} 将 宝玉${jewelIndex}： ${getCharaName(card)} 加入手牌`);
    }

    return { gameOver: defenderOwner.jewels.length <= 0 };
}

function breakDefenderUnit(defenderOwner, defender, logger) {
    const fromFront = removeFromArea(defenderOwner.front, defender.instanceId);
    const unit = fromFront || removeFromArea(defenderOwner.rear, defender.instanceId);
    if (!unit) return;

    defenderOwner.graveyard.push(unit);
    if (Array.isArray(unit._stackedCards) && unit._stackedCards.length > 0) {
        defenderOwner.graveyard.push(...unit._stackedCards);
        unit._stackedCards = [];
    }
    logger(`${defenderOwner.seatName} 单位被击破: ${cardBrief(unit)}`);
}

function buildSupportDetail(card, supportFailed = false) {
    if (!card) {
        return {
            id: null,
            cardId: null,
            instanceId: null,
            charaName: null,
            supportValue: 0,
            supportEffectId: null,
            supportEffectName: null,
            supportFailed: false
        };
    }
    return {
        id: String(card.id || '').trim() || null,
        cardId: String(card.id || '').trim() || null,
        instanceId: String(card.instanceId || '').trim() || null,
        charaName: String(card.charaName || '').trim() || null,
        supportValue: supportFailed ? 0 : toInt(card.support, 0),
        supportEffectId: String(card.supportAbility?.effectId || '').trim() || null,
        supportEffectName: String(card.supportAbility?.effectName || card.supportAbility?.text || '').trim() || null,
        supportFailed: !!supportFailed
    };
}

function getCharaName(card) {
    const text = String(card?.charaName || '').trim();
    return text || '未知角色';
}

function formatBattlePowerText(baseAttack, powerDelta, supportDetail) {
    if (powerDelta === 0) {
        return `战:${baseAttack}`;
    }

    const signedDelta = powerDelta > 0 ? `+${powerDelta}` : String(powerDelta);
    const abilityText = supportDetail?.supportEffectName
        ? ` 能力:${supportDetail.supportEffectName}`
        : '';
    return `战:${baseAttack}${signedDelta}${abilityText}`;
}

function formatSupportText(supportDetail, supportEffectState) {
    const charaName = supportDetail?.charaName || '无';
    const supportValue = toInt(supportDetail?.supportValue, 0);
    const shouldShowAbility = !!supportEffectState?.effectName
        && (!supportEffectState.used || !supportEffectState.powerDelta);
    const failedText = supportDetail?.supportFailed ? ' 失败' : '';
    return `${charaName}(援:${supportValue}${shouldShowAbility ? ` 能力:${supportEffectState.effectName}` : ''}${failedText})`;
}

function chooseAllyMoveTarget(owner, attacker, defender) {
    const frontCandidates = owner.front
        .filter(card => card.instanceId !== attacker.instanceId && card.instanceId !== defender?.instanceId)
        .sort((left, right) => toInt(right.attack, 0) - toInt(left.attack, 0));
    if (frontCandidates.length > 0) {
        return { card: frontCandidates[0], from: 'front', to: 'rear' };
    }

    const rearCandidates = owner.rear
        .filter(card => card.instanceId !== attacker.instanceId && card.instanceId !== defender?.instanceId)
        .sort((left, right) => toInt(right.attack, 0) - toInt(left.attack, 0));
    if (rearCandidates.length > 0) {
        return { card: rearCandidates[0], from: 'rear', to: 'front' };
    }

    return null;
}

function chooseUntapTarget(owner, attacker) {
    return [...owner.front, ...owner.rear]
        .filter(card => card.instanceId !== attacker.instanceId)
        .filter(card => !!card.isTapped)
        .filter(card => toInt(card.cost, 0) <= 2)
        .sort((left, right) => toInt(right.attack, 0) - toInt(left.attack, 0))[0] || null;
}

function chooseEnemyMoveTarget(opponent, defender) {
    const frontCandidates = opponent.front
        .filter(card => card.instanceId !== defender.instanceId)
        .sort((left, right) => toInt(right.attack, 0) - toInt(left.attack, 0));
    if (frontCandidates.length > 0) {
        return { card: frontCandidates[0], from: 'front', to: 'rear' };
    }

    const rearCandidates = opponent.rear
        .filter(card => card.instanceId !== defender.instanceId)
        .sort((left, right) => toInt(right.attack, 0) - toInt(left.attack, 0));
    if (rearCandidates.length > 0) {
        return { card: rearCandidates[0], from: 'rear', to: 'front' };
    }

    return null;
}

function chooseAttackerPostBattleMove(owner, attacker) {
    const inFront = (owner.front || []).some(card => String(card.instanceId) === String(attacker?.instanceId));
    const inRear = (owner.rear || []).some(card => String(card.instanceId) === String(attacker?.instanceId));
    if (inFront) return { from: 'front', to: 'rear' };
    if (inRear) return { from: 'rear', to: 'front' };
    return null;
}

function moveCardBetweenZones(player, fromZone, toZone, instanceId) {
    if (!player || !fromZone || !toZone || fromZone === toZone) return null;
    const source = Array.isArray(player[fromZone]) ? player[fromZone] : null;
    const target = Array.isArray(player[toZone]) ? player[toZone] : null;
    if (!source || !target) return null;
    const moved = removeFromArea(source, instanceId);
    if (!moved) return null;
    target.push(moved);
    return moved;
}

function chooseSupportDiscardCard(player, preferredCharaName = '') {
    const preferred = String(preferredCharaName || '').trim();
    if (!Array.isArray(player?.hand) || player.hand.length === 0) return null;

    return [...player.hand].sort((left, right) => {
        const leftPreferred = preferred && String(left?.charaName || '').trim() === preferred ? 1 : 0;
        const rightPreferred = preferred && String(right?.charaName || '').trim() === preferred ? 1 : 0;
        if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;

        const leftMain = left?.isMainCharacter ? 1 : 0;
        const rightMain = right?.isMainCharacter ? 1 : 0;
        if (leftMain !== rightMain) return leftMain - rightMain;

        const leftScore = toInt(left.cost, 0) * 10 - toInt(left.support, 0) * 2 - toInt(left.attack, 0) * 0.2;
        const rightScore = toInt(right.cost, 0) * 10 - toInt(right.support, 0) * 2 - toInt(right.attack, 0) * 0.2;
        return rightScore - leftScore;
    })[0] || null;
}

function chooseBondCandidateFromHand(player, preferredCharaName = '') {
    const preferred = String(preferredCharaName || '').trim();
    if (!Array.isArray(player?.hand) || player.hand.length === 0) return null;

    return [...player.hand].sort((left, right) => {
        const leftPreferred = preferred && String(left?.charaName || '').trim() === preferred ? 1 : 0;
        const rightPreferred = preferred && String(right?.charaName || '').trim() === preferred ? 1 : 0;
        if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
        return toInt(right.cost, 0) - toInt(left.cost, 0);
    })[0] || null;
}

function isAnyForceMatched(requiredForces, actualForce) {
    if (!Array.isArray(requiredForces) || requiredForces.length === 0) return false;
    return requiredForces.some(force => forceMatched(force, actualForce));
}

function isSiblingPairMatched(supportName, battleName) {
    const left = String(supportName || '').trim();
    const right = String(battleName || '').trim();
    if (!left || !right) return false;
    return (left === '艾瑞珂' && right === '伊弗列姆') || (left === '伊弗列姆' && right === '艾瑞珂');
}

function cardHasTrait(card, trait) {
    return Array.isArray(card?.traits) && card.traits.includes(trait);
}

function shouldUseSupportEffect(owner, context) {
    if (typeof owner?.profile?.shouldUseSupportEffect === 'function') {
        return owner.profile.shouldUseSupportEffect(context);
    }

    if (!context?.canUse) return { use: false, reason: '条件不成立' };
    if (context.powerDelta > 0) return { use: true, reason: '收益成立' };
    if (context.lockAttackerCritical) return { use: true, reason: '关键控制效果' };
    if (context.lockDefenderEvasion) return { use: true, reason: '关键控制效果' };
    if (context.jewelBreakCount > 1) return { use: true, reason: '收益成立' };
    if (context.sideEffectType === 'move-ally' && context.sideEffectTarget) return { use: true, reason: '站位优化' };
    if (context.sideEffectType === 'untap-ally' && context.sideEffectTarget) return { use: true, reason: '站位优化' };
    if (context.sideEffectType === 'move-enemy' && context.sideEffectTarget) return { use: true, reason: '站位优化' };
    return { use: false, reason: '收益不足' };
}

function buildSupportEffectState({ supportCard, role, owner, opponent, attacker, defender, supportFailed }) {
    const effectId = String(supportCard?.supportAbility?.effectId || '').trim() || null;
    const effectName = String(supportCard?.supportAbility?.effectName || supportCard?.supportAbility?.text || '').trim() || null;
    const effectTiming = getSupportEffectTiming(supportCard);
    const params = supportCard?.supportAbility?.effectParams || {};
    const requiredForce = params.requiredAttackerForce || supportCard?.force || null;
    const requiredForces = Array.isArray(params.requiredAttackerForces) ? params.requiredAttackerForces : null;
    const battleUnit = role === 'attacker' ? attacker : defender;

    const effectState = {
        effectId,
        effectName,
        canUse: false,
        used: false,
        powerDelta: 0,
        lockAttackerCritical: false,
        lockDefenderEvasion: false,
        jewelBreakCount: 1,
        sideEffectType: null,
        sideEffectTarget: null,
        sideEffectCard: null,
        decisionReason: null,
        note: null,
        resultNote: null
    };

    if (!effectId || !effectName) {
        return effectState;
    }

    if (supportFailed) {
        effectState.note = '同名支援失败';
        return effectState;
    }

    if (!isSupportTimingMatched(effectTiming, role)) {
        effectState.note = '时机不匹配';
        return effectState;
    }

    switch (effectId) {
    case 'EMBLEM_SIBLING': {
        const supportName = getCharaName(supportCard);
        const battleName = getCharaName(battleUnit);
        const requiredName = String(params.requiredBattleCharaName || '').trim();
        const requiredNames = Array.isArray(params.requiredBattleCharaNames) ? params.requiredBattleCharaNames : [];
        const matched = requiredNames.length > 0
            ? requiredNames.includes(battleName)
            : (requiredName ? requiredName === battleName : isSiblingPairMatched(supportName, battleName));
        if (matched) {
            effectState.canUse = true;
            effectState.powerDelta = 20;
            effectState.resultNote = '战力+20';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    }
    case 'EMBLEM_ATTACK':
        effectState.canUse = true;
        effectState.powerDelta = 20;
        effectState.resultNote = '战力+20';
        break;
    case 'EMBLEM_DEFENSE':
        effectState.canUse = true;
        effectState.powerDelta = 20;
        effectState.resultNote = '战力+20';
        break;
    case 'EMBLEM_STRONG':
        effectState.canUse = true;
        effectState.powerDelta = 30;
        effectState.resultNote = '战力+30';
        break;
    case 'EMBLEM_COOP':
        if (!params.requireHasForce || String(battleUnit?.force || '').trim()) {
            effectState.canUse = true;
            effectState.powerDelta = 10;
            effectState.resultNote = '战力+10';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    case 'EMBLEM_LINK':
        if (params.requireNoForce) {
            if (!String(battleUnit?.force || '').trim()) {
                effectState.canUse = true;
                effectState.powerDelta = 10;
                effectState.resultNote = '战力+10';
            } else {
                effectState.note = '条件不满足';
            }
        } else if ((requiredForces && isAnyForceMatched(requiredForces, battleUnit?.force)) || forceMatched(requiredForce, battleUnit?.force)) {
            effectState.canUse = true;
            effectState.powerDelta = 10;
            effectState.resultNote = '战力+10';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    case 'EMBLEM_HERO':
        if (role === 'attacker' && defender.isMainCharacter && ((requiredForces && isAnyForceMatched(requiredForces, attacker?.force)) || forceMatched(requiredForce, attacker?.force))) {
            effectState.canUse = true;
            effectState.jewelBreakCount = 2;
            effectState.resultNote = '本次主人公击破改为破坏2个宝玉';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    case 'EMBLEM_LIGHT':
    case 'EMBLEM_HOPE':
        if (requiredForces && !isAnyForceMatched(requiredForces, attacker?.force)) {
            effectState.note = '条件不满足';
            break;
        }
        if (!requiredForces && requiredForce && !forceMatched(requiredForce, attacker?.force)) {
            effectState.note = '条件不满足';
            break;
        }
        effectState.canUse = true;
        effectState.sideEffectType = 'peek-own-jewel';
        effectState.resultNote = '查看1张己方宝玉';
        break;
    case 'EMBLEM_COURAGE':
    case 'EMBLEM_FATE':
        if ((requiredForces && isAnyForceMatched(requiredForces, attacker?.force)) || (!requiredForces && (!requiredForce || forceMatched(requiredForce, attacker?.force)))) {
            effectState.canUse = true;
            effectState.sideEffectType = 'draw-topdeck';
            effectState.resultNote = '抽1张卡，将1张手牌放回牌组顶';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    case 'EMBLEM_HOLY_BLOOD':
    case 'EMBLEM_DRAGON_BLOOD':
    case 'EMBLEM_DRAGON_SCALE':
        if ((owner?.bonds || []).length <= (opponent?.bonds || []).length && (owner?.hand || []).length > 0) {
            effectState.canUse = true;
            effectState.sideEffectType = 'hand-to-bond';
            effectState.resultNote = '将1张手牌置入羁绊区';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    case 'EMBLEM_MANAKETE':
        if (((requiredForces && isAnyForceMatched(requiredForces, attacker?.force)) || (!requiredForces && (!requiredForce || forceMatched(requiredForce, attacker?.force)))) && (owner?.hand || []).length > 0) {
            effectState.canUse = true;
            effectState.sideEffectType = 'hand-to-bond';
            effectState.resultNote = '将1张手牌置入羁绊区';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    case 'EMBLEM_PRAYER':
        effectState.canUse = true;
        effectState.lockAttackerCritical = true;
        effectState.resultNote = '本次战斗攻击方不能发动必杀';
        break;
    case 'EMBLEM_SEAL_CURSE':
        effectState.canUse = true;
        effectState.sideEffectType = 'seal-opponent-support';
        effectState.resultNote = '对手本次战斗支援能力无效';
        break;
    case 'EMBLEM_CERTAINTY':
        if (!defender?.isMainCharacter) {
            effectState.canUse = true;
            effectState.lockDefenderEvasion = true;
            effectState.resultNote = '本次战斗防御方不能回避';
        } else {
            effectState.note = '对主人公无效';
        }
        break;
    case 'EMBLEM_SKY':
    case 'EMBLEM_COMMAND': {
        const target = chooseAllyMoveTarget(owner, attacker, defender);
        if (target) {
            effectState.canUse = true;
            effectState.sideEffectType = 'move-ally';
            effectState.sideEffectTarget = target;
            effectState.resultNote = `${getCharaName(target.card)} ${target.from === 'front' ? '前卫' : '后卫'}->${target.to === 'front' ? '前卫' : '后卫'}`;
        } else {
            effectState.note = '无可移动目标';
        }
        break;
    }
    case 'EMBLEM_DANCE': {
        const target = chooseUntapTarget(owner, attacker);
        if (target) {
            effectState.canUse = true;
            effectState.sideEffectType = 'untap-ally';
            effectState.sideEffectTarget = target;
            effectState.resultNote = `${getCharaName(target)} 回正`;
        } else {
            effectState.note = '无可回正目标';
        }
        break;
    }
    case 'EMBLEM_STRATEGY': {
        const target = chooseEnemyMoveTarget(opponent, defender);
        if (target && forceMatched(requiredForce, attacker?.force)) {
            effectState.canUse = true;
            effectState.sideEffectType = 'move-enemy';
            effectState.sideEffectTarget = target;
            effectState.resultNote = `${getCharaName(target.card)} ${target.from === 'front' ? '前卫' : '后卫'}->${target.to === 'front' ? '前卫' : '后卫'}`;
        } else {
            effectState.note = '条件不满足';
        }
        break;
    }
    case 'EMBLEM_MAGIC':
        effectState.canUse = true;
        effectState.sideEffectType = 'draw-discard';
        effectState.resultNote = '抽1张卡，再弃置1张手牌';
        break;
    case 'EMBLEM_PROCUREMENT':
        if ((owner?.hand || []).length <= 4) {
            effectState.canUse = true;
            effectState.sideEffectType = 'draw-if-hand-4-or-less';
            effectState.resultNote = '手牌4以下，抽1张卡';
        } else {
            effectState.note = '条件不满足';
        }
        break;
    case 'EMBLEM_DARK': {
        if ((opponent?.hand || []).length >= 5) {
            const discardCard = chooseSupportDiscardCard(opponent, defender?.charaName || attacker?.charaName || '');
            if (discardCard) {
                effectState.canUse = true;
                effectState.sideEffectType = 'opponent-discard';
                effectState.sideEffectCard = discardCard;
                effectState.resultNote = `对手弃置${getCharaName(discardCard)}`;
            } else {
                effectState.note = '对手无可弃置手牌';
            }
        } else {
            effectState.note = '对手手牌不足5张';
        }
        break;
    }
    case 'EMBLEM_THIEF':
        if ((opponent?.drawPile || []).length > 0) {
            effectState.canUse = true;
            effectState.sideEffectType = 'opponent-mill-top-deck';
            effectState.resultNote = '将对手牌组顶置入退避区';
        } else {
            effectState.note = '对手无牌可处理';
        }
        break;
    case 'EMBLEM_PROPHECY':
        if ((owner?.drawPile || []).length > 0) {
            effectState.canUse = true;
            effectState.sideEffectType = 'peek-and-optional-mill-self-top';
            effectState.resultNote = '查看牌组顶，可选择置入退避区';
        } else {
            effectState.note = '无牌可查看';
        }
        break;
    case 'EMBLEM_DESPAIR': {
        const zombie = (owner?.graveyard || []).find(card => cardHasTrait(card, '尸兵')) || null;
        if (zombie) {
            effectState.canUse = true;
            effectState.sideEffectType = 'resurrect-zombie';
            effectState.sideEffectCard = zombie;
            effectState.resultNote = `将${getCharaName(zombie)}出击到前卫`; 
        } else {
            effectState.note = '无可出击尸兵';
        }
        break;
    }
    case 'EMBLEM_NINJUTSU':
        if ((owner?.hand || []).length > 0) {
            effectState.canUse = true;
            effectState.sideEffectType = 'self-discard';
            effectState.resultNote = '将1张手牌置入退避区';
        } else {
            effectState.note = '无手牌可处理';
        }
        break;
    case 'EMBLEM_SUPPORT':
        effectState.canUse = true;
        effectState.sideEffectType = 'post-battle-move-attacker';
        effectState.resultNote = '战斗结束后可移动攻击单位';
        break;
    case 'EMBLEM_PHANTOM':
        effectState.canUse = true;
        effectState.sideEffectType = 'post-battle-phantom-move';
        effectState.resultNote = '战斗结束后攻击单位向指定区域移动';
        break;
    case 'EMBLEM_RESISTANCE':
        effectState.canUse = true;
        effectState.sideEffectType = 'battle-end-stay';
        effectState.resultNote = '战斗结束后该单位留场';
        break;
    case 'EMBLEM_TRAINING':
        effectState.canUse = true;
        effectState.sideEffectType = 'break-to-hand';
        effectState.resultNote = '若击破防御单位则改为加入手牌';
        break;
    case 'EMBLEM_ENCOURAGE':
        effectState.canUse = true;
        effectState.sideEffectType = 'draw-on-break-main-character';
        effectState.resultNote = '若击破对方主人公，战斗后抽1张卡';
        break;
    default:
        effectState.note = 'AI未处理该支援能力';
        break;
    }

    return effectState;
}

function applySupportEffectState(snapshot, effectState, role, owner, opponent, attacker, defender) {
    if (!effectState?.used) return;

    if (effectState.powerDelta) {
        if (role === 'attacker') snapshot.attackerPower += effectState.powerDelta;
        else snapshot.defenderPower += effectState.powerDelta;
    }
    if (effectState.lockAttackerCritical) snapshot.attackerCriticalLocked = true;
    if (effectState.lockDefenderEvasion) snapshot.defenderEvasionLocked = true;
    if (effectState.jewelBreakCount > 1) {
        snapshot.jewelBreakCount = Math.max(snapshot.jewelBreakCount, effectState.jewelBreakCount);
    }

    if (effectState.sideEffectType === 'move-ally' && effectState.sideEffectTarget) {
        moveCardBetweenZones(owner, effectState.sideEffectTarget.from, effectState.sideEffectTarget.to, effectState.sideEffectTarget.card.instanceId);
    }
    if (effectState.sideEffectType === 'untap-ally' && effectState.sideEffectTarget) {
        effectState.sideEffectTarget.isTapped = false;
    }
    if (effectState.sideEffectType === 'move-enemy' && effectState.sideEffectTarget) {
        moveCardBetweenZones(opponent, effectState.sideEffectTarget.from, effectState.sideEffectTarget.to, effectState.sideEffectTarget.card.instanceId);
    }
    if (effectState.sideEffectType === 'draw-discard') {
        const drawnCard = drawOneRaw(owner);
        if (drawnCard) {
            owner.hand.push(drawnCard);
        }
        const discardCard = chooseSupportDiscardCard(owner, role === 'attacker' ? attacker?.charaName : defender?.charaName);
        if (discardCard) {
            const removed = removeFromArea(owner.hand, discardCard.instanceId);
            if (removed) {
                owner.graveyard.push(removed);
                effectState.resultNote = `抽1张卡，弃置${getCharaName(removed)}`;
            }
        } else if (drawnCard) {
            effectState.resultNote = `抽1张卡：${getCharaName(drawnCard)}`;
        }
    }
    if (effectState.sideEffectType === 'opponent-discard' && effectState.sideEffectCard) {
        const removed = removeFromArea(opponent.hand, effectState.sideEffectCard.instanceId);
        if (removed) {
            opponent.graveyard.push(removed);
            effectState.resultNote = `对手弃置${getCharaName(removed)}`;
        }
    }
    if (effectState.sideEffectType === 'draw-if-hand-4-or-less') {
        const drawnCard = drawOneRaw(owner);
        if (drawnCard) {
            owner.hand.push(drawnCard);
            effectState.resultNote = `抽1张卡：${getCharaName(drawnCard)}`;
        }
    }
    if (effectState.sideEffectType === 'draw-topdeck') {
        const drawnCard = drawOneRaw(owner);
        if (drawnCard) {
            owner.hand.push(drawnCard);
        }
        const topdeckCard = chooseSupportDiscardCard(owner, role === 'attacker' ? attacker?.charaName : defender?.charaName);
        if (topdeckCard) {
            const removed = removeFromArea(owner.hand, topdeckCard.instanceId);
            if (removed) {
                owner.drawPile.push(removed);
                effectState.resultNote = `抽1张卡，将${getCharaName(removed)}放回牌组顶`;
            }
        }
    }
    if (effectState.sideEffectType === 'hand-to-bond') {
        const candidate = chooseBondCandidateFromHand(owner, role === 'attacker' ? attacker?.charaName : defender?.charaName);
        if (candidate) {
            const removed = removeFromArea(owner.hand, candidate.instanceId);
            if (removed) {
                owner.bonds.push(removed);
                effectState.resultNote = `${getCharaName(removed)} 置入羁绊区`;
            }
        }
    }
    if (effectState.sideEffectType === 'opponent-mill-top-deck') {
        const removed = drawOneRaw(opponent);
        if (removed) {
            opponent.graveyard.push(removed);
            effectState.resultNote = `对手牌组顶${getCharaName(removed)}置入退避区`;
        }
    }
    if (effectState.sideEffectType === 'peek-and-optional-mill-self-top') {
        const topCard = owner.drawPile[owner.drawPile.length - 1] || null;
        if (topCard && toInt(topCard.cost, 0) <= 2) {
            const removed = drawOneRaw(owner);
            if (removed) {
                owner.graveyard.push(removed);
                effectState.resultNote = `查看后将${getCharaName(removed)}置入退避区`;
            }
        }
    }
    if (effectState.sideEffectType === 'resurrect-zombie' && effectState.sideEffectCard) {
        const removed = removeFromArea(owner.graveyard, effectState.sideEffectCard.instanceId);
        if (removed) {
            owner.front.push(removed);
            effectState.resultNote = `${getCharaName(removed)} 出击到前卫`;
        }
    }
    if (effectState.sideEffectType === 'self-discard') {
        const discardCard = chooseSupportDiscardCard(owner, role === 'attacker' ? attacker?.charaName : defender?.charaName);
        if (discardCard) {
            const removed = removeFromArea(owner.hand, discardCard.instanceId);
            if (removed) {
                owner.graveyard.push(removed);
                effectState.resultNote = `${getCharaName(removed)} 置入退避区`;
            }
        }
    }
}

function formatSupportEffectDecision(owner, effectState) {
    if (!effectState?.effectName) return '';

    const powerOnlyEmblems = new Set(['EMBLEM_ATTACK', 'EMBLEM_DEFENSE', 'EMBLEM_STRONG', 'EMBLEM_COOP', 'EMBLEM_LINK', 'EMBLEM_SIBLING']);
    if (powerOnlyEmblems.has(effectState.effectId)) {
        return '';
    }

    if (!effectState.canUse) {
        return '';
    }
    if (!effectState.used) {
        return `${owner.seatName} 放弃发动${effectState.effectName}${effectState.decisionReason ? `（${effectState.decisionReason}）` : ''}`;
    }
    return `${owner.seatName} 使用${effectState.effectName}${effectState.resultNote ? `，${effectState.resultNote}` : ''}`;
}

function serializeSupportEffectState(effectState) {
    if (!effectState) return null;
    const target = effectState.sideEffectTarget || null;
    const card = target?.card || effectState.sideEffectCard || null;
    return {
        effectId: effectState.effectId || null,
        effectName: effectState.effectName || null,
        canUse: !!effectState.canUse,
        used: !!effectState.used,
        powerDelta: toInt(effectState.powerDelta, 0),
        lockAttackerCritical: !!effectState.lockAttackerCritical,
        lockDefenderEvasion: !!effectState.lockDefenderEvasion,
        jewelBreakCount: toInt(effectState.jewelBreakCount, 1),
        sideEffectType: effectState.sideEffectType || null,
        sideEffectTarget: target
            ? {
                cardId: String(target.card?.id || '').trim() || null,
                instanceId: String(target.card?.instanceId || '').trim() || null,
                charaName: getCharaName(target.card),
                from: target.from || null,
                to: target.to || null
            }
            : null,
        sideEffectCard: card && !target
            ? {
                cardId: String(card.id || '').trim() || null,
                instanceId: String(card.instanceId || '').trim() || null,
                charaName: getCharaName(card)
            }
            : null,
        decisionReason: effectState.decisionReason || null,
        note: effectState.note || null,
        resultNote: effectState.resultNote || null
    };
}

function runBattle({ attackerOwner, defenderOwner, attacker, defender, logger }) {
    const snapshot = buildBattleSnapshot({ attackerOwner, defenderOwner, attacker, defender });

    if (snapshot.attackerSupport) attackerOwner.graveyard.push(snapshot.attackerSupport);
    if (snapshot.defenderSupport) defenderOwner.graveyard.push(snapshot.defenderSupport);

    const attackerSupportDetail = buildSupportDetail(snapshot.attackerSupport, snapshot.attackerSupportFailed);
    const defenderSupportDetail = buildSupportDetail(snapshot.defenderSupport, snapshot.defenderSupportFailed);

    const attackerSupportEffectState = buildSupportEffectState({
        supportCard: snapshot.attackerSupport,
        role: 'attacker',
        owner: attackerOwner,
        opponent: defenderOwner,
        attacker,
        defender,
        supportFailed: snapshot.attackerSupportFailed
    });
    const defenderSupportEffectState = buildSupportEffectState({
        supportCard: snapshot.defenderSupport,
        role: 'defender',
        owner: defenderOwner,
        opponent: attackerOwner,
        attacker,
        defender,
        supportFailed: snapshot.defenderSupportFailed
    });

    const attackerWouldWinNow = snapshot.attackerPower >= snapshot.defenderPower;
    const attackerWouldWinIfUse = (snapshot.attackerPower + toInt(attackerSupportEffectState.powerDelta, 0)) >= snapshot.defenderPower;
    const defenderSurvivesNow = snapshot.attackerPower < snapshot.defenderPower;
    const defenderSurvivesIfUse = snapshot.attackerPower < (snapshot.defenderPower + toInt(defenderSupportEffectState.powerDelta, 0));

    const attackerSupportDecision = shouldUseSupportEffect(attackerOwner, {
        ...attackerSupportEffectState,
        role: 'attacker',
        attackerPower: snapshot.attackerPower,
        defenderPower: snapshot.defenderPower,
        ownerHandCount: attackerOwner.hand.length,
        opponentHandCount: defenderOwner.hand.length,
        attackerWouldWinNow,
        attackerWouldWinIfUse,
        defenderSurvivesNow,
        defenderSurvivesIfUse,
        defenderIsMainCharacter: !!defender.isMainCharacter,
        defenderJewels: defenderOwner.jewels.length
    });
    attackerSupportEffectState.used = typeof attackerSupportDecision === 'object'
        ? !!attackerSupportDecision.use
        : !!attackerSupportDecision;
    attackerSupportEffectState.decisionReason = typeof attackerSupportDecision === 'object'
        ? String(attackerSupportDecision.reason || '').trim() || null
        : null;

    if (attackerSupportEffectState.used && attackerSupportEffectState.sideEffectType === 'seal-opponent-support') {
        defenderSupportEffectState.canUse = false;
        defenderSupportEffectState.used = false;
        defenderSupportEffectState.note = '被封咒无效';
        defenderSupportEffectState.decisionReason = null;
    }

    const defenderSupportDecision = shouldUseSupportEffect(defenderOwner, {
        ...defenderSupportEffectState,
        role: 'defender',
        attackerPower: snapshot.attackerPower,
        defenderPower: snapshot.defenderPower,
        ownerHandCount: defenderOwner.hand.length,
        opponentHandCount: attackerOwner.hand.length,
        attackerWouldWinNow,
        attackerWouldWinIfUse,
        defenderSurvivesNow,
        defenderSurvivesIfUse,
        defenderIsMainCharacter: !!defender.isMainCharacter,
        defenderJewels: defenderOwner.jewels.length
    });
    defenderSupportEffectState.used = typeof defenderSupportDecision === 'object'
        ? !!defenderSupportDecision.use
        : !!defenderSupportDecision;
    defenderSupportEffectState.decisionReason = typeof defenderSupportDecision === 'object'
        ? String(defenderSupportDecision.reason || '').trim() || null
        : null;

    applySupportEffectState(snapshot, attackerSupportEffectState, 'attacker', attackerOwner, defenderOwner, attacker, defender);
    applySupportEffectState(snapshot, defenderSupportEffectState, 'defender', defenderOwner, attackerOwner, attacker, defender);

    const baseAttackerWins = snapshot.attackerPower >= snapshot.defenderPower;
    const criticalPower = snapshot.attackerPower * 2;
    const criticalWouldWin = criticalPower >= snapshot.defenderPower;

    let finalAttackerWins = baseAttackerWins;
    let usedCritical = false;
    let usedEvasion = false;

    if (!baseAttackerWins && criticalWouldWin && !snapshot.attackerCriticalLocked) {
        const canCritical = hasSkillCostCard(attackerOwner, attacker.charaName);
        const canLethalNow = !!defender.isMainCharacter && defenderOwner.jewels.length <= snapshot.jewelBreakCount;
        const useCritical = attackerOwner.profile.shouldUseCritical({
            canPay: canCritical,
            canLethalNow,
            criticalWouldWin,
            defenderIsMainCharacter: !!defender.isMainCharacter,
            defenderJewels: defenderOwner.jewels.length,
            handCount: attackerOwner.hand.length,
            attackerCriticalLocked: snapshot.attackerCriticalLocked
        });

        if (useCritical && paySkillCostCard(attackerOwner, attacker.charaName)) {
            finalAttackerWins = true;
            usedCritical = true;
        }
    }

    if (finalAttackerWins && !snapshot.defenderEvasionLocked) {
        const canEvade = hasSkillCostCard(defenderOwner, defender.charaName);
        const useEvasion = defenderOwner.profile.shouldUseEvasion({
            canPay: canEvade,
            defenderIsMainCharacter: !!defender.isMainCharacter,
            defenderJewels: defenderOwner.jewels.length,
            wouldLoseWithoutEvasion: true,
            handCount: defenderOwner.hand.length,
            defenderEvasionLocked: snapshot.defenderEvasionLocked
        });
        if (useEvasion && paySkillCostCard(defenderOwner, defender.charaName)) {
            finalAttackerWins = false;
            usedEvasion = true;
        }
    }

    const attackerBaseAttack = toInt(attacker.attack, 0);
    const defenderBaseAttack = toInt(defender.attack, 0);
    const attackerPowerDelta = attackerSupportEffectState.used ? attackerSupportEffectState.powerDelta : 0;
    const defenderPowerDelta = defenderSupportEffectState.used ? defenderSupportEffectState.powerDelta : 0;
    const attackerBattlePowerText = formatBattlePowerText(attackerBaseAttack, attackerPowerDelta, attackerSupportDetail);
    const defenderBattlePowerText = formatBattlePowerText(defenderBaseAttack, defenderPowerDelta, defenderSupportDetail);

    logger(
        `战斗: ${getCharaName(attacker)}(${attackerBattlePowerText}) + ${formatSupportText(attackerSupportDetail, attackerSupportEffectState)} 总:${snapshot.attackerPower} VS ${getCharaName(defender)}(${defenderBattlePowerText}) + ${formatSupportText(defenderSupportDetail, defenderSupportEffectState)} 总:${snapshot.defenderPower}`,
        'battle-preview',
        {
            attacker: serializeReplayPatchCard(attacker),
            defender: serializeReplayPatchCard(defender),
            attackerSupportCard: serializeReplayPatchCard(snapshot.attackerSupport),
            defenderSupportCard: serializeReplayPatchCard(snapshot.defenderSupport),
            attackerSeat: attackerOwner.seatName,
            defenderSeat: defenderOwner.seatName,
            attackerSupport: attackerSupportDetail,
            defenderSupport: defenderSupportDetail,
            attackerPower: snapshot.attackerPower,
            defenderPower: snapshot.defenderPower,
            attackerSupportEffect: serializeSupportEffectState(attackerSupportEffectState),
            defenderSupportEffect: serializeSupportEffectState(defenderSupportEffectState)
        }
    );

    const supportEffectLogs = [
        formatSupportEffectDecision(attackerOwner, attackerSupportEffectState),
        formatSupportEffectDecision(defenderOwner, defenderSupportEffectState)
    ].filter(Boolean);
    if (supportEffectLogs.length > 0) {
        logger(
            `支援能力: ${supportEffectLogs.join(' | ')}`,
            'battle-support-effect',
            {
                attackerSupportEffect: serializeSupportEffectState(attackerSupportEffectState),
                defenderSupportEffect: serializeSupportEffectState(defenderSupportEffectState)
            }
        );
    }

    let resultReason = '';
    if (baseAttackerWins !== finalAttackerWins) {
        if (usedEvasion && !finalAttackerWins) {
            resultReason = '因防御方使用回避';
        } else if (usedCritical && finalAttackerWins) {
            resultReason = '因攻击方使用必杀';
        }
    }

    logger(
        `战斗结果: ${resultReason ? `${resultReason} ` : ''}${finalAttackerWins ? '攻击方胜' : '防御方存活'}`,
        'battle-result',
        {
            attacker: serializeReplayPatchCard(attacker),
            defender: serializeReplayPatchCard(defender),
            attackerSupportCard: serializeReplayPatchCard(snapshot.attackerSupport),
            defenderSupportCard: serializeReplayPatchCard(snapshot.defenderSupport),
            attackerSeat: attackerOwner.seatName,
            defenderSeat: defenderOwner.seatName,
            attackerSupport: attackerSupportDetail,
            defenderSupport: defenderSupportDetail,
            attackerPower: snapshot.attackerPower,
            defenderPower: snapshot.defenderPower,
            finalAttackerWins
        }
    );

    if (!finalAttackerWins) {
        return { winner: null };
    }

    if (defender.isMainCharacter) {
        const mcResult = handleMainCharacterBreak(defenderOwner, snapshot.jewelBreakCount, logger);

        if (attackerSupportEffectState.used && attackerSupportEffectState.sideEffectType === 'draw-on-break-main-character') {
            const drawnCard = drawOneRaw(attackerOwner);
            if (drawnCard) {
                attackerOwner.hand.push(drawnCard);
                logger(`${attackerOwner.seatName} 激励之纹章：击破主人公后抽1张卡（${getCharaName(drawnCard)}）`, 'battle-support-effect');
            }
        }

        if (attackerSupportEffectState.used && (attackerSupportEffectState.sideEffectType === 'post-battle-move-attacker' || attackerSupportEffectState.sideEffectType === 'post-battle-phantom-move')) {
            const move = chooseAttackerPostBattleMove(attackerOwner, attacker);
            if (move) {
                const moved = moveCardBetweenZones(attackerOwner, move.from, move.to, attacker.instanceId);
                if (moved) {
                    logger(`${attackerOwner.seatName} ${attackerSupportEffectState.effectName || '援护'}：战斗后移动${getCharaName(moved)} ${move.from === 'front' ? '前卫' : '后卫'}->${move.to === 'front' ? '前卫' : '后卫'}`, 'battle-support-effect');
                }
            }
        }

        return { winner: mcResult.gameOver ? attackerOwner.seatName : null };
    }

    if (defenderSupportEffectState.used && defenderSupportEffectState.sideEffectType === 'battle-end-stay') {
        logger(`${defenderOwner.seatName} 抵抗之纹章：防御单位留场`, 'battle-support-effect');
        return { winner: null };
    }

    if (attackerSupportEffectState.used && attackerSupportEffectState.sideEffectType === 'break-to-hand') {
        const fromFront = removeFromArea(defenderOwner.front, defender.instanceId);
        const unit = fromFront || removeFromArea(defenderOwner.rear, defender.instanceId);
        if (unit) {
            defenderOwner.hand.push(unit);
            if (Array.isArray(unit._stackedCards) && unit._stackedCards.length > 0) {
                defenderOwner.hand.push(...unit._stackedCards);
                unit._stackedCards = [];
            }
            logger(`${attackerOwner.seatName} 锻炼之纹章：${defenderOwner.seatName} ${getCharaName(unit)} 改为加入手牌`, 'battle-support-effect');
            autoMarch(defenderOwner);
            if (attackerSupportEffectState.used && (attackerSupportEffectState.sideEffectType === 'post-battle-move-attacker' || attackerSupportEffectState.sideEffectType === 'post-battle-phantom-move')) {
                const move = chooseAttackerPostBattleMove(attackerOwner, attacker);
                if (move) {
                    const moved = moveCardBetweenZones(attackerOwner, move.from, move.to, attacker.instanceId);
                    if (moved) {
                        logger(`${attackerOwner.seatName} ${attackerSupportEffectState.effectName || '援护'}：战斗后移动${getCharaName(moved)} ${move.from === 'front' ? '前卫' : '后卫'}->${move.to === 'front' ? '前卫' : '后卫'}`, 'battle-support-effect');
                    }
                }
            }
            return { winner: null };
        }
    }

    breakDefenderUnit(defenderOwner, defender, logger);
    autoMarch(defenderOwner);

    if (attackerSupportEffectState.used && (attackerSupportEffectState.sideEffectType === 'post-battle-move-attacker' || attackerSupportEffectState.sideEffectType === 'post-battle-phantom-move')) {
        const move = chooseAttackerPostBattleMove(attackerOwner, attacker);
        if (move) {
            const moved = moveCardBetweenZones(attackerOwner, move.from, move.to, attacker.instanceId);
            if (moved) {
                logger(`${attackerOwner.seatName} ${attackerSupportEffectState.effectName || '援护'}：战斗后移动${getCharaName(moved)} ${move.from === 'front' ? '前卫' : '后卫'}->${move.to === 'front' ? '前卫' : '后卫'}`, 'battle-support-effect');
            }
        }
    }

    return { winner: null };
}

function calculateTieBreaker(player) {
    const boardAttack = [...player.front, ...player.rear].reduce((sum, card) => sum + toInt(card.attack, 0), 0);
    return player.jewels.length * 1000 + player.hand.length * 30 + boardAttack;
}

function runSingleGame({ playerA, playerB, maxTurns, logger }) {
    const players = [playerA, playerB];
    let turn = 1;
    let currentActiveSeat = null;
    let seq = 0;
    const timeline = [];
    const initialSnapshot = createReplaySnapshot({ playerA, playerB, activeSeat: currentActiveSeat, turn });
    let previousSnapshot = initialSnapshot;

    const recordEvent = (line, tag = 'info', extra = {}) => {
        const lineWithTurn = `[T${turn}] ${line}`;
        logger(lineWithTurn);

        const nextSnapshot = createReplaySnapshot({ playerA, playerB, activeSeat: currentActiveSeat, turn });
        const replayPatch = buildReplayPatch(previousSnapshot, nextSnapshot);
        previousSnapshot = nextSnapshot;

        seq += 1;
        timeline.push({
            seq,
            tag,
            line: lineWithTurn,
            ts: Date.now(),
            turn,
            turnLabel: `T${turn}`,
            activeSeat: currentActiveSeat,
            extra: {
                ...(extra || {}),
                ...(replayPatch ? { replayPatch } : {})
            }
        });
    };

    recordEvent('对局初始化完成', 'setup');

    while (turn <= maxTurns) {
        const active = players[(turn - 1) % 2];
        const passive = players[turn % 2];
        active.turnIndex += 1;
        currentActiveSeat = active.seatName;

        for (const unit of [...active.front, ...active.rear]) {
            unit.isTapped = false;
        }
        recordEvent(`${active.seatName} 全体回正`, 'untap');

        if (!(turn === 1)) {
            const drawn = drawToHand(active, 1);
            if (drawn > 0) {
                const lastCard = active.hand[active.hand.length - 1] || null;
                recordEvent(`${active.seatName} 回合抽牌: ${cardBrief(lastCard)}`, 'draw');
            } else {
                recordEvent(`${active.seatName} 回合抽牌失败（无牌可抽）`, 'draw');
            }
        }

        recordEvent(`${active.seatName} 回合开始 | 手牌${active.hand.length} 羁绊${active.bonds.length} 前${active.front.length} 后${active.rear.length}`, 'turn-start');

        let moved = autoMarch(active);
        if (moved.length > 0) {
            recordEvent(`${active.seatName} 自动进军: ${moved.map(c => getCharaName(c)).join(', ')}`, 'march');
        }
        moved = autoMarch(passive);
        if (moved.length > 0) {
            recordEvent(`${passive.seatName} 自动进军: ${moved.map(c => getCharaName(c)).join(', ')}`, 'march');
        }
        applyBondPhase(active, (line) => recordEvent(line, 'bond'));
        applyDeployPhase(active, (line) => recordEvent(line, 'deploy'));

        const isFirstPlayerOpeningTurn = turn === 1;
        if (isFirstPlayerOpeningTurn) {
            recordEvent(`${active.seatName} 先攻首回合不能攻击`, 'attack-skip');
        } else {
            const attackers = active.profile.chooseAttackers({ player: active, opponent: passive });
            for (const attacker of attackers) {
                if (attacker.isTapped) continue;
                const moved = autoMarch(passive);
                if (moved.length > 0) {
                    recordEvent(`${passive.seatName} 自动进军: ${moved.map(c => getCharaName(c)).join(', ')}`, 'march');
                }
                const legalTargets = collectLegalTargets(active, passive, attacker);
                if (!legalTargets.length) {
                    recordEvent(`${active.seatName} 无合法攻击目标: ${getCharaName(attacker)}(射程${normalizeRange(attacker.range)})`, 'attack-skip');
                    continue;
                }
                const defender = active.profile.chooseTarget({ attacker, opponent: passive, player: active, legalTargets }) || null;
                if (!defender) continue;
                if (!canAttackTargetByRangeInAI(active, passive, attacker, defender)) {
                    recordEvent(`${active.seatName} 非法目标被拦截: ${getCharaName(attacker)} -> ${getCharaName(defender)}`, 'attack-skip');
                    continue;
                }
                attacker.isTapped = true;
                recordEvent(
                    `${active.seatName} 宣言攻击: ${getCharaName(attacker)} -> ${passive.seatName} ${getCharaName(defender)}`,
                    'attack-declare',
                    {
                        attacker: serializeReplayPatchCard(attacker),
                        defender: serializeReplayPatchCard(defender),
                        attackerSeat: active.seatName,
                        defenderSeat: passive.seatName
                    }
                );
                const battleResult = runBattle({
                    attackerOwner: active,
                    defenderOwner: passive,
                    attacker,
                    defender,
                    logger: (line, tag = 'battle', extra = {}) => recordEvent(line, tag, extra)
                });
                if (battleResult.winner) {
                    recordEvent(`对局结束: ${battleResult.winner} 获胜（主人公击破）`, 'game-end');
                    return { winner: battleResult.winner, reason: 'main-character-break', turn, timeline, initialSnapshot };
                }
            }
        }

        moved = autoMarch(active);
        if (moved.length > 0) {
            recordEvent(`${active.seatName} 自动进军: ${moved.map(c => getCharaName(c)).join(', ')}`, 'march');
        }
        moved = autoMarch(passive);
        if (moved.length > 0) {
            recordEvent(`${passive.seatName} 自动进军: ${moved.map(c => getCharaName(c)).join(', ')}`, 'march');
        }
        recordEvent(`${active.seatName} 回合结束`, 'turn-end');
        turn += 1;
    }

    const scoreA = calculateTieBreaker(playerA);
    const scoreB = calculateTieBreaker(playerB);
    if (scoreA === scoreB) {
        recordEvent(`对局结束: 回合上限平局（${scoreA} : ${scoreB}）`, 'game-end');
        return { winner: 'draw', reason: 'turn-limit', turn: maxTurns, timeline, initialSnapshot };
    }
    const winner = scoreA > scoreB ? playerA.seatName : playerB.seatName;
    recordEvent(`对局结束: ${winner} 胜利（回合上限比分 ${scoreA}:${scoreB}）`, 'game-end');
    return {
        winner,
        reason: 'turn-limit-score',
        turn: maxTurns,
        timeline,
        initialSnapshot
    };
}

function runAIDuel(options) {
    const {
        deckA,
        deckB,
        profileA,
        profileB,
        expandedA,
        expandedB,
        games = 20,
        maxTurns = 40,
        verbose = false
    } = options;

    const seatAName = profileA.label || '玩家A';
    const seatBName = profileB.label || '玩家B';

    const stats = {
        totalGames: games,
        wins: {
            // 使用AI策略名作为key，避免卡组名重复导致统计错误
            [seatAName]: 0,
            [seatBName]: 0,
            // 保留deckName用于向后兼容或特殊场景
            _deckNameA: deckA.name,
            _deckNameB: deckB.name,
            draw: 0
        },
        details: []
    };

    for (let i = 0; i < games; i++) {
        const logs = [];
        const logger = (line) => {
            if (verbose) logs.push(line);
        };

        const playerA = setupPlayer({ deckDef: deckA, expandedCards: expandedA, profile: profileA, seatName: seatAName });
        const playerB = setupPlayer({ deckDef: deckB, expandedCards: expandedB, profile: profileB, seatName: seatBName });

        const result = runSingleGame({ playerA, playerB, maxTurns, logger });
        const winner = result.winner;

        if (winner === playerA.seatName) {
            stats.wins[seatAName] += 1;
        } else if (winner === playerB.seatName) {
            stats.wins[seatBName] += 1;
        } else {
            stats.wins.draw += 1;
        }

        const gameDetail = {
            game: i + 1,
            winner,
            reason: result.reason,
            turn: result.turn,
            timeline: result.timeline || [],
            initialSnapshot: result.initialSnapshot || null
        };

        // 只在 verbose 模式下包含 logs
        if (verbose) gameDetail.logs = logs;

        stats.details.push(gameDetail);
    }

    return stats;
}

module.exports = {
    runAIDuel
};
