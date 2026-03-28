// modules/rules.js

// modules/rules.js
export function createRulesEngine(state) {
    
    // 基础阶段动作判定
    const canPerformAction = (actionType) => {
        if (state.isDevMode.value) return true;
        // PLAY 模式下，非回合方完全禁止操作
        if (!state.isMyTurn.value) return false;

        const validPhases = {
            'draw': ['BEGINNING'],
            'placeBond': ['BOND'],
            'deploy': ['DEPLOY'],
            'attack': ['ATTACK']
        };

        return validPhases[actionType]?.includes(state.currentPhase.value);
    };

    // 🎨 势力到颜色的映射字典 (基于 FE0 官方规则)
    // color 用于费用标签背景，borderColor 用于粗边框
    const FACTION_MAP = {
        '光之剑': { name: '红色', color: 'bg-red-950/70', borderColor: 'border-red-600' },
        '圣痕': { name: '蓝色', color: 'bg-blue-950/70', borderColor: 'border-blue-600' },
        '白夜': { name: '白色', color: 'bg-stone-800/80', borderColor: 'border-stone-100' }, 
        '暗夜': { name: '黑色', color: 'bg-stone-950/80', borderColor: 'border-stone-900' },
        '寻踪的纹章': { name: '绿色', color: 'bg-green-950/70', borderColor: 'border-green-600' },
        '神器': { name: '紫色', color: 'bg-purple-950/70', borderColor: 'border-purple-600' },
        '圣战旗': { name: '黄色', color: 'bg-yellow-950/70', borderColor: 'border-yellow-500' },
        '女神纹章': { name: '茶色', color: 'bg-amber-950/70', borderColor: 'border-amber-800' },
        '无': { name: '无色', color: 'bg-gray-900/70', borderColor: 'border-gray-600' }
    };

    // 🔑 新增辅助：直接从卡牌对象获取其势力信息 (防呆字段匹配)
    const getCardFactionInfo = (card) => {
        const faction = card?.force || card?.faction || card?.symbol || '无';
        return FACTION_MAP[faction] || FACTION_MAP['无'];
    };

    // 用于费用校验的出击费用的【双重校验】
    const canDeployCard = (card) => {
        if (state.isDevMode.value) return { valid: true };

        const cost = parseInt(card.cost) || 0; 
        const cardFaction = card.force || card.faction || card.symbol || '无'; 

        const availableBonds = state.bonds.value.length - (state.usedBondsThisTurn?.value || 0);
        if (availableBonds < cost) {
            return { valid: false, message: `费用不足！需要 ${cost} 费，本回合仅剩 ${availableBonds} 费。` };
        }

        if (cardFaction !== '无' && cost > 0) {
            const hasActiveMatchingBond = state.bonds.value.some(bond => {
                if (bond.isFaceDown) return false; 
                const bondFaction = bond.force || bond.faction || bond.symbol || '无';
                return bondFaction === cardFaction; 
            });
            
            if (!hasActiveMatchingBond) {
                const info = FACTION_MAP[cardFaction] || FACTION_MAP['无'];
                return { valid: false, message: `颜色限制！缺少正面朝上的【${cardFaction} (${info.name})】羁绊。` };
            }
        }
        return { valid: true }; // 校验全数通过
    };

    const getActionByArea = (areaName) => {
        return { 'bonds': 'placeBond', 'front': 'deploy', 'rear': 'deploy' }[areaName];
    };

    // 转职检测：检查手牌中的卡是否可以转职到战场上相同角色的卡
    const canPerformClassChange = (handCard) => {
        if (!handCard) return null;
        if (!state.isDevMode.value && !state.isMyTurn.value) return null;

        // 修复4：promoteCost 为 N/A 的卡（下级职业/固定职业）不能转职
        const promoteCost = handCard.promoteCost;
        if (!promoteCost || promoteCost === 'N/A') return null;
        const ccCost = parseInt(promoteCost);
        if (isNaN(ccCost) || ccCost < 0) return null;

        const charaName = handCard.charaName;
        if (!charaName) return null;

        // 检查战场上是否有相同charaName的卡
        const matchingCardOnField = [
            ...state.fieldFront.value,
            ...state.fieldRear.value
        ].find(c => c.charaName === charaName);

        if (!matchingCardOnField) return null;

        // 修复5：检查羁绊费用（非dev模式）
        if (!state.isDevMode.value) {
            const availableBonds = state.bonds.value.length - (state.usedBondsThisTurn?.value || 0);
            if (availableBonds < ccCost) {
                return { valid: false, reason: 'insufficient-bonds', targetCard: matchingCardOnField, charaName, ccCost };
            }

            // 检查势力颜色羁绊
            const cardFaction = handCard.force || handCard.faction || handCard.symbol || '无';
            if (cardFaction !== '无' && ccCost > 0) {
                const hasMatchingBond = state.bonds.value.some(bond => {
                    if (bond.isFaceDown) return false;
                    const bondFaction = bond.force || bond.faction || bond.symbol || '无';
                    return bondFaction === cardFaction;
                });
                if (!hasMatchingBond) {
                    return { valid: false, reason: 'no-faction-bond', targetCard: matchingCardOnField, charaName, ccCost };
                }
            }
        }

        return {
            valid: true,
            targetCard: matchingCardOnField,
            charaName,
            ccCost
        };
    };

    return {
        canPerformAction,
        canDeployCard,
        getActionByArea,
        canPerformClassChange,
        getCardFactionInfo
    };
}