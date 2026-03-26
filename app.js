// app.js
// 主应用文件 - 组装所有模块

import { createGameState } from './modules/state.js';
import { createRulesEngine } from './modules/rules.js';
import { createCardOperations } from './modules/cardOps.js';
import { createDragDropHandler } from './modules/dragDrop.js';
import { createTurnManager } from './modules/turnManagement.js';
import { createSocketHandler } from './modules/socketHandler.js';

const { createApp, onMounted } = Vue;

createApp({
    setup() {
        // ========== 初始化所有模块 ==========
        
        // 1. 创建游戏状态
        const state = createGameState();
        
        // 2. 创建规则引擎
        const rules = createRulesEngine(state);
        
        // 3. 创建卡片操作
        const cardOps = createCardOperations(state);
        
        // 4. 创建拖拽处理
        const dragDrop = createDragDropHandler(state, cardOps, rules);
        
        // 5. 创建回合管理
        const turnMgr = createTurnManager(state);
        
        // 6. 创建网络同步处理
        const socketHandler = createSocketHandler(state, cardOps);

        // ========== UI 辅助函数 ==========

        /**
         * 检查卡片是否属于我方
         */
        const isMyCard = (card) => !!cardOps.getArea(card);

        /**
         * 检查卡片是否在手牌中
         */
        const isCardInHand = (card) => state.hand.value.some(c => c.instanceId === card.instanceId);

        /**
         * 格式化能力文本
         */
        const formattedAbility = (t) => 
            t ? t.replace(/能力：/g, '<span class="text-blue-400">【能力】</span>') : "无";

        /**
         * 格式化支援能力文本
         */
        const formattedSupport = (t) => 
            t ? t.replace(/支援技能：/g, '<span class="text-yellow-500">【支援】</span>') : "无支援";

        /**
         * 处理羁绊卡片点击（开发中的特殊逻辑）
         */
        const handleMinifiedClick = (card) => {
            if (state.activePanel.value === 'bonds') {
                cardOps.toggleBondFace(card);
            } else {
                state.selectedCard.value = card;
            }
        };

        /**
         * 监听窗口大小变化，动态调整 app 高度
         */
        const updateHeight = () => {
            document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
        };

        // ========== 初始化钩子 ==========

        onMounted(async () => {
            // 初始化高度
            window.addEventListener('resize', updateHeight);
            updateHeight();

            // 加载卡牌数据
            try {
                const res = await fetch('/api/cards');
                const data = await res.json();
                state.deck.value = data.map(c => ({ ...c, instanceId: Math.random() + Date.now() }));
                
                // 初始抽取 6 张手牌
                for (let i = 0; i < 6; i++) {
                    if (state.deck.value.length > 0) {
                        state.hand.value.push(state.deck.value.pop());
                    }
                }
            } catch (err) {
                console.error("卡牌数据加载失败", err);
            }

            // 初始化所有 Socket 监听器
            socketHandler.setupSocketListeners();
            turnMgr.setupTurnListener();

            // 直接调用我们的终极重置函数进行初始化（传入 true 避免刚进房就把别人重置了）
            await cardOps.resetGame(true);
        });

        // ========== 导出所有需要的数据和方法 ==========

        return {
            // 状态数据
            ...state,
            
            // 卡片操作
            ...cardOps,
            ...rules,
            // 拖拽交互
            // 拖拽交互 (这一句顶替了你原来写的 onDragStart, onDrop 等一长串)
            ...dragDrop,
            // 回合管理
            nextPhase: turnMgr.nextPhase,
            
            // 规则判定
            canPerformAction: rules.canPerformAction,
            
            // UI 函数
            isMyCard,
            isCardInHand,
            formattedAbility,
            formattedSupport,
            handleMinifiedClick,
            updateHeight
        };
    }
}).mount('#app');

// 调试：全局暴露模块（开发用）
window.gameModules = {
    state: createGameState,
    rules: createRulesEngine,
    cardOps: createCardOperations,
    dragDrop: createDragDropHandler,
    turnMgr: createTurnManager,
    socketHandler: createSocketHandler
};
