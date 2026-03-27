function cardName(c) {
    return c?.cardName || c?.id || '未知卡牌';
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
            const criticalWouldHit = (combatState.pendingCombat.atkBase * 2 + combatState.pendingCombat.atkSupport) >= defTotal;
            log(socket.id, `战斗 → ${combatState.pendingCombat.atkName}(${atkTotal}) 攻击 ${combatState.pendingCombat.defName}(${defTotal}) → ${result}`);
            if (result === '未击破' && !criticalWouldHit) {
                combatState.pendingCombat = null;
            }
        }
        socket.broadcast.emit(EVT.OPPONENT_DEFENSE_SUPPORT, data);
    });

    socket.on(EVT.SYNC_COMBAT_DECISION, (data) => {
        if (combatState.pendingCombat && data?.decisionType === 'critical' && data?.useSkill) {
            const criticalPower = combatState.pendingCombat.atkBase * 2 + combatState.pendingCombat.atkSupport;
            log(socket.id, `战斗 → ${combatState.pendingCombat.atkName} 发动必杀，战力提升至 ${criticalPower}`);
            if (data?.costCard) {
                log(socket.id, `战斗代价 → 弃置 ${cardName(data.costCard)}`);
            }
        }
        if (combatState.pendingCombat && data?.decisionType === 'evasion') {
            const result = data?.useSkill ? '回避，未击破' : '未回避，击破';
            log(socket.id, `战斗 → ${combatState.pendingCombat.defName} ${result}`);
            if (data?.useSkill && data?.costCard) {
                log(socket.id, `战斗代价 → 弃置 ${cardName(data.costCard)}`);
            }
            combatState.pendingCombat = null;
        }
        if (combatState.pendingCombat && data?.decisionType === 'critical' && !data?.useSkill) {
            log(socket.id, `战斗 → ${combatState.pendingCombat.atkName} 未发动必杀，结果为未击破`);
            combatState.pendingCombat = null;
        }
        socket.broadcast.emit(EVT.OPPONENT_COMBAT_DECISION, data);
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
