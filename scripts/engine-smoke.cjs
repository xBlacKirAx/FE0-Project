const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');

function loadEsModuleFunctions(relativePath, exportedNames) {
    const filePath = path.join(projectRoot, relativePath);
    let code = fs.readFileSync(filePath, 'utf8');

    for (const name of exportedNames) {
        code = code.replace(new RegExp(`export\\s+function\\s+${name}`, 'g'), `function ${name}`);
        code = code.replace(new RegExp(`export\\s+const\\s+${name}`, 'g'), `const ${name}`);
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
    const combat = loadEsModuleFunctions('modules/engine/combatEngine.js', [
        'isAttackerFromMyField',
        'getCombatWinner'
    ]);
    const decision = loadEsModuleFunctions('modules/engine/combatDecisionEngine.js', [
        'createInitialCombatDecision',
        'getInitialCombatDecisionContext'
    ]);
    const supportEffect = loadEsModuleFunctions('modules/engine/supportEffectEngine.js', [
        'getCardCharaName',
        'isSupportFailed',
        'getSupportEffectIdByTitle',
        'resolveSupportEffectMeta',
        'resolveSupportEffectResult',
        'getSupportEffectCatalogSize'
    ]);
    const phase = loadEsModuleFunctions('modules/engine/phaseEngine.js', [
        'PHASE_ORDER',
        'PHASE_NAME_MAP',
        'getNextPhase'
    ]);

    assert(combat.isAttackerFromMyField('a1', [{ instanceId: 'a1' }], []) === true, '战斗引擎: 我方前排识别失败');
    assert(combat.isAttackerFromMyField('x1', [{ instanceId: 'a1' }], [{ instanceId: 'b1' }]) === false, '战斗引擎: 非我方卡识别失败');
    assert(combat.getCombatWinner(30, 20) === true, '战斗引擎: 高战力胜利判断失败');
    assert(combat.getCombatWinner(20, 20) === true, '战斗引擎: 平局应判攻击方胜利');
    assert(combat.getCombatWinner(10, 20) === false, '战斗引擎: 低战力失败判断失败');

    const initialDecision = decision.createInitialCombatDecision();
    assert(initialDecision.stage === 'idle', '战斗决策引擎: 初始阶段应为 idle');
    assert(initialDecision.promptOwner === null, '战斗决策引擎: 初始 promptOwner 应为空');
    // 新签名: (myCardPower, mySupportPower, oppTotalPower)
    const defenderPrompt = decision.getInitialCombatDecisionContext(30, 0, 20);
    assert(defenderPrompt.stage === 'awaiting-defender-evasion', '战斗决策引擎: 已击破时应等待防御方回避');
    const criticalPrompt = decision.getInitialCombatDecisionContext(15, 0, 25);
    assert(criticalPrompt.stage === 'awaiting-attacker-critical', '战斗决策引擎: 可必杀反杀时应等待攻击方必杀');
    const autoMiss = decision.getInitialCombatDecisionContext(10, 0, 25);
    assert(autoMiss.stage === 'auto-miss', '战斗决策引擎: 无法击破时应自动判未击破');
    // 必杀公式验证: 卡片战力*2 + 支援战力，支援战力不翻倍
    // cardPower=15, support=5 → base=20 < 30, critical=15*2+5=35 >= 30 → awaiting-attacker-critical
    const criticalWithSupport = decision.getInitialCombatDecisionContext(15, 5, 30);
    assert(criticalWithSupport.stage === 'awaiting-attacker-critical', '战斗决策引擎: 含支援时必杀公式计算错误');
    assert(criticalWithSupport.criticalPower === 35, '战斗决策引擎: criticalPower 应为 cardPower*2+support=35');

    assert(supportEffect.getSupportEffectCatalogSize() >= 34, '支援效果引擎: 纹章效果目录数量异常');
    assert(supportEffect.getSupportEffectIdByTitle('『攻击之纹章』') === 'EMBLEM_ATTACK', '支援效果引擎: 攻击之纹章映射异常');
    const supportMeta = supportEffect.resolveSupportEffectMeta({
        keywords: { title: ['『防御之纹章』'], timing: ['〖防御型〗'] }
    });
    assert(supportMeta.effectId === 'EMBLEM_DEFENSE', '支援效果引擎: 元数据 effectId 解析异常');
    const supportResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『攻击之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(supportResult.powerDelta === 20, '支援效果引擎: 攻击之纹章应提供 +20 战力');

    const prayerResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『祈祷之纹章』'], timing: ['〖防御型〗'] } } },
        role: 'defender',
        state: {}
    });
    assert(prayerResult.lockAttackerCritical === true, '支援效果引擎: 祈祷之纹章应禁止攻击方必杀');

    const heroResult = supportEffect.resolveSupportEffectResult({
        supportCard: { force: '光之剑', supportAbility: { keywords: { title: ['『英雄之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: { attacker: { value: { force: '光之剑' } } }
    });
    assert(heroResult.jewelBreakCount === 2, '支援效果引擎: 英雄之纹章应将击破宝玉数提升为 2');

    const magicResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『魔术之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(magicResult.sideEffect === 'draw1Discard1', '支援效果引擎: 魔术之纹章应返回抽1弃1侧效');

    assert(Array.isArray(phase.PHASE_ORDER), '阶段引擎: PHASE_ORDER 异常');
    assert(phase.PHASE_ORDER.join(',') === 'BEGINNING,BOND,DEPLOY,ATTACK,END', '阶段顺序异常');
    assert(phase.PHASE_NAME_MAP.ATTACK === '攻击阶段', '阶段名称映射异常');
    assert(phase.getNextPhase('BEGINNING') === 'BOND', '阶段推进 BEGINNING -> BOND 失败');
    assert(phase.getNextPhase('ATTACK') === 'END', '阶段推进 ATTACK -> END 失败');
    assert(phase.getNextPhase('END') === null, '阶段推进 END 应返回 null');

    console.log('纯函数引擎检查通过');
}

try {
    main();
} catch (error) {
    console.error(`纯函数引擎检查失败: ${error.message}`);
    process.exit(1);
}
