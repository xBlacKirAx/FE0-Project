const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function fileExists(relativePath) {
    return fs.existsSync(path.join(projectRoot, relativePath));
}

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function assertFile(relativePath) {
    assert(fileExists(relativePath), `缺少文件: ${relativePath}`);
}

function assertContains(relativePath, snippet, description) {
    const content = read(relativePath);
    assert(content.includes(snippet), `${relativePath} 缺少 ${description}`);
}

function assertRegex(relativePath, regex, description) {
    const content = read(relativePath);
    assert(regex.test(content), `${relativePath} 缺少 ${description}`);
}

function main() {
    const requiredFiles = [
        'app.js',
        'index.html',
        'server.js',
        'shared/socketEvents.js',
        'modules/viewModels.js',
        'modules/uiActions.js',
        'modules/formatters.js',
        'modules/state.js',
        'modules/state/myAreas.js',
        'modules/state/opponentAreas.js',
        'modules/state/uiState.js',
        'modules/state/interactionState.js',
        'modules/state/gameState.js',
        'modules/state/networkState.js',
        'modules/socketHandler.js',
        'modules/socket/opponentAreaStore.js',
        'modules/socket/registerBattleListeners.js',
        'modules/socket/registerStateListeners.js',
        'modules/cardOps.js',
        'modules/cardOps/areaCommands.js',
        'modules/cardOps/combatCommands.js',
        'modules/engine/combatEngine.js',
        'modules/engine/phaseEngine.js',
        'modules/commands/turnCommands.js',
        'modules/effects/socketEffects.js',
        'modules/effects/cardSocketEffects.js',
        'server/socket/registerGameplayHandlers.js',
        'server/socket/registerBattleHandlers.js',
        'server/socket/registerSyncHandlers.js',
        'server/socket/registerTurnModeHandlers.js',
        'server/socket/connectionRegistry.js'
    ];

    requiredFiles.forEach(assertFile);

    const events = require(path.join(projectRoot, 'shared/socketEvents.js'));
    assert(typeof events === 'object', 'shared/socketEvents.js 未导出事件对象');
    assert(Object.keys(events).length >= 20, '事件数量异常，SOCKET_EVENTS 可能不完整');
    assert(events.SYNC_ATTACK === 'sync-attack', 'SYNC_ATTACK 事件值异常');
    assert(events.OPPONENT_ATTACK === 'opponent-attack', 'OPPONENT_ATTACK 事件值异常');

    const serverModule = require(path.join(projectRoot, 'server.js'));
    assert(typeof serverModule.startServer === 'function', 'server.js 缺少 startServer 导出');
    assert(typeof serverModule.resolvePort === 'function', 'server.js 缺少 resolvePort 导出');

    assertRegex('modules/viewModels.js', /export function createPanelViewModels\s*\(/, 'createPanelViewModels 导出');
    assertRegex('modules/uiActions.js', /export function createUiActions\s*\(/, 'createUiActions 导出');
    assertRegex('modules/state.js', /export function createGameState\s*\(/, 'createGameState 导出');
    assertRegex('modules/socketHandler.js', /export function createSocketHandler\s*\(/, 'createSocketHandler 导出');
    assertRegex('modules/cardOps.js', /export function createCardOperations\s*\(/, 'createCardOperations 导出');
    assertRegex('modules/cardOps/areaCommands.js', /export function createAreaCommands\s*\(/, 'createAreaCommands 导出');
    assertRegex('modules/cardOps/combatCommands.js', /export function createCombatCommands\s*\(/, 'createCombatCommands 导出');
    assertRegex('modules/engine/combatEngine.js', /export function isAttackerFromMyField\s*\(/, 'isAttackerFromMyField 导出');
    assertRegex('modules/engine/phaseEngine.js', /export function getNextPhase\s*\(/, 'getNextPhase 导出');

    assertContains('index.html', 'shared/socketEvents.js', '共享事件脚本加载');
    assertContains('app.js', "createPanelViewModels", 'view model 装配');
    assertContains('app.js', "createUiActions", 'UI actions 装配');
    assertContains('server.js', 'startServer', '可测试化 server 入口');

    console.log('结构回归检查通过');
  }

try {
    main();
} catch (error) {
    console.error(`结构回归检查失败: ${error.message}`);
    process.exit(1);
}
