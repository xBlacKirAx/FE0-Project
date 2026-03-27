// modules/rules.js
// 游戏规则判定

// modules/rules.js
export function createRulesEngine(state) {
    
    // 基础阶段动作判定
    const canPerformAction = (actionType) => {
        if (state.isDevMode.value) return true; // DEV模式无视一切阶段规则

        const validPhases = {
            'draw': ['BEGINNING'],
            'placeBond': ['BOND'],
            'deploy': ['DEPLOY'],
            'attack': ['ATTACK']
        };

        return validPhases[actionType]?.includes(state.currentPhase.value);
    };

    // 💰 新增：出击费用校验
    // modules/rules.js 内部
    const canDeployCard = (card) => {
        if (state.isDevMode.value) return true; // DEV模式无视费用

        const cost = parseInt(card.cost) || 0; 
        const currentBonds = state.bonds.value.length; 
        
        // 🧮 核心计算：剩余可用费用 = 羁绊总数 - 本回合已用费用
        const availableBonds = currentBonds - (state.usedBondsThisTurn?.value || 0);

        if (availableBonds < cost) {
            console.warn(`[规则拦截] 剩余费用不足！需要 ${cost} 费，仅剩 ${availableBonds} 费。`);
            return false;
        }

        return true;
    };

    const getActionByArea = (areaName) => {
        const mapping = {
            'bonds': 'placeBond',
            'front': 'deploy',
            'rear': 'deploy'
        };
        return mapping[areaName];
    };

    return {
        canPerformAction,
        canDeployCard, // 👈 记得暴露出来
        getActionByArea
    };
}
