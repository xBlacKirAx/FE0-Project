// modules/cardOps.js
// 卡片操作逻辑

export function createCardOperations(state) {
    const {
        hand, fieldFront, fieldRear, bonds, jewels, graveyard, boundless, deck,
        undoStack, selectedCard, hasPlacedBond, socket
    } = state;

    /**
     * 根据卡片查找其所在的区域数组
     */
    const getArea = (card) => {
        if (!card) return null;
        const myAreas = [
            hand.value, fieldFront.value, fieldRear.value, bonds.value,
            jewels.value, graveyard.value, boundless.value, deck.value
        ];
        for (const area of myAreas) {
            if (area.some(c => c.instanceId === card.instanceId)) return area;
        }
        return null;
    };

    /**
     * 根据区域名称获取对应的数组引用
     */
    const getAreaArray = (name) => {
        const mapping = {
            'hand': hand.value,
            'front': fieldFront.value,
            'rear': fieldRear.value,
            'bonds': bonds.value,
            'jewels': jewels.value,
            'graveyard': graveyard.value,
            'boundless': boundless.value,
            'deck': deck.value
        };
        return mapping[name] || [];
    };

    /**
     * 根据区域数组获取其名称
     */
    const getAreaName = (area) => {
        if (area === hand.value) return 'hand';
        if (area === fieldFront.value) return 'front';
        if (area === fieldRear.value) return 'rear';
        if (area === bonds.value) return 'bonds';
        if (area === jewels.value) return 'jewels';
        if (area === graveyard.value) return 'graveyard';
        if (area === boundless.value) return 'boundless';
        if (area === deck.value) return 'deck';
        return 'unknown';
    };

    /**
     * 移动卡片到指定区域
     */
    const moveTo = (card, toAreaName) => {
        const fromArea = getArea(card);
        if (!fromArea) return;
        
        const fromAreaName = getAreaName(fromArea);
        if (fromAreaName === toAreaName) return;

        const idx = fromArea.findIndex(c => c.instanceId === card.instanceId);
        if (idx > -1) {
            // 记录到撤销栈
            undoStack.value.push({ card, from: fromAreaName, to: toAreaName });
            if (undoStack.value.length > 10) undoStack.value.shift();

            const targetCard = fromArea.splice(idx, 1)[0];
            getAreaArray(toAreaName).push(targetCard);

            socket.emit('sync-card-move', { card: targetCard, to: toAreaName, from: fromAreaName });
            selectedCard.value = null;
        }

        // 标记已放置羁绊
        if (toAreaName === 'bonds') {
            hasPlacedBond.value = true;
        }
    };

    /**
     * 业务层面的便利函数
     */
    const playToField = (card, pos) => moveTo(card, pos);
    const playToBond = (card) => moveTo(card, 'bonds');
    const returnToHandFromBoard = (card) => moveTo(card, 'hand');

    /**
     * 从牌组抽牌
     */
    const drawCard = () => {
        if (hand.value.length >= 10 || deck.value.length === 0) return;
        const card = deck.value.pop();
        hand.value.push(card);
        socket.emit('player-draw');
    };

    /**
     * 翻转羁绊卡片
     */
    const toggleBondFace = (card) => {
        if (!card) return;
        card.isFaceDown = !card.isFaceDown;
        socket.emit('sync-bond-flip', {
            instanceId: card.instanceId,
            isFaceDown: card.isFaceDown
        });
    };

    /**
     * 撤销最后一步移动
     */
    const undoLastMove = () => {
        const last = undoStack.value.pop();
        if (!last) return;
        const currentArea = getAreaArray(last.to);
        const idx = currentArea.findIndex(c => c.instanceId === last.card.instanceId);
        if (idx > -1) {
            const card = currentArea.splice(idx, 1)[0];
            getAreaArray(last.from).push(card);
            socket.emit('sync-card-move', { card, to: last.from, from: last.to });
        }
    };
    // 发起攻击 (主动方)
    const initiateAttack = (state, attackerCard, defenderCard) => {
        state.attacker.value = attackerCard;
        state.defender.value = defenderCard;
        state.combatStats.value = {
            myTotalPower: attackerCard.attack || 0,
            oppTotalPower: defenderCard.attack || 0
        };
        state.isCombatActive.value = true;

        setTimeout(() => {
            // 1. 我方翻开支援卡
            let mySupport = null;
            if (state.deck.value.length > 0) {
                mySupport = state.deck.value.pop();
                state.mySupportCard.value = mySupport;
                state.combatStats.value.myTotalPower += (mySupport.support || 0);
            }

            // 2. 告诉网络对面的对手：“我打你了，这是我的支援牌”
            state.socket.emit('sync-attack', {
                attacker: attackerCard,
                defender: defenderCard,
                supportCard: mySupport
            });
            
            // 注意：这里不再自动执行 resolveCombat。
            // 我们必须耐心等待对手通过网络把他的防守支援牌发过来！
        }, 800);
    };

    // 结算战斗 (清理UI)
    // ⚔️ 终极版：结算战斗 (判定击破与清理战场)
    const resolveCombat = (state) => {
        // 1. 智能判定：我是不是发起攻击的那个人？
        // 如果发起攻击的卡片存在于我的前卫或后卫数组中，那我就是攻击方
        const isMyAttacker = ['fieldFront', 'fieldRear'].some(area =>
            state[area].value.some(c => c.instanceId === state.attacker.value.instanceId)
        );

        // 2. 战力比拼 (FE0规则：攻击力 >= 对方防守力，则判定击破)
        const attackerWins = state.combatStats.value.myTotalPower >= state.combatStats.value.oppTotalPower;

        // 3. 击破结算
        if (attackerWins) {
            console.log("💥 战斗结算: 击破对手！");
            const targetId = state.defender.value.instanceId;

            // 无差别扫描：无论防守卡在谁的场上，统统找出来送进对应主人的弃牌区
            ['fieldFront', 'fieldRear'].forEach(area => {
                const idx = state[area].value.findIndex(c => c.instanceId === targetId);
                if (idx > -1) state.graveyard.value.push(state[area].value.splice(idx, 1)[0]); // 进我的弃牌区
            });
            ['opponentFront', 'opponentRear'].forEach(area => {
                const idx = state[area].value.findIndex(c => c.instanceId === targetId);
                if (idx > -1) state.oppGraveyard.value.push(state[area].value.splice(idx, 1)[0]); // 进对手弃牌区
            });
        } else {
            console.log("🛡️ 战斗结算: 攻击未能击破！");
        }

        // 4. 支援卡退场 (用完的支援卡必须进各自的弃牌区)
        if (isMyAttacker) {
            // 我是攻击方：左侧(mySupport)是我的，右侧(oppSupport)是对手的
            if (state.mySupportCard.value) state.graveyard.value.push(state.mySupportCard.value);
            if (state.oppSupportCard.value) state.oppGraveyard.value.push(state.oppSupportCard.value);
        } else {
            // 我是防守方：左侧(mySupport)是对手的（攻击方），右侧(oppSupport)是我的
            if (state.mySupportCard.value) state.oppGraveyard.value.push(state.mySupportCard.value);
            if (state.oppSupportCard.value) state.graveyard.value.push(state.oppSupportCard.value);
        }

        // 5. 稍微延迟 0.5 秒关闭面板，给玩家看清数字的缓冲时间
        setTimeout(() => {
            state.isCombatActive.value = false;
            state.attacker.value = null;
            state.defender.value = null;
            state.mySupportCard.value = null;
            state.oppSupportCard.value = null;
        }, 500); 
    };
    // modules/cardOps.js
// 在 createCardOperations 内部追加：

    // 获取我方完整状态（用于发送给刚进入房间的对手）
    const getMySyncData = () => {
        return {
            front: state.fieldFront.value,
            rear: state.fieldRear.value,
            bonds: state.bonds.value,
            jewels: state.jewels.value,
            graveyard: state.graveyard.value,
            handCount: state.hand.value.length,
            bondsCount: state.bonds.value.length
        };
    };

    // 一键重置牌局
    const resetGame = async (isRemote = false) => {
        // 1. 清空全场
        state.hand.value = [];
        state.fieldFront.value = [];
        state.fieldRear.value = [];
        state.bonds.value = [];
        state.jewels.value = [];
        state.graveyard.value = [];
        state.boundless.value = [];
        state.deck.value = [];
        state.currentPhase.value = 'BEGINNING';
        state.hasPlacedBond.value = false;

        // 2. 重新获取卡牌并洗牌
        try {
            const res = await fetch('/api/cards');
            const data = await res.json();
            state.deck.value = data.map(c => ({ 
                ...c, 
                instanceId: Math.random() + Date.now(), 
                isFaceDown: false 
            })).sort(() => Math.random() - 0.5); // 洗牌

            // 3. 选出主人公 (牌堆顶第一张)，直接出击到前卫区
            if (state.deck.value.length > 0) {
                state.fieldFront.value.push(state.deck.value.pop());
            }

            // 4. 分配 5 张宝玉 (默认背面朝上)
            for(let i = 0; i < 5; i++) {
                if (state.deck.value.length > 0) {
                    const jewel = state.deck.value.pop();
                    jewel.isFaceDown = true;
                    state.jewels.value.push(jewel);
                }
            }

            // 5. 初始抽取 6 张手牌
            for(let i = 0; i < 6; i++) {
                if (state.deck.value.length > 0) {
                    state.hand.value.push(state.deck.value.pop());
                }
            }
        } catch (err) {
            console.error("加载卡牌失败", err);
        }

        // 6. 如果是我主动点击的重置，才通知全服一起重置
        if (!isRemote && state.socket) {
            state.socket.emit('sync-reset');
        }

        // 7. 🔑 核心修复：无论主动还是被动（包括刚进房间初始化），
        // 只要我自己的场面布置好了，就必须强制把我的场面发给对手！
        setTimeout(() => {
            if (state.socket) {
                state.socket.emit('full-state-sync', getMySyncData());
                console.log("已向对手发送我的全量状态！");
            }
        }, 600); // 延迟 600ms 确保 Vue 数据已经渲染完毕
    };

    return {
        getArea,
        getAreaArray,
        getAreaName,
        moveTo,
        playToField,
        playToBond,
        returnToHandFromBoard,
        drawCard,
        toggleBondFace,
        undoLastMove,
        initiateAttack,
        resolveCombat,
        resetGame,
        getMySyncData
    };
}
// modules/cardOps.js

