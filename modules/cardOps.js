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

    const moveTo = (card, toAreaName) => {
        const fromArea = getArea(card);
        if (!fromArea) return;
        const fromAreaName = getAreaName(fromArea);
        if (fromAreaName === toAreaName) return;

        const idx = fromArea.findIndex(c => c.instanceId === card.instanceId);
        if (idx > -1) {
            undoStack.value.push({ card, from: fromAreaName, to: toAreaName });
            if (undoStack.value.length > 10) undoStack.value.shift();
            const targetCard = fromArea.splice(idx, 1)[0];
            getAreaArray(toAreaName).push(targetCard);
            socket.emit('sync-card-move', { card: targetCard, to: toAreaName, from: fromAreaName });
            selectedCard.value = null;
        }
        if (toAreaName === 'bonds') hasPlacedBond.value = true;
    };

    const playToField = (card, pos) => moveTo(card, pos);
    const playToBond = (card) => moveTo(card, 'bonds');
    const returnToHandFromBoard = (card) => moveTo(card, 'hand');

    const drawCard = () => {
        if (hand.value.length >= 10 || deck.value.length === 0) return;
        hand.value.push(deck.value.pop());
        socket.emit('player-draw');
    };

    const toggleBondFace = (card) => {
        if (!card) return;
        card.isFaceDown = !card.isFaceDown;
        socket.emit('sync-bond-flip', { instanceId: card.instanceId, isFaceDown: card.isFaceDown });
    };

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

    // ⚔️ 战斗逻辑
    const initiateAttack = (state, attackerCard, defenderCard) => {
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
            socket.emit('sync-attack', { attacker: attackerCard, defender: defenderCard, supportCard: mySupport });
        }, 800);
    };

    const resolveCombat = (state) => {
        const isMyAttacker = ['fieldFront', 'fieldRear'].some(area => state[area].value.some(c => c.instanceId === state.attacker.value.instanceId));
        const attackerWins = state.combatStats.value.myTotalPower >= state.combatStats.value.oppTotalPower;

        if (attackerWins) {
            const targetId = state.defender.value.instanceId;
            ['fieldFront', 'fieldRear'].forEach(area => { const idx = state[area].value.findIndex(c => c.instanceId === targetId); if (idx > -1) state.graveyard.value.push(state[area].value.splice(idx, 1)[0]); });
            ['opponentFront', 'opponentRear'].forEach(area => { const idx = state[area].value.findIndex(c => c.instanceId === targetId); if (idx > -1) state.oppGraveyard.value.push(state[area].value.splice(idx, 1)[0]); });
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

    // 🔄 获取全量状态和重置
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
            deck.value = data.map(c => ({ ...c, instanceId: Math.random() + Date.now(), isFaceDown: false })).sort(() => Math.random() - 0.5);

            if (deck.value.length > 0) fieldFront.value.push(deck.value.pop());
            for(let i=0; i<5; i++) { if(deck.value.length > 0) { const j = deck.value.pop(); j.isFaceDown = true; jewels.value.push(j); } }
            for(let i=0; i<6; i++) { if(deck.value.length > 0) hand.value.push(deck.value.pop()); }
        } catch (err) { console.error("加载失败", err); }

        if (!isRemote && socket) socket.emit('sync-reset');
        setTimeout(() => { if (socket) socket.emit('full-state-sync', getMySyncData()); }, 600);
    };

    return {
        getArea, getAreaArray, getAreaName, moveTo, playToField, playToBond, returnToHandFromBoard,
        drawCard, toggleBondFace, undoLastMove, initiateAttack, resolveCombat,
        getMySyncData, resetGame
    };
}