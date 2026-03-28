const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');

function loadEsModuleFunctions(relativePath, exportedNames) {
    const filePath = path.join(projectRoot, relativePath);
    let code = fs.readFileSync(filePath, 'utf8');

    for (const name of exportedNames) {
        code = code.replace(new RegExp(`export\\s+function\\s+${name}`, 'g'), `function ${name}`);
    }

    const exportBlock = `\nmodule.exports = { ${exportedNames.join(', ')} };`;
    const context = {
        module: { exports: {} },
        exports: {},
        console
    };
    vm.runInNewContext(code + exportBlock, context, { filename: filePath });
    return context.module.exports;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function main() {
    const roomUi = loadEsModuleFunctions('modules/roomUiState.js', [
        'normalizeRoomPayload',
        'deriveRoomRole',
        'deriveRoomStatusText',
        'didOpponentLeaveRoom',
        'deriveRoomScene',
        'deriveTopBarUi'
    ]);

    const normalized = roomUi.normalizeRoomPayload({
        roomId: 'ab12',
        hostId: 'host-1',
        guestId: '',
        playerCount: '1',
        ready: 0,
        queueing: 1,
        gameInProgress: 1,
        isPrivate: ''
    });
    assert(normalized.roomId === 'ab12', 'normalizeRoomPayload: roomId 解析错误');
    assert(normalized.hostId === 'host-1', 'normalizeRoomPayload: hostId 解析错误');
    assert(normalized.guestId === null, 'normalizeRoomPayload: guestId 应归一为 null');
    assert(normalized.playerCount === 1, 'normalizeRoomPayload: playerCount 应转为数字');
    assert(normalized.queueing === true, 'normalizeRoomPayload: queueing 应转为布尔');
    assert(normalized.ready === false, 'normalizeRoomPayload: ready 应转为布尔');
    assert(normalized.gameInProgress === true, 'normalizeRoomPayload: gameInProgress 应转为布尔');
    assert(normalized.isPrivate === false, 'normalizeRoomPayload: isPrivate 应转为布尔');

    assert(roomUi.deriveRoomRole({ roomId: 'ROOM1', hostId: 'me', guestId: 'other', myId: 'me' }) === 'host', 'deriveRoomRole: 房主判定错误');
    assert(roomUi.deriveRoomRole({ roomId: 'ROOM1', hostId: 'other', guestId: 'me', myId: 'me' }) === 'guest', 'deriveRoomRole: 客方判定错误');
    assert(roomUi.deriveRoomRole({ roomId: '', hostId: 'other', guestId: 'me', myId: 'me' }) === '', 'deriveRoomRole: 无房间时应为空');

    assert(roomUi.deriveRoomStatusText({ queueing: true, roomId: '' }) === '匹配中...', 'deriveRoomStatusText: 匹配中文案错误');
    assert(roomUi.deriveRoomStatusText({ queueing: false, roomId: '' }) === '未加入房间', 'deriveRoomStatusText: 空房间文案错误');
    assert(roomUi.deriveRoomStatusText({ queueing: false, roomId: 'ABC123' }) === '房间 ABC123', 'deriveRoomStatusText: 房间文案错误');

    assert(roomUi.didOpponentLeaveRoom(
        { roomId: 'ROOM1', playerCount: 2, ready: true },
        { roomId: 'ROOM1', playerCount: 1, ready: false }
    ) === true, 'didOpponentLeaveRoom: 对手离房判定错误');
    assert(roomUi.didOpponentLeaveRoom(
        { roomId: 'ROOM1', playerCount: 1, ready: false },
        { roomId: 'ROOM1', playerCount: 1, ready: false }
    ) === false, 'didOpponentLeaveRoom: 非双人房变化不应提示');

    assert(roomUi.deriveRoomScene({
        connectionScene: 'connected',
        roomId: '',
        roomQueueing: false,
        roomReady: false,
        roomGameInProgress: false
    }) === 'idle', 'deriveRoomScene: idle 判定错误');
    assert(roomUi.deriveRoomScene({
        connectionScene: 'connected',
        roomId: '',
        roomQueueing: true,
        roomReady: false,
        roomGameInProgress: false
    }) === 'matching', 'deriveRoomScene: matching 判定错误');
    assert(roomUi.deriveRoomScene({
        connectionScene: 'connected',
        roomId: 'ROOM1',
        roomQueueing: false,
        roomReady: false,
        roomGameInProgress: false
    }) === 'waiting', 'deriveRoomScene: waiting 判定错误');
    assert(roomUi.deriveRoomScene({
        connectionScene: 'connected',
        roomId: 'ROOM1',
        roomQueueing: false,
        roomReady: true,
        roomGameInProgress: false
    }) === 'ready', 'deriveRoomScene: ready 判定错误');
    assert(roomUi.deriveRoomScene({
        connectionScene: 'connected',
        roomId: 'ROOM1',
        roomQueueing: false,
        roomReady: true,
        roomGameInProgress: true
    }) === 'in-game', 'deriveRoomScene: in-game 判定错误');
    assert(roomUi.deriveRoomScene({
        connectionScene: 'recovering',
        roomId: 'ROOM1',
        roomQueueing: false,
        roomReady: true,
        roomGameInProgress: false
    }) === 'recovering', 'deriveRoomScene: recovering 判定错误');

    const idleUi = roomUi.deriveTopBarUi({
        roomScene: 'idle',
        roomGameInProgress: false,
        showNextPhaseButton: false,
        startRoomButtonConsumed: false,
        isCompactMobile: false
    });
    assert(idleUi.showCreateRoomButton === true, 'deriveTopBarUi: idle 时应显示建房按钮');
    assert(idleUi.showJoinRoomButton === true, 'deriveTopBarUi: idle 时应显示加入按钮');
    assert(idleUi.showQuickMatchButton === true, 'deriveTopBarUi: 桌面 idle 时应显示匹配按钮');
    assert(idleUi.showLeaveRoomButton === false, 'deriveTopBarUi: idle 时不应显示离房');
    assert(idleUi.showStartRoomButton === false, 'deriveTopBarUi: idle 时不应显示开局');
    assert(idleUi.showResetButton === false, 'deriveTopBarUi: idle 时不应显示对局按钮');

    const mobileIdleUi = roomUi.deriveTopBarUi({
        roomScene: 'idle',
        roomGameInProgress: false,
        showNextPhaseButton: false,
        startRoomButtonConsumed: false,
        isCompactMobile: true
    });
    assert(mobileIdleUi.showCreateRoomButton === true, 'deriveTopBarUi: 手机 idle 时应保留建房按钮');
    assert(mobileIdleUi.showJoinRoomButton === true, 'deriveTopBarUi: 手机 idle 时应保留加入按钮');
    assert(mobileIdleUi.showQuickMatchButton === false, 'deriveTopBarUi: 手机 idle 时应隐藏匹配按钮');

    const readyUi = roomUi.deriveTopBarUi({
        roomScene: 'ready',
        roomGameInProgress: false,
        showNextPhaseButton: false,
        startRoomButtonConsumed: false,
        isCompactMobile: false
    });
    assert(readyUi.showLeaveRoomButton === true, 'deriveTopBarUi: ready 时应显示离房');
    assert(readyUi.showStartRoomButton === true, 'deriveTopBarUi: ready 时应显示开局');

    const inGameUi = roomUi.deriveTopBarUi({
        roomScene: 'in-game',
        roomGameInProgress: true,
        showNextPhaseButton: true,
        startRoomButtonConsumed: true,
        isCompactMobile: false
    });
    assert(inGameUi.showResetButton === true, 'deriveTopBarUi: in-game 时应显示重置');
    assert(inGameUi.showDeckManagerButton === true, 'deriveTopBarUi: 桌面对局中应显示卡组按钮');
    assert(inGameUi.showCostCounter === true, 'deriveTopBarUi: in-game 时应显示 cost');
    assert(inGameUi.showTurnOwner === true, 'deriveTopBarUi: in-game 时应显示回合归属');
    assert(inGameUi.showPhaseName === true, 'deriveTopBarUi: in-game 时应显示阶段');
    assert(inGameUi.showNextPhaseButton === true, 'deriveTopBarUi: in-game 时应显示 next');
    assert(inGameUi.showLeaveRoomButton === true, 'deriveTopBarUi: in-game 时应显示离房');
    assert(inGameUi.showStartRoomButton === false, 'deriveTopBarUi: in-game 时不应显示开局');

    const mobileInGameUi = roomUi.deriveTopBarUi({
        roomScene: 'in-game',
        roomGameInProgress: true,
        showNextPhaseButton: true,
        startRoomButtonConsumed: true,
        isCompactMobile: true
    });
    assert(mobileInGameUi.showResetButton === false, 'deriveTopBarUi: 手机对局中应隐藏重置');
    assert(mobileInGameUi.showDeckManagerButton === false, 'deriveTopBarUi: 手机对局中应隐藏卡组按钮');
    assert(mobileInGameUi.showTurnOwner === false, 'deriveTopBarUi: 手机对局中应隐藏回合归属');
    assert(mobileInGameUi.showCostCounter === true, 'deriveTopBarUi: 手机对局中应保留 cost');
    assert(mobileInGameUi.showPhaseName === true, 'deriveTopBarUi: 手机对局中应保留阶段');
    assert(mobileInGameUi.showNextPhaseButton === true, 'deriveTopBarUi: 手机对局中应保留 next');
    assert(mobileInGameUi.showLeaveRoomButton === true, 'deriveTopBarUi: 手机对局中应保留离房');

    const recoveringUi = roomUi.deriveTopBarUi({
        roomScene: 'recovering',
        roomGameInProgress: false,
        showNextPhaseButton: false,
        startRoomButtonConsumed: false,
        isCompactMobile: true
    });
    assert(recoveringUi.showStartRoomButton === false, 'deriveTopBarUi: recovering 时不应显示开局');

    console.log('房间状态烟测检查通过');
}

try {
    main();
} catch (error) {
    console.error(`房间状态烟测检查失败: ${error.message}`);
    process.exit(1);
}
