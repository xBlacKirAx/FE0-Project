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
import { DeckManagerModal } from './components/DeckManagerModal.js';

const { createApp, computed, onMounted, watch, ref } = Vue;

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
        });
        const { handleMinifiedClick, safePlayToField } = createUiActions({ state, cardOps, rules });

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
                state.activePanel.value === 'supportStrategyTargetEnemy' ||
                state.activePanel.value === 'supportNinjutsuHandToGrave' ||
                state.activePanel.value === 'supportDespairZombieCandidates' ||
                state.activePanel.value === 'supportMoveAttackerPostBattleCandidates'
            ) {
                closeActivePanel();
            }
        });
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
            canPerformAction: rules.canPerformAction,
            canPerformClassChange: rules.canPerformClassChange,
            getCardFactionInfo: rules.getCardFactionInfo,
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