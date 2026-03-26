// modules/turnManagement.js
// 回合管理逻辑

function createTurnManager(state) {
    const { currentPhase, hasPlacedBond, isMyTurn, socket, PHASES } = state;

    const phaseOrder = ['BEGINNING', 'BOND', 'DEPLOY', 'ATTACK', 'END'];

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
        socket.emit('turn-end');
    };

    /**
     * 处理开始阶段逻辑（对手回合结束时触发）
     */
    const handleBeginningPhase = () => {
        console.log('我的回合开始：解除横置，准备抽牌');
        // TODO: 自动抽牌逻辑
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
