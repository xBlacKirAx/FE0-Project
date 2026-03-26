// modules/cardOps.js
// 卡片操作逻辑

function createCardOperations(state) {
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
        undoLastMove
    };
}
