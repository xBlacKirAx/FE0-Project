// modules/rules.js

// modules/rules.js
export function createRulesEngine(state) {
    const rangeModel = globalThis.RANGE_MODEL;
    const normalizeRange = rangeModel?.normalizeRange || ((raw) => {
        const text = String(raw || '').trim();
        if (text === '1' || text === '2' || text === '1-2' || text === '-') return text;
        return '-';
    });

    const canHitByRange = rangeModel?.canHitByRange || ((rangeOrRaw, attackerArea, defenderArea) => {
        const range = normalizeRange(rangeOrRaw);
        const map = { 'my-rear': 0, 'my-front': 1, 'opp-front': 2, 'opp-rear': 3 };
        const ai = map[attackerArea];
        const di = map[defenderArea];
        if (typeof ai !== 'number' || typeof di !== 'number') {
            return { valid: false, range, distance: null, allowedDistances: [], reason: 'invalid-distance' };
        }
        const distance = Math.abs(di - ai);
        const allowedDistances = range === '-' ? [0] : (range === '1' ? [1] : (range === '2' ? [2] : (range === '1-2' ? [1, 2] : [])));
        if (!allowedDistances.length) {
            return { valid: false, range, distance, allowedDistances, reason: 'unsupported-range' };
        }
        const valid = allowedDistances.includes(distance);
        return { valid, range, distance, allowedDistances, reason: valid ? 'ok' : 'range-distance-mismatch' };
    });

    const getCardAreaName = (card) => {
        if (!card?.instanceId) return null;
        const id = String(card.instanceId);

        if ((state.fieldFront.value || []).some(c => String(c.instanceId) === id)) return 'my-front';
        if ((state.fieldRear.value || []).some(c => String(c.instanceId) === id)) return 'my-rear';
        if ((state.opponentFront.value || []).some(c => String(c.instanceId) === id)) return 'opp-front';
        if ((state.opponentRear.value || []).some(c => String(c.instanceId) === id)) return 'opp-rear';
        return null;
    };

    const canAttackTargetByRange = (attackerCard, defenderCard) => {
        const attackerArea = getCardAreaName(attackerCard);
        const defenderArea = getCardAreaName(defenderCard);
        const range = normalizeRange(attackerCard?.range);

        if (!attackerArea || !defenderArea) {
            return { valid: false, reason: 'invalid-area', message: '攻防单位区域信息异常。' };
        }
        if (!(attackerArea === 'my-front' || attackerArea === 'my-rear')) {
            return { valid: false, reason: 'attacker-not-my-field', message: '攻击单位必须在己方战场。' };
        }
        if (!(defenderArea === 'opp-front' || defenderArea === 'opp-rear')) {
            return { valid: false, reason: 'defender-not-opp-field', message: '目标必须是对方前场或后场单位。' };
        }

        const hitResult = canHitByRange(range, attackerArea, defenderArea);
        if (hitResult.distance === null) {
            return { valid: false, reason: 'invalid-distance', message: '攻防距离计算失败。' };
        }

        if (hitResult.reason === 'unsupported-range') {
            return { valid: false, reason: 'unsupported-range', message: '未知射程，不能攻击。' };
        }

        const ok = hitResult.valid;
        if (ok) {
            return { valid: true, reason: 'ok', message: '' };
        }

        if (range === '-') {
            return {
                valid: false,
                reason: 'range-zero',
                message: '射程“-”等同0，仅能命中距离0区域；敌方单位不在同一区域。'
            };
        }

        return {
            valid: false,
            reason: 'range-distance-mismatch',
            message: `射程${range}不可命中当前目标（距离=${hitResult.distance}）。`
        };
    };
    
    // 基础阶段动作判定
    const canPerformAction = (actionType) => {
        if (state.isDevMode.value) return true;
        // PLAY 模式下，非回合方完全禁止操作
        if (!state.isMyTurn.value) return false;

        if (state.firstPlayerOpeningTurnLocked?.value === true) {
            if (actionType === 'draw' || actionType === 'attack') {
                return false;
            }
        }

        const validPhases = {
            'draw': ['BEGINNING'],
            'placeBond': ['BOND'],
            'deploy': ['DEPLOY'],
            'attack': ['ATTACK'],
            'reposition': ['ATTACK']
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

    // 转职检测：检查手牌中的卡是否可以转职到战场上相同单位名的卡
    const canPerformClassChange = (handCard) => {
        if (!handCard) return null;
        if (!state.isDevMode.value && !state.isMyTurn.value) return null;

        // promoteCost 为 N/A 的卡（下级职业/固定职业）不能转职
        const promoteCost = handCard.promoteCost;
        if (!promoteCost || promoteCost === 'N/A') return null;
        const ccCost = parseInt(promoteCost);
        if (isNaN(ccCost) || ccCost < 0) return null;

        const cardName = handCard.cardName;
        if (!cardName) return null;

        // 检查战场上是否有相同cardName的卡
        const matchingCardOnField = [
            ...state.fieldFront.value,
            ...state.fieldRear.value
        ].find(c => c.cardName === cardName);

        if (!matchingCardOnField) return null;

        // 检查羁绊费用（非dev模式）
        if (!state.isDevMode.value) {
            const availableBonds = state.bonds.value.length - (state.usedBondsThisTurn?.value || 0);
            if (availableBonds < ccCost) {
                return { valid: false, reason: 'insufficient-bonds', targetCard: matchingCardOnField, cardName, ccCost };
            }

            // 检查势力颜色羁绊
            const cardFaction = handCard.force || hand.faction || hand.symbol || '无';
            if (cardFaction !== '无' && ccCost > 0) {
                const hasMatchingBond = state.bonds.value.some(bond => {
                    if (bond.isFaceDown) return false;
                    const bondFaction = bond.force || bond.faction || bond.symbol || '无';
                    return bondFaction === cardFaction;
                });
                if (!hasMatchingBond) {
                    return { valid: false, reason: 'no-faction-bond', targetCard: matchingCardOnField, cardName, ccCost };
                }
            }
        }

        return {
            valid: true,
            targetCard: matchingCardOnField,
            cardName,
            ccCost
        };
    };

    const validateDeck = (deck, protagonistCardId) => {
        const errors = [];
        const cardCounts = {};
        let hasCost1 = false;

        if (!Array.isArray(deck)) {
            return { isValid: false, errors: ['卡组数据无效。'] };
        }

        deck.forEach(card => {
            const cardId = card.id;
            cardCounts[cardId] = (cardCounts[cardId] || 0) + 1;
            if (String(card.cost) === '1') {
                hasCost1 = true;
            }
        });

        if (deck.length < 50) {
            errors.push(`卡组数量不足50张 (当前 ${deck.length}张)`);
        }

        if (!hasCost1) {
            errors.push('卡组缺少出击费用为1的卡牌。');
        }

        if (!protagonistCardId || !deck.some(c => String(c.id).trim() === String(protagonistCardId).trim())) {
            errors.push('卡组必须指定一张主人公牌。');
        }

        Object.entries(cardCounts).forEach(([cardId, count]) => {
            if (count > 4) {
                const card = deck.find(c => c.id === cardId);
                errors.push(`卡牌 "${card?.cardName || cardId}" 超过了4张 (当前 ${count}张)`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    };

    return {
        canPerformAction,
        canDeployCard,
        canAttackTargetByRange,
        getActionByArea,
        canPerformClassChange,
        getCardFactionInfo,
        validateDeck
    };
}