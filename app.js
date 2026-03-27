// app.js
import { createGameState } from './modules/state.js';
import { createRulesEngine } from './modules/rules.js';
import { createCardOperations } from './modules/cardOps.js';
import { createDragDropHandler } from './modules/dragDrop.js';
import { createTurnManager } from './modules/turnManagement.js';
import { createSocketHandler } from './modules/socketHandler.js';

const { createApp, onMounted, watch } = Vue;

createApp({
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

            if (state.activePanel.value === 'bonds') {
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
            canPerformAction: rules.canPerformAction,getFactionInfo: rules.getFactionInfo,
            isMyCard, isCardInHand, formattedAbility, formattedSupport, handleMinifiedClick, updateHeight
        };
    }
}).mount('#app');