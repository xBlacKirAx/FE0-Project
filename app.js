// app.js
import { createGameState } from './modules/state.js';
import { createRulesEngine } from './modules/rules.js';
import { createCardOperations } from './modules/cardOps.js';
import { createDragDropHandler } from './modules/dragDrop.js';
import { createTurnManager } from './modules/turnManagement.js';
import { createSocketHandler } from './modules/socketHandler.js';
import { createPanelViewModels } from './modules/viewModels.js';
import { formatAbility, formatSupport } from './modules/formatters.js';
import { createUiActions } from './modules/uiActions.js';
import {
    normalizeRoomPayload,
    deriveRoomRole,
    deriveRoomStatusText,
    didOpponentLeaveRoom,
    deriveRoomScene,
    deriveTopBarUi
} from './modules/roomUiState.js';
import { CombatOverlay } from './components/CombatOverlay.js';
import { RegionPanel } from './components/RegionPanel.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { BattleRow } from './components/BattleRow.js';
import { BondStrip } from './components/BondStrip.js';
import { HandStrip } from './components/HandStrip.js';
import { DeckWidget } from './components/DeckWidget.js';
import { SidePanelButtons } from './components/SidePanelButtons.js';
import { OppHandPanel } from './components/OppHandPanel.js';
import { OppDeckPanel } from './components/OppDeckPanel.js';
import { TopControlBar } from './components/TopControlBar.js';
import { DeckManagerModal } from './components/DeckManagerModal.js';

const { createApp, computed, onMounted, watch, ref } = Vue;

const ROOM_CACHE_KEY = 'fe0.roomCache';

function saveRoomCache(cache) {
    try {
        localStorage.setItem(ROOM_CACHE_KEY, JSON.stringify(cache || {}));
    } catch {
        // ignore
    }
}

function loadRoomCache() {
    try {
        const raw = localStorage.getItem(ROOM_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

function clearRoomCache() {
    try {
        localStorage.removeItem(ROOM_CACHE_KEY);
    } catch {
        // ignore
    }
}

// 可选: 'theme1' (默认熔岩对峙), 'theme2' (金属桌垫)
const BATTLE_THEME = 'theme1';

createApp({
    components: {
        BattleRow,
        BondStrip,
        HandStrip,
        DeckWidget,
        SidePanelButtons,
        TopControlBar,
        DeckManagerModal,
        CombatOverlay,
        RegionPanel,
        CardDetailModal,
        OppHandPanel,
        OppDeckPanel
    },
    setup() {
        const state = createGameState();
        const rules = createRulesEngine(state);
        // 👇 加上 rules 参数，让 cardOps 也能使用规则引擎！
        const cardOps = createCardOperations(state, rules); 
        const dragDrop = createDragDropHandler(state, cardOps, rules)
        const turnMgr = createTurnManager(state);
        const socketHandler = createSocketHandler(state, cardOps);
        const EVT = globalThis.SOCKET_EVENTS || {};

        const isMyCard = (card) => !!cardOps.getArea(card);
        const isCardInHand = (card) => state.hand.value.some(c => c.instanceId === card.instanceId);
        const formattedAbility = formatAbility;
        const formattedSupport = formatSupport;

        const {
            activePanelTitle,
            activePanelCards,
            isOpponentPanel,
            playerPanelButtons,
            enemyPanelButtons
        } = createPanelViewModels(state, computed);
        const remainingCost = computed(() => Math.max(0, (state.bonds.value?.length || 0) - (state.usedBondsThisTurn.value || 0)));
        const totalBonds = computed(() => state.bonds.value?.length || 0);
        const currentPhaseName = computed(() => state.PHASES?.[state.currentPhase.value]?.name || state.currentPhase.value || '');
        const showNextPhaseButton = computed(() =>
            state.isDevMode.value || (state.isMyTurn.value && (state.currentPhase.value || 'BEGINNING') !== 'BEGINNING')
        );
        const nextPhaseLabel = computed(() => (state.currentPhase.value || 'BEGINNING') === 'END' ? '结束' : 'NEXT');
        const isMyCombatAttacker = computed(() => ['fieldFront', 'fieldRear'].some(area =>
            state[area].value.some(card => card.instanceId === state.attacker.value?.instanceId)
        ));
        const selectedCombatCostCardId = ref(null);
        const selectedCombatCostCardName = ref('');
        const showDeckManager = ref(false);
        const isCompactMobile = ref(false);
        const cachedRoomPassword = ref('');
        const startRoomButtonConsumed = ref(false);
        const isHandlingRoomGameStart = ref(false);
        const lastHandledRoomGameStartTs = ref(0);
        const phaseBeforeDevMode = ref(state.currentPhase.value || 'BEGINNING');
        const canStartRoomGame = computed(() => !!state.roomId.value && state.roomReady.value);
        const roomScene = computed(() => deriveRoomScene({
            connectionScene: state.connectionScene.value,
            roomId: state.roomId.value,
            roomQueueing: state.roomQueueing.value,
            roomReady: state.roomReady.value,
            roomGameInProgress: state.roomGameInProgress.value
        }));
        const topBarUi = computed(() => deriveTopBarUi({
            roomScene: roomScene.value,
            roomGameInProgress: state.roomGameInProgress.value,
            showNextPhaseButton: showNextPhaseButton.value,
            startRoomButtonConsumed: startRoomButtonConsumed.value,
            isCompactMobile: isCompactMobile.value
        }));

        const getCardCharaName = (card) => {
            const direct = (card?.charaName || '').trim();
            if (direct) return direct;
            const fullName = (card?.cardName || card?.name || '').trim();
            if (!fullName) return '';
            const idx = fullName.search(/\s/);
            if (idx > -1) {
                const derived = fullName.slice(idx).trim();
                if (derived) return derived;
            }
            return fullName;
        };

        const isLocalDecisionActor = computed(() => {
            const owner = state.combatDecision.value?.promptOwner;
            if (!owner) return false;
            return (owner === 'attacker' && isMyCombatAttacker.value) || (owner === 'defender' && !isMyCombatAttacker.value);
        });

        const requiredCombatCharaName = computed(() => {
            const stage = state.combatDecision.value?.stage;
            if (stage === 'awaiting-attacker-critical') return getCardCharaName(state.attacker.value);
            if (stage === 'awaiting-defender-evasion' || stage === 'awaiting-defender-evasion-after-critical') return getCardCharaName(state.defender.value);
            return '';
        });

        const combatCostCandidates = computed(() => {
            if (!isLocalDecisionActor.value) return [];
            const required = requiredCombatCharaName.value;
            if (!required) return [];
            return state.hand.value.filter(card => getCardCharaName(card) === required);
        });

        const selectedCombatCostCard = computed(() =>
            combatCostCandidates.value.find(card => card.instanceId === selectedCombatCostCardId.value) || null
        );

        const resolvedPanelTitle = computed(() => {
            if (state.activePanel.value === 'combatCostHand') {
                return `战斗代价选择（角色名：${requiredCombatCharaName.value || '未知'}）`;
            }
            if (state.activePanel.value === 'supportMagicDiscardHand') {
                return '魔术之纹章：选择1张手牌弃置';
            }
            if (state.activePanel.value === 'supportCourageTopdeckHand') {
                return '勇气之纹章：选择1张手牌放回牌组顶';
            }
            if (state.activePanel.value === 'supportManaketeHandToBond') {
                return '龙人之纹章：选择1张手牌置入羁绊区';
            }
            if (state.activePanel.value === 'supportDarkSelfDiscardHand') {
                return '黑暗之纹章：选择1张手牌弃置';
            }
            if (state.activePanel.value === 'supportSkyMoveCandidates') {
                return '天空之纹章：选择1名我方单位移动';
            }
            if (state.activePanel.value === 'supportDanceUntapCandidates') {
                return '歌舞之纹章：选择1名出击费用2以下的我方单位';
            }
            if (state.activePanel.value === 'supportPeekOwnJewel') {
                return '光明/希望之纹章：选择1张宝玉查看正面';
            }
            if (state.activePanel.value === 'supportMainCharacterJewelSelect') {
                const remaining = state.supportInteraction.value?.remainingCount || 1;
                return `主人公被击破：选择1张宝玉加入手牌（剩余${remaining}张）`;
            }
            if (state.activePanel.value === 'supportStrategyTargetEnemy') {
                return '计略之纹章：选择1名敌方单位移动';
            }
            if (state.activePanel.value === 'supportNinjutsuHandToGrave') {
                return '忍术之纹章：选择1张手牌放置到退避区';
            }
            if (state.activePanel.value === 'supportDespairZombieCandidates') {
                return '绝望之纹章：选择1张尸兵出击';
            }
            if (state.activePanel.value === 'supportMoveAttackerPostBattleCandidates') {
                return '援护之纹章：点击攻击单位执行移动';
            }
            return activePanelTitle.value;
        });

        const resolvedPanelCards = computed(() => {
            if (state.activePanel.value === 'combatCostHand') {
                return combatCostCandidates.value;
            }
            if (state.activePanel.value === 'supportMagicDiscardHand') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportCourageTopdeckHand') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportManaketeHandToBond') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportDarkSelfDiscardHand') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportSkyMoveCandidates') {
                const excludedId = state.supportInteraction.value?.excludedId;
                return [...state.fieldFront.value, ...state.fieldRear.value].filter(card => String(card.instanceId) !== String(excludedId));
            }
            if (state.activePanel.value === 'supportDanceUntapCandidates') {
                const excludedId = state.supportInteraction.value?.excludedId;
                return [...state.fieldFront.value, ...state.fieldRear.value].filter(card => {
                    if (String(card.instanceId) === String(excludedId)) return false;
                    return (parseInt(card.cost, 10) || 0) <= 2;
                });
            }
            if (state.activePanel.value === 'supportPeekOwnJewel') {
                return state.jewels.value;
            }
            if (state.activePanel.value === 'supportMainCharacterJewelSelect') {
                return state.jewels.value;
            }
            if (state.activePanel.value === 'supportStrategyTargetEnemy') {
                const excludedId = state.supportInteraction.value?.excludedId;
                return [...state.opponentFront.value, ...state.opponentRear.value].filter(card => String(card.instanceId) !== String(excludedId));
            }
            if (state.activePanel.value === 'supportNinjutsuHandToGrave') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportDespairZombieCandidates') {
                return state.supportInteraction.value?.candidates || [];
            }
            if (state.activePanel.value === 'supportMoveAttackerPostBattleCandidates') {
                const attackerId = state.supportInteraction.value?.attackerId;
                if (!attackerId) return [];
                return [...state.fieldFront.value, ...state.fieldRear.value].filter(card => String(card.instanceId) === String(attackerId));
            }
            return activePanelCards.value;
        });

        const resolvedIsOpponentPanel = computed(() => {
            if (state.activePanel.value === 'supportStrategyTargetEnemy') {
                return true;
            }
            return isOpponentPanel.value;
        });

        const closeActivePanel = () => {
            state.activePanel.value = null;
        };

        const openCombatCostPicker = () => {
            state.activePanel.value = 'combatCostHand';
        };

        const closeSelectedCard = () => {
            state.selectedCard.value = null;
        };

        const openFullImage = () => {
            state.showFullImage.value = true;
        };

        const openPanel = (panelKey) => {
            state.activePanel.value = panelKey;
        };

        const toggleDevMode = () => {
            const nextIsDevMode = !state.isDevMode.value;
            const currentPhaseSnapshot = state.currentPhase.value || 'BEGINNING';

            if (nextIsDevMode) {
                phaseBeforeDevMode.value = currentPhaseSnapshot;
            }

            state.isDevMode.value = nextIsDevMode;

            const resumePhase = nextIsDevMode
                ? currentPhaseSnapshot
                : (phaseBeforeDevMode.value || currentPhaseSnapshot || 'BEGINNING');
            const openingTurnLocked = !nextIsDevMode;

            // 切到 PLAY 时，由切换者拥有当前回合；对手会被同步为非回合方。
            if (!nextIsDevMode) {
                state.isMyTurn.value = true;
                state.currentPhase.value = resumePhase;
                state.hasPlacedBond.value = false;
                state.usedBondsThisTurn.value = 0;
                state.firstPlayerOpeningTurnLocked.value = openingTurnLocked;
            } else {
                state.firstPlayerOpeningTurnLocked.value = false;
            }

            state.socket.emit('sync-dev-mode', {
                isDevMode: nextIsDevMode,
                turnOwner: !nextIsDevMode ? 'sender' : null,
                phase: resumePhase,
                openingTurnLocked
            });
        };

        const updateRoomState = (payload = {}) => {
            const prevRoomState = {
                roomId: String(state.roomId.value || ''),
                playerCount: Number(state.roomPlayerCount.value || 0),
                ready: !!state.roomReady.value
            };
            const nextRoomState = normalizeRoomPayload(payload);

            state.roomId.value = nextRoomState.roomId;
            state.roomPlayerCount.value = nextRoomState.playerCount;
            state.roomQueueing.value = nextRoomState.queueing;
            state.roomReady.value = nextRoomState.ready;
            state.roomGameInProgress.value = !!nextRoomState.gameInProgress;
            state.roomIsPrivate.value = nextRoomState.isPrivate;
            if (!nextRoomState.roomId) {
                state.roomGameInProgress.value = false;
            } else if (state.connectionScene.value === 'recovering') {
                state.connectionScene.value = 'connected';
            }

            if (!prevRoomState.roomId && nextRoomState.roomId) {
                startRoomButtonConsumed.value = false;
            }

            state.roomRole.value = deriveRoomRole({
                roomId: nextRoomState.roomId,
                hostId: nextRoomState.hostId,
                guestId: nextRoomState.guestId,
                myId: state.socket.id
            });

            state.roomStatusText.value = deriveRoomStatusText(nextRoomState);

            if (nextRoomState.queueing) {
                return;
            }
            if (!nextRoomState.roomId) {
                clearRoomCache();
                startRoomButtonConsumed.value = false;
                state.connectionScene.value = state.socket.connected ? 'connected' : 'disconnected';
                return;
            }

            if (didOpponentLeaveRoom(prevRoomState, nextRoomState)) {
                alert('你的对手已离开。');
            }

            saveRoomCache({
                roomId: nextRoomState.roomId,
                password: cachedRoomPassword.value || ''
            });
        };

        const createRoom = () => {
            if (!EVT.ROOM_CREATE) return;
            const password = prompt('可选：输入房间口令（留空=公开房）') || '';
            cachedRoomPassword.value = String(password || '').trim();
            if (!cachedRoomPassword.value) {
                if (EVT.ROOM_QUICK_MATCH) {
                    state.socket.emit(EVT.ROOM_QUICK_MATCH);
                } else {
                    state.socket.emit(EVT.ROOM_CREATE, { password: '' });
                }
                return;
            }
            state.socket.emit(EVT.ROOM_CREATE, { password: cachedRoomPassword.value });
        };

        const joinRoom = () => {
            if (!EVT.ROOM_JOIN) return;
            const roomId = prompt('输入房间号（6位）');
            if (!roomId) return;
            const password = prompt('若为私密房请输入口令（公开房可留空）') || '';
            cachedRoomPassword.value = String(password || '').trim();
            state.socket.emit(EVT.ROOM_JOIN, {
                roomId: roomId.trim(),
                password: cachedRoomPassword.value
            });
        };

        const quickMatch = () => {
            if (!EVT.ROOM_QUICK_MATCH) return;
            state.socket.emit(EVT.ROOM_QUICK_MATCH);
        };

        const leaveRoom = () => {
            if (!EVT.ROOM_LEAVE) return;
            startRoomButtonConsumed.value = false;
            state.roomGameInProgress.value = false;
            clearRoomCache();
            cachedRoomPassword.value = '';
            state.socket.emit(EVT.ROOM_LEAVE);
        };

        const startRoomGame = () => {
            if (!EVT.ROOM_START_GAME) return;
            if (!canStartRoomGame.value) {
                alert('双方就绪后才可开局。');
                return;
            }
            startRoomButtonConsumed.value = true;
            state.socket.emit(EVT.ROOM_START_GAME);
        };

        const resetByControlBar = () => {
            cardOps.resetGame(false);
        };

        const openDeckManager = () => {
            showDeckManager.value = true;
        };

        const closeDeckManager = () => {
            showDeckManager.value = false;
        };

        const setDraggingOver = (value) => {
            state.isDraggingOver.value = value;
        };

        const clearDraggingOver = () => {
            state.isDraggingOver.value = null;
            state.hoveredAttackTargetId.value = null;
            state.hoveredAttackTargetRect.value = null;
        };

        const openBondsPanel = () => {
            state.activePanel.value = 'bonds';
        };

        const selectCard = (card) => {
            state.selectedCard.value = card;
        };

        const handleCombatDecision = (decisionType, useSkill, costCardId = null) => {
            const idToUse = useSkill ? (costCardId || selectedCombatCostCardId.value) : null;
            const success = cardOps.respondCombatDecision(state, decisionType, useSkill, idToUse);
            if (success) {
                selectedCombatCostCardId.value = null;
                selectedCombatCostCardName.value = '';
                if (state.activePanel.value === 'combatCostHand') {
                    closeActivePanel();
                }
            }
        };

        const handleRegionPanelCardClick = (card) => {
            if (state.activePanel.value === 'combatCostHand') {
                selectedCombatCostCardId.value = card.instanceId;
                selectedCombatCostCardName.value = card.cardName || card.name || '';
                closeActivePanel();
                return;
            }
            if (
                state.activePanel.value === 'supportMagicDiscardHand' ||
                state.activePanel.value === 'supportCourageTopdeckHand' ||
                state.activePanel.value === 'supportManaketeHandToBond' ||
                state.activePanel.value === 'supportDarkSelfDiscardHand' ||
                state.activePanel.value === 'supportSkyMoveCandidates' ||
                state.activePanel.value === 'supportDanceUntapCandidates' ||
                state.activePanel.value === 'supportPeekOwnJewel' ||
                state.activePanel.value === 'supportMainCharacterJewelSelect' ||
                state.activePanel.value === 'supportStrategyTargetEnemy' ||
                state.activePanel.value === 'supportNinjutsuHandToGrave' ||
                state.activePanel.value === 'supportDespairZombieCandidates' ||
                state.activePanel.value === 'supportMoveAttackerPostBattleCandidates'
            ) {
                const ok = cardOps.resolveSupportInteraction(state, card.instanceId);
                if (ok) {
                    closeActivePanel();
                }
                return;
            }
            handleMinifiedClick(card);
        };

        watch(state.currentPhase, (newPhase) => {
            if (newPhase === 'BEGINNING') {
                state.usedBondsThisTurn.value = 0;
            }

            // 进军时点1：己方回合结束阶段
            if (newPhase === 'END' && state.isMyTurn.value && !state.isCombatActive.value) {
                cardOps.marchRearToFrontIfNeeded?.('己方结束阶段');
            }
        });
        const { handleMinifiedClick, safePlayToField } = createUiActions({ state, cardOps, rules });

        // 进军时点2：敌方回合所有阶段（通过敌方回合内的场面变化持续判定）
        watch(
            () => [
                state.isMyTurn.value,
                state.isCombatActive.value,
                state.fieldFront.value.length,
                state.fieldRear.value.length
            ],
            ([isMyTurn, isCombatActive, frontCount, rearCount]) => {
                if (isMyTurn) return;
                if (isCombatActive) return;
                if (frontCount > 0 || rearCount === 0) return;
                cardOps.marchRearToFrontIfNeeded?.('敌方回合自动判定');
            }
        );

        watch(() => state.combatDecision.value?.stage, () => {
            selectedCombatCostCardId.value = null;
            selectedCombatCostCardName.value = '';
            if (state.activePanel.value === 'combatCostHand') {
                closeActivePanel();
            }
        });

        watch(requiredCombatCharaName, () => {
            selectedCombatCostCardId.value = null;
            selectedCombatCostCardName.value = '';
        });

        watch(() => state.supportInteraction.value?.type, (type) => {
            if (type === 'magic-discard') {
                state.activePanel.value = 'supportMagicDiscardHand';
                return;
            }
            if (type === 'courage-topdeck') {
                state.activePanel.value = 'supportCourageTopdeckHand';
                return;
            }
            if (type === 'manakete-hand-to-bond') {
                state.activePanel.value = 'supportManaketeHandToBond';
                return;
            }
            if (type === 'dark-self-discard') {
                state.activePanel.value = 'supportDarkSelfDiscardHand';
                return;
            }
            if (type === 'sky-move') {
                state.activePanel.value = 'supportSkyMoveCandidates';
                return;
            }
            if (type === 'dance-untap-ally') {
                state.activePanel.value = 'supportDanceUntapCandidates';
                return;
            }
            if (type === 'peek-own-jewel') {
                state.activePanel.value = 'supportPeekOwnJewel';
                return;
            }
            if (type === 'main-character-jewel-select') {
                state.activePanel.value = 'supportMainCharacterJewelSelect';
                return;
            }
            if (type === 'strategy-select-enemy') {
                state.activePanel.value = 'supportStrategyTargetEnemy';
                return;
            }
            if (type === 'ninjutsu-hand-to-grave') {
                state.activePanel.value = 'supportNinjutsuHandToGrave';
                return;
            }
            if (type === 'despair-select-zombie') {
                state.activePanel.value = 'supportDespairZombieCandidates';
                return;
            }
            if (type === 'support-move-attacker-post-battle') {
                state.activePanel.value = 'supportMoveAttackerPostBattleCandidates';
                return;
            }
            if (type === 'phantom-post-battle') {
                const attackerId = state.supportInteraction.value?.attackerId || state.attacker.value?.instanceId || null;
                cardOps.resolveSupportInteraction(state, attackerId);
                return;
            }

            if (
                state.activePanel.value === 'supportMagicDiscardHand' ||
                state.activePanel.value === 'supportCourageTopdeckHand' ||
                state.activePanel.value === 'supportManaketeHandToBond' ||
                state.activePanel.value === 'supportDarkSelfDiscardHand' ||
                state.activePanel.value === 'supportSkyMoveCandidates' ||
                state.activePanel.value === 'supportDanceUntapCandidates' ||
                state.activePanel.value === 'supportPeekOwnJewel' ||
                state.activePanel.value === 'supportMainCharacterJewelSelect' ||
                state.activePanel.value === 'supportStrategyTargetEnemy' ||
                state.activePanel.value === 'supportNinjutsuHandToGrave' ||
                state.activePanel.value === 'supportDespairZombieCandidates' ||
                state.activePanel.value === 'supportMoveAttackerPostBattleCandidates'
            ) {
                closeActivePanel();
            }
        });
        const updateHeight = () => {
            document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
            isCompactMobile.value = window.innerWidth < 640;
        };

        onMounted(async () => {
            document.documentElement.setAttribute('data-battle-theme', BATTLE_THEME);
            window.addEventListener('resize', updateHeight);
            updateHeight();

            // 启动网络监听
            socketHandler.setupSocketListeners();
            turnMgr.setupTurnListener();

            if (EVT.ROOM_STATE) {
                state.socket.on(EVT.ROOM_STATE, (payload) => {
                    updateRoomState(payload || {});
                });
            }
            if (EVT.ROOM_ERROR) {
                state.socket.on(EVT.ROOM_ERROR, (payload) => {
                    const message = payload?.message || '房间操作失败';
                    alert(message);
                });
            }
            if (EVT.ROOM_GAME_STARTED) {
                state.socket.on(EVT.ROOM_GAME_STARTED, async (payload = {}) => {
                    const eventTs = Number(payload?.ts || 0);
                    if (isHandlingRoomGameStart.value) {
                        return;
                    }
                    if (eventTs > 0 && eventTs === lastHandledRoomGameStartTs.value) {
                        return;
                    }

                    isHandlingRoomGameStart.value = true;
                    if (eventTs > 0) {
                        lastHandledRoomGameStartTs.value = eventTs;
                    }
                    const startedBy = payload?.startedBy || null;
                    startRoomButtonConsumed.value = true;
                    state.roomGameInProgress.value = true;
                    try {
                        // 开局事件两端都会收到，这里使用 remote reset 避免双方互发 SYNC_RESET 导致重复重置。
                        await cardOps.resetGame(true);

                        // 开局后统一进入游玩模式，并按开局发起者确定先后手。
                        state.isDevMode.value = false;
                        const iAmStarter = !!startedBy && String(startedBy) === String(state.socket.id);
                        state.isMyTurn.value = iAmStarter;
                        state.currentPhase.value = 'BEGINNING';
                        state.hasPlacedBond.value = false;
                        state.usedBondsThisTurn.value = 0;
                        if (state.firstPlayerOpeningTurnLocked) {
                            state.firstPlayerOpeningTurnLocked.value = iAmStarter;
                        }
                    } finally {
                        isHandlingRoomGameStart.value = false;
                    }
                });
            }

            state.socket.on('connect', () => {
                state.connectionScene.value = state.roomId.value ? 'recovering' : 'connected';
                const cache = loadRoomCache();
                if (!cache?.roomId) return;
                cachedRoomPassword.value = String(cache.password || '');
                if (EVT.ROOM_JOIN) {
                    state.socket.emit(EVT.ROOM_JOIN, {
                        roomId: String(cache.roomId || '').trim(),
                        password: cachedRoomPassword.value
                    });
                }
            });

            state.socket.on('disconnect', () => {
                state.connectionScene.value = state.roomId.value ? 'recovering' : 'disconnected';
            });

            // 🚀 直接用 cardOps 的终极重置初始化游戏！
            await cardOps.resetGame(true); 
            if (!state.roomId.value) {
                state.connectionScene.value = state.socket.connected ? 'connected' : 'disconnected';
            }
        });

        return {
            ...state,
            ...cardOps,
            ...dragDrop, // 自动暴露拖拽与攻击指令
			playToField: safePlayToField,
            nextPhase: turnMgr.nextPhase,
            canPerformAction: rules.canPerformAction,
            canPerformClassChange: rules.canPerformClassChange,
            getCardFactionInfo: rules.getCardFactionInfo,
            topBarUi,
            roomScene,
            isCompactMobile,
            activePanelTitle,
            activePanelCards,
            resolvedPanelTitle,
            resolvedPanelCards,
            isOpponentPanel: resolvedIsOpponentPanel,
            remainingCost,
            totalBonds,
            currentPhaseName,
            showNextPhaseButton,
            nextPhaseLabel,
            isMyCombatAttacker,
            playerPanelButtons,
            enemyPanelButtons,
            closeActivePanel,
            closeSelectedCard,
            openFullImage,
            openPanel,
            toggleDevMode,
            resetByControlBar,
            openDeckManager,
            closeDeckManager,
            showDeckManager,
            createRoom,
            joinRoom,
            quickMatch,
            leaveRoom,
            canStartRoomGame,
            startRoomGame,
            setDraggingOver,
            clearDraggingOver,
            openBondsPanel,
            selectCard,
            handleCombatDecision,
            handleRegionPanelCardClick,
            openCombatCostPicker,
            selectedCombatCostCardId,
            selectedCombatCostCard,
            selectedCombatCostCardName,
            combatCostCandidates,
            isMyCard, isCardInHand, formattedAbility, formattedSupport, handleMinifiedClick, updateHeight
        };
    }
}).mount('#app');