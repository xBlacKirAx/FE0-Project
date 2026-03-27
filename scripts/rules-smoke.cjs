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

function ref(value) {
    return { value };
}

function createMockState(overrides = {}) {
    return {
        isDevMode: ref(false),
        isMyTurn: ref(true),
        currentPhase: ref('DEPLOY'),
        bonds: ref([]),
        usedBondsThisTurn: ref(0),
        ...overrides
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function main() {
    const { createRulesEngine } = loadEsModuleFunctions('modules/rules.js', ['createRulesEngine']);

    const devRules = createRulesEngine(createMockState({ isDevMode: ref(true) }));
    assert(devRules.canPerformAction('attack') === true, 'DEV 模式下应允许任意动作');
    assert(devRules.canDeployCard({ cost: '99', force: '光之剑' }).valid === true, 'DEV 模式下应忽略费用与颜色');

    const wrongTurnRules = createRulesEngine(createMockState({ isMyTurn: ref(false), currentPhase: ref('ATTACK') }));
    assert(wrongTurnRules.canPerformAction('attack') === false, '非回合方不应允许攻击');

    const phaseRules = createRulesEngine(createMockState({ currentPhase: ref('BOND') }));
    assert(phaseRules.canPerformAction('placeBond') === true, 'BOND 阶段应允许放置羁绊');
    assert(phaseRules.canPerformAction('deploy') === false, 'BOND 阶段不应允许出击');
    assert(phaseRules.getActionByArea('front') === 'deploy', 'front 区域动作映射异常');
    assert(phaseRules.getActionByArea('bonds') === 'placeBond', 'bonds 区域动作映射异常');

    const insufficientCostRules = createRulesEngine(createMockState({
        bonds: ref([{ force: '光之剑', isFaceDown: false }]),
        usedBondsThisTurn: ref(1)
    }));
    const insufficientCost = insufficientCostRules.canDeployCard({ cost: '2', force: '光之剑' });
    assert(insufficientCost.valid === false, '费用不足时应拒绝出击');
    assert(insufficientCost.message.includes('费用不足'), '费用不足提示异常');

    const colorMismatchRules = createRulesEngine(createMockState({
        bonds: ref([{ force: '圣痕', isFaceDown: false }])
    }));
    const colorMismatch = colorMismatchRules.canDeployCard({ cost: '1', force: '光之剑' });
    assert(colorMismatch.valid === false, '颜色不匹配时应拒绝出击');
    assert(colorMismatch.message.includes('颜色限制'), '颜色限制提示异常');

    const validDeployRules = createRulesEngine(createMockState({
        bonds: ref([
            { force: '光之剑', isFaceDown: false },
            { force: '圣痕', isFaceDown: true }
        ])
    }));
    const validDeploy = validDeployRules.canDeployCard({ cost: '1', force: '光之剑' });
    assert(validDeploy.valid === true, '满足费用和颜色时应允许出击');

    const factionInfo = validDeployRules.getCardFactionInfo({ force: '光之剑' });
    assert(factionInfo.name === '红色', '势力信息映射异常');

    console.log('规则引擎检查通过');
}

try {
    main();
} catch (error) {
    console.error(`规则引擎检查失败: ${error.message}`);
    process.exit(1);
}
