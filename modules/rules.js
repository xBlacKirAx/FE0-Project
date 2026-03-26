// modules/rules.js
// 游戏规则判定

function createRulesEngine(state) {
    const { isDevMode, currentPhase, hasPlacedBond, isMyTurn } = state;

    /**
     * 判定是否可以执行特定操作
     * @param {string} actionType - 操作类型：'PLACE_BOND'|'DEPLOY_CARD'|'RETURN_HAND'
     * @returns {boolean}
     */
    const canPerformAction = (actionType) => {
        // 开发者模式开关：开启时无视所有规则
        if (isDevMode.value) return true;
        
        // 非我方回合：禁止除撤回外的所有操作
        if (!isMyTurn.value && actionType !== 'RETURN_HAND') return false;

        switch (actionType) {
            case 'PLACE_BOND':
                // 规则：必须是羁绊阶段，且本回合还没放过羁绊
                return currentPhase.value === 'BOND' && hasPlacedBond.value === false;
                
            case 'DEPLOY_CARD':
                // 规则：必须是出击阶段
                return currentPhase.value === 'DEPLOY';
                
            case 'RETURN_HAND':
                return true; // 允许随时撤回手牌

            default:
                return false;
        }
    };

    /**
     * 根据目标区域获取对应的操作类型
     */
    const getActionByArea = (areaName) => {
        const actionMap = {
            'bonds': 'PLACE_BOND',
            'front': 'DEPLOY_CARD',
            'rear': 'DEPLOY_CARD',
            'hand': 'RETURN_HAND'
        };
        return actionMap[areaName] || null;
    };

    return {
        canPerformAction,
        getActionByArea
    };
}
