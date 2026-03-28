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

    const siblingResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            charaName: '艾瑞珂',
            supportAbility: { keywords: { title: ['『兄妹之纹章』'], timing: ['〖攻防型〗'] } }
        },
        role: 'defender',
        state: { defender: { value: { charaName: '伊弗列姆' } } }
    });
    assert(siblingResult.powerDelta === 20, '支援效果引擎: 兄妹之纹章满足条件时应提供 +20 战力');

    const prayerResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『祈祷之纹章』'], timing: ['〖防御型〗'] } } },
        role: 'defender',
        state: {}
    });
    assert(prayerResult.lockAttackerCritical === true, '支援效果引擎: 祈祷之纹章应禁止攻击方必杀');

    const heroResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            force: '圣痕',
            supportAbility: {
                keywords: { title: ['『英雄之纹章』'], timing: ['〖攻击型〗'] },
                effectParams: { requiredAttackerForce: '圣痕' }
            }
        },
        role: 'attacker',
        state: { attacker: { value: { force: '圣痕' } } }
    });
    assert(heroResult.jewelBreakCount === 2, '支援效果引擎: 英雄之纹章应将击破宝玉数提升为 2');

    const magicResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『魔术之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(magicResult.sideEffect === 'draw1Discard1', '支援效果引擎: 魔术之纹章应返回抽1弃1侧效');

    const thiefResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『盗贼之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(thiefResult.sideEffect === 'opponentTopDeckToGraveOptional', '支援效果引擎: 盗贼之纹章应返回处理对手牌组顶侧效');

    const darkResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『黑暗之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: { oppStats: { value: { hand: 5 } } }
    });
    assert(darkResult.sideEffect === 'opponentDiscard1IfHand5Plus', '支援效果引擎: 黑暗之纹章满足条件时应返回弃手侧效');

    const strategyResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            supportAbility: {
                keywords: { title: ['『计略之纹章』'], timing: ['〖攻击型〗'] },
                effectParams: { requiredAttackerForce: '圣痕' }
            }
        },
        role: 'attacker',
        state: { attacker: { value: { force: '圣痕' } } }
    });
    assert(strategyResult.sideEffect === 'moveEnemyExceptDefender', '支援效果引擎: 计略之纹章满足条件时应返回敌方移动侧效');

    const manaketeResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            supportAbility: {
                keywords: { title: ['『龙人之纹章』'], timing: ['〖攻击型〗'] },
                effectParams: { requiredAttackerForce: '光之剑' }
            }
        },
        role: 'attacker',
        state: { attacker: { value: { force: '光之剑' } } }
    });
    assert(manaketeResult.sideEffect === 'putHandCardToBond', '支援效果引擎: 龙人之纹章满足条件时应返回手牌置羁绊侧效');

    const certaintyResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『必中之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: { defender: { value: { isMainCharacter: false } } }
    });
    assert(certaintyResult.lockDefenderEvasion === true, '支援效果引擎: 必中之纹章应锁定神速回避');

    const commandResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『指挥之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(commandResult.sideEffect === 'moveAllyExceptAttacker', '支援效果引擎: 指挥之纹章应返回我方移动侧效');

    const courageResult = supportEffect.resolveSupportEffectResult({
        supportCard: { force: '神器', supportAbility: { keywords: { title: ['『勇气之纹章』'], timing: ['〖攻防型〗'] } } },
        role: 'attacker',
        state: { attacker: { value: { force: '神器' } } }
    });
    assert(courageResult.sideEffect === 'draw1Topdeck1', '支援效果引擎: 勇气之纹章满足条件时应返回抽1顶1侧效');

    const danceResult = supportEffect.resolveSupportEffectResult({
        supportCard: { force: '白夜', supportAbility: { keywords: { title: ['『歌舞之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: { attacker: { value: { force: '白夜' } } }
    });
    assert(danceResult.sideEffect === 'untapAllyCost2OrLess', '支援效果引擎: 歌舞之纹章满足条件时应返回回正侧效');

    const prophecyResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『预言之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(prophecyResult.sideEffect === 'peekOwnTopDeckOptionalMill', '支援效果引擎: 预言之纹章应返回看顶并可入墓侧效');

    const strongResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『强者之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(strongResult.powerDelta === 30, '支援效果引擎: 强者之纹章应提供 +30 战力');

    const fateResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            supportAbility: {
                keywords: { title: ['『命运之纹章』'], timing: ['〖攻击型〗'] },
                effectParams: { requiredAttackerForce: '圣痕' }
            }
        },
        role: 'attacker',
        state: { attacker: { value: { force: '圣痕' } } }
    });
    assert(fateResult.sideEffect === 'draw1Topdeck1', '支援效果引擎: 命运之纹章满足条件时应返回抽1顶1侧效');

    const linkResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            supportAbility: {
                keywords: { title: ['『连携之纹章』'], timing: ['〖攻击型〗'] },
                effectParams: { requiredAttackerForce: '圣痕' }
            }
        },
        role: 'attacker',
        state: { attacker: { value: { force: '圣痕' } } }
    });
    assert(linkResult.powerDelta === 10, '支援效果引擎: 连携之纹章满足条件时应提供 +10 战力');

    const encourageResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『激励之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(encourageResult.sideEffect === 'drawOnBreakMainCharacter', '支援效果引擎: 激励之纹章应返回击破主人公后抽牌侧效');

    const coopResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            supportAbility: {
                keywords: { title: ['『共斗之纹章』'], timing: ['〖攻防型〗'] },
                effectParams: { requireHasForce: true }
            }
        },
        role: 'defender',
        state: { defender: { value: { force: '圣痕' } } }
    });
    assert(coopResult.powerDelta === 10, '支援效果引擎: 共斗之纹章满足条件时应提供 +10 战力');

    const sealResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『封咒之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(sealResult.sideEffect === 'sealOpponentSupportEffect', '支援效果引擎: 封咒之纹章应返回封印对手支援侧效');

    const lightResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            supportAbility: {
                keywords: { title: ['『光明之纹章』'], timing: ['〖攻击型〗'] },
                effectParams: { requireHasForce: true }
            }
        },
        role: 'attacker',
        state: { attacker: { value: { force: '白夜' } } }
    });
    assert(lightResult.sideEffect === 'peekOwnJewel', '支援效果引擎: 光明之纹章满足条件时应返回查看宝玉侧效');

    const hopeResult = supportEffect.resolveSupportEffectResult({
        supportCard: {
            supportAbility: {
                keywords: { title: ['『希望之纹章』'], timing: ['〖防御型〗'] },
                effectParams: { requiredAttackerForce: '圣痕' }
            }
        },
        role: 'defender',
        state: { defender: { value: { force: '圣痕' } } }
    });
    assert(hopeResult.sideEffect === 'peekOwnJewel', '支援效果引擎: 希望之纹章满足条件时应返回查看宝玉侧效');

    const procurementResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『筹措之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: { hand: { value: [1, 2, 3, 4] } }
    });
    assert(procurementResult.sideEffect === 'drawIfHand4OrLess', '支援效果引擎: 筹措之纹章满足条件时应返回抽牌侧效');

    const dragonBloodResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『龙血之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: { bonds: { value: [1, 2] }, oppBonds: { value: [1, 2, 3] } }
    });
    assert(dragonBloodResult.sideEffect === 'putHandCardToBondIfBehindOnBonds', '支援效果引擎: 龙血之纹章满足条件时应返回手牌转羁绊侧效');

    const despairResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『绝望之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(despairResult.sideEffect === 'resurrectZombieFromGraveyard', '支援效果引擎: 绝望之纹章应返回僵尸复活侧效');

    const ninjutsuResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『忍术之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(ninjutsuResult.sideEffect === 'ninjutsuOptional', '支援效果引擎: 忍术之纹章应返回可选放入退避区侧效');

    const phantomResult = supportEffect.resolveSupportEffectResult({
        supportCard: { 
            cardName: '织部翼 龙回的轨迹',
            supportAbility: { keywords: { title: ['『幻影之纹章』'], timing: ['〖攻击型〗'] } } 
        },
        role: 'attacker',
        state: {}
    });
    assert(phantomResult.sideEffect === 'phantomBattleEndReplace', '支援效果引擎: 幻影之纹章应返回战斗结束后替换出击侧效');
    assert(phantomResult.sideEffectData?.charaName, '支援效果引擎: 幻影之纹章应提供角色名数据');

    const resistanceResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『抵抗之纹章』'], timing: ['〖防御型〗'] } } },
        role: 'defender',
        state: {}
    });
    assert(resistanceResult.sideEffect === 'resistanceBattleEndStay', '支援效果引擎: 抵抗之纹章应返回防守单位保留侧效');

    const supportResult2 = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『援护之纹章』'], timing: ['〖攻击型〗'] } } },
        role: 'attacker',
        state: {}
    });
    assert(supportResult2.sideEffect === 'supportMoveAttackerPostBattle', '支援效果引擎: 援护之纹章应返回攻击单位战后移动侧效');

    const trainingResult = supportEffect.resolveSupportEffectResult({
        supportCard: { supportAbility: { keywords: { title: ['『锻炼之纹章』'], timing: ['〖防御型〗'] } } },
        role: 'defender',
        state: {}
    });
    assert(trainingResult.sideEffect === 'trainingDefenderBreakToHand', '支援效果引擎: 锻炼之纹章应返回防守单位进手牌侧效');

    assert(Array.isArray(phase.PHASE_ORDER), '阶段引擎: PHASE_ORDER 异常');
    assert(phase.PHASE_ORDER.join(',') === 'BEGINNING,BOND,DEPLOY,ATTACK,END', '阶段顺序异常');
    assert(phase.PHASE_NAME_MAP.ATTACK === '攻击阶段', '阶段名称映射异常');
    assert(phase.getNextPhase('BEGINNING') === 'BOND', '阶段推进 BEGINNING -> BOND 失败');
    assert(phase.getNextPhase('ATTACK') === 'END', '阶段推进 ATTACK -> END 失败');
    assert(phase.getNextPhase('END') === null, '阶段推进 END 应返回 null');

    // ── 能力引擎测试
    const abilityEngine = loadEsModuleFunctions('modules/engine/abilityEngine.js', [
        'parseAbilitySegments',
        'evaluatePassive',
        'checkSpecialDeployCondition',
        'checkAllSpecialDeployConditions',
        'getActivatableAbilities',
        'getAutoTriggers',
        'computePassivePowerBonus',
        'buildPassiveContext'
    ]);

    // parseAbilitySegments: 马尔斯 B01-001
    const marsCard = {
        ability: {
            text: "『英雄的凯歌』【起】[翻面3，从自己的手牌将1张「马尔斯」放置到退避区]直到下个对手的回合结束为止，所有我方单位的战斗力+30。『法尔西昂』【常】这名单位攻击<龙>属性单位的期间，这名单位的战斗力+20。",
            keywords: { type: ['【起】', '【常】'], title: [], timing: [] }
        }
    };
    const marsSegs = abilityEngine.parseAbilitySegments(marsCard);
    assert(marsSegs.length === 2, '能力引擎: 马尔斯应解析出2段能力');
    assert(marsSegs[0].type === '起', '能力引擎: 第1段应为【起】');
    assert(marsSegs[0].title === '英雄的凯歌', '能力引擎: 第1段标题应为英雄的凯歌');
    assert(marsSegs[1].type === '常', '能力引擎: 第2段应为【常】');
    assert(marsSegs[1].title === '法尔西昂', '能力引擎: 第2段标题应为法尔西昂');

    // evaluatePassive: 攻击<龙>属性+20，攻击方且目标有龙 trait 时应生效
    const passiveSeg = marsSegs[1];
    const ctxWithDragonDef = {
        unit: { instanceId: 'u1' },
        attacker: { instanceId: 'u1' },
        defender: { instanceId: 'u2', traits: ['龙'] },
        myFront: [], myRear: [], oppFront: [], oppRear: []
    };
    const passiveResult = abilityEngine.evaluatePassive(passiveSeg, ctxWithDragonDef);
    assert(passiveResult.matched === true, '能力引擎: 攻击<龙>属性【常】应匹配成功');
    assert(passiveResult.powerDelta === 20, '能力引擎: 攻击<龙>属性时法尔西昂应提供+20');

    // evaluatePassive: 防御单位无龙 trait，不应生效
    const ctxNoDragonDef = {
        unit: { instanceId: 'u1' },
        attacker: { instanceId: 'u1' },
        defender: { instanceId: 'u2', traits: ['重甲'] },
        myFront: [], myRear: [], oppFront: [], oppRear: []
    };
    const passiveResultNo = abilityEngine.evaluatePassive(passiveSeg, ctxNoDragonDef);
    assert(passiveResultNo.powerDelta === 0, '能力引擎: 非龙属性防守时法尔西昂不应生效');

    // checkAllSpecialDeployConditions: B01-049 雅典娜 退避区限制
    const athenaCard = {
        id: 'B01-049',
        charaName: '雅典娜',
        ability: {
            text: "『少女剑士的报恩』【特】这张卡仅限自己的退避区中的卡有5张以上时才能出击。",
            keywords: { type: ['【特】'] }
        }
    };
    const blockedCtx = {
        card: athenaCard,
        myFront: [], myRear: [],
        myGraveyard: [1, 2, 3],
        myGraveyardCount: 3
    };
    const allowedCtx = {
        card: athenaCard,
        myFront: [], myRear: [],
        myGraveyard: [1, 2, 3, 4, 5],
        myGraveyardCount: 5
    };
    const blockResult = abilityEngine.checkAllSpecialDeployConditions(athenaCard, blockedCtx);
    assert(blockResult !== null && blockResult.blocked === true, '能力引擎: 雅典娜退避区不足时应阻止出击');
    const allowResult = abilityEngine.checkAllSpecialDeployConditions(athenaCard, allowedCtx);
    assert(allowResult === null, '能力引擎: 雅典娜退避区5张时应允许出击');

    // getActivatableAbilities: 横置费用，已横置时不可用
    const shidaCard = {
        ability: {
            text: "『翱翔天空者』【起】〖1回合1次〗将这名单位移动。这个能力只能在这名单位处于未行动状态时使用。",
            keywords: { type: ['【起】'], timing: ['〖1回合1次〗'] }
        }
    };
    const activeCtx = {
        unit: { instanceId: 's1', isTapped: true },
        fieldArea: 'front',
        faceUpBonds: 3,
        usedOnceThisTurn: {},
        myHand: [], myFront: [], myRear: [], bonds: [], isMyTurn: true
    };
    const activatable = abilityEngine.getActivatableAbilities(shidaCard, activeCtx);
    assert(activatable.length === 1, '能力引擎: 翱翔天空者应有1条激活候选');
    assert(activatable[0].canActivate === false, '能力引擎: 单位已横置时翱翔天空者不可激活');

    // getAutoTriggers: on-attack 时机
    const kainCard = {
        ability: {
            text: "『赤绿之双击』【自】[将我方的「阿贝尔」转为已行动状态]这名单位攻击时，你可以支付费用。如果支付，则直到战斗结束为止，这名单位的战斗力+40。",
            keywords: { type: ['【自】'] }
        }
    };
    const autoCtx = {
        timing: 'on-attack',
        unit: { instanceId: 'k1' },
        attacker: { instanceId: 'k1' },
        defender: { instanceId: 'd1' },
        myFront: [], myRear: [], fieldArea: 'front'
    };
    const autoTriggers = abilityEngine.getAutoTriggers(kainCard, autoCtx);
    assert(autoTriggers.length === 1, '能力引擎: 赤绿之双击应在攻击时触发1次');
    assert(autoTriggers[0].title === '赤绿之双击', '能力引擎: 触发名称应为赤绿之双击');

    console.log('纯函数引擎检查通过');
}

try {
    main();
} catch (error) {
    console.error(`纯函数引擎检查失败: ${error.message}`);
    process.exit(1);
}
