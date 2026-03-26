// modules/socketHandler.js
// Socket.IO 事件处理

export function createSocketHandler(state, cardOps) {
    const {
        oppStats, oppGraveyard, oppJewels, oppBonds,
        opponentFront, opponentRear, hand
    } = state;
    const { resolveCombat, getMySyncData, resetGame } = cardOps; 
    const socket = state.socket;
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

        // --- ⚔️ 战斗系统联机同步 ---

        // 1. 【我是防守方】：接收到对手发起的攻击
        socket.on('opponent-attack', ({ attacker, defender, supportCard }) => {
            // 巧思：为了让 UI 不变，防守方屏幕的“左侧(Attacker)”放对手数据，“右侧(Defender)”放自己数据
            state.attacker.value = attacker;
            state.mySupportCard.value = supportCard; // 左侧敌方支援卡
            
            state.defender.value = defender;
            
            state.combatStats.value = {
                myTotalPower: (attacker.attack || 0) + (supportCard?.support || 0), // 左侧总战力
                oppTotalPower: defender.attack || 0                                 // 右侧基础战力
            };

            state.isCombatActive.value = true;

            // 800ms后，我方自动从牌库翻开防守支援卡
            setTimeout(() => {
                let defenseSupport = null;
                if (state.deck.value.length > 0) {
                    defenseSupport = state.deck.value.pop();
                    state.oppSupportCard.value = defenseSupport; // 右侧我方防守支援卡
                    state.combatStats.value.oppTotalPower += (defenseSupport.support || 0);
                }

                // 将我的防守支援卡发回给攻击方！
                socket.emit('sync-defense-support', { supportCard: defenseSupport });

                // 双方都亮牌了，展示 2 秒后关闭面板
                setTimeout(() => { resolveCombat(state); }, 2000);
            }, 800);
        });

        // 2. 【我是攻击方】：接收到对手翻开的防守支援卡
        socket.on('opponent-defense-support', ({ supportCard }) => {
            // 把对手发来的牌放到 UI 右侧
            state.oppSupportCard.value = supportCard; 
            state.combatStats.value.oppTotalPower += (supportCard?.support || 0);

            // 双方战力展示完毕，2 秒后关闭面板
            setTimeout(() => { resolveCombat(state); }, 2000);
        });
        // 🔄 1. 有新玩家进入，他请求同步状态 -> 我把我的状态打包发给他
        socket.on('request-sync', () => {
            if (getMySyncData) {
                socket.emit('full-state-sync', getMySyncData());
            }
        });

        // 🔄 2. 我接收到了对手的完整状态 -> 更新到我的界面上
        socket.on('full-state-sync', (data) => {
            state.opponentFront.value = data.front || [];
            state.opponentRear.value = data.rear || [];
            state.oppBonds.value = data.bonds || [];
            state.oppJewels.value = data.jewels || [];
            state.oppGraveyard.value = data.graveyard || [];
            
            state.oppStats.value = {
                hand: data.handCount || 0,
                bonds: data.bondsCount || 0,
                active: 0
            };
        });

        // 🔄 3. 对手点击了“一键重置” -> 我方被动执行重置（传入 true 代表是被动）
        socket.on('sync-reset', () => {
            console.log("对手发起了重置指令，正在重新洗牌...");
            if (resetGame) resetGame(true);
        });

        // 🚀 4. 🔑 核心修复：确保加入房间时100%索要对手的战局
        const requestSync = () => {
            console.log("已连接，正在请求对手的当前战局...");
            socket.emit('request-sync');
        };

        // 如果代码执行到这里时 Socket 已经连上了，直接发请求
        if (socket.connected) {
            requestSync();
        } else {
            // 否则等它连上再发
            socket.on('connect', requestSync);
        }
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
