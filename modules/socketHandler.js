// modules/socketHandler.js
export function createSocketHandler(state, cardOps) {
    const { socket, oppStats, oppHand, oppGraveyard, oppJewels, oppBonds, oppDeck, oppBoundless, opponentFront, opponentRear } = state;
    // 必须从 cardOps 中取出这三个函数
    const { resolveCombat, getMySyncData, resetGame } = cardOps;

    const setupSocketListeners = () => {
        socket.on('opponent-draw-card', (data) => {
            oppStats.value.hand++;
            if (data?.card) oppHand.value = [...oppHand.value, data.card];
        });
        
        socket.on('opponent-bond-flipped', ({ instanceId, isFaceDown }) => {
            const card = oppBonds.value.find(c => c.instanceId === instanceId);
            if (card) card.isFaceDown = isFaceDown;
        });

        socket.on('opponent-card-moved', (data) => {
            removeCardFromOpponentArea(data.from, data.card.instanceId);
            addCardToOpponentArea(data.to, data.card);
        });

        // ====== ⚔️ 战斗系统联机同步 ======
        // 1. 接收对手攻击
        socket.on('opponent-attack', ({ attacker, defender, supportCard }) => {
            const oppAttacker = [...state.opponentFront.value, ...state.opponentRear.value]
                                .find(c => c.instanceId === attacker.instanceId);
            if (oppAttacker) oppAttacker.isTapped = true;
            // 💥 强制刷新对手的数组，让移动端立刻看到横置
            ['opponentFront', 'opponentRear'].forEach(areaName => {
                const area = state[areaName];
                const idx = area.value.findIndex(c => c.instanceId === attacker.instanceId);
                if (idx > -1) {
                    area.value[idx].isTapped = true;
                    area.value = [...area.value]; // 强制刷新
                }
            });
            
            state.attacker.value = attacker;
            state.mySupportCard.value = supportCard; 
            state.defender.value = defender;
            state.combatStats.value = { myTotalPower: (attacker.attack || 0) + (supportCard?.support || 0), oppTotalPower: defender.attack || 0 };
            state.isCombatActive.value = true;

            setTimeout(() => {
                let defenseSupport = null;
                if (state.deck.value.length > 0) {
                    defenseSupport = state.deck.value.pop();
                    state.oppSupportCard.value = defenseSupport;
                    state.combatStats.value.oppTotalPower += (defenseSupport.support || 0);
                }
                socket.emit('sync-defense-support', { supportCard: defenseSupport });
                setTimeout(() => { if (resolveCombat) resolveCombat(state); }, 2000);
            }, 800);
        });

        // 2. 接收对手恢复直立
        socket.on('opponent-card-untap', ({ instanceId }) => {
            const oppCard = [...state.opponentFront.value, ...state.opponentRear.value]
                            .find(c => c.instanceId === instanceId);
            if (oppCard) oppCard.isTapped = false;
            ['opponentFront', 'opponentRear'].forEach(areaName => {
                const area = state[areaName];
                const idx = area.value.findIndex(c => c.instanceId === instanceId);
                if (idx > -1) {
                    area.value[idx].isTapped = false;
                    area.value = [...area.value]; // 强制刷新
                }
            });
        });
        socket.on('opponent-defense-support', ({ supportCard }) => {
            state.oppSupportCard.value = supportCard; 
            state.combatStats.value.oppTotalPower += (supportCard?.support || 0);
            setTimeout(() => { if (resolveCombat) resolveCombat(state); }, 2000);
        });

        // ====== 🔄 状态同步 ======
        socket.on('request-sync', () => {
            if (getMySyncData) socket.emit('full-state-sync', getMySyncData());
        });

        socket.on('full-state-sync', (data) => {
            opponentFront.value = data.front || [];
            opponentRear.value = data.rear || [];
            oppBonds.value = data.bonds || [];
            oppJewels.value = data.jewels || [];
            oppGraveyard.value = data.graveyard || [];
            oppHand.value = data.hand || [];
            oppDeck.value = data.deck || [];
            oppBoundless.value = data.boundless || [];
            oppStats.value = { hand: data.handCount || 0, bonds: data.bondsCount || 0, active: 0 };
        });

        socket.on('sync-reset', () => {
            if (resetGame) resetGame(true);
        });

        // ====== 🔄 模式同步 ======
        socket.on('opponent-dev-mode-changed', ({ isDevMode, turnOwner }) => {
            state.isDevMode.value = isDevMode;

            // 对手切到 PLAY 时，对手应为回合方，本端强制为非回合方。
            if (!isDevMode && turnOwner === 'sender') {
                state.isMyTurn.value = false;
                state.currentPhase.value = 'BEGINNING';
                state.hasPlacedBond.value = false;
                state.usedBondsThisTurn.value = 0;
            }
        });

        const requestSync = () => socket.emit('request-sync');
        if (socket.connected) {
            requestSync();
        } else {
            socket.on('connect', requestSync);
        }
    };

    const removeCardFromOpponentArea = (areaName, cardId) => {
        if (areaName === 'graveyard') oppGraveyard.value = oppGraveyard.value.filter(c => c.instanceId !== cardId);
        else if (areaName === 'jewels') oppJewels.value = oppJewels.value.filter(c => c.instanceId !== cardId);
        else if (areaName === 'bonds') oppBonds.value = oppBonds.value.filter(c => c.instanceId !== cardId);
        else if (areaName === 'front') opponentFront.value = opponentFront.value.filter(c => c.instanceId !== cardId);
        else if (areaName === 'rear') opponentRear.value = opponentRear.value.filter(c => c.instanceId !== cardId);
        else if (areaName === 'deck') oppDeck.value = oppDeck.value.filter(c => c.instanceId !== cardId);
        else if (areaName === 'boundless') oppBoundless.value = oppBoundless.value.filter(c => c.instanceId !== cardId);
        else if (areaName === 'hand') { oppStats.value.hand--; oppHand.value = oppHand.value.filter(c => c.instanceId !== cardId); }
    };

    const addCardToOpponentArea = (areaName, card) => {
        if (areaName === 'graveyard') oppGraveyard.value.push(card);
        else if (areaName === 'jewels') oppJewels.value.push(card);
        else if (areaName === 'bonds') oppBonds.value.push(card);
        else if (areaName === 'front') opponentFront.value.push(card);
        else if (areaName === 'rear') opponentRear.value.push(card);
        else if (areaName === 'deck') oppDeck.value.push(card);
        else if (areaName === 'boundless') oppBoundless.value.push(card);
        else if (areaName === 'hand') { oppStats.value.hand++; oppHand.value = [...oppHand.value, card]; }
    };

    return { setupSocketListeners };
}