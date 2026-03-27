// modules/uiActions.js

export function createUiActions({ state, cardOps, rules }) {
    const handleMinifiedClick = (card) => {
        // 终极拦截：如果距离上次手指离开屏幕不到 300ms，判定为幽灵点击。
        if (window.lastDragEndTime && Date.now() - window.lastDragEndTime < 300) {
            console.log('拦截到移动端幽灵点击');
            return;
        }

        if (state.activePanel.value === 'bonds' && (state.isDevMode.value || state.isMyTurn.value)) {
            cardOps.toggleBondFace(card);
        } else {
            state.selectedCard.value = card;
        }
    };

    const safePlayToField = (card, area) => {
        if (!rules.canPerformAction('deploy')) {
            alert('只能在出击阶段 (DEPLOY) 部署单位！');
            return;
        }

        const deployCheck = rules.canDeployCard(card);
        if (!deployCheck.valid) {
            alert(deployCheck.message);
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
