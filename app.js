// app.js
import { createGameState } from './modules/state.js';
import { createRulesEngine } from './modules/rules.js';
import { createCardOperations } from './modules/cardOps.js';
import { createDragDropHandler } from './modules/dragDrop.js';
import { createTurnManager } from './modules/turnManagement.js';
import { createSocketHandler } from './modules/socketHandler.js';
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
        const formattedAbility = (t) => t ? t.replace(/能力：/g, '<span class="text-blue-400">【能力】</span>') : "无";
        const formattedSupport = (t) => t ? t.replace(/支援技能：/g, '<span class="text-yellow-500">【支援】</span>') : "无支援";

        const panelTitleMap = {
            bonds: '羁绊区 (点击卡牌快速翻面)',
            jewels: '宝玉区',
            graveyard: '弃牌区',
            boundless: '无限区',
            deck: '牌组',
            oppBonds: '对手羁绊区',
            oppJewels: '对手宝玉区',
            oppGraveyard: '对手弃牌区',
            oppDeck: '对手牌组',
            oppBoundless: '对手无限区'
        };

        const panelCardMap = {
            bonds: state.bonds,
            jewels: state.jewels,
            graveyard: state.graveyard,
            boundless: state.boundless,
            deck: state.deck,
            oppBonds: state.oppBonds,
            oppJewels: state.oppJewels,
            oppGraveyard: state.oppGraveyard,
            oppBoundless: state.oppBoundless
            // oppDeck 由 OppDeckPanel 单独处理（默认背面）
        };

        const activePanelTitle = computed(() => panelTitleMap[state.activePanel.value] || '区域');
        const activePanelCards = computed(() => panelCardMap[state.activePanel.value]?.value || []);
        const isOpponentPanel = computed(() => state.activePanel.value?.startsWith('opp') || false);
        const remainingCost = computed(() => Math.max(0, (state.bonds.value?.length || 0) - (state.usedBondsThisTurn.value || 0)));
        const totalBonds = computed(() => state.bonds.value?.length || 0);
        const currentPhaseName = computed(() => state.PHASES?.[state.currentPhase.value]?.name || state.currentPhase.value || '');
        const showNextPhaseButton = computed(() =>
            state.isDevMode.value || (state.isMyTurn.value && (state.currentPhase.value || 'BEGINNING') !== 'BEGINNING')
        );
        const nextPhaseLabel = computed(() => (state.currentPhase.value || 'BEGINNING') === 'END' ? '结束' : 'NEXT');

        const playerPanelButtons = computed(() => ([
            { key: 'jewels',    label: '宝玉', count: state.jewels.value?.length || 0 },
            { key: 'graveyard', label: '弃牌', count: state.graveyard.value?.length || 0 },
            { key: 'deck',      label: '牌组', count: state.deck.value?.length || 0 },
            { key: 'boundless', label: '无限', count: state.boundless.value?.length || 0 }
        ]));

        const enemyPanelButtons = computed(() => ([
            { key: 'oppJewels',    label: '宝玉', count: state.oppJewels.value?.length || 0 },
            { key: 'oppGraveyard', label: '弃牌', count: state.oppGraveyard.value?.length || 0 },
            { key: 'oppDeck',      label: '牌组', count: state.oppDeck.value?.length || 0 },
            { key: 'oppBoundless', label: '无限', count: state.oppBoundless.value?.length || 0 },
            { key: 'oppHand',      label: '手牌', count: state.oppStats.value?.hand || 0 },
            { key: 'oppBonds',     label: '羁绊', count: state.oppBonds.value?.length || 0 }
        ]));

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
        const handleMinifiedClick = (card) => {
            // 🛡️ 终极拦截：如果距离上次手指离开屏幕不到 300 毫秒，绝对是幽灵点击，直接无视！
            if (window.lastDragEndTime && Date.now() - window.lastDragEndTime < 300) {
                console.log("👻 拦截到移动端幽灵点击");
                return;
            }

            if (state.activePanel.value === 'bonds' && (state.isDevMode.value || state.isMyTurn.value)) {
                cardOps.toggleBondFace(card);
            } else {
                state.selectedCard.value = card;
            }
        };
		const safePlayToField = (card, area) => {
            if (!rules.canPerformAction('deploy')) {
                alert("只能在出击阶段 (DEPLOY) 部署单位！");
                return;
            }
            
            // 💡 修复 Bug 4: 正确解析 deployCheck 对象的 .valid 属性
            const deployCheck = rules.canDeployCard(card);
            if (!deployCheck.valid) {
                alert(deployCheck.message); // 打印出是缺费用还是缺颜色
                return;
            }
            
            cardOps.playToField(card, area);
            state.selectedCard.value = null; 
        };
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