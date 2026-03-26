// modules/dragDrop.js
// 拖拽和触摸交互

export function createDragDropHandler(state, cardOps, rules) {
    const { draggedCard, isDraggingOver } = state;
    // 确保从 cardOps 中提取了 initiateAttack
    const { moveTo, initiateAttack } = cardOps; 
    const { canPerformAction, getActionByArea } = rules;

    /**
     * 鼠标拖拽开始
     */
    const onDragStart = (card) => {
        draggedCard.value = card;
        if (window.navigator.vibrate) window.navigator.vibrate(10);
    };

    /**
     * 鼠标拖拽中
     */
    const onDragOver = (e, areaName) => {
        e.preventDefault();
        isDraggingOver.value = areaName;
    };

    /**
     * ⚔️ 新增：PC端 拖拽到敌方卡片上松开 (发起攻击)
     */
    const onAttackDrop = (enemyCard) => {
        isDraggingOver.value = null;
        if (!draggedCard.value) return;

        // 🔑 增加 !state.isDevMode.value 判定
        if (state.currentPhase.value !== 'ATTACK' && !state.isDevMode.value) {
            console.warn("[规则拦截] 只能在【攻击阶段】发起攻击！");
            draggedCard.value = null;
            return;
        }

        if (initiateAttack) {
            initiateAttack(state, draggedCard.value, enemyCard);
        }
        draggedCard.value = null;
    };

    /**
     * 鼠标拖拽到区域结束 (出击/移动)
     */
    const onDropMouse = (toAreaName) => {
        isDraggingOver.value = null;
        if (!draggedCard.value) return;

        const actionType = getActionByArea(toAreaName);
        if (actionType && !canPerformAction(actionType)) {
            console.warn(`[规则拦截] 无法执行 ${actionType}`);
            draggedCard.value = null;
            return;
        }

        moveTo(draggedCard.value, toAreaName);
        draggedCard.value = null;
    };

    /**
     * 触摸开始
     */
    const onTouchStart = (e, card) => {
        draggedCard.value = card;
        if (window.navigator.vibrate) window.navigator.vibrate(10);
    };

    /**
     * 触摸移动（实时更新高亮或锁定敌方）
     */
    const onTouchMove = (e) => {
        if (!draggedCard.value) return;
        e.preventDefault();

        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        const enemyCardEl = element?.closest('[data-enemy-id]');
        const area = element?.closest('[data-area]');
        
        if (enemyCardEl && (state.currentPhase.value === 'ATTACK' || state.isDevMode.value)) {
            isDraggingOver.value = 'attack-target';
        } else if (area) {
            isDraggingOver.value = area.getAttribute('data-area');
        } else {
            isDraggingOver.value = null;
        }
    };

    /**
     * 触摸结束 (移动端自动判定)
     */
    const onTouchEnd = (e, card) => {
        if (!draggedCard.value) return;

        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        // 1. 优先判定是否放在了敌方卡片上
        const enemyCardEl = element?.closest('[data-enemy-id]');
        if (enemyCardEl && (state.currentPhase.value === 'ATTACK' || state.isDevMode.value)) {
            const enemyId = enemyCardEl.getAttribute('data-enemy-id');
            const allEnemyCards = [...state.opponentFront.value, ...state.opponentRear.value];
            const targetCard = allEnemyCards.find(c => String(c.instanceId) === enemyId);
            
            if (targetCard && initiateAttack) {
                initiateAttack(state, draggedCard.value, targetCard);
            }
            draggedCard.value = null;
            isDraggingOver.value = null;
            return;
        }

        // 2. 否则判定是否放在了己方区域
        const areaElement = element?.closest('[data-area]');
        if (areaElement) {
            const areaName = areaElement.getAttribute('data-area');
            const actionType = getActionByArea(areaName);
            if (actionType && !canPerformAction(actionType)) {
                console.warn(`[规则拦截] 无法执行 ${actionType}`);
                draggedCard.value = null;
                isDraggingOver.value = null;
                return;
            }
            moveTo(draggedCard.value, areaName);
        }
        
        draggedCard.value = null;
        isDraggingOver.value = null;
    };

    // 暴露给 Vue 的方法
    return {
        onDrop: onDropMouse, // 兼容 index.html 里的 @drop="onDrop('front')"
        onDropMouse,
        onAttackDrop,        // 👈 这次绝对把它暴露出去了！
        onDragStart,
        onDragOver,
        onTouchStart,
        onTouchMove,
        onTouchEnd
    };
}