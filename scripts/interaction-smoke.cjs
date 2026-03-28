const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');

function loadCreateCombatCommands() {
    const filePath = path.join(projectRoot, 'modules/cardOps/combatCommands.js');
    let code = fs.readFileSync(filePath, 'utf8');

    code = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '');
    code = code.replace(/export\s+function\s+createCombatCommands/g, 'function createCombatCommands');

    const context = {
        module: { exports: {} },
        exports: {},
        console,
        setTimeout: () => 0,
        alert: () => {},
        confirm: () => true,
        Math,
        Date,
        isAttackerFromMyField: () => true,
        getCombatWinner: (mine, opp) => mine >= opp,
        createInitialCombatDecision: () => ({ stage: 'idle', promptOwner: null }),
        getInitialCombatDecisionContext: (myCardPower, mySupportPower, oppTotalPower) => {
            const myTotal = (myCardPower || 0) + (mySupportPower || 0);
            if (myTotal >= (oppTotalPower || 0)) {
                return {
                    stage: 'awaiting-defender-evasion',
                    promptOwner: 'defender',
                    criticalPower: (myCardPower || 0) * 2 + (mySupportPower || 0)
                };
            }
            return {
                stage: 'auto-miss',
                promptOwner: null,
                criticalPower: (myCardPower || 0) * 2 + (mySupportPower || 0)
            };
        },
        resolveSupportEffectResult: () => null,
        isSupportFailed: () => false,
        emitSyncAttack: () => {},
        emitPlayerDraw: (socket, payload) => {
            socket.__draws.push(payload);
        },
        emitSyncCardUntap: () => {},
        emitSyncCombatDecision: (socket, payload) => {
            socket.__combatDecisions.push(payload);
        },
        emitSyncCardMove: (socket, payload) => {
            socket.__moves.push(payload);
        },
        emitSyncSupportInteractionRequest: (socket, payload) => {
            socket.__supportRequests.push(payload);
        },
        emitSyncSupportInteractionResolve: (socket, payload) => {
            socket.__supportResolves.push(payload);
        }
    };

    vm.runInNewContext(`${code}\nmodule.exports = { createCombatCommands };`, context, { filename: filePath });
    return context.module.exports.createCombatCommands;
}

function ref(value) {
    return { value };
}

function makeSocket() {
    return {
        __moves: [],
        __draws: [],
        __combatDecisions: [],
        __supportRequests: [],
        __supportResolves: []
    };
}

function makeState(overrides = {}) {
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
        oppStats: ref({ hand: 0, bonds: 0, active: 0 }),
        jewels: ref([]),
        oppJewels: ref([]),
        oppGraveyard: ref([]),
        ...overrides
    };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    const createCombatCommands = loadCreateCombatCommands();

    {
        const socket = makeSocket();
        const state = makeState({
            hand: ref([{ instanceId: 'h1', cardName: 'A' }, { instanceId: 'h2', cardName: 'B' }]),
            graveyard: ref([]),
            supportInteraction: ref(null),
            combatStats: ref({ supportNotice: null })
        });
        const commands = createCombatCommands({ state, socket });
        commands.handleIncomingSupportInteractionRequest(state, { requestId: 'dark-1', type: 'dark-discard' });
        assert(state.supportInteraction.value?.type === 'dark-self-discard', '黑暗之纹章请求后应进入自弃选择状态');
        assert(String(state.combatStats.value.supportNotice || '').includes('黑暗之纹章'), '黑暗之纹章请求后应显示提示');
        const ok = commands.resolveSupportInteraction(state, 'h2');
        assert(ok === true, '黑暗之纹章应允许选择手牌弃置');
        assert(state.hand.value.length === 1 && state.graveyard.value.length === 1, '黑暗之纹章应将手牌移入退避区');
        assert(socket.__moves[0]?.from === 'hand' && socket.__moves[0]?.to === 'graveyard', '黑暗之纹章应同步手牌移动');
        assert(socket.__supportResolves[0]?.type === 'dark-discard' && socket.__supportResolves[0]?.success === true, '黑暗之纹章应同步完成结果');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            deck: ref([{ instanceId: 'd1', cardName: '顶牌' }]),
            graveyard: ref([])
        });
        const commands = createCombatCommands({ state, socket });
        commands.handleIncomingSupportInteractionRequest(state, { requestId: 'thief-1', type: 'thief-mill-top-deck' });
        assert(state.deck.value.length === 0 && state.graveyard.value.length === 1, '盗贼之纹章应将牌组顶移入退避区');
        assert(socket.__supportResolves[0]?.type === 'thief-mill-top-deck' && socket.__supportResolves[0]?.success === true, '盗贼之纹章应回传处理完成');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            fieldFront: ref([{ instanceId: 'ally-1', cardName: '前排同伴' }]),
            fieldRear: ref([]),
            supportInteraction: ref({ type: 'sky-move', excludedId: 'attacker-1' }),
            attacker: ref({ instanceId: 'attacker-1' }),
            combatStats: ref({ supportNotice: '天空之纹章' })
        });
        const commands = createCombatCommands({ state, socket });
        const ok = commands.resolveSupportInteraction(state, 'ally-1');
        assert(ok === true, '天空之纹章应允许移动我方其他单位');
        assert(state.fieldFront.value.length === 0 && state.fieldRear.value.length === 1, '天空之纹章应完成前后排切换');
        assert(socket.__moves[0]?.from === 'front' && socket.__moves[0]?.to === 'rear', '天空之纹章应同步移动结果');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            hand: ref([{ instanceId: 'h4', cardName: '放回牌组顶' }]),
            deck: ref([{ instanceId: 'd2', cardName: '原顶牌' }]),
            supportInteraction: ref({ type: 'courage-topdeck' }),
            combatStats: ref({ supportNotice: '勇气之纹章' })
        });
        const commands = createCombatCommands({ state, socket });
        const ok = commands.resolveSupportInteraction(state, 'h4');
        assert(ok === true, '勇气之纹章应允许选择手牌放回牌组顶');
        assert(state.hand.value.length === 0, '勇气之纹章应移出被选择手牌');
        assert(state.deck.value[state.deck.value.length - 1]?.instanceId === 'h4', '勇气之纹章应将选择手牌置于牌组顶');
        assert(socket.__moves[0]?.from === 'hand' && socket.__moves[0]?.to === 'deck', '勇气之纹章应同步手牌到牌组');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            fieldFront: ref([{ instanceId: 'ally-2', cardName: '歌舞目标', cost: '2', isTapped: true }]),
            fieldRear: ref([]),
            supportInteraction: ref({ type: 'dance-untap-ally', excludedId: 'attacker-2' }),
            attacker: ref({ instanceId: 'attacker-2' }),
            combatStats: ref({ supportNotice: '歌舞之纹章' })
        });
        const commands = createCombatCommands({ state, socket });
        const ok = commands.resolveSupportInteraction(state, 'ally-2');
        assert(ok === true, '歌舞之纹章应允许选择出击费用2以下单位回正');
        assert(state.fieldFront.value[0].isTapped === false, '歌舞之纹章应将目标单位转为未行动');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            hand: ref([{ instanceId: 'h3', cardName: '置羁绊' }]),
            bonds: ref([]),
            supportInteraction: ref({ type: 'manakete-hand-to-bond' }),
            combatStats: ref({ supportNotice: '龙人之纹章' })
        });
        const commands = createCombatCommands({ state, socket });
        const ok = commands.resolveSupportInteraction(state, 'h3');
        assert(ok === true, '龙人之纹章应允许选择手牌置入羁绊区');
        assert(state.hand.value.length === 0 && state.bonds.value.length === 1, '龙人之纹章应将手牌移入羁绊区');
        assert(socket.__moves[0]?.from === 'hand' && socket.__moves[0]?.to === 'bonds', '龙人之纹章应同步手牌到羁绊区');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            jewels: ref([{ instanceId: 'j1', cardName: '宝玉A', isFaceDown: true }]),
            supportInteraction: ref({ type: 'peek-own-jewel' }),
            combatStats: ref({ supportNotice: '查看宝玉' })
        });
        const commands = createCombatCommands({ state, socket });
        const ok = commands.resolveSupportInteraction(state, 'j1');
        assert(ok === true, '光明/希望之纹章应允许选择宝玉查看');
        assert(state.supportInteraction.value === null, '查看宝玉完成后应清空交互状态');
        assert(String(state.combatStats.value.supportNotice || '').includes('宝玉A'), '查看宝玉后应记录提示信息');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            opponentFront: ref([{ instanceId: 'enemy-1', cardName: '敌前排' }]),
            opponentRear: ref([]),
            defender: ref({ instanceId: 'def-1' }),
            supportInteraction: ref({ type: 'strategy-select-enemy', requestId: 'strategy-1', excludedId: 'def-1' }),
            combatStats: ref({ supportNotice: '计略之纹章' })
        });
        const commands = createCombatCommands({ state, socket });
        const ok = commands.resolveSupportInteraction(state, 'enemy-1');
        assert(ok === true, '计略之纹章应允许选择敌方非防御单位');
        assert(socket.__supportRequests[0]?.type === 'strategy-move-enemy', '计略之纹章应向对手发送移动请求');
        assert(socket.__supportRequests[0]?.toArea === 'rear', '计略之纹章应根据目标所在区域计算目标位置');
        assert(state.supportInteraction.value?.type === 'strategy-await-opponent', '计略之纹章发起请求后应等待对手完成');
        commands.handleIncomingSupportInteractionResolve(state, { requestId: 'strategy-1', type: 'strategy-move-enemy', success: true });
        assert(state.supportInteraction.value === null, '计略之纹章完成后应清空等待状态');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            fieldFront: ref([{ instanceId: 'my-front', cardName: '己方前排' }]),
            fieldRear: ref([]),
            defender: ref({ instanceId: 'def-2' })
        });
        const commands = createCombatCommands({ state, socket });
        commands.handleIncomingSupportInteractionRequest(state, {
            requestId: 'strategy-2',
            type: 'strategy-move-enemy',
            targetCardId: 'my-front',
            toArea: 'rear'
        });
        assert(state.fieldFront.value.length === 0 && state.fieldRear.value.length === 1, '计略之纹章被请求方应执行单位移动');
        assert(socket.__supportResolves[0]?.requestId === 'strategy-2' && socket.__supportResolves[0]?.success === true, '计略之纹章被请求方应返回成功结果');
    }

    {
        const socket = makeSocket();
        const state = makeState({
            combatStats: ref({
                myCardPower: 30,
                mySupportPower: 0,
                oppTotalPower: 20,
                attackerCriticalLocked: false,
                defenderEvasionLocked: true
            }),
            combatDecision: ref({ stage: 'idle', promptOwner: null }),
            attacker: ref({ instanceId: 'atk-1' }),
            defender: ref({ instanceId: 'def-3', isMainCharacter: false }),
            fieldFront: ref([{ instanceId: 'atk-1' }]),
            fieldRear: ref([]),
            opponentFront: ref([{ instanceId: 'def-3' }]),
            opponentRear: ref([]),
            graveyard: ref([]),
            oppGraveyard: ref([])
        });
        const commands = createCombatCommands({ state, socket });
        commands.beginCombatResolution(state);
        assert(state.combatDecision.value.finalAttackerWins === true, '必中之纹章应在可击破时禁止神速回避并直接判定攻击方胜');
    }

    console.log('交互烟测检查通过');
}

try {
    main();
} catch (error) {
    console.error(`交互烟测检查失败: ${error.message}`);
    process.exit(1);
}