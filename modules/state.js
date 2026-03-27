// modules/state.js
// 集中聚合各领域状态切片，并对外保持同一份状态对象形状。

import { createMyAreasState } from './state/myAreas.js';
import { createOpponentAreasState } from './state/opponentAreas.js';
import { createUiState } from './state/uiState.js';
import { createInteractionState } from './state/interactionState.js';
import { createGameFlowState } from './state/gameState.js';
import { createNetworkState } from './state/networkState.js';

export function createGameState() {
    const myAreas = createMyAreasState();
    const opponentAreas = createOpponentAreasState();
    const ui = createUiState();
    const interaction = createInteractionState();
    const gameFlow = createGameFlowState();
    const network = createNetworkState();

    return {
        // 我方区域
        ...myAreas,
        // 对手区域
        ...opponentAreas,
        // UI
        ...ui,
        // 交互
        ...interaction,
        // 游戏状态 + 联机
        ...gameFlow,
        ...network
    };
}
