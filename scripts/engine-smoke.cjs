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
