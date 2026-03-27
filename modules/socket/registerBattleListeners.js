// modules/socket/registerBattleListeners.js

export function registerBattleListeners({ state, socket, EVT, resolveCombat }) {
    socket.on(EVT.OPPONENT_ATTACK, ({ attacker, defender, supportCard }) => {
        const oppAttacker = [...state.opponentFront.value, ...state.opponentRear.value]
            .find(c => c.instanceId === attacker.instanceId);
        if (oppAttacker) oppAttacker.isTapped = true;

        ['opponentFront', 'opponentRear'].forEach(areaName => {
            const area = state[areaName];
            const idx = area.value.findIndex(c => c.instanceId === attacker.instanceId);
            if (idx > -1) {
                area.value[idx].isTapped = true;
                area.value = [...area.value];
            }
        });

        state.attacker.value = attacker;
        state.mySupportCard.value = supportCard;
        state.defender.value = defender;
        state.combatStats.value = {
            myTotalPower: (attacker.attack || 0) + (supportCard?.support || 0),
            oppTotalPower: defender.attack || 0
        };
        state.isCombatActive.value = true;

        setTimeout(() => {
            let defenseSupport = null;
            if (state.deck.value.length > 0) {
                defenseSupport = state.deck.value.pop();
                state.oppSupportCard.value = defenseSupport;
                state.combatStats.value.oppTotalPower += (defenseSupport.support || 0);
            }
            socket.emit(EVT.SYNC_DEFENSE_SUPPORT, { supportCard: defenseSupport });
            setTimeout(() => {
                if (resolveCombat) resolveCombat(state);
            }, 2000);
        }, 800);
    });

    socket.on(EVT.OPPONENT_CARD_UNTAP, ({ instanceId }) => {
        const oppCard = [...state.opponentFront.value, ...state.opponentRear.value]
            .find(c => c.instanceId === instanceId);
        if (oppCard) oppCard.isTapped = false;

        ['opponentFront', 'opponentRear'].forEach(areaName => {
            const area = state[areaName];
            const idx = area.value.findIndex(c => c.instanceId === instanceId);
            if (idx > -1) {
                area.value[idx].isTapped = false;
                area.value = [...area.value];
            }
        });
    });

    socket.on(EVT.OPPONENT_UNTAP_ALL, () => {
        ['opponentFront', 'opponentRear'].forEach(areaName => {
            const area = state[areaName];
            if (!area?.value?.length) return;
            area.value.forEach(card => {
                card.isTapped = false;
            });
            area.value = [...area.value];
        });
    });

    socket.on(EVT.OPPONENT_DEFENSE_SUPPORT, ({ supportCard }) => {
        state.oppSupportCard.value = supportCard;
        state.combatStats.value.oppTotalPower += (supportCard?.support || 0);
        setTimeout(() => {
            if (resolveCombat) resolveCombat(state);
        }, 2000);
    });
}
