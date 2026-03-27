// modules/dragDrop.js
// 拖拽和触摸交互

export function createDragDropHandler(state, cardOps, rules) {
    const { draggedCard, isDraggingOver } = state;
    const { moveTo, initiateAttack } = cardOps;
    const { canPerformAction, getActionByArea, canDeployCard} = rules;
    // 👇 1. 新增：用来区分是“点击”还是“拖拽”
    let hasMoved = false;
    const onDragStart = (card) => {
        draggedCard.value = card;
        if (window.navigator.vibrate) window.navigator.vibrate(10);
    };

    const onDragOver = (e, areaName) => {
        e.preventDefault();
        isDraggingOver.value = areaName;
    };

    const onAttackDrop = (enemyCard) => {
        isDraggingOver.value = null;
        if (!draggedCard.value) return;

        // 【规则拦截】非攻击阶段
        if (state.currentPhase.value !== 'ATTACK' && !state.isDevMode.value) {
            console.warn("[规则拦截] 只能在【攻击阶段】发起攻击！");
            draggedCard.value = null;
            return;
        }

        // 【规则拦截】已横置卡牌
        if (draggedCard.value.isTapped && !state.isDevMode.value) {
            console.warn("[规则拦截] 已横置的卡牌无法再次攻击！");
            draggedCard.value = null;
            return;
        }

        if (initiateAttack) {
            initiateAttack(state, draggedCard.value, enemyCard);
        }
        draggedCard.value = null;
    };

    const onDropMouse = (toAreaName) => {
        isDraggingOver.value = null;
        if (!draggedCard.value) return;

        const actionType = getActionByArea(toAreaName);
        if (actionType && !canPerformAction(actionType)) {
            console.warn(`[规则拦截] 无法执行 ${actionType}，阶段不符！`);
            draggedCard.value = null;
            return;
        }

        // 💰 新增：如果是出击动作，校验费用！
        if (actionType === 'deploy') {
            const deployCheck = canDeployCard(draggedCard.value);
            if (!deployCheck.valid) {
                alert(deployCheck.message); // 👈 动态显示是缺费用还是缺颜色
                draggedCard.value = null;
                return;
            }
        }

        moveTo(draggedCard.value, toAreaName);
        draggedCard.value = null;
    };

    let touchMoved = false; // 区分是“点击”还是“拖拽”

    const onTouchStart = (e, card) => {
        draggedCard.value = card;
        touchMoved = false; // 每次触摸重置
        if (window.navigator.vibrate) window.navigator.vibrate(10);
    };

    const onTouchMove = (e) => {
        if (!draggedCard.value) return;
        touchMoved = true; // 只要手指滑动了，就是真正的拖拽
        e.preventDefault();

        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const enemyCardEl = element?.closest('[data-enemy-id]');
        const area = element?.closest('[data-area]');
        
        if (enemyCardEl && (state.currentPhase.value === 'ATTACK' || state.isDevMode.value)) {
             if (draggedCard.value.isTapped && !state.isDevMode.value) {
                 isDraggingOver.value = null; 
             } else {
                 isDraggingOver.value = 'attack-target';
             }
        } else if (area) {
            isDraggingOver.value = area.getAttribute('data-area');
        } else {
            isDraggingOver.value = null;
        }
    };

    const onTouchEnd = (e, card) => {
        if (!draggedCard.value) return;

        // 🛡️ 核心机制：记录拖拽结束的时间戳到全局
        window.lastDragEndTime = Date.now();

        if (!touchMoved) {
            // 如果没移动过，这是纯点击，直接清理拖拽状态，让 click 事件去接管
            draggedCard.value = null;
            isDraggingOver.value = null;
            return;
        }

        // --- 下面是原有的真实拖拽判定逻辑 ---
        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        // 1. 尝试攻击
        const enemyCardEl = element?.closest('[data-enemy-id]');
        if (enemyCardEl && (state.currentPhase.value === 'ATTACK' || state.isDevMode.value)) {
            if (draggedCard.value.isTapped && !state.isDevMode.value) {
                console.warn("[规则拦截] 已横置的卡牌无法再次攻击！");
                draggedCard.value = null;
                isDraggingOver.value = null;
                return;
            }
            const enemyId = enemyCardEl.getAttribute('data-enemy-id');
            const allEnemyCards = [...state.opponentFront.value, ...state.opponentRear.value];
            const targetCard = allEnemyCards.find(c => String(c.instanceId) === enemyId);
            
            if (targetCard && initiateAttack) initiateAttack(state, draggedCard.value, targetCard);
            
            draggedCard.value = null;
            isDraggingOver.value = null;
            return;
        }

        // 2. 尝试移动/出击
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

            // 💰 修复：校验出击费用
            if (actionType === 'deploy') {
                const deployCheck = canDeployCard(draggedCard.value);
                if (!deployCheck.valid) {
                    alert(deployCheck.message); // 👈 动态显示
                    draggedCard.value = null;
                    isDraggingOver.value = null;
                    return;
                }
            }

            moveTo(draggedCard.value, areaName);
        }
        
        draggedCard.value = null;
        isDraggingOver.value = null;
    };

    return {
        onDrop: onDropMouse,
        onDropMouse,
        onAttackDrop,
        onDragStart,
        onDragOver,
        onTouchStart,
        onTouchMove,
        onTouchEnd
    };
}