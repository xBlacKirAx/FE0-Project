function areaLabel(a) {
    return ({
        hand: '手牌',
        front: '前排',
        rear: '后排',
        bonds: '羁绊区',
        jewels: '宝玉区',
        graveyard: '退避区',
        deck: '牌组',
        boundless: '无限区'
    }[a] || a);
}

function cardName(c) {
    return c?.cardName || c?.id || '未知卡牌';
}

function registerGameplayHandlers({ socket, EVT, log, relayToRoomPeers }) {
    socket.on(EVT.PLAY_TO_FIELD, (data) => relayToRoomPeers(socket, EVT.OPPONENT_PLAYED_TO_FIELD, data));
    socket.on(EVT.PLAY_TO_BOND, (card) => relayToRoomPeers(socket, EVT.OPPONENT_PLAYED_TO_BOND, card));
    socket.on(EVT.RETURN_TO_HAND, (card) => relayToRoomPeers(socket, EVT.OPPONENT_RETURNED_CARD, card));

    socket.on(EVT.PLAYER_DRAW, (data) => {
        log(socket.id, `抽牌 → ${cardName(data?.card)}`);
        relayToRoomPeers(socket, EVT.OPPONENT_DRAW_CARD, data);
    });

    socket.on(EVT.SYNC_CARD_MOVE, (data) => {
        const from = areaLabel(data?.from);
        const to = areaLabel(data?.to);
        const name = cardName(data?.card);
        if (data?.to === 'bonds') log(socket.id, `放置羁绊 → ${name}`);
        else if (data?.from === 'hand' && (data?.to === 'front' || data?.to === 'rear')) log(socket.id, `出击 → ${name} 到 ${to}`);
        else log(socket.id, `移动 → ${name} [${from}→${to}]`);
        relayToRoomPeers(socket, EVT.OPPONENT_CARD_MOVED, data);
    });

    socket.on(EVT.SYNC_BOND_FLIP, (data) => {
        log(socket.id, `羁绊翻面 → instanceId:${data?.instanceId} isFaceDown:${data?.isFaceDown}`);
        relayToRoomPeers(socket, EVT.OPPONENT_BOND_FLIPPED, data);
    });
}

module.exports = { registerGameplayHandlers };
