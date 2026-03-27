function cardName(c) {
    return c?.name || c?.id || '未知卡牌';
}

function registerBattleHandlers({ socket, EVT, log, combatState }) {
    socket.on(EVT.SYNC_ATTACK, (data) => {
        combatState.pendingCombat = {
            atkName: cardName(data?.attacker),
            defName: cardName(data?.defender),
            atkBase: data?.attacker?.attack || 0,
            atkSupport: data?.supportCard?.support || 0,
            defBase: data?.defender?.attack || 0
        };
        socket.broadcast.emit(EVT.OPPONENT_ATTACK, data);
    });

    socket.on(EVT.SYNC_DEFENSE_SUPPORT, (data) => {
        const defSupport = data?.supportCard?.support || 0;
        if (combatState.pendingCombat) {
            const atkTotal = combatState.pendingCombat.atkBase + combatState.pendingCombat.atkSupport;
            const defTotal = combatState.pendingCombat.defBase + defSupport;
            const result = atkTotal >= defTotal ? '击破' : '未击破';
            log(socket.id, `战斗 → ${combatState.pendingCombat.atkName}(${atkTotal}) 攻击 ${combatState.pendingCombat.defName}(${defTotal}) → ${result}`);
            combatState.pendingCombat = null;
        }
        socket.broadcast.emit(EVT.OPPONENT_DEFENSE_SUPPORT, data);
    });

    socket.on(EVT.SYNC_CARD_UNTAP, (data) => {
        log(socket.id, `回正 → instanceId:${data?.instanceId}`);
        socket.broadcast.emit(EVT.OPPONENT_CARD_UNTAP, data);
    });

    socket.on(EVT.SYNC_UNTAP_ALL, () => {
        log(socket.id, '全体回正');
        socket.broadcast.emit(EVT.OPPONENT_UNTAP_ALL);
    });
}

module.exports = { registerBattleHandlers };
