// modules/turnManagement.js
// 回合管理逻辑

export function createTurnManager(state) {
    const { currentPhase, hasPlacedBond, isMyTurn, socket, PHASES } = state;

    const phaseOrder = ['BEGINNING', 'BOND', 'DEPLOY', 'ATTACK', 'END'];
    const phaseNameMap = {
        BEGINNING: '开始阶段', BOND: '羁绊阶段', DEPLOY: '出击阶段', ATTACK: '攻击阶段', END: '结束阶段'
    };

    /**
     * 进入下一阶段
     */
    const nextPhase = () => {
        let currentIndex = phaseOrder.indexOf(currentPhase.value);

        if (currentIndex < phaseOrder.length - 1) {
            currentPhase.value = phaseOrder[currentIndex + 1];
            
            // 进入 BOND 阶段时，重置"已放置羁绊"标志
            if (currentPhase.value === 'BOND') {
                hasPlacedBond.value = false;
            }

            const phaseName = phaseNameMap[currentPhase.value] || currentPhase.value;
            console.log(`[阶段] → ${phaseName}`);
            socket.emit('sync-phase', { phase: currentPhase.value, phaseName });
        } else {
            // 回合结束，准备进入对手的回合
            currentPhase.value = 'BEGINNING';
            hasPlacedBond.value = false;
            endTurn();
        }
    };

    /**
     * 结束回合
     */
    const endTurn = () => {
        currentPhase.value = 'BEGINNING';
        hasPlacedBond.value = false;
        isMyTurn.value = false;

        // 己方回合结束 = 敌方回合开始，立即在本地将对手卡牌回正（乐观更新）
        const untapOpponent = (areaRef) => {
            if (!areaRef?.value?.length) return;
            areaRef.value.forEach(card => { card.isTapped = false; });
            areaRef.value = [...areaRef.value];
        };
        untapOpponent(state.opponentFront);
        untapOpponent(state.opponentRear);

        socket.emit('turn-end');
    };

    /**
     * 处理开始阶段逻辑（对手回合结束时触发）
     */
    const handleBeginningPhase = () => {
        // 重置本方回合状态
        currentPhase.value = 'BEGINNING';
        hasPlacedBond.value = false;
        if (state.usedBondsThisTurn) state.usedBondsThisTurn.value = 0;
        if (state.undoStack) state.undoStack.value = [];

        // 解除我方所有横置
        const untapArea = (areaRef) => {
            if (!areaRef?.value?.length) return;
            areaRef.value.forEach(card => { card.isTapped = false; });
            areaRef.value = [...areaRef.value]; // 触发响应式更新
        };
        untapArea(state.fieldFront);
        untapArea(state.fieldRear);

        // 通知对方同步解横置
        socket.emit('sync-untap-all');

        console.log('我的回合开始：解除横置，准备抽牌');
    };

    /**
     * 监听对手回合结束事件（需在 onMounted 中调用）
     */
    const setupTurnListener = () => {
        socket.on('opponent-turn-end', () => {
            isMyTurn.value = true;
            handleBeginningPhase();
        });
    };

    return {
        nextPhase,
        endTurn,
        handleBeginningPhase,
        setupTurnListener
    };
}
