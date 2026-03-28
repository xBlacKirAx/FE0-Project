const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');

function loadRegisterStateListeners() {
    const filePath = path.join(projectRoot, 'modules/socket/registerStateListeners.js');
    let code = fs.readFileSync(filePath, 'utf8');
    code = code.replace(/export\s+function\s+registerStateListeners/g, 'function registerStateListeners');

    const context = {
        module: { exports: {} },
        exports: {},
        console
    };

    vm.runInNewContext(`${code}\nmodule.exports = { registerStateListeners };`, context, { filename: filePath });
    return context.module.exports.registerStateListeners;
}

function ref(value) {
    return { value };
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeState() {
    return {
        opponentFront: ref([]),
        opponentRear: ref([]),
        oppBonds: ref([]),
        oppJewels: ref([]),
        oppGraveyard: ref([]),
        oppHand: ref([]),
        oppDeck: ref([]),
        oppBoundless: ref([]),
        oppStats: ref({ hand: 0, bonds: 0, active: 0 }),
        isDevMode: ref(false),
        isMyTurn: ref(true),
        currentPhase: ref('BEGINNING'),
        hasPlacedBond: ref(false),
        usedBondsThisTurn: ref(0)
    };
}

function makeSocket() {
    const handlers = {};
    return {
        connected: true,
        __handlers: handlers,
        __emits: [],
        on(event, cb) {
            handlers[event] = cb;
        },
        emit(event, payload) {
            this.__emits.push({ event, payload });
        }
    };
}

function main() {
    const registerStateListeners = loadRegisterStateListeners();
    const EVT = {
        OPPONENT_DRAW_CARD: 'opponent-draw-card',
        OPPONENT_BOND_FLIPPED: 'opponent-bond-flipped',
        OPPONENT_CARD_MOVED: 'opponent-card-moved',
        REQUEST_SYNC: 'request-sync',
        FULL_STATE_SYNC: 'full-state-sync',
        SYNC_RESET: 'sync-reset',
        OPPONENT_DEV_MODE_CHANGED: 'opponent-dev-mode-changed'
    };

    {
        const state = makeState();
        const socket = makeSocket();
        let requestHandledCount = 0;
        let latestRequest = null;

        registerStateListeners({
            state,
            socket,
            EVT,
            getMySyncData: () => ({ handCount: 1, bondsCount: 1 }),
            resetGame: () => {},
            areaStore: {
                remove: () => {},
                add: () => {}
            },
            handleIncomingSupportInteractionRequest: (s, payload) => {
                requestHandledCount += 1;
                latestRequest = payload;
            }
        });

        const syncPayload = {
            front: [],
            rear: [],
            bonds: [],
            jewels: [],
            graveyard: [],
            hand: [],
            deck: [],
            boundless: [],
            handCount: 0,
            bondsCount: 0,
            pendingSupportRequest: {
                requestId: 'dark-req-1',
                type: 'dark-discard'
            }
        };

        socket.__handlers[EVT.FULL_STATE_SYNC](syncPayload);
        assert(requestHandledCount === 1, '全量同步后应补收并处理待处理支援请求');
        assert(latestRequest && latestRequest.requestId === 'dark-req-1', '补收请求应携带原 requestId');

        socket.__handlers[EVT.FULL_STATE_SYNC](syncPayload);
        assert(requestHandledCount === 1, '相同 requestId 的全量同步不应重复处理');

        socket.__handlers[EVT.FULL_STATE_SYNC]({
            ...syncPayload,
            pendingSupportRequest: {
                requestId: 'dark-req-2',
                type: 'dark-discard'
            }
        });
        assert(requestHandledCount === 2, '新的 requestId 应被处理');
    }

    console.log('断线重连烟测检查通过');
}

try {
    main();
} catch (error) {
    console.error(`断线重连烟测检查失败: ${error.message}`);
    process.exit(1);
}
