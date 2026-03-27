// modules/turnManagement.js
// 回合管理逻辑

import { getNextPhase, PHASE_NAME_MAP } from './engine/phaseEngine.js';
import { setBeginningPhaseState, clearTurnUsageState, untapArea } from './commands/turnCommands.js';
import { emitSyncPhase, emitTurnEnd, emitSyncUntapAll } from './effects/socketEffects.js';

export function createTurnManager(state) {
    const { currentPhase, hasPlacedBond, isMyTurn, socket } = state;

    /**
     * 进入下一阶段
     */
    const nextPhase = () => {
        const prev = currentPhase.value;
        const next = getNextPhase(currentPhase.value);

        if (next) {
            if (prev === 'DEPLOY' && next === 'ATTACK' && state.undoStack) {
                state.undoStack.value.push({
                    type: 'phase-transition',
                    from: prev,
                    to: next,
                    previousPhase: prev,
                    previousHasPlacedBond: hasPlacedBond.value
                });
                if (state.undoStack.value.length > 10) state.undoStack.value.shift();
            }
            currentPhase.value = next;
            
            // 进入 BOND 阶段时，重置"已放置羁绊"标志
            if (currentPhase.value === 'BOND') {
                hasPlacedBond.value = false;
            }

            const phaseName = PHASE_NAME_MAP[currentPhase.value] || currentPhase.value;
            console.log(`[阶段] → ${phaseName}`);
            emitSyncPhase(socket, { phase: currentPhase.value, phaseName });
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
        setBeginningPhaseState(state);
        isMyTurn.value = false;

        // 己方回合结束 = 敌方回合开始，立即在本地将对手卡牌回正（乐观更新）
        untapArea(state.opponentFront);
        untapArea(state.opponentRear);

        emitTurnEnd(socket);
    };

    /**
     * 处理开始阶段逻辑（对手回合结束时触发）
     */
    const handleBeginningPhase = () => {
        // 重置本方回合状态
        setBeginningPhaseState(state);
        clearTurnUsageState(state);
        if (state.hasBattledThisTurn) {
            state.hasBattledThisTurn.value = false;
        }

        // 解除我方所有横置
        untapArea(state.fieldFront);
        untapArea(state.fieldRear);

        // 通知对方同步解横置
        emitSyncUntapAll(socket);

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
