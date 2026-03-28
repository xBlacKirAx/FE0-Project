// modules/dragDrop.js
// 拖拽和触摸交互

export function createDragDropHandler(state, cardOps, rules) {
    const { draggedCard, isDraggingOver, hoveredAttackTargetId, hoveredAttackTargetRect } = state;
    const { moveTo, initiateAttack } = cardOps;
    const { canPerformAction, getActionByArea, canDeployCard} = rules;
    const clearAttackTargetHighlight = () => {
        hoveredAttackTargetId.value = null;
        hoveredAttackTargetRect.value = null;
    };

    const setAttackTargetHighlight = (enemyCardId, element) => {
        hoveredAttackTargetId.value = String(enemyCardId);
        if (!element?.getBoundingClientRect) {
            hoveredAttackTargetRect.value = null;
            return;
        }
        const rect = element.getBoundingClientRect();
        hoveredAttackTargetRect.value = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
        };
    };

    // 触摸意图判定：横向滑动优先视为滚动，而不是拖拽。
    let touchStartX = 0;
    let touchStartY = 0;
    let isScrollGesture = false;
    let touchDragTimer = null;
    let touchDragActive = false;
    let touchSourceArea = null;
    const onDragStart = (card) => {
        if (!state.isDevMode.value && !state.isMyTurn.value) return;
        draggedCard.value = card;
        clearAttackTargetHighlight();
        if (window.navigator.vibrate) window.navigator.vibrate(10);
    };

    const onDragOver = (e, areaName, enemyCardId = null) => {
        e.preventDefault();
        isDraggingOver.value = areaName;
        if (areaName === 'attack-target' && enemyCardId !== null && enemyCardId !== undefined) {
            setAttackTargetHighlight(enemyCardId, e.currentTarget || e.target?.closest?.('[data-enemy-id]'));
        } else {
            clearAttackTargetHighlight();
        }
    };

    const onAttackDrop = (enemyCard) => {
        isDraggingOver.value = null;
        clearAttackTargetHighlight();
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
        clearAttackTargetHighlight();
        if (!draggedCard.value) return;

        // 检测转职（只在出击到前场或后场时）
        if ((toAreaName === 'front' || toAreaName === 'rear') && state.hand.value.some(c => c.instanceId === draggedCard.value.instanceId)) {
            const classChangeCheck = rules.canPerformClassChange(draggedCard.value);
            if (classChangeCheck && classChangeCheck.valid) {
                const shouldClassChange = confirm(`🔄 转职：确认用"${draggedCard.value.cardName}"覆盖"${classChangeCheck.targetCard.cardName}"并抽1卡？`);
                if (shouldClassChange) {
                    cardOps.performClassChange(draggedCard.value, classChangeCheck.targetCard);
                    draggedCard.value = null;
                    return;
                }
            }
        }

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

    const onTouchStart = (e, card, sourceArea = 'hand') => {
        if (!state.isDevMode.value && !state.isMyTurn.value) return;
        touchMoved = false; // 每次触摸重置
        isScrollGesture = false;
        touchDragActive = false;
        touchSourceArea = sourceArea;
        touchStartX = e.touches?.[0]?.clientX || 0;
        touchStartY = e.touches?.[0]?.clientY || 0;

        if (sourceArea !== 'hand') {
            // 战场卡：立即进入拖拽，确保触碰敌卡时能实时高亮。
            draggedCard.value = card;
            touchDragActive = true;
            if (window.navigator.vibrate) window.navigator.vibrate(10);
            return;
        }

        // 长按激活拖拽：短触与横滑默认让给原生滚动/点击。
        if (touchDragTimer) clearTimeout(touchDragTimer);
        touchDragTimer = setTimeout(() => {
            if (isScrollGesture) return;
            draggedCard.value = card;
            touchDragActive = true;
            if (window.navigator.vibrate) window.navigator.vibrate(10);
        }, 180);
    };

    const onTouchMove = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;

        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // 手牌区域：横向位移显著时，交给原生滚动处理。
        if (touchSourceArea === 'hand' && !isScrollGesture && absX > 12 && absX > absY + 4) {
            isScrollGesture = true;
            if (touchDragTimer) {
                clearTimeout(touchDragTimer);
                touchDragTimer = null;
            }
            draggedCard.value = null;
            touchDragActive = false;
            isDraggingOver.value = null;
            clearAttackTargetHighlight();
            return;
        }

        // 战场区域：仅在“明显的大幅横扫”时才交给滚动，默认优先拖曳攻击。
        if (touchSourceArea !== 'hand' && !isScrollGesture && absX > 46 && absX > absY + 18) {
            isScrollGesture = true;
            draggedCard.value = null;
            touchDragActive = false;
            isDraggingOver.value = null;
            clearAttackTargetHighlight();
            return;
        }

        if (isScrollGesture || !touchDragActive || !draggedCard.value) return;

        touchMoved = true; // 只要手指滑动了，就是真正的拖拽
        e.preventDefault();
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const enemyCardEl = element?.closest('[data-enemy-id]');
        const area = element?.closest('[data-area]');
        
        if (enemyCardEl && (state.currentPhase.value === 'ATTACK' || state.isDevMode.value)) {
             if (draggedCard.value.isTapped && !state.isDevMode.value) {
                 isDraggingOver.value = null; 
                 clearAttackTargetHighlight();
             } else {
                 isDraggingOver.value = 'attack-target';
                 setAttackTargetHighlight(enemyCardEl.getAttribute('data-enemy-id'), enemyCardEl);
             }
        } else if (area) {
            isDraggingOver.value = area.getAttribute('data-area');
            clearAttackTargetHighlight();
        } else {
            isDraggingOver.value = null;
            clearAttackTargetHighlight();
        }
    };

    const onTouchEnd = (e, card) => {
        if (touchDragTimer) {
            clearTimeout(touchDragTimer);
            touchDragTimer = null;
        }

        if (!touchDragActive || !draggedCard.value) {
            draggedCard.value = null;
            isDraggingOver.value = null;
            clearAttackTargetHighlight();
            touchDragActive = false;
            touchSourceArea = null;
            return;
        }

        if (!touchMoved) {
            // 纯点击，不设置 lastDragEndTime，让 click 事件正常触发
            draggedCard.value = null;
            isDraggingOver.value = null;
            clearAttackTargetHighlight();
            touchDragActive = false;
            touchSourceArea = null;
            return;
        }

        // 🛡️ 只有真正拖拽结束才记录时间戳，避免误拦截点击
        window.lastDragEndTime = Date.now();

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
                clearAttackTargetHighlight();
                touchSourceArea = null;
                return;
            }
            const enemyId = enemyCardEl.getAttribute('data-enemy-id');
            const allEnemyCards = [...state.opponentFront.value, ...state.opponentRear.value];
            const targetCard = allEnemyCards.find(c => String(c.instanceId) === enemyId);
            
            if (targetCard && initiateAttack) initiateAttack(state, draggedCard.value, targetCard);
            
            draggedCard.value = null;
            isDraggingOver.value = null;
            clearAttackTargetHighlight();
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
        touchDragActive = false;
        touchSourceArea = null;
        isDraggingOver.value = null;
        clearAttackTargetHighlight();
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