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

    const scrollHandToLatest = () => {
        requestAnimationFrame(() => {
            const strip = document.querySelector('.hand-strip-scroll');
            if (!strip) return;
            strip.scrollTo({ left: strip.scrollWidth, behavior: 'smooth' });
        });
    };

    const moveTo = (card, toAreaName) => {
        const fromArea = getArea(card);
        if (!fromArea) return;
        const fromAreaName = getAreaName(fromArea);
        if (fromAreaName === toAreaName) return;

        const idx = fromArea.findIndex(c => c.instanceId === card.instanceId);
        if (idx > -1) {
            const isDeploy = fromAreaName === 'hand' && (toAreaName === 'front' || toAreaName === 'rear');
            
            // DEV 模式下强制算作 0 费
            const cost = (isDeploy && !state.isDevMode.value) ? (parseInt(card.cost) || 0) : 0;

            undoStack.value.push({ 
                card, 
                from: fromAreaName, 
                to: toAreaName,
                previousPhase: state.currentPhase.value,
                previousHasPlacedBond: hasPlacedBond.value,
                costUsed: cost // 记录扣掉的费用，用于撤销
            });
            if (undoStack.value.length > 10) undoStack.value.shift();
            
            // 扣除可用费用
            if (isDeploy && state.usedBondsThisTurn !== undefined) {
                state.usedBondsThisTurn.value += cost;
            }

            const targetCard = fromArea.splice(idx, 1)[0];
            getAreaArray(toAreaName).push(targetCard);
            if (socket) socket.emit('sync-card-move', { card: targetCard, to: toAreaName, from: fromAreaName });
            selectedCard.value = null;
        }

        // 羁绊阶段自动跳转出击阶段
        if (toAreaName === 'bonds') {
            hasPlacedBond.value = true;
            if (state.currentPhase.value === 'BOND' && !state.isDevMode.value) {
                state.currentPhase.value = 'DEPLOY';
            }
        }
    };

    // 💡 核心修复：清理掉多余的 rules 校验，直接调用底层移动，因为 app.js 已经做好了安检
    const playToField = (card, pos) => moveTo(card, pos);
    const playToBond = (card) => moveTo(card, 'bonds');
    const returnToHandFromBoard = (card) => moveTo(card, 'hand');

    const drawCard = () => {
        if (!state.isDevMode.value && !state.isMyTurn.value) return;
        if (hand.value.length >= 10 || deck.value.length === 0) return;

        undoStack.value.push({ type: 'draw', previousPhase: state.currentPhase.value });
        if (undoStack.value.length > 10) undoStack.value.shift();

        const flyingCard = document.createElement('img');
        flyingCard.src = 'images/card_back.jpg'; 
        flyingCard.style.position = 'fixed';
        flyingCard.style.zIndex = '9999999';     
        flyingCard.style.width = '80px';
        flyingCard.style.height = '112px';
        flyingCard.style.borderRadius = '6px';
        flyingCard.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
        flyingCard.style.pointerEvents = 'none';
        flyingCard.style.objectFit = 'cover';

        const startX = window.innerWidth - 100;      
        const startY = window.innerHeight - 150;
        const midX = window.innerWidth / 2 - 40;     
        const midY = window.innerHeight / 2 - 56;
        const endX = window.innerWidth / 2 - 40;     
        const endY = window.innerHeight - 50;

        flyingCard.style.left = `${startX}px`;
        flyingCard.style.top = `${startY}px`;
        flyingCard.style.opacity = '0';
        document.body.appendChild(flyingCard);

        const drawAnimationDuration = 900;
        const animation = flyingCard.animate([
            { transform: 'scale(0.5) rotateY(180deg) rotateZ(-15deg)', left: `${startX}px`, top: `${startY}px`, opacity: 0 },
            { opacity: 1, offset: 0.1 },
            { transform: 'scale(1.8) rotateY(90deg) rotateZ(5deg)', left: `${midX}px`, top: `${midY}px`, opacity: 1, offset: 0.5 },
            { transform: 'scale(0.8) rotateY(0deg) rotateZ(0deg)', left: `${endX}px`, top: `${endY}px`, opacity: 0 }
        ], { duration: drawAnimationDuration, easing: 'cubic-bezier(0.2, 1, 0.3, 1)', fill: 'forwards' });

        let drawSettled = false;
        const settleDraw = () => {
            if (drawSettled) return;
            drawSettled = true;
            flyingCard.remove();
            const drawnCard = deck.value.pop();
            hand.value.push(drawnCard);
            scrollHandToLatest();
            if (socket) socket.emit('player-draw', { card: drawnCard });
            if (state.currentPhase.value === 'BEGINNING' && !state.isDevMode.value) {
                state.currentPhase.value = 'BOND';
            }
        };

        animation.onfinish = settleDraw;
        // 在动画尾段提前结算，减少“动画结束后卡还没入手”的空档体感。
        setTimeout(settleDraw, Math.floor(drawAnimationDuration * 0.3));
    };

    const toggleBondFace = (card) => {
        if (!card) return;
        card.isFaceDown = !card.isFaceDown;
        if (socket) socket.emit('sync-bond-flip', { instanceId: card.instanceId, isFaceDown: card.isFaceDown });
    };

    const undoLastMove = () => {
        const last = undoStack.value.pop();
        if (!last) return;

        if (last.previousPhase) state.currentPhase.value = last.previousPhase;
        if (last.previousHasPlacedBond !== undefined) hasPlacedBond.value = last.previousHasPlacedBond;

        if (last.type === 'draw') {
            const card = hand.value.pop();
            if (card) deck.value.push(card); 
            return;
        }
        
        if (last.costUsed && state.usedBondsThisTurn !== undefined) {
            state.usedBondsThisTurn.value -= last.costUsed;
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
            hand: state.hand.value, deck: state.deck.value, boundless: state.boundless.value,
            handCount: state.hand.value.length, bondsCount: state.bonds.value.length
        };
    };

    const resetGame = async (isRemote = false) => {
        hand.value = []; fieldFront.value = []; fieldRear.value = []; bonds.value = []; jewels.value = []; graveyard.value = []; boundless.value = []; deck.value = [];
        state.currentPhase.value = 'BEGINNING'; state.hasPlacedBond.value = false;
        state.usedBondsThisTurn.value = 0;
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

    // 💡 导出时，直接导出原生的 playToField 即可
    return {
        getArea, getAreaArray, getAreaName, moveTo, playToField, playToBond, returnToHandFromBoard,
        drawCard, toggleBondFace, undoLastMove, initiateAttack, resolveCombat,
        getMySyncData, resetGame, untapCard
    };
}