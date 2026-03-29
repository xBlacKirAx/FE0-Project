const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function ref(value) {
    return { value };
}

function loadEsModuleFunctions(relativePath, exportedNames) {
    const filePath = path.join(projectRoot, relativePath);
    let code = fs.readFileSync(filePath, 'utf8');

    code = code.replace(/export\s+function\s+/g, 'function ');
    code = code.replace(/export\s+const\s+/g, 'const ');

    const exportBlock = `\nmodule.exports = { ${exportedNames.join(', ')} };`;
    const context = {
        module: { exports: {} },
        exports: {},
        console
    };
    vm.runInNewContext(code + exportBlock, context, { filename: filePath });
    return context.module.exports;
}

function loadCreateCombatCommands(deps) {
    const filePath = path.join(projectRoot, 'modules/cardOps/combatCommands.js');
    let code = fs.readFileSync(filePath, 'utf8');
    code = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '');
    code = code.replace(/export\s+function\s+createCombatCommands/g, 'function createCombatCommands');

    const context = {
        module: { exports: {} },
        exports: {},
        console,
        Math,
        Date,
        alert: () => {},
        confirm: () => true,
        setTimeout: (fn) => {
            if (typeof fn === 'function') fn();
            return 0;
        },
        ...deps
    };

    vm.runInNewContext(`${code}\nmodule.exports = { createCombatCommands };`, context, { filename: filePath });
    return context.module.exports.createCombatCommands;
}

function loadRegisterBattleListeners(deps) {
    const filePath = path.join(projectRoot, 'modules/socket/registerBattleListeners.js');
    let code = fs.readFileSync(filePath, 'utf8');
    code = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '');
    code = code.replace(/export\s+function\s+registerBattleListeners/g, 'function registerBattleListeners');

    const context = {
        module: { exports: {} },
        exports: {},
        console,
        setTimeout: (fn) => {
            if (typeof fn === 'function') fn();
            return 0;
        },
        ...deps
    };

    vm.runInNewContext(`${code}\nmodule.exports = { registerBattleListeners };`, context, { filename: filePath });
    return context.module.exports.registerBattleListeners;
}

function makeSocket() {
    const handlers = new Map();
    return {
        emitted: [],
        on(event, handler) {
            handlers.set(event, handler);
        },
        emit(event, payload) {
            this.emitted.push({ event, payload });
        },
        trigger(event, payload) {
            const fn = handlers.get(event);
            if (typeof fn === 'function') fn(payload || {});
        }
    };
}

function makeBaseState(overrides = {}) {
    return {
        hand: ref([]),
        bonds: ref([]),
        graveyard: ref([]),
        deck: ref([]),
        fieldFront: ref([]),
        fieldRear: ref([]),
        opponentFront: ref([]),
        opponentRear: ref([]),
        attacker: ref(null),
        defender: ref(null),
        selectedCard: ref(null),
        supportInteraction: ref(null),
        combatStats: ref({ supportNotice: null }),
        combatDecision: ref({ stage: 'idle', promptOwner: null }),
        mySupportCard: ref(null),
        oppSupportCard: ref(null),
        isCombatActive: ref(false),
        isDevMode: ref(false),
        hasBattledThisTurn: ref(false),
        firstPlayerOpeningTurnLocked: ref(false),
        oppStats: ref({ hand: 0, bonds: 0, active: 0 }),
        jewels: ref([]),
        oppJewels: ref([]),
        oppGraveyard: ref([]),
        ...overrides
    };
}

function loadEffectTimingGroups() {
    const catalogPath = path.join(projectRoot, 'data', 'support_effect_catalog_full.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const attackOnly = [];
    const defenseOnly = [];

    for (const item of Array.isArray(catalog) ? catalog : []) {
        const effectId = String(item?.effectId || '').trim();
        if (!effectId) continue;

        const effectName = String(item?.effectName || '').trim() || effectId;
        const timings = Array.isArray(item?.timings)
            ? item.timings.map(text => String(text || '').trim()).filter(Boolean)
            : [];

        const hasAttack = timings.includes('〖攻击型〗');
        const hasDefense = timings.includes('〖防御型〗');
        const hasBoth = timings.includes('〖攻防型〗') || (hasAttack && hasDefense);

        if (hasBoth) continue;
        if (hasAttack) attackOnly.push({ effectId, effectName, timing: '〖攻击型〗' });
        if (hasDefense) defenseOnly.push({ effectId, effectName, timing: '〖防御型〗' });
    }

    return { attackOnly, defenseOnly };
}

function buildSupportCard({ effectId, effectName, timing, instanceId, charaName = '测试支援者' }) {
    return {
        instanceId,
        charaName,
        support: 30,
        supportAbility: {
            effectId,
            effectName,
            effectTiming: timing,
            keywords: {
                title: [`『${effectName}』`],
                timing: [timing]
            }
        }
    };
}

function main() {
    const support = loadEsModuleFunctions('modules/engine/supportEffectEngine.js', [
        'resolveSupportEffectResult',
        'isSupportFailed'
    ]);

    const createCombatCommands = loadCreateCombatCommands({
        isAttackerFromMyField: () => true,
        getCombatWinner: (mine, opp) => mine >= opp,
        createInitialCombatDecision: () => ({ stage: 'idle', promptOwner: null, criticalPower: 0 }),
        getInitialCombatDecisionContext: () => ({ stage: 'auto-miss', promptOwner: null, criticalPower: 0 }),
        resolveSupportEffectResult: support.resolveSupportEffectResult,
        isSupportFailed: support.isSupportFailed,
        emitSyncAttack: () => {},
        emitSyncCardMove: () => {},
        emitPlayerDraw: () => {},
        emitSyncCardUntap: () => {},
        emitSyncCombatDecision: () => {},
        emitSyncSupportInteractionRequest: () => {},
        emitSyncSupportInteractionResolve: () => {},
        computePassivePowerBonus: () => ({ totalDelta: 0, breakdown: [] }),
        buildPassiveContext: () => ({}),
        getAutoTriggers: () => []
    });

    const EVT = {
        OPPONENT_ATTACK: 'OPPONENT_ATTACK',
        OPPONENT_DEFENSE_SUPPORT: 'OPPONENT_DEFENSE_SUPPORT',
        OPPONENT_CARD_UNTAP: 'OPPONENT_CARD_UNTAP',
        OPPONENT_UNTAP_ALL: 'OPPONENT_UNTAP_ALL',
        OPPONENT_COMBAT_DECISION: 'OPPONENT_COMBAT_DECISION',
        OPPONENT_SUPPORT_INTERACTION_REQUEST: 'OPPONENT_SUPPORT_INTERACTION_REQUEST',
        OPPONENT_SUPPORT_INTERACTION_RESOLVE: 'OPPONENT_SUPPORT_INTERACTION_RESOLVE',
        SYNC_DEFENSE_SUPPORT: 'SYNC_DEFENSE_SUPPORT'
    };

    const registerBattleListeners = loadRegisterBattleListeners({
        resolveSupportEffectResult: support.resolveSupportEffectResult,
        isSupportFailed: support.isSupportFailed,
        emitPlayerDraw: () => {},
        emitSyncCardMove: () => {},
        computePassivePowerBonus: () => ({ totalDelta: 0, breakdown: [] }),
        buildPassiveContext: () => ({})
    });

    const timingGroups = loadEffectTimingGroups();

    assert(timingGroups.attackOnly.length > 0, '游玩模式规则烟测: 未找到纯攻击型纹章');
    assert(timingGroups.defenseOnly.length > 0, '游玩模式规则烟测: 未找到纯防御型纹章');

    {
        const socket = makeSocket();
        const state = makeBaseState({
            fieldFront: ref([{ instanceId: 'atk-1', charaName: '库洛姆', attack: 40, isTapped: false }]),
            opponentFront: ref([{ instanceId: 'def-1', charaName: '马尔斯', attack: 40, isMainCharacter: false }]),
            deck: ref([
                {
                    instanceId: 'sup-same',
                    charaName: '库洛姆',
                    support: 20,
                    supportAbility: {
                        keywords: { title: ['『攻击之纹章』'], timing: ['〖攻击型〗'] }
                    }
                }
            ])
        });

        const commands = createCombatCommands({ state, socket });
        commands.initiateAttack(state, state.fieldFront.value[0], state.opponentFront.value[0]);

        assert(state.combatStats.value.attackerSupportApplied === 0, '游玩模式(本地攻击): 同名支援应为0');
        assert(String(state.combatStats.value.supportNotice || '').includes('支援失效'), '游玩模式(本地攻击): 同名支援应提示失效');
    }

    for (let i = 0; i < timingGroups.defenseOnly.length; i++) {
        const effect = timingGroups.defenseOnly[i];
        const socket = makeSocket();
        const state = makeBaseState({
            fieldFront: ref([{ instanceId: `atk-local-${i}`, charaName: '露琪娜', attack: 30, isTapped: false }]),
            opponentFront: ref([{ instanceId: `def-local-${i}`, charaName: '马尔斯', attack: 40, isMainCharacter: false }]),
            deck: ref([
                buildSupportCard({
                    effectId: effect.effectId,
                    effectName: effect.effectName,
                    timing: effect.timing,
                    instanceId: `sup-local-${effect.effectId}`,
                    charaName: '希达'
                })
            ])
        });

        const commands = createCombatCommands({ state, socket });
        commands.initiateAttack(state, state.fieldFront.value[0], state.opponentFront.value[0]);

        assert(state.combatStats.value.attackerSupportApplied === 30, `游玩模式(本地攻击): ${effect.effectName} 支援值应正常计入`);
        assert(state.combatStats.value.attackerCriticalLocked === false, `游玩模式(本地攻击): ${effect.effectName} 不应越权锁定必杀`);
        assert(state.combatStats.value.defenderEvasionLocked === false, `游玩模式(本地攻击): ${effect.effectName} 不应越权锁定回避`);
        assert(String(state.combatStats.value.supportNotice || '').includes('时机不符'), `游玩模式(本地攻击): ${effect.effectName} 时机不符应有提示`);
    }

    for (let i = 0; i < timingGroups.attackOnly.length; i++) {
        const effect = timingGroups.attackOnly[i];
        const socket = makeSocket();
        const state = makeBaseState({
            defender: ref({ instanceId: `my-def-${i}`, charaName: '琪姬', attack: 40, isMainCharacter: false }),
            combatStats: ref({
                myCardPower: 0,
                mySupportPower: 0,
                myTotalPower: 50,
                oppTotalPower: 40,
                attackerCriticalLocked: false,
                defenderEvasionLocked: false,
                encourageDrawOnBreakMainCharacter: false,
                opponentSupportEffectSealed: false,
                jewelBreakCount: 1,
                attackerSupportApplied: 0,
                defenderSupportApplied: 0,
                postBattleEffects: [],
                supportNotice: null
            })
        });

        registerBattleListeners({
            state,
            socket,
            EVT,
            beginCombatResolution: () => {},
            applyCombatDecision: () => {},
            handleIncomingSupportInteractionRequest: () => {},
            handleIncomingSupportInteractionResolve: () => {}
        });

        socket.trigger(EVT.OPPONENT_DEFENSE_SUPPORT, {
            supportCard: buildSupportCard({
                effectId: effect.effectId,
                effectName: effect.effectName,
                timing: effect.timing,
                instanceId: `sup-socket-${effect.effectId}`,
                charaName: '密涅瓦'
            })
        });

        assert(state.combatStats.value.defenderSupportApplied === 30, `游玩模式(socket防守): ${effect.effectName} 支援值应正常计入`);
        assert(state.combatStats.value.attackerCriticalLocked === false, `游玩模式(socket防守): ${effect.effectName} 不应越权锁定必杀`);
        assert(state.combatStats.value.defenderEvasionLocked === false, `游玩模式(socket防守): ${effect.effectName} 不应越权锁定回避`);
        assert(String(state.combatStats.value.supportNotice || '').includes('时机不符'), `游玩模式(socket防守): ${effect.effectName} 时机不符应有提示`);
    }

    {
        const socket = makeSocket();
        const state = makeBaseState({
            defender: ref({ instanceId: 'my-def-2', charaName: '萨莉雅', attack: 30, isMainCharacter: false }),
            combatStats: ref({
                myCardPower: 0,
                mySupportPower: 0,
                myTotalPower: 50,
                oppTotalPower: 40,
                attackerCriticalLocked: false,
                defenderEvasionLocked: false,
                encourageDrawOnBreakMainCharacter: false,
                opponentSupportEffectSealed: false,
                jewelBreakCount: 1,
                attackerSupportApplied: 0,
                defenderSupportApplied: 0,
                postBattleEffects: [],
                supportNotice: null
            })
        });

        registerBattleListeners({
            state,
            socket,
            EVT,
            beginCombatResolution: () => {},
            applyCombatDecision: () => {},
            handleIncomingSupportInteractionRequest: () => {},
            handleIncomingSupportInteractionResolve: () => {}
        });

        socket.trigger(EVT.OPPONENT_DEFENSE_SUPPORT, {
            supportCard: {
                instanceId: 'sup-def-same',
                charaName: '萨莉雅',
                support: 20,
                supportAbility: {
                    keywords: { title: ['『防御之纹章』'], timing: ['〖防御型〗'] }
                }
            }
        });

        assert(state.combatStats.value.defenderSupportApplied === 0, '游玩模式(socket防守): 同名支援应为0');
        assert(String(state.combatStats.value.supportNotice || '').includes('支援失效'), '游玩模式(socket防守): 同名支援应提示失效');
    }

    console.log(`游玩模式支援规则烟测检查通过: 纯防御型越权样本=${timingGroups.defenseOnly.length}, 纯攻击型越权样本=${timingGroups.attackOnly.length}`);
}

try {
    main();
} catch (error) {
    console.error(`游玩模式支援规则烟测检查失败: ${error.message}`);
    process.exit(1);
}
