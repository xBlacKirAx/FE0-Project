// app.js
import { createGameState } from './modules/state.js';
import { createRulesEngine } from './modules/rules.js';
import { createCardOperations } from './modules/cardOps.js';
import { createDragDropHandler } from './modules/dragDrop.js';
import { createTurnManager } from './modules/turnManagement.js';
import { createSocketHandler } from './modules/socketHandler.js';

const { createApp, onMounted } = Vue;

createApp({
    setup() {
        const state = createGameState();
        const rules = createRulesEngine(state);
        const cardOps = createCardOperations(state);
        const dragDrop = createDragDropHandler(state, cardOps, rules);
        const turnMgr = createTurnManager(state);
        const socketHandler = createSocketHandler(state, cardOps);

        const isMyCard = (card) => !!cardOps.getArea(card);
        const isCardInHand = (card) => state.hand.value.some(c => c.instanceId === card.instanceId);
        const formattedAbility = (t) => t ? t.replace(/能力：/g, '<span class="text-blue-400">【能力】</span>') : "无";
        const formattedSupport = (t) => t ? t.replace(/支援技能：/g, '<span class="text-yellow-500">【支援】</span>') : "无支援";

        const handleMinifiedClick = (card) => {
            if (state.activePanel.value === 'bonds') { cardOps.toggleBondFace(card); } 
            else { state.selectedCard.value = card; }
        };

        const updateHeight = () => { document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`); };

        onMounted(async () => {
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
            nextPhase: turnMgr.nextPhase,
            canPerformAction: rules.canPerformAction,
            isMyCard, isCardInHand, formattedAbility, formattedSupport, handleMinifiedClick, updateHeight
        };
    }
}).mount('#app');