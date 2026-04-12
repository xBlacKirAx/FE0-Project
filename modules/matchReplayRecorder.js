// 房间对战录像：生成与 AI 回放相同结构的 games[].initialSnapshot + timeline[].extra.replayPatch

import {
    bindRoomReplayState,
    buildRoomReplayGameForExport,
    canExportRoomReplay,
    clearRoomReplayTimelineSession,
    isRoomReplayTimelineActive,
    scheduleRoomReplayDigestFromSocket,
    startRoomReplayTimelineSession
} from './roomReplayTimeline.js';

const REPLAY_OUT_EVENTS = new Set([
    'play-to-field',
    'play-to-bond',
    'return-to-hand',
    'player-draw',
    'sync-card-move',
    'sync-bond-flip',
    'sync-attack',
    'sync-defense-support',
    'sync-combat-decision',
    'sync-combat-support-emblem-choice',
    'sync-support-interaction-request',
    'sync-support-interaction-resolve',
    'sync-card-untap',
    'sync-untap-all',
    'full-state-sync',
    'sync-phase',
    'turn-end',
    'mulligan-decision',
    'request-sync'
]);

const REPLAY_IN_EVENTS = new Set([
    'opponent-played-to-field',
    'opponent-played-to-bond',
    'opponent-returned-card',
    'opponent-draw-card',
    'opponent-card-moved',
    'opponent-bond-flipped',
    'opponent-attack',
    'opponent-defense-support',
    'opponent-combat-decision',
    'opponent-combat-support-emblem-choice',
    'opponent-support-interaction-request',
    'opponent-support-interaction-resolve',
    'opponent-card-untap',
    'opponent-untap-all',
    'full-state-sync',
    'sync-phase',
    'opponent-turn-end',
    'opponent-mulligan-decision',
    'opponent-dev-mode-changed'
]);

let sessionMeta = null;

export function startMatchReplaySession(meta = {}) {
    sessionMeta = {
        ...meta,
        startedAt: new Date().toISOString()
    };
    startRoomReplayTimelineSession({
        roomId: meta.roomId,
        seatAName: meta.seatAName || meta.displayName || '我方',
        seatBName: meta.seatBName || '对手'
    });
}

export function clearMatchReplaySession() {
    sessionMeta = null;
    clearRoomReplayTimelineSession();
}

export function isMatchReplaySessionActive() {
    return !!sessionMeta && isRoomReplayTimelineActive();
}

export { canExportRoomReplay };

export function buildMatchReplayPayload(endInfo = {}) {
    const game = buildRoomReplayGameForExport();
    const base = {
        version: 2,
        format: 'fe0-room-replay',
        session: sessionMeta,
        end: endInfo
    };
    if (game) {
        const a = String(sessionMeta?.seatAName || sessionMeta?.displayName || '我方').trim() || '我方';
        const b = String(sessionMeta?.seatBName || '对手').trim() || '对手';
        return {
            ...base,
            id: `room_${Date.now()}`,
            createdAt: new Date().toISOString(),
            source: 'room',
            deckA: a,
            deckB: b,
            games: [game],
            totalGames: 1
        };
    }
    return {
        ...base,
        version: 1,
        format: 'fe0-room-replay-empty',
        games: [],
        message: '无可用录像数据（可能尚未完成调度或尚未产生步骤）'
    };
}

export function installMatchReplaySocketWrapper(socket, shouldRecord, getState) {
    if (!socket || socket.__fe0ReplayWrapped) return;
    socket.__fe0ReplayWrapped = true;

    if (typeof getState === 'function') {
        bindRoomReplayState(getState);
    }

    const origEmit = socket.emit.bind(socket);
    socket.emit = (evt, ...args) => {
        const result = origEmit(evt, ...args);
        try {
            if (typeof shouldRecord === 'function' && shouldRecord() && REPLAY_OUT_EVENTS.has(evt)) {
                queueMicrotask(() => {
                    if (typeof shouldRecord === 'function' && shouldRecord()) {
                        scheduleRoomReplayDigestFromSocket(evt, args[0]);
                    }
                });
            }
        } catch {
            // ignore
        }
        return result;
    };

    if (typeof socket.onAny === 'function') {
        socket.onAny((evt, ...args) => {
            try {
                if (typeof shouldRecord === 'function' && shouldRecord() && REPLAY_IN_EVENTS.has(evt)) {
                    queueMicrotask(() => {
                        if (typeof shouldRecord === 'function' && shouldRecord()) {
                            scheduleRoomReplayDigestFromSocket(evt, args[0]);
                        }
                    });
                }
            } catch {
                // ignore
            }
        });
    }
}
