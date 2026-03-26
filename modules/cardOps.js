// modules/cardOps.js
export function createCardOperations(state) {
    const {
        hand, fieldFront, fieldRear, bonds, jewels, graveyard, boundless, deck,
        undoStack, selectedCard, hasPlacedBond, socket
    } = state;

    const getArea = (card) => {
        if (!card) return null;
        const myAreas = [ hand.value, fieldFront.value, fieldRear.value, bonds.value, jewels.value, graveyard.value, boundless.value, deck.value ];
        for (const area of myAreas) { if (area.some(c => c.instanceId === card.instanceId)) return area; }
        return null;
    };

    const getAreaArray = (name) => {
        const mapping = { 'hand': hand.value, 'front': fieldFront.value, 'rear': fieldRear.value, 'bonds': bonds.value, 'jewels': jewels.value, 'graveyard': graveyard.value, 'boundless': boundless.value, 'deck': deck.value };
        return mapping[name] || [];
    };

    const getAreaName = (area) => {
        if (area === hand.value) return 'hand'; if (area === fieldFront.value) return 'front'; if (area === fieldRear.value) return 'rear';
        if (area === bonds.value) return 'bonds'; if (area === jewels.value) return 'jewels'; if (area === graveyard.value) return 'graveyard';
        if (area === boundless.value) return 'boundless'; if (area === deck.value) return 'deck'; return 'unknown';
    };

    // 🚀 改造后的 moveTo：支持阶段状态快照和自动进入出击阶段
    const moveTo = (card, toAreaName) => {
        const fromArea = getArea(card);
        if (!fromArea) return;
        const fromAreaName = getAreaName(fromArea);
        if (fromAreaName === toAreaName) return;

        const idx = fromArea.findIndex(c => c.instanceId === card.instanceId);
        if (idx > -1) {
            // 📝 记录状态快照，用于撤销和阶段回退
            undoStack.value.push({ 
                card, 
                from: fromAreaName, 
                to: toAreaName,
                previousPhase: state.currentPhase.value,
                previousHasPlacedBond: hasPlacedBond.value
            });
            if (undoStack.value.length > 10) undoStack.value.shift();
            
            const targetCard = fromArea.splice(idx, 1)[0];
            getAreaArray(toAreaName).push(targetCard);
            if (socket) socket.emit('sync-card-move', { card: targetCard, to: toAreaName, from: fromAreaName });
            selectedCard.value = null;
        }

        // 🚀 自动阶段过渡：如果在羁绊阶段放了羁绊，自动进入出击阶段
        if (toAreaName === 'bonds') {
            hasPlacedBond.value = true;
            if (state.currentPhase.value === 'BOND' && !state.isDevMode.value) {
                state.currentPhase.value = 'DEPLOY';
            }
        }
    };

    const playToField = (card, pos) => moveTo(card, pos);
    const playToBond = (card) => moveTo(card, 'bonds');
    const returnToHandFromBoard = (card) => moveTo(card, 'hand');

    // 🏆 终极原生 JS 抽牌动画 + 自动阶段过渡
    const drawCard = () => {
        if (hand.value.length >= 10 || deck.value.length === 0) return;

        // 1. 撤销快照记录
        undoStack.value.push({ type: 'draw', previousPhase: state.currentPhase.value });
        if (undoStack.value.length > 10) undoStack.value.shift();

        // 👑 2. 强制在整个网页的最外层 (body) 创建临时动画卡片
        const flyingCard = document.createElement('img');
        flyingCard.src = 'images/card_back.jpg'; // 确保卡背路径正确
        flyingCard.style.position = 'fixed';
        flyingCard.style.zIndex = '9999999';     // 绝对最高层级防遮挡
        flyingCard.style.width = '80px';
        flyingCard.style.height = '112px';
        flyingCard.style.borderRadius = '6px';
        flyingCard.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
        flyingCard.style.pointerEvents = 'none';
        flyingCard.style.objectFit = 'cover';

        // 🧮 3. 动态计算当前屏幕的长宽，画出绝对居中的飞行轨迹
        const startX = window.innerWidth - 100;      // 起点：屏幕右下
        const startY = window.innerHeight - 150;
        const midX = window.innerWidth / 2 - 40;     // 中点：屏幕正中央
        const midY = window.innerHeight / 2 - 56;
        const endX = window.innerWidth / 2 - 40;     // 终点：手牌区中心
        const endY = window.innerHeight - 50;

        flyingCard.style.left = `${startX}px`;
        flyingCard.style.top = `${startY}px`;
        flyingCard.style.opacity = '0';
        document.body.appendChild(flyingCard);

        // 🚀 4. 使用原生 JS 动画 (Web Animations API) 播放完美贝塞尔曲线
        const animation = flyingCard.animate([
            { transform: 'scale(0.5) rotateY(180deg) rotateZ(-15deg)', left: `${startX}px`, top: `${startY}px`, opacity: 0 },
            { opacity: 1, offset: 0.1 },
            { transform: 'scale(1.8) rotateY(90deg) rotateZ(5deg)', left: `${midX}px`, top: `${midY}px`, opacity: 1, offset: 0.5 },
            { transform: 'scale(0.8) rotateY(0deg) rotateZ(0deg)', left: `${endX}px`, top: `${endY}px`, opacity: 0 }
        ], {
            duration: 700, 
            easing: 'cubic-bezier(0.2, 1, 0.3, 1)',
            fill: 'forwards'
        });

        // ✨ 5. 动画结束瞬间，把牌塞进手里并过渡阶段
        animation.onfinish = () => {
            flyingCard.remove(); // 删除临时动画元素
            
            // 真实的加牌动作
            hand.value.push(deck.value.pop());
            if (socket) socket.emit('player-draw');

            // 🚀 阶段自动过渡：抽牌后进入羁绊阶段
            if (state.currentPhase.value === 'BEGINNING' && !state.isDevMode.value) {
                state.currentPhase.value = 'BOND';
            }
        };
    };

    const toggleBondFace = (card) => {
        if (!card) return;
        card.isFaceDown = !card.isFaceDown;
        if (socket) socket.emit('sync-bond-flip', { instanceId: card.instanceId, isFaceDown: card.isFaceDown });
    };

    // ⏪ 改造后的撤销逻辑：实现时光倒流
    const undoLastMove = () => {
        const last = undoStack.value.pop();
        if (!last) return;

        // ⏪ 优先回退阶段和羁绊标记
        if (last.previousPhase) state.currentPhase.value = last.previousPhase;
        if (last.previousHasPlacedBond !== undefined) hasPlacedBond.value = last.previousHasPlacedBond;

        // 特殊处理抽牌的撤销
        if (last.type === 'draw') {
            const card = hand.value.pop();
            if (card) deck.value.push(card); 
            return;
        }

        const currentArea = getAreaArray(last.to);
        const idx = currentArea.findIndex(c => c.instanceId === last.card.instanceId);
        if (idx > -1) {
            const card = currentArea.splice(idx, 1)[0];
            getAreaArray(last.from).push(card);
            if (socket) socket.emit('sync-card-move', { card, to: last.from, from: last.to });
        }
    };

    const initiateAttack = (state, attackerCard, defenderCard) => {
        if (attackerCard.isTapped && !state.isDevMode.value) {
            console.warn("[规则拦截] 底层已拒绝：已横置的卡牌无法再次攻击！");
            return;
        }

        attackerCard.isTapped = true; 

        state.attacker.value = attackerCard;
        state.defender.value = defenderCard;
        state.combatStats.value = { myTotalPower: attackerCard.attack || 0, oppTotalPower: defenderCard.attack || 0 };
        state.isCombatActive.value = true;
        
        setTimeout(() => {
            let mySupport = null;
            if (state.deck.value.length > 0) {
                mySupport = state.deck.value.pop();
                state.mySupportCard.value = mySupport;
                state.combatStats.value.myTotalPower += (mySupport.support || 0);
            }
            if (socket) socket.emit('sync-attack', { attacker: attackerCard, defender: defenderCard, supportCard: mySupport });
        }, 800);
    };

    const untapCard = (card) => {
        if (!card) return;
        card.isTapped = false; 
        if (socket) socket.emit('sync-card-untap', { instanceId: card.instanceId });
        state.selectedCard.value = null; 
    };

    const resolveCombat = (state) => {
        const isMyAttacker = ['fieldFront', 'fieldRear'].some(area => state[area].value.some(c => c.instanceId === state.attacker.value.instanceId));
        const attackerWins = state.combatStats.value.myTotalPower >= state.combatStats.value.oppTotalPower;

        if (attackerWins) {
            const targetId = state.defender.value.instanceId;
            const isTargetMC = state.defender.value.isMainCharacter; 

            if (isTargetMC) {
                console.log("👑 主人公被击破！");
                if (isMyAttacker) {
                    if (state.oppJewels.value.length > 0) {
                        state.oppJewels.value.pop(); 
                        state.oppStats.value.hand++; 
                    } else {
                        setTimeout(() => alert("🏆 决杀！你击破了对手没有宝玉的主人公，获得胜利！"), 600);
                    }
                } else {
                    if (state.jewels.value.length > 0) {
                        const brokenJewel = state.jewels.value.pop(); 
                        brokenJewel.isFaceDown = false; 
                        state.hand.value.push(brokenJewel); 
                    } else {
                        setTimeout(() => alert("💀 败北... 你的主人公在没有宝玉的情况下被击破。"), 600);
                    }
                }
            } else {
                console.log("💥 普通单位被击破！");
                ['fieldFront', 'fieldRear'].forEach(area => { const idx = state[area].value.findIndex(c => c.instanceId === targetId); if (idx > -1) state.graveyard.value.push(state[area].value.splice(idx, 1)[0]); });
                ['opponentFront', 'opponentRear'].forEach(area => { const idx = state[area].value.findIndex(c => c.instanceId === targetId); if (idx > -1) state.oppGraveyard.value.push(state[area].value.splice(idx, 1)[0]); });
            }
        }

        if (isMyAttacker) {
            if (state.mySupportCard.value) state.graveyard.value.push(state.mySupportCard.value);
            if (state.oppSupportCard.value) state.oppGraveyard.value.push(state.oppSupportCard.value);
        } else {
            if (state.mySupportCard.value) state.oppGraveyard.value.push(state.mySupportCard.value);
            if (state.oppSupportCard.value) state.graveyard.value.push(state.oppSupportCard.value);
        }

        setTimeout(() => {
            state.isCombatActive.value = false; state.attacker.value = null; state.defender.value = null;
            state.mySupportCard.value = null; state.oppSupportCard.value = null;
        }, 500);
    };

    const getMySyncData = () => {
        return {
            front: state.fieldFront.value, rear: state.fieldRear.value, bonds: state.bonds.value,
            jewels: state.jewels.value, graveyard: state.graveyard.value, 
            handCount: state.hand.value.length, bondsCount: state.bonds.value.length
        };
    };

    const resetGame = async (isRemote = false) => {
        hand.value = []; fieldFront.value = []; fieldRear.value = []; bonds.value = []; jewels.value = []; graveyard.value = []; boundless.value = []; deck.value = [];
        state.currentPhase.value = 'BEGINNING'; state.hasPlacedBond.value = false;

        try {
            const res = await fetch('/api/cards');
            const data = await res.json();
            deck.value = data.map(c => ({ 
                ...c, 
                instanceId: Math.random() + Date.now(), 
                isFaceDown: false, 
                isTapped: false 
            })).sort(() => Math.random() - 0.5);
            
            if (deck.value.length > 0) {
                const mc = deck.value.pop();
                mc.isMainCharacter = true; 
                fieldFront.value.push(mc);
            }

            for(let i=0; i<5; i++) { if(deck.value.length > 0) { const j = deck.value.pop(); j.isFaceDown = true; jewels.value.push(j); } }
            for(let i=0; i<6; i++) { if(deck.value.length > 0) hand.value.push(deck.value.pop()); }
        } catch (err) { console.error("加载失败", err); }

        if (!isRemote && socket) socket.emit('sync-reset');
        setTimeout(() => { if (socket) socket.emit('full-state-sync', getMySyncData()); }, 600);
    };

    return {
        getArea, getAreaArray, getAreaName, moveTo, playToField, playToBond, returnToHandFromBoard,
        drawCard, toggleBondFace, undoLastMove, initiateAttack, resolveCombat,
        getMySyncData, resetGame, untapCard
    };
}