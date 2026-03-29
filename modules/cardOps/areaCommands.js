// modules/cardOps/areaCommands.js

import {
    emitSyncCardMove,
    emitPlayerDraw,
    emitSyncBondFlip,
    emitSyncReset,
    emitFullStateSync
} from '../effects/cardSocketEffects.js';
import { emitSyncPhase } from '../effects/socketEffects.js';
import { checkAllSpecialDeployConditions, getActivatableAbilities } from '../engine/abilityEngine.js';

export function createAreaCommands({ state, socket, refs, rules }) {
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

    const shuffleInPlace = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    };

    const getSelectedDeckId = () => {
        try {
            return globalThis?.localStorage?.getItem('fe0.selectedDeckId') || '';
        } catch {
            return '';
        }
    };

    const getSelectedDeckPassword = () => {
        try {
            return globalThis?.localStorage?.getItem('fe0.selectedDeckPassword') || '';
        } catch {
            return '';
        }
    };

    const loadCardsForReset = async () => {
        const selectedDeckId = getSelectedDeckId();
        let deckPayload = { cards: [], protagonistCardId: '' };

        if (selectedDeckId) {
            try {
                const selectedDeckPassword = getSelectedDeckPassword();
                const passwordQuery = selectedDeckPassword ? `?password=${encodeURIComponent(selectedDeckPassword)}` : '';
                const deckRes = await fetch(`/api/decks/${selectedDeckId}/expanded-cards${passwordQuery}`);
                if (deckRes.ok) {
                    deckPayload = await deckRes.json();
                }
            } catch (err) {
                console.warn('加载已选卡组失败，回退到默认卡池。', err);
            }
        }

        if (!deckPayload.cards || deckPayload.cards.length === 0) {
            const res = await fetch('/api/cards');
            deckPayload = { cards: await res.json(), protagonistCardId: '' };
        }

        const { isValid, errors } = rules.validateDeck(deckPayload.cards, deckPayload.protagonistCardId);
        if (!isValid) {
            alert(`卡组不合法，无法开始游戏：\n- ${errors.join('\n- ')}`);
            return { cards: [], protagonistCardId: '' };
        }

        return {
            cards: deckPayload.cards,
            protagonistCardId: String(deckPayload.protagonistCardId || '').trim()
        };
    };
    const performMulliganOps = () => {
        // 1. 获取当前手牌数量（通常是6）
        const handCount = refs.hand.value.length;
        
        // 2. 将手牌放回卡组
        refs.deck.value.push(...refs.hand.value);
        refs.hand.value = [];
        
        // 3. 洗牌 (如果你里面有 shuffleDeck 函数的话，调用它)
        if (typeof shuffleDeck === 'function') {
            shuffleDeck();
        }
        
        // 4. 重新抽同等数量的牌
        for(let i = 0; i < handCount; i++) {
            // 假设 drawCard 是在这个文件里定义的抽卡函数
            drawCard({ bypassPhaseCheck: true }); 
        }
    };
    const recycleGraveyardIntoDeckIfNeeded = () => {
        if (deck.value.length !== 0 || graveyard.value.length === 0) return [];

        const recycledCards = graveyard.value.splice(0, graveyard.value.length);
        deck.value.push(...recycledCards);
        shuffleInPlace(deck.value);

        recycledCards.forEach(card => {
            emitSyncCardMove(socket, { card, from: 'graveyard', to: 'deck' });
        });

        return recycledCards.map(card => card.instanceId);
    };

    const drawOneWithAutoRecycle = () => {
        const recycledCardIds = [];

        recycledCardIds.push(...recycleGraveyardIntoDeckIfNeeded());
        if (deck.value.length === 0) {
            alert('💀 败北... 你的牌组和退避区都没有卡了，你无法抽卡。');
            return { drawnCard: null, recycledCardIds: [] };
        }

        const drawnCard = deck.value.pop();

        // 若本次操作把卡组抽空，立即把弃牌区洗回卡组。
        recycledCardIds.push(...recycleGraveyardIntoDeckIfNeeded());

        return { drawnCard, recycledCardIds };
    };

    const revertRecycledCards = (recycledCardIds = []) => {
        if (!Array.isArray(recycledCardIds) || recycledCardIds.length === 0) return;

        recycledCardIds.forEach(cardId => {
            const idx = deck.value.findIndex(c => c.instanceId === cardId);
            if (idx === -1) return;
            const card = deck.value.splice(idx, 1)[0];
            graveyard.value.push(card);
            emitSyncCardMove(socket, { card, from: 'deck', to: 'graveyard' });
        });
    };

    const handleUniquenessCheck = () => {
        const allMyUnits = [...fieldFront.value, ...fieldRear.value];
        const unitsByName = allMyUnits.reduce((acc, unit) => {
            const name = unit.cardName;
            if (!acc[name]) {
                acc[name] = [];
            }
            acc[name].push(unit);
            return acc;
        }, {});

        Object.values(unitsByName).forEach(unitGroup => {
            if (unitGroup.length > 1) {
                let cardToKeep = unitGroup.find(u => u.isMainCharacter) || unitGroup[0];
                const cardsToRemove = unitGroup.filter(u => u.instanceId !== cardToKeep.instanceId);
                
                cardsToRemove.forEach(cardToRemove => {
                    const fromArea = getArea(cardToRemove);
                    if (fromArea) {
                        const fromAreaName = getAreaName(fromArea);
                        const idx = fromArea.findIndex(c => c.instanceId === cardToRemove.instanceId);
                        if (idx > -1) {
                            const card = fromArea.splice(idx, 1)[0];
                            graveyard.value.push(card);
                            emitSyncCardMove(socket, { card, to: 'graveyard', from: fromAreaName });
                        }
                    }
                });
                alert(`同名单位处理：场上存在多张 ${cardToKeep.cardName}，已自动保留一张并将其余送入退避区。`);
            }
        });
    };

    const moveTo = (card, toAreaName) => {
        const fromArea = getArea(card);
        if (!fromArea) return;
        const fromAreaName = getAreaName(fromArea);
        if (fromAreaName === toAreaName) return;

        // 规则补充：战场上同charaName只能有1张。
        // 当手牌中的无转职费用同名卡尝试出击时，按普通出击费用执行“升级”（叠放到同名卡上方）。
        const isDeployFromHand = fromAreaName === 'hand' && (toAreaName === 'front' || toAreaName === 'rear');
        if (isDeployFromHand) {
            const sameNameOnField = [...fieldFront.value, ...fieldRear.value]
                .find(c => c.instanceId !== card.instanceId && c.cardName && card.cardName && c.cardName === card.cardName);
            if (sameNameOnField) {
                const isNoPromoteCost = !card.promoteCost || card.promoteCost === 'N/A';
                if (isNoPromoteCost) {
                    const deployCost = state.isDevMode.value ? 0 : (parseInt(card.cost, 10) || 0);
                    const handIdx = hand.value.findIndex(c => c.instanceId === card.instanceId);
                    if (handIdx === -1) return;

                    const targetAreaName = fieldFront.value.some(c => c.instanceId === sameNameOnField.instanceId) ? 'front' : 'rear';
                    const targetAreaArray = getAreaArray(targetAreaName);
                    const targetIdx = targetAreaArray.findIndex(c => c.instanceId === sameNameOnField.instanceId);
                    if (targetIdx === -1) return;

                    const oldTop = targetAreaArray.splice(targetIdx, 1)[0];
                    const newTop = hand.value.splice(handIdx, 1)[0];
                    const inheritedStacks = oldTop._stackedCards || [];

                    newTop._stackedCards = [oldTop, ...inheritedStacks];
                    oldTop._stackedCards = [];
                    newTop.isMainCharacter = !!oldTop.isMainCharacter;

                    if (deployCost > 0 && state.usedBondsThisTurn !== undefined) {
                        state.usedBondsThisTurn.value += deployCost;
                    }

                    undoStack.value.push({
                        type: 'upgrade',
                        newCard: newTop,
                        removedFieldCard: oldTop,
                        fieldArea: targetAreaName,
                        oldWasMainCharacter: !!oldTop.isMainCharacter,
                        previousPhase: state.currentPhase.value,
                        previousHasPlacedBond: hasPlacedBond.value,
                        costUsed: deployCost
                    });
                    if (undoStack.value.length > 10) undoStack.value.shift();

                    // 广播旧顶卡离开战场，避免对手端出现同名叠加导致数量异常
                    emitSyncCardMove(socket, { card: oldTop, from: targetAreaName, to: 'stacked' });
                    targetAreaArray.push(newTop);
                    emitSyncCardMove(socket, { card: newTop, from: 'hand', to: targetAreaName });
                    console.log(`[升级] ${newTop?.cardName || '卡牌'} 覆盖 ${oldTop?.cardName || '卡牌'}（费用${deployCost}）`);
                    selectedCard.value = null;
                    return;
                }

                // 同名且具备转职费用时，直接按转职处理（不弹提示）
                performClassChange(card, sameNameOnField);
                return;
            }
        }

        const idx = fromArea.findIndex(c => c.instanceId === card.instanceId);
        if (idx > -1) {
            const isDeploy = fromAreaName === 'hand' && (toAreaName === 'front' || toAreaName === 'rear');
            const cost = (isDeploy && !state.isDevMode.value) ? (parseInt(card.cost) || 0) : 0;

                // ── 【特】出击条件检查（非开发模式下拦截）
                if (isDeploy && !state.isDevMode.value) {
                    const specialCtx = {
                        card,
                        myFront: state.fieldFront?.value || [],
                        myRear: state.fieldRear?.value || [],
                        myGraveyard: graveyard.value,
                        myGraveyardCount: graveyard.value.length,
                        protagonistCharaName: state.protagonistCharaName?.value || null
                    };
                    const blocked = checkAllSpecialDeployConditions(card, specialCtx);
                    if (blocked) {
                        console.warn(`[规则拦截] 【特】条件不满足，无法出击：${blocked.note}`);
                        return;
                    }
                }

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

            if (toAreaName === 'front' || toAreaName === 'rear') {
                handleUniquenessCheck();
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

    const moveFieldUnit = (card, toAreaName) => {
        if (!card) return false;
        if (toAreaName !== 'front' && toAreaName !== 'rear') return false;
        if (!state.isDevMode.value && card.isTapped) return false;

        const fromArea = getArea(card);
        const fromAreaName = getAreaName(fromArea);
        if (fromAreaName !== 'front' && fromAreaName !== 'rear') return false;
        if (fromAreaName === toAreaName) return false;

        const fromArr = getAreaArray(fromAreaName);
        const idx = fromArr.findIndex(c => c.instanceId === card.instanceId);
        if (idx === -1) return false;

        const moved = fromArr.splice(idx, 1)[0];
        const wasTapped = !!moved.isTapped;
        moved.isTapped = true;
        getAreaArray(toAreaName).push(moved);
        emitSyncCardMove(socket, { card: moved, from: fromAreaName, to: toAreaName });

        undoStack.value.push({
            type: 'field-move',
            cardId: moved.instanceId,
            from: fromAreaName,
            to: toAreaName,
            wasTapped,
            previousPhase: state.currentPhase.value,
            previousHasPlacedBond: hasPlacedBond.value
        });
        if (undoStack.value.length > 10) undoStack.value.shift();

        selectedCard.value = null;
        console.log(`[移动] ${moved?.cardName || '卡牌'} [${fromAreaName} → ${toAreaName}]，并转为横置`);
        return true;
    };

    const getFieldAreaNameOfCard = (card) => {
        if (!card) return null;
        if (fieldFront.value.some(c => c.instanceId === card.instanceId)) return 'front';
        if (fieldRear.value.some(c => c.instanceId === card.instanceId)) return 'rear';
        return null;
    };

    const getActivatableUnitAbilities = (card) => {
        if (!state.isDevMode.value && !state.isMyTurn.value) return [];
        const fieldArea = getFieldAreaNameOfCard(card);
        if (!fieldArea) return [];

        const faceUpBonds = (bonds.value || []).filter(cardInBond => !cardInBond.isFaceDown).length;
        return getActivatableAbilities(card, {
            unit: card,
            fieldArea,
            myHand: hand.value,
            myFront: fieldFront.value,
            myRear: fieldRear.value,
            bonds: bonds.value,
            faceUpBonds,
            isMyTurn: !!state.isMyTurn.value,
            usedOnceThisTurn: card._abilityUsedThisTurn || {}
        });
    };

    const consumeAbilityCost = (card, segment) => {
        const raw = (segment?.costRaw || '').replace(/[\[\]]/g, '').trim();
        if (!raw) return true;

        const flipMatch = raw.match(/翻面(\d+)/);
        if (flipMatch) {
            const need = parseInt(flipMatch[1], 10) || 0;
            const faceUp = bonds.value.filter(b => !b.isFaceDown);
            if (faceUp.length < need) return false;
            for (let i = 0; i < need; i++) {
                faceUp[i].isFaceDown = true;
                emitSyncBondFlip(socket, { instanceId: faceUp[i].instanceId, isFaceDown: true });
            }
        }

        if (raw.includes('横置') && !raw.includes('其他我方单位')) {
            if (card.isTapped) return false;
            card.isTapped = true;
        }

        if (raw.includes('将1名其他我方单位转为已行动状态')) {
            const other = [...fieldFront.value, ...fieldRear.value]
                .find(c => c.instanceId !== card.instanceId && !c.isTapped);
            if (!other) return false;
            other.isTapped = true;
        }

        const discardNamedMatch = raw.match(/从自己的手牌将1张「([^」]+)」放置到退避区/);
        if (discardNamedMatch) {
            const reqName = discardNamedMatch[1];
            const handIdx = hand.value.findIndex(c => (c.charaName || '') === reqName);
            if (handIdx === -1) return false;
            const paid = hand.value.splice(handIdx, 1)[0];
            graveyard.value.push(paid);
            emitSyncCardMove(socket, { card: paid, from: 'hand', to: 'graveyard' });
        }

        if (raw.includes('将这名单位击破')) {
            const area = getFieldAreaNameOfCard(card);
            if (!area) return false;
            const src = getAreaArray(area);
            const idx = src.findIndex(c => c.instanceId === card.instanceId);
            if (idx === -1) return false;
            const broken = src.splice(idx, 1)[0];
            graveyard.value.push(broken);
            emitSyncCardMove(socket, { card: broken, from: area, to: 'graveyard' });
            if (broken._stackedCards?.length > 0) {
                broken._stackedCards.forEach(sc => {
                    graveyard.value.push(sc);
                    emitSyncCardMove(socket, { card: sc, from: 'stacked', to: 'graveyard' });
                });
                broken._stackedCards = [];
            }
        }

        return true;
    };

    const addCardTempPower = (card, delta) => {
        if (!delta) return;
        const current = parseInt(card._tempAbilityPowerThisTurn || 0, 10) || 0;
        card._tempAbilityPowerThisTurn = current + delta;
    };

    const moveOneEnemyUnit = () => {
        const target = state.opponentFront.value[0] || state.opponentRear.value[0] || null;
        if (!target) return false;
        const inFront = state.opponentFront.value.some(c => c.instanceId === target.instanceId);
        const fromArea = inFront ? 'opponentFront' : 'opponentRear';
        const toArea = inFront ? 'opponentRear' : 'opponentFront';
        const from = state[fromArea].value;
        const idx = from.findIndex(c => c.instanceId === target.instanceId);
        if (idx === -1) return false;
        const moved = from.splice(idx, 1)[0];
        state[toArea].value.push(moved);
        emitSyncCardMove(socket, { card: moved, from: inFront ? 'front' : 'rear', to: inFront ? 'rear' : 'front' });
        return true;
    };

    const moveOneOtherAllyUnit = (card) => {
        const target = [...fieldFront.value, ...fieldRear.value].find(c => c.instanceId !== card.instanceId);
        if (!target) return false;
        const fromArea = fieldFront.value.some(c => c.instanceId === target.instanceId) ? 'front' : 'rear';
        const toArea = fromArea === 'front' ? 'rear' : 'front';
        return moveFieldUnit(target, toArea);
    };

    const drawCards = (count) => {
        for (let i = 0; i < count; i++) {
            const { drawnCard } = drawOneWithAutoRecycle();
            if (!drawnCard) break;
            hand.value.push(drawnCard);
            emitPlayerDraw(socket, { card: drawnCard });
        }
    };

    const recoverFromGraveToHand = (predicate, limit = 1, uniqueByName = false) => {
        const chosen = [];
        const seen = new Set();
        for (let i = graveyard.value.length - 1; i >= 0; i--) {
            const card = graveyard.value[i];
            if (!predicate(card)) continue;
            const key = card.charaName || card.cardName || card.name || card.instanceId;
            if (uniqueByName && seen.has(key)) continue;
            chosen.push({ card, index: i });
            seen.add(key);
            if (chosen.length >= limit) break;
        }
        chosen.sort((a, b) => b.index - a.index).forEach(({ card, index }) => {
            graveyard.value.splice(index, 1);
            hand.value.push(card);
            emitSyncCardMove(socket, { card, from: 'graveyard', to: 'hand' });
        });
        return chosen.length;
    };

    const applyUnitAbilityEffect = (card, segment) => {
        const txt = segment.effectText || '';

        const allAlliesBuffMatch = txt.match(/所有我方单位的战斗力\+(\d+)/);
        if (allAlliesBuffMatch) {
            const delta = parseInt(allAlliesBuffMatch[1], 10) || 0;
            const allies = [...fieldFront.value, ...fieldRear.value];
            allies.forEach(ally => addCardTempPower(ally, delta));
        }

        const selfPowerMatch = txt.match(/这名单位的战斗力\+(-?\d+)/);
        if (selfPowerMatch) {
            const delta = parseInt(selfPowerMatch[1], 10) || 0;
            addCardTempPower(card, delta);
        }

        if (txt.includes('这名单位的战斗力变为2倍')) {
            const base = parseInt(card.attack, 10) || 0;
            addCardTempPower(card, base);
        }

        if (txt.includes('攻击不能被神速回避')) {
            card._tempCannotBeEvadedThisTurn = true;
        }

        if (txt.includes('攻击所将破坏的宝玉变为2颗')) {
            card._tempJewelBreak2ThisTurn = true;
        }

        if (txt.includes('将这名单位移动')) {
            const fromArea = getFieldAreaNameOfCard(card);
            if (fromArea) {
                moveFieldUnit(card, fromArea === 'front' ? 'rear' : 'front');
            }
        }

        if (txt.includes('选择1名其他我方单位，将其移动')) {
            moveOneOtherAllyUnit(card);
        }

        if (txt.includes('选择1名敌方单位，将其移动') || txt.includes('选择任意名敌方单位，将其移动')) {
            moveOneEnemyUnit();
        }

        if (txt.includes('将对手卡组最上方的1张卡放置到退避区')) {
            if (state.oppDeck.value.length > 0) {
                const top = state.oppDeck.value.pop();
                state.oppGraveyard.value.push(top);
            }
        }

        if (txt.includes('抽1张卡')) drawCards(1);
        if (txt.includes('抽2张卡')) drawCards(2);
        if (txt.includes('抽卡3张') || txt.includes('抽3张卡')) drawCards(3);

        const graveExceptMatch = txt.match(/从自己的退避区中选择(?:至多(\d+)张)?1?张?「([^」]+)」以外.*?加入手牌/);
        if (graveExceptMatch) {
            const limit = parseInt(graveExceptMatch[1] || '1', 10) || 1;
            const except = graveExceptMatch[2];
            const uniqueByName = txt.includes('单位名不同');
            recoverFromGraveToHand(candidate => (candidate.charaName || '') !== except, limit, uniqueByName);
        }

        if (txt.includes('选择自己的1张手牌，放置到羁绊区')) {
            const moved = hand.value.pop();
            if (moved) {
                bonds.value.push(moved);
                emitSyncCardMove(socket, { card: moved, from: 'hand', to: 'bonds' });
            }
        }

        if (txt.includes('将卡组最上方的1张卡追加到宝玉区') && deck.value.length > 0) {
            const top = deck.value.pop();
            top.isFaceDown = true;
            jewels.value.push(top);
            emitSyncCardMove(socket, { card: top, from: 'deck', to: 'jewels' });
        }

        if (txt.includes('对手选择他自己的1张手牌，放置到退避区')) {
            state.oppStats.value.hand = Math.max(0, (state.oppStats.value.hand || 0) - 1);
        }
        if (txt.includes('对手选择他自己的2张手牌，放置到退避区')) {
            state.oppStats.value.hand = Math.max(0, (state.oppStats.value.hand || 0) - 2);
        }
        if (txt.includes('对手选择他自己的3张手牌，放置到退避区')) {
            state.oppStats.value.hand = Math.max(0, (state.oppStats.value.hand || 0) - 3);
        }

        if (!card._abilityUsedThisTurn) card._abilityUsedThisTurn = {};
        card._abilityUsedThisTurn[segment.title] = true;

        handleUniquenessCheck();
    };

    const activateUnitAbility = (card, preferredTitle = null) => {
        if (!card) return false;
        const activatable = getActivatableUnitAbilities(card);
        if (!activatable.length) return false;

        const candidate = preferredTitle
            ? activatable.find(a => a.title === preferredTitle)
            : activatable.find(a => a.canActivate);
        if (!candidate || !candidate.canActivate) {
            return false;
        }

        const segments = (card?.ability?.entries || [])
            .filter(e => e.type === '【起】')
            .map(e => ({
                title: e.title,
                type: '起',
                costRaw: e.cost?.raw ? `[${e.cost.raw}]` : '',
                effectText: e.effectText || ''
            }));
        const segment = segments.find(e => e.title === candidate.title) || {
            title: candidate.title,
            type: '起',
            costRaw: candidate.costRaw,
            effectText: candidate.effectText
        };

        const okCost = consumeAbilityCost(card, segment);
        if (!okCost) {
            return false;
        }

        applyUnitAbilityEffect(card, segment);
        return true;
    };

    const marchRearToFrontIfNeeded = (reason = 'auto-march') => {
        if (fieldFront.value.length > 0) return false;
        if (fieldRear.value.length === 0) return false;

        const movedCards = fieldRear.value.splice(0, fieldRear.value.length);
        movedCards.forEach(card => {
            fieldFront.value.push(card);
            emitSyncCardMove(socket, { card, from: 'rear', to: 'front' });
        });

        console.log(`[进军] ${reason}：后场 ${movedCards.length} 张已推进前场`);
        return true;
    };

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

        // 广播旧顶卡离开战场，避免对手端残留导致卡片数量变多
        emitSyncCardMove(socket, { card: removedFieldCard, from: fieldArea, to: 'stacked' });

        // 2. 从手牌取出新卡
        const newCard = hand.value.splice(handIdx, 1)[0];

        // 修复1：新卡继承旧卡的叠放（旧卡 + 旧卡的叠放）
        newCard._stackedCards = [removedFieldCard, ...inheritedStacks];
        removedFieldCard._stackedCards = []; // 旧卡本身不再保存叠放引用
        // 主人公转职时，顶层卡必须保留主人公标识
        newCard.isMainCharacter = !!removedFieldCard.isMainCharacter;

        // 转职抽1卡（与转职作为同一次可撤销动作）
        const { drawnCard, recycledCardIds } = drawOneWithAutoRecycle();
        if (drawnCard) {
            hand.value.push(drawnCard);
            scrollHandToLatest();
            emitPlayerDraw(socket, { card: drawnCard });
        }

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
            drawnCardId: drawnCard?.instanceId || null,
            recycledCardIds,
            oldWasMainCharacter: !!removedFieldCard.isMainCharacter,
            previousPhase: state.currentPhase.value,
            previousHasPlacedBond: hasPlacedBond.value,
            costUsed: ccCost
        });
        if (undoStack.value.length > 10) undoStack.value.shift();

        // 5. 将新卡放入战场
        fieldAreaArray.push(newCard);
        emitSyncCardMove(socket, { card: newCard, from: 'hand', to: fieldArea });

        // 不再额外写入draw类型撤销，避免需要点2次撤销。
    };

    const drawCard = (opts = {}) => {
        const bypassPhaseCheck = opts?.bypassPhaseCheck === true;
        if (!state.isDevMode.value) {
            if (!state.isMyTurn.value) return;
            if (!bypassPhaseCheck && state.firstPlayerOpeningTurnLocked?.value) {
                alert('先攻第一回合不能在开始阶段抽卡。');
                state.currentPhase.value = 'BOND';
                const phaseName = state.PHASES?.['BOND']?.name || 'BOND';
                emitSyncPhase(socket, { phase: state.currentPhase.value, phaseName });
                return;
            }
            // 修复3：正常抽牌仅限BEGINNING阶段；转职后抽牌绕过此限制
            if (!bypassPhaseCheck && state.currentPhase.value !== 'BEGINNING') return;
        }
        if (deck.value.length === 0 && graveyard.value.length === 0) return;

        const drawUndoEntry = {
            type: 'draw',
            previousPhase: state.currentPhase.value,
            drawnCardId: null,
            recycledCardIds: []
        };
        undoStack.value.push(drawUndoEntry);
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
            const { drawnCard, recycledCardIds } = drawOneWithAutoRecycle();
            if (!drawnCard) return;

            drawUndoEntry.drawnCardId = drawnCard.instanceId;
            drawUndoEntry.recycledCardIds = recycledCardIds;

            hand.value.push(drawnCard);
            scrollHandToLatest();
            emitPlayerDraw(socket, { card: drawnCard });
            // 仅用户手动抽牌时推进阶段（转职抽牌不推进）
            if (!bypassPhaseCheck && state.currentPhase.value === 'BEGINNING' && !state.isDevMode.value) {
                state.currentPhase.value = 'BOND';
                const phaseName = state.PHASES?.['BOND']?.name || 'BOND';
                emitSyncPhase(socket, { phase: state.currentPhase.value, phaseName });
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
            const cardIdx = last.drawnCardId
                ? hand.value.findIndex(c => c.instanceId === last.drawnCardId)
                : hand.value.length - 1;
            const card = cardIdx > -1 ? hand.value.splice(cardIdx, 1)[0] : null;
            console.log(`[撤销] 撤回抽牌 → ${card?.cardName || '未知卡牌'}`);
            if (card) {
                deck.value.push(card);
                emitSyncCardMove(socket, { card, from: 'hand', to: 'deck' });
            }
            revertRecycledCards(last.recycledCardIds);
            return;
        }

        if (last.type === 'class-change') {
            // 退款费用
            if (last.costUsed && state.usedBondsThisTurn !== undefined) {
                state.usedBondsThisTurn.value -= last.costUsed;
            }
            // 转职抽卡一并撤销：从手牌取回并洗回牌组
            if (last.drawnCardId) {
                const drawnIdx = hand.value.findIndex(c => c.instanceId === last.drawnCardId);
                if (drawnIdx > -1) {
                    const drawnCard = hand.value.splice(drawnIdx, 1)[0];
                    deck.value.push(drawnCard);
                    emitSyncCardMove(socket, { card: drawnCard, from: 'hand', to: 'deck' });
                }
            }
            revertRecycledCards(last.recycledCardIds);
            // 在战场找到新卡，退回手牌
            const fieldAreaArr = getAreaArray(last.fieldArea);
            const newCardIdx = fieldAreaArr.findIndex(c => c.instanceId === last.newCard.instanceId);
            if (newCardIdx > -1) {
                const newCard = fieldAreaArr.splice(newCardIdx, 1)[0];
                // 恢复旧卡的叠放（排除旧卡自身，即 _stackedCards[0]）
                last.removedFieldCard._stackedCards = newCard._stackedCards.slice(1);
                newCard._stackedCards = [];
                newCard.isMainCharacter = false;
                hand.value.push(newCard);
                emitSyncCardMove(socket, { card: newCard, from: last.fieldArea, to: 'hand' });
            }
            // 恢复旧卡到战场
            last.removedFieldCard.isMainCharacter = !!last.oldWasMainCharacter;
            fieldAreaArr.push(last.removedFieldCard);
            emitSyncCardMove(socket, { card: last.removedFieldCard, from: 'stacked', to: last.fieldArea });
            console.log(`[撤销] 撤回转职：${last.newCard?.cardName} ← ${last.removedFieldCard?.cardName}`);
            return;
        }

        if (last.type === 'upgrade') {
            if (last.costUsed && state.usedBondsThisTurn !== undefined) {
                state.usedBondsThisTurn.value -= last.costUsed;
            }
            const fieldAreaArr = getAreaArray(last.fieldArea);
            const newCardIdx = fieldAreaArr.findIndex(c => c.instanceId === last.newCard.instanceId);
            if (newCardIdx > -1) {
                const newCard = fieldAreaArr.splice(newCardIdx, 1)[0];
                last.removedFieldCard._stackedCards = newCard._stackedCards.slice(1);
                newCard._stackedCards = [];
                newCard.isMainCharacter = false;
                hand.value.push(newCard);
                emitSyncCardMove(socket, { card: newCard, from: last.fieldArea, to: 'hand' });
            }
            last.removedFieldCard.isMainCharacter = !!last.oldWasMainCharacter;
            fieldAreaArr.push(last.removedFieldCard);
            emitSyncCardMove(socket, { card: last.removedFieldCard, from: 'stacked', to: last.fieldArea });
            console.log(`[撤销] 撤回升级：${last.newCard?.cardName} ← ${last.removedFieldCard?.cardName}`);
            return;
        }

        if (last.type === 'field-move') {
            const toAreaArr = getAreaArray(last.to);
            const cardIdx = toAreaArr.findIndex(c => c.instanceId === last.cardId);
            if (cardIdx > -1) {
                const moved = toAreaArr.splice(cardIdx, 1)[0];
                moved.isTapped = !!last.wasTapped;
                getAreaArray(last.from).push(moved);
                emitSyncCardMove(socket, { card: moved, from: last.to, to: last.from });
                console.log(`[撤销] 撤回移动：${moved?.cardName || '卡牌'} [${last.to} → ${last.from}]`);
            }
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

    const getMySyncData = () => {
        const interaction = state.supportInteraction?.value || null;
        const isAwaitOpponent = typeof interaction?.type === 'string' && interaction.type.includes('await-opponent');
        const pendingSupportRequest = isAwaitOpponent && interaction?.requestPayload && interaction?.requestId
            ? { ...interaction.requestPayload }
            : null;

        return {
            front: state.fieldFront.value,
            rear: state.fieldRear.value,
            bonds: state.bonds.value,
            jewels: state.jewels.value,
            graveyard: state.graveyard.value,
            hand: state.hand.value,
            deck: state.deck.value,
            boundless: state.boundless.value,
            handCount: state.hand.value.length,
            bondsCount: state.bonds.value.length,
            pendingSupportRequest
        };
    };

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

        state.currentPhase.value = 'MULLIGAN';
        state.hasPlacedBond.value = false;
        state.usedBondsThisTurn.value = 0;
        if (undoStack) {
            undoStack.value = [];
        }
        if (state.supportInteraction) {
            state.supportInteraction.value = null;
        }
        if (state.hasBattledThisTurn) {
            state.hasBattledThisTurn.value = false;
        }
        if (state.mulliganState) {
            state.mulliganState.value = 'idle';
        }
        if (state.opponentMulliganState) {
            state.opponentMulliganState.value = 'idle';
        }
        if (state.hasMulliganed) {
            state.hasMulliganed.value = false;
        }

        try {
            const payload = await loadCardsForReset();
            const data = Array.isArray(payload?.cards) ? payload.cards : [];
            const protagonistCardId = String(payload?.protagonistCardId || '').trim();

            deck.value = data.map(c => ({
                ...c,
                instanceId: Math.random() + Date.now(),
                isFaceDown: false,
                isTapped: false
            })).sort(() => Math.random() - 0.5);

            if (deck.value.length > 0) {
                let mc = null;
                if (protagonistCardId) {
                    const idx = deck.value.findIndex(card => String(card.id || '').trim() === protagonistCardId);
                    if (idx > -1) {
                        mc = deck.value.splice(idx, 1)[0];
                    }
                }
                if (!mc) {
                    mc = deck.value.pop();
                }
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

            if (state.isMyTurn.value) {
                state.mulliganState.value = 'awaiting';
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
        performMulliganOps,
        moveFieldUnit,
        marchRearToFrontIfNeeded,
        toggleBondFace,
        undoLastMove,
        placeCardToTopOfDeck,
        getActivatableUnitAbilities,
        activateUnitAbility,
        getMySyncData,
        resetGame
    };
}
