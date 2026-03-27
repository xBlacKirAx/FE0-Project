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

const { createApp, computed, onMounted, watch } = Vue;

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

        const closeActivePanel = () => {
            state.activePanel.value = null;
        };

        const closeSelectedCard = () => {
            state.selectedCard.value = null;
        };

        const openFullImage = () => {
            state.showFullImage.value = true;
        };

        const closeCombatOverlay = () => {
            state.isCombatActive.value = false;
        };

        const openPanel = (panelKey) => {
            state.activePanel.value = panelKey;
        };

        const toggleDevMode = () => {
            const nextIsDevMode = !state.isDevMode.value;
            state.isDevMode.value = nextIsDevMode;

            // 切到 PLAY 时，由切换者拥有当前回合；对手会被同步为非回合方。
            if (!nextIsDevMode) {
                state.isMyTurn.value = true;
                state.currentPhase.value = 'BEGINNING';
                state.hasPlacedBond.value = false;
                state.usedBondsThisTurn.value = 0;
            }

            state.socket.emit('sync-dev-mode', {
                isDevMode: nextIsDevMode,
                turnOwner: !nextIsDevMode ? 'sender' : null
            });
        };

        const resetByControlBar = () => {
            cardOps.resetGame(false);
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
		
        
        watch(state.currentPhase, (newPhase) => {
            if (newPhase === 'BEGINNING') {
                state.usedBondsThisTurn.value = 0;
            }
        });
        const { handleMinifiedClick, safePlayToField } = createUiActions({ state, cardOps, rules });
        const updateHeight = () => { document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`); };

        onMounted(async () => {
            document.documentElement.setAttribute('data-battle-theme', BATTLE_THEME);
            window.addEventListener('resize', updateHeight);
            updateHeight();

            // 启动网络监听
            socketHandler.setupSocketListeners();
            turnMgr.setupTurnListener();

            // 🚀 直接用 cardOps 的终极重置初始化游戏！
            await cardOps.resetGame(true); 
        });

        return {
            ...state,
            ...cardOps,
            ...dragDrop, // 自动暴露拖拽与攻击指令
			playToField: safePlayToField,
            nextPhase: turnMgr.nextPhase,
            canPerformAction: rules.canPerformAction,getCardFactionInfo: rules.getCardFactionInfo,
            activePanelTitle,
            activePanelCards,
            isOpponentPanel,
            remainingCost,
            totalBonds,
            currentPhaseName,
            showNextPhaseButton,
            nextPhaseLabel,
            playerPanelButtons,
            enemyPanelButtons,
            closeActivePanel,
            closeSelectedCard,
            openFullImage,
            closeCombatOverlay,
            openPanel,
            toggleDevMode,
            resetByControlBar,
            setDraggingOver,
            clearDraggingOver,
            openBondsPanel,
            selectCard,
            isMyCard, isCardInHand, formattedAbility, formattedSupport, handleMinifiedClick, updateHeight
        };
    }
}).mount('#app');