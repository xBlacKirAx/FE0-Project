const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');

function loadCreateAreaCommands() {
    const filePath = path.join(projectRoot, 'modules/cardOps/areaCommands.js');
    let code = fs.readFileSync(filePath, 'utf8');

    code = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '');
    code = code.replace(/export\s+function\s+createAreaCommands/g, 'function createAreaCommands');

    const context = {
        module: { exports: {} },
        exports: {},
        console,
        Math,
        Date,
        fetch: async () => ({ json: async () => [] }),
        requestAnimationFrame: (cb) => cb(),
        setTimeout: (cb) => {
            if (typeof cb === 'function') cb();
            return 0;
        },
        document: {
            querySelector: () => ({ scrollTo: () => {}, scrollWidth: 0 }),
            createElement: () => ({
                style: {},
                animate: () => ({ onfinish: null }),
                remove: () => {}
            }),
            body: { appendChild: () => {} }
        },
        window: {
            innerWidth: 1280,
            innerHeight: 720,
            navigator: { vibrate: () => {} }
        },
        alert: () => {},
        emitSyncCardMove: (socket, payload) => { socket.__moves.push(payload); },
        emitPlayerDraw: (socket, payload) => { socket.__draws.push(payload); },
        emitSyncBondFlip: () => {},
        emitSyncReset: () => {},
        emitFullStateSync: () => {},
        emitSyncPhase: () => {}
    };

    vm.runInNewContext(`${code}\nmodule.exports = { createAreaCommands };`, context, { filename: filePath });
    return context.module.exports.createAreaCommands;
}

function loadCreateOpponentAreaStore() {
    const filePath = path.join(projectRoot, 'modules/socket/opponentAreaStore.js');
    let code = fs.readFileSync(filePath, 'utf8');

    code = code.replace(/export\s+function\s+createOpponentAreaStore/g, 'function createOpponentAreaStore');

    const context = {
        module: { exports: {} },
        exports: {},
        console
    };

    vm.runInNewContext(`${code}\nmodule.exports = { createOpponentAreaStore };`, context, { filename: filePath });
    return context.module.exports.createOpponentAreaStore;
}

function ref(value) {
    return { value };
}

function makeSocket() {
    return { __moves: [], __draws: [] };
}

function makeState(overrides = {}) {
    return {
        isDevMode: ref(false),
        isMyTurn: ref(true),
        currentPhase: ref('DEPLOY'),
        usedBondsThisTurn: ref(0),
        hasPlacedBond: ref(false),
        hasBattledThisTurn: ref(false),
        supportInteraction: ref(null),
        PHASES: {
            BEGINNING: { name: '开始阶段' },
            BOND: { name: '羁绊阶段' },
            DEPLOY: { name: '出击阶段' },
            ATTACK: { name: '攻击阶段' },
            END: { name: '结束阶段' }
        },
        ...overrides
    };
}

function makeRefs(overrides = {}) {
    return {
        hand: ref([]),
        fieldFront: ref([]),
        fieldRear: ref([]),
        bonds: ref([]),
        jewels: ref([]),
        graveyard: ref([]),
        boundless: ref([]),
        deck: ref([]),
        undoStack: ref([]),
        selectedCard: ref(null),
        hasPlacedBond: ref(false),
        ...overrides
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function main() {
    const createAreaCommands = loadCreateAreaCommands();
    const createOpponentAreaStore = loadCreateOpponentAreaStore();

    {
        const socket = makeSocket();
        const oldTop = { instanceId: 'f1', cardName: '旧上级', charaName: '马尔斯', isMainCharacter: true, _stackedCards: [{ instanceId: 'f0', cardName: '旧下级', charaName: '马尔斯' }] };
        const handCard = { instanceId: 'h1', cardName: '新上级', charaName: '马尔斯', promoteCost: '2', cost: '4' };
        const drawn = { instanceId: 'd1', cardName: '抽到的牌' };

        const refs = makeRefs({
            hand: ref([handCard]),
            fieldFront: ref([oldTop]),
            deck: ref([drawn])
        });
        const state = makeState({
            fieldFront: refs.fieldFront,
            fieldRear: refs.fieldRear,
            hand: refs.hand,
            deck: refs.deck,
            usedBondsThisTurn: ref(0)
        });

        const commands = createAreaCommands({ state, socket, refs });
        commands.performClassChange(handCard, oldTop);

        assert(refs.fieldFront.value.length === 1, '转职后前排应保留1张顶层卡');
        assert(refs.fieldFront.value[0].instanceId === 'h1', '转职后顶层应是手牌中的新卡');
        assert((refs.fieldFront.value[0]._stackedCards || []).length === 2, '转职后应继承旧顶层及其叠放');
        assert(refs.fieldFront.value[0].isMainCharacter === true, '主人公转职后应保留主人公标识');
        assert(state.usedBondsThisTurn.value === 2, '转职应消耗 promoteCost 费用');
        assert(socket.__moves.some(m => m.from === 'front' && m.to === 'stacked' && m.card.instanceId === 'f1'), '转职应广播旧顶卡离场到 stacked');
        assert(socket.__moves.some(m => m.from === 'hand' && m.to === 'front' && m.card.instanceId === 'h1'), '转职应广播新卡手牌到战场');
        assert(socket.__draws.length === 1, '转职应抽1张卡并广播抽牌');

        commands.undoLastMove();
        assert(refs.fieldFront.value.length === 1 && refs.fieldFront.value[0].instanceId === 'f1', '撤销转职后应恢复旧顶层');
        assert(refs.hand.value.some(c => c.instanceId === 'h1'), '撤销转职后新卡应回手牌');
        assert(refs.deck.value.some(c => c.instanceId === 'd1'), '撤销转职时应将转职抽卡退回牌组并洗牌');
        assert(!refs.hand.value.some(c => c.instanceId === 'd1'), '撤销转职后抽到的卡不应留在手牌');
        assert(state.usedBondsThisTurn.value === 0, '撤销转职后应退还费用');
    }

    {
        const socket = makeSocket();
        const oldTop = { instanceId: 'f10', cardName: '旧上级', charaName: '艾克', isMainCharacter: false, _stackedCards: [] };
        const handCard = { instanceId: 'h10', cardName: '新上级', charaName: '艾克', promoteCost: '1', cost: '3' };
        const lastDeckCard = { instanceId: 'd10', cardName: '最后一张牌组卡' };
        const g1 = { instanceId: 'g10', cardName: '弃牌A' };
        const g2 = { instanceId: 'g11', cardName: '弃牌B' };

        const refs = makeRefs({
            hand: ref([handCard]),
            fieldFront: ref([oldTop]),
            deck: ref([lastDeckCard]),
            graveyard: ref([g1, g2])
        });
        const state = makeState({
            fieldFront: refs.fieldFront,
            fieldRear: refs.fieldRear,
            hand: refs.hand,
            deck: refs.deck,
            graveyard: refs.graveyard,
            usedBondsThisTurn: ref(0)
        });

        const commands = createAreaCommands({ state, socket, refs });
        commands.performClassChange(handCard, oldTop);

        assert(refs.deck.value.length === 2, '转职抽空牌组后应立刻把弃牌区洗回牌组');
        assert(refs.graveyard.value.length === 0, '转职抽空牌组后弃牌区应被清空并洗回');
        assert(socket.__moves.some(m => m.from === 'graveyard' && m.to === 'deck' && m.card.instanceId === 'g10'), '转职触发洗回时应同步弃牌区到牌组');

        commands.undoLastMove();
        assert(refs.deck.value.some(c => c.instanceId === 'd10'), '撤销转职后应恢复原牌组顶卡');
        assert(refs.graveyard.value.some(c => c.instanceId === 'g10') && refs.graveyard.value.some(c => c.instanceId === 'g11'), '撤销转职后应恢复被洗回的弃牌区卡');
    }

    {
        const socket = makeSocket();
        const oldTop = { instanceId: 'f2', cardName: '场上旧卡', charaName: '罗伊', isMainCharacter: false };
        const handCard = { instanceId: 'h2', cardName: '可升级新卡', charaName: '罗伊', promoteCost: 'N/A', cost: '3' };

        const refs = makeRefs({
            hand: ref([handCard]),
            fieldFront: ref([oldTop])
        });
        const state = makeState({
            fieldFront: refs.fieldFront,
            fieldRear: refs.fieldRear,
            hand: refs.hand,
            usedBondsThisTurn: ref(0)
        });

        const commands = createAreaCommands({ state, socket, refs });
        commands.moveTo(handCard, 'front');

        assert(refs.fieldFront.value.length === 1 && refs.fieldFront.value[0].instanceId === 'h2', '升级后顶层应为新卡');
        assert((refs.fieldFront.value[0]._stackedCards || [])[0]?.instanceId === 'f2', '升级后应将旧顶层叠放到新卡下');
        assert(state.usedBondsThisTurn.value === 3, '升级应支付普通出击费用');
        assert(socket.__moves.some(m => m.from === 'front' && m.to === 'stacked' && m.card.instanceId === 'f2'), '升级应广播旧顶卡离场到 stacked');
        assert(socket.__moves.some(m => m.from === 'hand' && m.to === 'front' && m.card.instanceId === 'h2'), '升级应广播新卡上场');

        const receiverState = {
            oppStats: ref({ hand: 1, bonds: 0, active: 0 }),
            oppHand: ref([{ instanceId: 'h2', cardName: '可升级新卡', charaName: '罗伊' }]),
            oppGraveyard: ref([]),
            oppJewels: ref([]),
            oppBonds: ref([]),
            oppDeck: ref([]),
            oppBoundless: ref([]),
            opponentFront: ref([{ instanceId: 'f2', cardName: '场上旧卡', charaName: '罗伊', isMainCharacter: false }]),
            opponentRear: ref([])
        };
        const areaStore = createOpponentAreaStore(receiverState);
        const oldMove = socket.__moves.find(m => m.from === 'front' && m.to === 'stacked' && m.card.instanceId === 'f2');
        const newMove = socket.__moves.find(m => m.from === 'hand' && m.to === 'front' && m.card.instanceId === 'h2');

        areaStore.remove(oldMove.from, oldMove.card.instanceId);
        areaStore.add(oldMove.to, oldMove.card, areaStore.find(oldMove.card.instanceId));
        areaStore.remove(newMove.from, newMove.card.instanceId);
        areaStore.add(newMove.to, newMove.card, areaStore.find(newMove.card.instanceId));

        assert(receiverState.opponentFront.value.length === 1 && receiverState.opponentFront.value[0].instanceId === 'h2', '对手端同步后应显示升级后的新顶层');
        assert((receiverState.opponentFront.value[0]._stackedCards || []).length === 1, '对手端同步后应保留堆叠卡数量');
        assert(receiverState.opponentFront.value[0]._stackedCards[0]?.instanceId === 'f2', '对手端同步后应能看到旧顶层作为堆叠卡');
    }

    {
        const socket = makeSocket();
        const oldTop = { instanceId: 'f3', cardName: '场上同名', charaName: '琪姬', isMainCharacter: false };
        const handCard = { instanceId: 'h3', cardName: '可转职同名', charaName: '琪姬', promoteCost: '1', cost: '4' };

        const refs = makeRefs({
            hand: ref([handCard]),
            fieldFront: ref([oldTop]),
            deck: ref([])
        });
        const state = makeState({
            fieldFront: refs.fieldFront,
            fieldRear: refs.fieldRear,
            hand: refs.hand,
            deck: refs.deck,
            usedBondsThisTurn: ref(0)
        });

        const commands = createAreaCommands({ state, socket, refs });
        commands.moveTo(handCard, 'front');

        assert(refs.fieldFront.value[0].instanceId === 'h3', '同名且可转职时，普通出击应自动转为转职执行');
        assert(state.usedBondsThisTurn.value === 1, '自动转职应按 promoteCost 扣费');
        assert(socket.__moves.some(m => m.from === 'front' && m.to === 'stacked' && m.card.instanceId === 'f3'), '自动转职应广播旧顶层离场');
    }

    {
        const socket = makeSocket();
        const lastDeckCard = { instanceId: 'd20', cardName: '最后一张牌组卡' };
        const g1 = { instanceId: 'g20', cardName: '弃牌A' };
        const g2 = { instanceId: 'g21', cardName: '弃牌B' };

        const refs = makeRefs({
            hand: ref([]),
            deck: ref([lastDeckCard]),
            graveyard: ref([g1, g2]),
            undoStack: ref([])
        });
        const state = makeState({
            currentPhase: ref('BEGINNING'),
            isMyTurn: ref(true),
            hand: refs.hand,
            deck: refs.deck,
            graveyard: refs.graveyard
        });

        const commands = createAreaCommands({ state, socket, refs });
        commands.drawCard();

        assert(refs.hand.value.some(c => c.instanceId === 'd20'), '抽牌应拿到牌组顶卡');
        assert(refs.deck.value.length === 2, '抽空牌组后应立刻把弃牌区洗回牌组');
        assert(refs.graveyard.value.length === 0, '抽空牌组后弃牌区应被清空并洗回');

        commands.undoLastMove();
        assert(refs.hand.value.length === 0, '撤销抽牌后手牌应恢复');
        assert(refs.deck.value.some(c => c.instanceId === 'd20'), '撤销抽牌后应恢复原牌组顶卡');
        assert(refs.graveyard.value.some(c => c.instanceId === 'g20') && refs.graveyard.value.some(c => c.instanceId === 'g21'), '撤销抽牌后应恢复被洗回的弃牌区卡');
    }

    console.log('升级/转职烟测检查通过');
}

try {
    main();
} catch (error) {
    console.error(`升级/转职烟测检查失败: ${error.message}`);
    process.exit(1);
}
