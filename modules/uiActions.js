// modules/uiActions.js

export function createUiActions({ state, cardOps, rules }) {
    const notify = (message, duration = 2200) => {
        window.dispatchEvent(new CustomEvent('fe0:notice', {
            detail: { message: String(message || ''), duration }
        }));
    };
    const resolveLatestCard = (card) => {
        const targetId = String(card?.instanceId || '').trim();
        if (!targetId) return card;

        const pools = [
            state.hand.value,
            state.fieldFront.value,
            state.fieldRear.value,
            state.bonds.value,
            state.jewels.value,
            state.graveyard.value,
            state.boundless.value,
            state.deck.value,
            state.opponentFront.value,
            state.opponentRear.value,
            state.oppHand.value,
            state.oppBonds.value,
            state.oppJewels.value,
            state.oppGraveyard.value,
            state.oppDeck.value,
            state.oppBoundless.value
        ];

        for (const pool of pools) {
            const found = (Array.isArray(pool) ? pool : []).find(item => String(item?.instanceId || '').trim() === targetId);
            if (found) return found;
        }

        return card;
    };

    const handleMinifiedClick = (card) => {
        // 终极拦截：如果距离上次手指离开屏幕不到 300ms，判定为幽灵点击。
        if (window.lastDragEndTime && Date.now() - window.lastDragEndTime < 300) {
            console.log('拦截到移动端幽灵点击');
            return;
        }

        const latestCard = resolveLatestCard(card);

        if (state.activePanel.value === 'bonds' && (state.isDevMode.value || state.isMyTurn.value)) {
            cardOps.toggleBondFace(latestCard);
        } else {
            state.selectedCard.value = latestCard;
        }
    };

    const safePlayToField = (card, area) => {
        if (!rules.canPerformAction('deploy')) {
            notify('只能在出击阶段部署单位。');
            return;
        }

        const deployCheck = rules.canDeployCard(card);
        if (!deployCheck.valid) {
            notify(deployCheck.message || '当前无法出击该单位。');
            return;
        }

        cardOps.playToField(card, area);
        state.selectedCard.value = null;
    };

    return {
        handleMinifiedClick,
        safePlayToField
    };
}
