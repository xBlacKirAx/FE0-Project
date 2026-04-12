// 房间对战：生成与 AI 回放兼容的 initialSnapshot + timeline（replayPatch）。

import {
    buildReplayPatch,
    serializeCardForSnapshot,
    serializeReplayPatchCard
} from './replayPatchCore.js';

let sessionCtx = null;
let getStateFn = null;
let digestTimer = null;
const pendingSocketBatch = [];

export function bindRoomReplayState(getter) {
    getStateFn = typeof getter === 'function' ? getter : null;
}

function getState() {
    return getStateFn ? getStateFn() : null;
}

function deepClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch {
        return null;
    }
}

function serializeSeatState(st) {
    const hand = Array.isArray(st.hand) ? st.hand : [];
    const drawPile = Array.isArray(st.drawPile) ? st.drawPile : [];
    return {
        hand: hand.map(serializeCardForSnapshot).filter(Boolean),
        front: (st.front || []).map(serializeCardForSnapshot).filter(Boolean),
        rear: (st.rear || []).map(serializeCardForSnapshot).filter(Boolean),
        bonds: (st.bonds || []).map(serializeCardForSnapshot).filter(Boolean),
        jewels: (st.jewels || []).map(serializeCardForSnapshot).filter(Boolean),
        graveyard: (st.graveyard || []).map(serializeCardForSnapshot).filter(Boolean),
        drawPile: drawPile.map(serializeCardForSnapshot).filter(Boolean),
        handCount: hand.length,
        drawPileCount: drawPile.length,
        bondsCount: (st.bonds || []).length,
        jewelsCount: (st.jewels || []).length,
        graveyardCount: (st.graveyard || []).length
    };
}

export function buildLiveReplaySnapshot(rawState) {
    if (!sessionCtx || !rawState) return null;

    const seatAState = serializeSeatState({
        hand: rawState.hand?.value,
        front: rawState.fieldFront?.value,
        rear: rawState.fieldRear?.value,
        bonds: rawState.bonds?.value,
        jewels: rawState.jewels?.value,
        graveyard: rawState.graveyard?.value,
        drawPile: rawState.deck?.value
    });

    const seatBState = serializeSeatState({
        hand: rawState.oppHand?.value,
        front: rawState.opponentFront?.value,
        rear: rawState.opponentRear?.value,
        bonds: rawState.oppBonds?.value,
        jewels: rawState.oppJewels?.value,
        graveyard: rawState.oppGraveyard?.value,
        drawPile: rawState.oppDeck?.value
    });

    const activeSeat = rawState.isMyTurn?.value ? sessionCtx.seatAName : sessionCtx.seatBName;

    return {
        turn: sessionCtx.turnCounter,
        activeSeat,
        currentPhase: String(rawState.currentPhase?.value || ''),
        seatA: sessionCtx.seatAName,
        seatB: sessionCtx.seatBName,
        seatAState,
        seatBState
    };
}

function ensureInitialSnapshot(rawState) {
    if (!sessionCtx || sessionCtx.initialCaptured) return;
    const mulliganDone = String(rawState.mulliganState?.value || '') === 'done';
    const oppMulliganDone = String(rawState.opponentMulliganState?.value || '') === 'done';
    if (!mulliganDone || !oppMulliganDone) return;

    const snap = buildLiveReplaySnapshot(rawState);
    if (!snap) return;
    sessionCtx.initialSnapshot = deepClone(snap);
    sessionCtx.previousSnapshot = deepClone(snap);
    sessionCtx.initialCaptured = true;

    sessionCtx.timeline.push({
        seq: (sessionCtx.seq += 1),
        tag: 'setup',
        line: `[T${sessionCtx.turnCounter}] 对局就绪（调度完成）`,
        turn: sessionCtx.turnCounter,
        turnLabel: `T${sessionCtx.turnCounter}`,
        activeSeat: snap.activeSeat,
        extra: {}
    });
}

function cardLine(c) {
    if (!c) return '';
    return String(c.cardName || c.name || c.id || '').trim() || String(c.id || '');
}

function formatSocketLine(evt, data) {
    const d = data && typeof data === 'object' ? data : {};
    switch (evt) {
        case 'sync-card-move':
            return `移动 ${cardLine(d.card)}：${d.from || '?'} → ${d.to || '?'}`;
        case 'player-draw':
            return `抽牌 ${cardLine(d.card)}`;
        case 'play-to-field':
            return `出击 ${cardLine(d.card)} → ${d.area || d.to || '场地'}`;
        case 'play-to-bond':
            return `放置羁绊 ${cardLine(d.card)}`;
        case 'return-to-hand':
            return `返回手牌 ${cardLine(d.card)}`;
        case 'sync-bond-flip':
            return `羁绊翻面 ${String(d.instanceId || '').slice(-6)}`;
        case 'sync-attack':
            return `战斗 ${cardLine(d.attacker)} → ${cardLine(d.defender)}`;
        case 'opponent-attack':
            return `战斗 ${cardLine(d.attacker)} → ${cardLine(d.defender)}`;
        case 'sync-defense-support':
            return `防御支援 ${cardLine(d.supportCard)}`;
        case 'opponent-defense-support':
            return `防御支援 ${cardLine(d.supportCard)}`;
        case 'sync-combat-decision':
            return '战斗抉择';
        case 'opponent-combat-decision':
            return '对手战斗抉择';
        case 'sync-phase':
            return `阶段 ${d.phaseName || d.phase || ''}`;
        case 'turn-end':
            return '结束回合';
        case 'opponent-turn-end':
            return '对手结束回合';
        case 'sync-untap-all':
        case 'opponent-untap-all':
            return '重置行动（竖置）';
        case 'sync-card-untap':
        case 'opponent-card-untap':
            return `竖置单位 ${String(d.instanceId || '').slice(-6)}`;
        case 'full-state-sync':
            return '全量同步';
        case 'mulligan-decision':
            return '调度确认';
        case 'opponent-mulligan-decision':
            return '对手调度';
        case 'sync-support-interaction-request':
        case 'opponent-support-interaction-request':
            return '支援交互请求';
        case 'sync-support-interaction-resolve':
        case 'opponent-support-interaction-resolve':
            return '支援交互结算';
        case 'sync-combat-support-emblem-choice':
        case 'opponent-combat-support-emblem-choice':
            return '纹章抉择';
        default:
            return String(evt || '同步');
    }
}

export function startRoomReplayTimelineSession(meta = {}) {
    sessionCtx = {
        roomId: String(meta.roomId || ''),
        seatAName: String(meta.seatAName || '我方').slice(0, 24),
        seatBName: String(meta.seatBName || '对手').slice(0, 24),
        turnCounter: 1,
        seq: 0,
        timeline: [],
        initialSnapshot: null,
        previousSnapshot: null,
        initialCaptured: false
    };
}

export function clearRoomReplayTimelineSession() {
    sessionCtx = null;
    digestTimer = null;
    pendingSocketBatch.length = 0;
}

export function isRoomReplayTimelineActive() {
    return !!sessionCtx;
}

export function hasRoomReplayInitialCapture() {
    return !!(sessionCtx && sessionCtx.initialCaptured);
}

export function canExportRoomReplay() {
    return !!(sessionCtx && sessionCtx.initialCaptured && sessionCtx.timeline && sessionCtx.timeline.length > 0);
}

export function scheduleRoomReplayDigestFromSocket(evt, data) {
    if (!sessionCtx) return;
    const st = getState();
    if (!st) return;
    ensureInitialSnapshot(st);
    if (!sessionCtx.initialCaptured) return;

    pendingSocketBatch.push({ evt, data });

    if (digestTimer) return;
    digestTimer = true;
    queueMicrotask(() => {
        digestTimer = false;
        if (!sessionCtx) return;
        const batch = pendingSocketBatch.splice(0, pendingSocketBatch.length);
        if (!batch.length) return;
        const rawState = getState();
        if (!rawState) return;

        for (const item of batch) {
            const { evt: ev, data: d } = item;
            const lineHint = formatSocketLine(ev, d);
            let tag = 'net';
            let extra = {};
            if (ev === 'opponent-attack' || ev === 'sync-attack') {
                tag = 'attack-declare';
                extra = {
                    attacker: serializeReplayPatchCard(d?.attacker || rawState.attacker?.value),
                    defender: serializeReplayPatchCard(d?.defender || rawState.defender?.value),
                    attackerSupportCard: serializeReplayPatchCard(
                        d?.supportCard || (ev === 'sync-attack' ? rawState.mySupportCard?.value : null)
                    ),
                    defenderSupportCard: serializeReplayPatchCard(rawState.oppSupportCard?.value)
                };
            }
            flushRoomReplayStep(rawState, lineHint, tag, extra, ev);
        }
    });
}

export function flushRoomReplayAbilityStep(rawState, line) {
    if (!sessionCtx || !sessionCtx.initialCaptured || !rawState) return;
    flushRoomReplayStep(rawState, line, 'ability', {}, null);
}

function flushRoomReplayStep(rawState, line, tag, extra = {}, sourceEvt = null) {
    if (!sessionCtx) return;
    ensureInitialSnapshot(rawState);
    if (!sessionCtx.initialCaptured) return;

    const lineTurn = sessionCtx.turnCounter;
    const shouldBumpTurn = sourceEvt === 'turn-end' || sourceEvt === 'opponent-turn-end';

    const nextSnapshot = buildLiveReplaySnapshot(rawState);
    if (!nextSnapshot) return;

    const replayPatch = buildReplayPatch(sessionCtx.previousSnapshot, nextSnapshot);
    sessionCtx.previousSnapshot = deepClone(nextSnapshot);
    if (shouldBumpTurn) {
        sessionCtx.turnCounter += 1;
    }

    const mergedExtra = { ...(extra || {}) };
    if (replayPatch) mergedExtra.replayPatch = replayPatch;

    sessionCtx.timeline.push({
        seq: (sessionCtx.seq += 1),
        tag: tag || 'info',
        line: `[T${lineTurn}] ${line}`,
        turn: lineTurn,
        turnLabel: `T${lineTurn}`,
        activeSeat: nextSnapshot.activeSeat,
        extra: mergedExtra
    });
}

export function buildRoomReplayGameForExport() {
    if (!sessionCtx || !sessionCtx.initialCaptured || !sessionCtx.initialSnapshot) {
        return null;
    }
    return {
        winner: null,
        reason: 'room-saved',
        initialSnapshot: sessionCtx.initialSnapshot,
        timeline: sessionCtx.timeline
    };
}
