// modules/rules.js

export function createRulesEngine(state) {
    
    // 基础阶段动作判定
    const canPerformAction = (actionType) => {
        if (state.isDevMode.value) return true;

        const validPhases = {
            'draw': ['BEGINNING'],
            'placeBond': ['BOND'],
            'deploy': ['DEPLOY'],
            'attack': ['ATTACK']
        };

        return validPhases[actionType]?.includes(state.currentPhase.value);
    };

    // 🎨 势力到颜色的映射字典 (基于 FE0 官方规则)
    const FACTION_MAP = {
        '光之剑': { name: '红色', color: 'bg-red-500' },
        '圣痕': { name: '蓝色', color: 'bg-blue-500' },
        '白夜': { name: '白色', color: 'bg-gray-200' }, 
        '暗夜': { name: '黑色', color: 'bg-gray-800' },
        '寻踪的纹章': { name: '绿色', color: 'bg-green-500' },
        '神器': { name: '紫色', color: 'bg-purple-500' },
        '圣战旗': { name: '黄色', color: 'bg-yellow-400' },
        '女神纹章': { name: '茶色', color: 'bg-amber-700' },
        '无': { name: '无色', color: 'bg-gray-400' }
    };

    // 提供给 UI 渲染颜色的辅助函数
    const getFactionInfo = (faction) => FACTION_MAP[faction] || FACTION_MAP['无'];

    // 💰 + 🎨 出击费用的【双重校验】
    const canDeployCard = (card) => {
        if (state.isDevMode.value) return { valid: true };

        const cost = parseInt(card.cost) || 0; 
        // 兼容 JSON 中可能使用的字段名 (faction 或 symbol)
        const cardFaction = card.faction || card.symbol || '无'; 

        // 1. 数量校验：剩余可用费用是否足够？
        const availableBonds = state.bonds.value.length - (state.usedBondsThisTurn?.value || 0);
        if (availableBonds < cost) {
            return { 
                valid: false, 
                message: `费用不足！【${card.name || '此卡'}】需要 ${cost} 费，本回合仅剩 ${availableBonds} 费。` 
            };
        }

        // 2. 颜色（势力）校验：必须有至少一张【同势力】且【正面朝上】的羁绊卡
        if (cardFaction !== '无' && cost > 0) {
            const hasActiveMatchingBond = state.bonds.value.some(bond => {
                if (bond.isFaceDown) return false; // 翻面卡视为无色，直接忽略
                const bondFaction = bond.faction || bond.symbol || '无';
                return bondFaction === cardFaction; // 严格对比势力名
            });
            
            if (!hasActiveMatchingBond) {
                const colorInfo = getFactionInfo(cardFaction);
                return { 
                    valid: false, 
                    message: `颜色限制！羁绊区缺少正面朝上的【${cardFaction} (${colorInfo.name})】势力卡牌。` 
                };
            }
        }

        return { valid: true }; // 校验全数通过
    };

    const getActionByArea = (areaName) => {
        const mapping = { 'bonds': 'placeBond', 'front': 'deploy', 'rear': 'deploy' };
        return mapping[areaName];
    };

    return {
        canPerformAction,
        canDeployCard,
        getActionByArea,
        getFactionInfo // 导出给 UI 和 app.js 使用
    };
}