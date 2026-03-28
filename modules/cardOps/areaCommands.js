// modules/cardOps/areaCommands.js

import {
    emitSyncCardMove,
    emitPlayerDraw,
    emitSyncBondFlip,
    emitSyncReset,
    emitFullStateSync
} from '../effects/cardSocketEffects.js';
import { emitSyncPhase } from '../effects/socketEffects.js';

export function createAreaCommands({ state, socket, refs }) {
    const {
        hand,
        fieldFront,
        fieldRear,
        bonds,
        jewels,
        graveyard,
        boundless,
        deck,
        undoStack,
        selectedCard,
        hasPlacedBond
    } = refs;

    const getArea = (card) => {
        if (!card) return null;
        const myAreas = [
            hand.value,
            fieldFront.value,
            fieldRear.value,
            bonds.value,
            jewels.value,
            graveyard.value,
            boundless.value,
            deck.value
        ];
        for (const area of myAreas) {
            if (area.some(c => c.instanceId === card.instanceId)) return area;
        }
        return null;
    };

    const getAreaArray = (name) => {
        const mapping = {
            hand: hand.value,
            front: fieldFront.value,
            rear: fieldRear.value,
            bonds: bonds.value,
            jewels: jewels.value,
            graveyard: graveyard.value,
            boundless: boundless.value,
            deck: deck.value
        };
        return mapping[name] || [];
    };

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

    const scrollHandToLatest = () => {
        requestAnimationFrame(() => {
            const strip = document.querySelector('.hand-strip-scroll');
            if (!strip) return;
            strip.scrollTo({ left: strip.scrollWidth, behavior: 'smooth' });
        });
    };

    const moveTo = (card, toAreaName) => {
        const fromArea = getArea(card);
        if (!fromArea) return;
        const fromAreaName = getAreaName(fromArea);
        if (fromAreaName === toAreaName) return;

        const idx = fromArea.findIndex(c => c.instanceId === card.instanceId);
        if (idx > -1) {
            const isDeploy = fromAreaName === 'hand' && (toAreaName === 'front' || toAreaName === 'rear');
            const cost = (isDeploy && !state.isDevMode.value) ? (parseInt(card.cost) || 0) : 0;

            undoStack.value.push({
                card,
                from: fromAreaName,
                to: toAreaName,
                previousPhase: state.currentPhase.value,
                previousHasPlacedBond: hasPlacedBond.value,
                costUsed: cost
            });
            if (undoStack.value.length > 10) undoStack.value.shift();

            if (isDeploy && state.usedBondsThisTurn !== undefined) {
                state.usedBondsThisTurn.value += cost;
            }

            const targetCard = fromArea.splice(idx, 1)[0];
            getAreaArray(toAreaName).push(targetCard);
            emitSyncCardMove(socket, { card: targetCard, to: toAreaName, from: fromAreaName });

            // 转职叠放：当战场卡被移出战场时，叠放的下级卡一起进入退避区
            const isFromField = fromAreaName === 'front' || fromAreaName === 'rear';
            if (isFromField && targetCard._stackedCards?.length > 0) {
                targetCard._stackedCards.forEach(sc => {
                    graveyard.value.push(sc);
                    emitSyncCardMove(socket, { card: sc, from: 'stacked', to: 'graveyard' });
                });
                targetCard._stackedCards = [];
            }

            selectedCard.value = null;
        }

        if (toAreaName === 'bonds') {
            hasPlacedBond.value = true;
            if (state.currentPhase.value === 'BOND' && !state.isDevMode.value) {
                state.currentPhase.value = 'DEPLOY';
            }
        }
    };

    const playToField = (card, pos) => moveTo(card, pos);
    const playToBond = (card) => moveTo(card, 'bonds');
    const returnToHandFromBoard = (card) => moveTo(card, 'hand');

    // 转职：用手牌卡覆盖战场上相同角色的卡，旧卡叠放于新卡下，并抽1卡
    const performClassChange = (handCard, targetCardOnField) => {
        if (!handCard || !targetCardOnField) return;

        // 确定旧卡所在区域
        let fieldArea = null;
        if (state.fieldFront.value.some(c => c.instanceId === targetCardOnField.instanceId)) {
            fieldArea = 'front';
        } else if (state.fieldRear.value.some(c => c.instanceId === targetCardOnField.instanceId)) {
            fieldArea = 'rear';
        }
        if (!fieldArea) return;

        const fieldAreaArray = getAreaArray(fieldArea);
        const fieldIdx = fieldAreaArray.findIndex(c => c.instanceId === targetCardOnField.instanceId);
        if (fieldIdx === -1) return;

        const handIdx = hand.value.findIndex(c => c.instanceId === handCard.instanceId);
        if (handIdx === -1) return;

        // 修复5：使用 promoteCost 作为实际费用
        const ccCost = parseInt(handCard.promoteCost) || 0;

        // 1. 从战场移除旧卡（不进墓地，叠放到新卡下）
        const removedFieldCard = fieldAreaArray.splice(fieldIdx, 1)[0];
        const inheritedStacks = removedFieldCard._stackedCards || [];

        // 2. 从手牌取出新卡
        const newCard = hand.value.splice(handIdx, 1)[0];

        // 修复1：新卡继承旧卡的叠放（旧卡 + 旧卡的叠放）
        newCard._stackedCards = [removedFieldCard, ...inheritedStacks];
        removedFieldCard._stackedCards = []; // 旧卡本身不再保存叠放引用

        // 3. 支付费用
        if (ccCost > 0 && state.usedBondsThisTurn !== undefined) {
            state.usedBondsThisTurn.value += ccCost;
        }

        // 4. 记录到undo栈（修复2：可撤销）
        undoStack.value.push({
            type: 'class-change',
            newCard,
            removedFieldCard,
            fieldArea,
            previousPhase: state.currentPhase.value,
            previousHasPlacedBond: hasPlacedBond.value,
            costUsed: ccCost
        });
        if (undoStack.value.length > 10) undoStack.value.shift();

        // 5. 将新卡放入战场
        fieldAreaArray.push(newCard);
        emitSyncCardMove(socket, { card: newCard, from: 'hand', to: fieldArea });

        // 6. 转职后抽1卡（绕过阶段限制）
        drawCard({ bypassPhaseCheck: true });
    };

    const drawCard = (opts = {}) => {
        const bypassPhaseCheck = opts?.bypassPhaseCheck === true;
        if (!state.isDevMode.value) {
            if (!state.isMyTurn.value) return;
            // 修复3：正常抽牌仅限BEGINNING阶段；转职后抽牌绕过此限制
            if (!bypassPhaseCheck && state.currentPhase.value !== 'BEGINNING') return;
        }
        if (hand.value.length >= 10 || deck.value.length === 0) return;

        undoStack.value.push({ type: 'draw', previousPhase: state.currentPhase.value });
        if (undoStack.value.length > 10) undoStack.value.shift();

        const flyingCard = document.createElement('img');
        flyingCard.src = 'images/card_back.jpg';
        flyingCard.style.position = 'fixed';
        flyingCard.style.zIndex = '9999999';
        flyingCard.style.width = '80px';
        flyingCard.style.height = '112px';
        flyingCard.style.borderRadius = '6px';
        flyingCard.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
        flyingCard.style.pointerEvents = 'none';
        flyingCard.style.objectFit = 'cover';

        const startX = window.innerWidth - 100;
        const startY = window.innerHeight - 150;
        const midX = window.innerWidth / 2 - 40;
        const midY = window.innerHeight / 2 - 56;
        const endX = window.innerWidth / 2 - 40;
        const endY = window.innerHeight - 50;

        flyingCard.style.left = `${startX}px`;
        flyingCard.style.top = `${startY}px`;
        flyingCard.style.opacity = '0';
        document.body.appendChild(flyingCard);

        const drawAnimationDuration = 900;
        const animation = flyingCard.animate([
            { transform: 'scale(0.5) rotateY(180deg) rotateZ(-15deg)', left: `${startX}px`, top: `${startY}px`, opacity: 0 },
            { opacity: 1, offset: 0.1 },
            { transform: 'scale(1.8) rotateY(90deg) rotateZ(5deg)', left: `${midX}px`, top: `${midY}px`, opacity: 1, offset: 0.5 },
            { transform: 'scale(0.8) rotateY(0deg) rotateZ(0deg)', left: `${endX}px`, top: `${endY}px`, opacity: 0 }
        ], { duration: drawAnimationDuration, easing: 'cubic-bezier(0.2, 1, 0.3, 1)', fill: 'forwards' });

        let drawSettled = false;
        const settleDraw = () => {
            if (drawSettled) return;
            drawSettled = true;
            flyingCard.remove();
            const drawnCard = deck.value.pop();
            hand.value.push(drawnCard);
            scrollHandToLatest();
            emitPlayerDraw(socket, { card: drawnCard });
            // 仅用户手动抽牌时推进阶段（转职抽牌不推进）
            if (!bypassPhaseCheck && state.currentPhase.value === 'BEGINNING' && !state.isDevMode.value) {
                state.currentPhase.value = 'BOND';
            }
        };

        animation.onfinish = settleDraw;
        setTimeout(settleDraw, Math.floor(drawAnimationDuration * 0.3));
    };

    const toggleBondFace = (card) => {
        if (!card) return;
        card.isFaceDown = !card.isFaceDown;
        emitSyncBondFlip(socket, { instanceId: card.instanceId, isFaceDown: card.isFaceDown });
    };

    const undoLastMove = () => {
        if (state.hasBattledThisTurn?.value) {
            alert('本回合已经发生战斗，无法撤销。');
            return;
        }

        const last = undoStack.value.pop();
        if (!last) return;

        if (last.previousPhase) state.currentPhase.value = last.previousPhase;
        if (last.previousHasPlacedBond !== undefined) hasPlacedBond.value = last.previousHasPlacedBond;

        if (last.type === 'phase-transition') {
            const phaseName = state.PHASES?.[state.currentPhase.value]?.name || state.currentPhase.value;
            emitSyncPhase(socket, { phase: state.currentPhase.value, phaseName });
            return;
        }

        if (last.type === 'draw') {
            const card = hand.value.pop();
            console.log(`[撤销] 撤回抽牌 → ${card?.cardName || '未知卡牌'}`);
            if (card) deck.value.push(card);
            return;
        }

        if (last.type === 'class-change') {
            // 退款费用
            if (last.costUsed && state.usedBondsThisTurn !== undefined) {
                state.usedBondsThisTurn.value -= last.costUsed;
            }
            // 在战场找到新卡，退回手牌
            const fieldAreaArr = getAreaArray(last.fieldArea);
            const newCardIdx = fieldAreaArr.findIndex(c => c.instanceId === last.newCard.instanceId);
            if (newCardIdx > -1) {
                const newCard = fieldAreaArr.splice(newCardIdx, 1)[0];
                // 恢复旧卡的叠放（排除旧卡自身，即 _stackedCards[0]）
                last.removedFieldCard._stackedCards = newCard._stackedCards.slice(1);
                newCard._stackedCards = [];
                hand.value.push(newCard);
                emitSyncCardMove(socket, { card: newCard, from: last.fieldArea, to: 'hand' });
            }
            // 恢复旧卡到战场
            fieldAreaArr.push(last.removedFieldCard);
            emitSyncCardMove(socket, { card: last.removedFieldCard, from: 'stacked', to: last.fieldArea });
            console.log(`[撤销] 撤回转职：${last.newCard?.cardName} ← ${last.removedFieldCard?.cardName}`);
            return;
        }

        if (last.costUsed && state.usedBondsThisTurn !== undefined) {
            state.usedBondsThisTurn.value -= last.costUsed;
        }
        const currentArea = getAreaArray(last.to);
        const idx = currentArea.findIndex(c => c.instanceId === last.card.instanceId);
        if (idx > -1) {
            const card = currentArea.splice(idx, 1)[0];
            const fromLabel = { hand: '手牌', front: '前排', rear: '后排', bonds: '羁绊区', jewels: '宝玉区', graveyard: '弃牌区', boundless: '无限区', deck: '牌组' };
            console.log(`[撤销] 撤回：${card?.cardName || '卡牌'} [${fromLabel[last.to] || last.to} → ${fromLabel[last.from] || last.from}]`);
            getAreaArray(last.from).push(card);
            emitSyncCardMove(socket, { card, to: last.from, from: last.to });
        }
    };

    const getMySyncData = () => ({
        front: state.fieldFront.value,
        rear: state.fieldRear.value,
        bonds: state.bonds.value,
        jewels: state.jewels.value,
        graveyard: state.graveyard.value,
        hand: state.hand.value,
        deck: state.deck.value,
        boundless: state.boundless.value,
        handCount: state.hand.value.length,
        bondsCount: state.bonds.value.length
    });

    // 开发者模式：将指定卡牌放到牌组最上方
    const placeCardToTopOfDeck = (card) => {
        if (!state.isDevMode.value) {
            console.warn('【DEV】此功能仅限开发者模式');
            return;
        }
        if (!card) return;

        const fromArea = getArea(card);
        if (!fromArea) return;

        const fromAreaName = getAreaName(fromArea);
        const idx = fromArea.findIndex(c => c.instanceId === card.instanceId);
        if (idx > -1) {
            const removed = fromArea.splice(idx, 1)[0];
            // 放到牌组最上方（调整索引为length，这样pop时会获取到）
            deck.value.push(removed);
            console.log(`【DEV】 ${removed.cardName || '卡牌'} 已放到到牌组最上方 [${fromAreaName} → 牌组顶]`);
            emitSyncCardMove(socket, { card: removed, from: fromAreaName, to: 'deck' });
        }
    };

    const resetGame = async (isRemote = false) => {
        hand.value = [];
        fieldFront.value = [];
        fieldRear.value = [];
        bonds.value = [];
        jewels.value = [];
        graveyard.value = [];
        boundless.value = [];
        deck.value = [];
        state.currentPhase.value = 'BEGINNING';
        state.hasPlacedBond.value = false;
        state.usedBondsThisTurn.value = 0;
        if (state.supportInteraction) {
            state.supportInteraction.value = null;
        }
        if (state.hasBattledThisTurn) {
            state.hasBattledThisTurn.value = false;
        }

        try {
            const res = await fetch('/api/cards');
            const data = await res.json();
            deck.value = data.map(c => ({
                ...c,
                instanceId: Math.random() + Date.now(),
                isFaceDown: false,
                isTapped: false
            })).sort(() => Math.random() - 0.5);

            if (deck.value.length > 0) {
                const mc = deck.value.pop();
                mc.isMainCharacter = true;
                fieldFront.value.push(mc);
            }

            for (let i = 0; i < 5; i++) {
                if (deck.value.length > 0) {
                    const j = deck.value.pop();
                    j.isFaceDown = true;
                    jewels.value.push(j);
                }
            }
            for (let i = 0; i < 6; i++) {
                if (deck.value.length > 0) hand.value.push(deck.value.pop());
            }
        } catch (err) {
            console.error('加载失败', err);
        }

        if (!isRemote) emitSyncReset(socket);
        setTimeout(() => {
            emitFullStateSync(socket, getMySyncData());
        }, 600);
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
        performClassChange,
        toggleBondFace,
        undoLastMove,
        placeCardToTopOfDeck,
        getMySyncData,
        resetGame
    };
}
