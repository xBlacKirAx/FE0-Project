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
