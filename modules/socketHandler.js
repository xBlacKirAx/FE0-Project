// modules/socketHandler.js
// Socket.IO 事件处理

function createSocketHandler(state, cardOps) {
    const {
        socket, oppStats, oppGraveyard, oppJewels, oppBonds,
        opponentFront, opponentRear, hand
    } = state;

    /**
     * 初始化所有 Socket 监听器
     */
    const setupSocketListeners = () => {
        // 对手抽牌
        socket.on('opponent-draw-card', () => {
            oppStats.value.hand++;
        });

        // 对手切换羁绊翻面状态
        socket.on('opponent-bond-flipped', ({ instanceId, isFaceDown }) => {
            const card = oppBonds.value.find(c => c.instanceId === instanceId);
            if (card) {
                card.isFaceDown = isFaceDown;
            }
        });

        // 对手移动卡片（核心同步）
        socket.on('opponent-card-moved', (data) => {
            handleOpponentCardMoved(data);
        });

        // 对手自动更新存储区
        socket.on('opponent-update-storage', ({ to, card }) => {
            if (to === 'jewels') oppJewels.value.push(card);
            else if (to === 'graveyard') oppGraveyard.value.push(card);
            else if (to === 'bonds') oppBonds.value.push(card);
        });
    };

    /**
     * 处理对手卡片移动事件
     */
    const handleOpponentCardMoved = ({ card, to, from }) => {
        // A. 从来源区域移除卡片
        removeCardFromOpponentArea(from, card.instanceId);

        // B. 添加到目标区域
        addCardToOpponentArea(to, card);
    };

    /**
     * 从对手指定区域移除卡片
     */
    const removeCardFromOpponentArea = (areaName, cardId) => {
        if (areaName === 'graveyard') {
            oppGraveyard.value = oppGraveyard.value.filter(c => c.instanceId !== cardId);
        } else if (areaName === 'jewels') {
            oppJewels.value = oppJewels.value.filter(c => c.instanceId !== cardId);
        } else if (areaName === 'bonds') {
            oppBonds.value = oppBonds.value.filter(c => c.instanceId !== cardId);
        } else if (areaName === 'front') {
            opponentFront.value = opponentFront.value.filter(c => c.instanceId !== cardId);
        } else if (areaName === 'rear') {
            opponentRear.value = opponentRear.value.filter(c => c.instanceId !== cardId);
        } else if (areaName === 'hand') {
            oppStats.value.hand--;
        }
    };

    /**
     * 添加卡片到对手指定区域
     */
    const addCardToOpponentArea = (areaName, card) => {
        if (areaName === 'graveyard') {
            oppGraveyard.value.push(card);
        } else if (areaName === 'jewels') {
            oppJewels.value.push(card);
        } else if (areaName === 'bonds') {
            oppBonds.value.push(card);
        } else if (areaName === 'front') {
            opponentFront.value.push(card);
        } else if (areaName === 'rear') {
            opponentRear.value.push(card);
        } else if (areaName === 'hand') {
            oppStats.value.hand++;
        }
    };

    return {
        setupSocketListeners,
        handleOpponentCardMoved,
        removeCardFromOpponentArea,
        addCardToOpponentArea
    };
}
