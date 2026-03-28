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
        firstPlayerOpeningTurnLocked: ref(false),
        currentPhase: ref('DEPLOY'),
        bonds: ref([]),
        usedBondsThisTurn: ref(0),
        fieldFront: ref([]),
        fieldRear: ref([]),
        opponentFront: ref([]),
        opponentRear: ref([]),
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

    const firstTurnRules = createRulesEngine(createMockState({
        currentPhase: ref('BEGINNING'),
        firstPlayerOpeningTurnLocked: ref(true)
    }));
    assert(firstTurnRules.canPerformAction('draw') === false, '先攻第一回合应禁止开始阶段抽牌');
    const firstTurnAttackRules = createRulesEngine(createMockState({
        currentPhase: ref('ATTACK'),
        firstPlayerOpeningTurnLocked: ref(true)
    }));
    assert(firstTurnAttackRules.canPerformAction('attack') === false, '先攻第一回合应禁止攻击');

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

    {
        const state = createMockState({
            currentPhase: ref('ATTACK'),
            fieldFront: ref([{ instanceId: 'a-front', range: '1' }, { instanceId: 'a-front2', range: '2' }, { instanceId: 'a-front3', range: '1-2' }]),
            fieldRear: ref([{ instanceId: 'a-rear', range: '2' }, { instanceId: 'a-rear2', range: '1-2' }, { instanceId: 'a-rear3', range: '-' }]),
            opponentFront: ref([{ instanceId: 'd-front' }]),
            opponentRear: ref([{ instanceId: 'd-rear' }])
        });
        const rangeRules = createRulesEngine(state);

        const r0 = rangeRules.canAttackTargetByRange({ instanceId: 'a-rear3', range: '-' }, { instanceId: 'd-front' });
        assert(r0.valid === false, '射程 - 应禁止攻击');

        const r1ok = rangeRules.canAttackTargetByRange({ instanceId: 'a-front', range: '1' }, { instanceId: 'd-front' });
        assert(r1ok.valid === true, '射程1：前场应可攻击对方前场');
        const r1bad = rangeRules.canAttackTargetByRange({ instanceId: 'a-front', range: '1' }, { instanceId: 'd-rear' });
        assert(r1bad.valid === false, '射程1：前场不应攻击对方后场');

        const r2rear = rangeRules.canAttackTargetByRange({ instanceId: 'a-rear', range: '2' }, { instanceId: 'd-front' });
        assert(r2rear.valid === true, '射程2：后场应可攻击对方前场');
        const r2front = rangeRules.canAttackTargetByRange({ instanceId: 'a-front2', range: '2' }, { instanceId: 'd-rear' });
        assert(r2front.valid === true, '射程2：前场应可攻击对方后场');
        const r2bad = rangeRules.canAttackTargetByRange({ instanceId: 'a-front2', range: '2' }, { instanceId: 'd-front' });
        assert(r2bad.valid === false, '射程2：前场不应攻击对方前场');

        const r12frontA = rangeRules.canAttackTargetByRange({ instanceId: 'a-front3', range: '1-2' }, { instanceId: 'd-front' });
        const r12frontB = rangeRules.canAttackTargetByRange({ instanceId: 'a-front3', range: '1-2' }, { instanceId: 'd-rear' });
        const r12rear = rangeRules.canAttackTargetByRange({ instanceId: 'a-rear2', range: '1-2' }, { instanceId: 'd-front' });
        assert(r12frontA.valid === true && r12frontB.valid === true && r12rear.valid === true, '射程1-2应满足定义中的全部有效攻击方向');
    }

    console.log('规则引擎检查通过');
}

try {
    main();
} catch (error) {
    console.error(`规则引擎检查失败: ${error.message}`);
    process.exit(1);
}
