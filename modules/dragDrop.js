// modules/dragDrop.js
// 拖拽和触摸交互

function createDragDropHandler(state, cardOps, rules) {
    const { draggedCard, isDraggingOver } = state;
    const { moveTo } = cardOps;
    const { canPerformAction, getActionByArea } = rules;

    /**
     * 鼠标拖拽开始
     */
    const onDragStart = (card) => {
        draggedCard.value = card;
        // 振动反馈
        if (window.navigator.vibrate) window.navigator.vibrate(10);
    };

    /**
     * 鼠标拖拽中（用于标记目标区域）
     */
    const onDragOver = (e, areaName) => {
        e.preventDefault();
        isDraggingOver.value = areaName;
    };

    /**
     * 鼠标拖拽结束
     */
    const onDropMouse = (toAreaName) => {
        isDraggingOver.value = null;
        if (!draggedCard.value) return;

        const actionType = getActionByArea(toAreaName);
        
        // 规则检查
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
     * 触摸移动（实时更新高亮区域）
     */
    const onTouchMove = (e) => {
        if (!draggedCard.value) return;
        e.preventDefault();

        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const area = element?.closest('[data-area]');
        
        if (area) {
            isDraggingOver.value = area.getAttribute('data-area');
        } else {
            isDraggingOver.value = null;
        }
    };

    /**
     * 触摸结束
     */
    const onTouchEnd = (e, card) => {
        if (!draggedCard.value) return;

        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
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

    return {
        onDrop: (toAreaName) => {
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
        },
        onDragStart,
        onDragOver,
        onDropMouse,
        onTouchStart,
        onTouchMove,
        onTouchEnd
    };
}
