const { ref, watch, computed } = Vue;

export const RegionPanel = {
    props: {
        activePanel: String,
        panelTitle: {
            type: String,
            default: ''
        },
        panelCards: {
            type: Array,
            default: () => []
        },
        isDevMode: Boolean,
        isOpponentPanel: Boolean,
        onClose: {
            type: Function,
            required: true
        },
        onCardClick: {
            type: Function,
            required: true
        },
        highlightedInstanceIds: {
            type: Array,
            default: () => []
        }
    },
    setup(props) {
        const flippedIds = ref(new Set());

        watch(() => props.activePanel, () => {
            flippedIds.value = new Set();
        });

        const isMainCharacterJewelSelectPanel = computed(() => props.activePanel === 'supportMainCharacterJewelSelect');
        const isJewelPanel = computed(() => props.activePanel === 'jewels' || props.activePanel === 'oppJewels' || isMainCharacterJewelSelectPanel.value);
        const isMyJewelPanel = computed(() => props.activePanel === 'jewels' || isMainCharacterJewelSelectPanel.value);

        const displayCards = computed(() => {
            if (!isJewelPanel.value) return props.panelCards;
            return (props.panelCards || []).map(card => ({
                ...card,
                localFlipped: flippedIds.value.has(card.instanceId)
            }));
        });

        const isBondAbilityHighlight = computed(() =>
            props.activePanel === 'abilityBondFlipPick' || props.activePanel === 'combatTriggerBondFlipPick');

        const isHighlighted = (card) => {
            if (!card?.instanceId) return false;
            return (props.highlightedInstanceIds || []).some((id) => String(id) === String(card.instanceId));
        };

        const handleCardClick = (card) => {
            if (isJewelPanel.value) {
                // 主人公被击破后的宝玉选择：单击直接选择，不走翻面详情流程。
                if (isMainCharacterJewelSelectPanel.value) {
                    props.onCardClick(card);
                    return;
                }

                // 己方宝玉：第一次点击翻开，翻开后再次点击进入详情。
                if (isMyJewelPanel.value) {
                    if (!card.localFlipped) {
                        const next = new Set(flippedIds.value);
                        next.add(card.instanceId);
                        flippedIds.value = next;
                        return;
                    }
                    props.onCardClick(card);
                    return;
                }

                // 对手宝玉仍维持原逻辑（仅DEV可翻面）
                if (!props.isDevMode) return;
                const next = new Set(flippedIds.value);
                if (next.has(card.instanceId)) next.delete(card.instanceId);
                else next.add(card.instanceId);
                flippedIds.value = next;
                return;
            }
            props.onCardClick(card);
        };

        return {
            isJewelPanel,
            isMyJewelPanel,
            isMainCharacterJewelSelectPanel,
            isBondAbilityHighlight,
            isHighlighted,
            displayCards,
            handleCardClick
        };
    },
    template: `
        <div v-if="activePanel" class="fixed inset-0 z-region flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="onClose()"></div>

            <div class="relative bg-neutral-900 border border-white/10 w-full max-w-lg h-[70vh] rounded-xl flex flex-col animate-zoom">
                <div class="p-3 border-b border-white/10 flex justify-between bg-white/5">
                    <span class="text-sm font-bold uppercase" :class="isOpponentPanel ? 'text-red-500' : 'text-blue-400'">
                        {{ isOpponentPanel ? '对手的' : '我的' }} {{ panelTitle }}
                    </span>
                    <div class="flex items-center gap-2">
                        <span v-if="isMainCharacterJewelSelectPanel" class="text-[9px] text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded">请选择要拿取的宝玉</span>
                        <span v-else-if="activePanel === 'abilityBondFlipPick' || activePanel === 'combatTriggerBondFlipPick'" class="text-[9px] text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded">点选正面羁绊 · 底部确认翻面</span>
                        <span v-else-if="isMyJewelPanel" class="text-[9px] text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded">己方宝玉 · 先翻开再查看详情</span>
                        <span v-else-if="isJewelPanel && isDevMode" class="text-[9px] text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded">DEV · 点击翻面</span>
                        <button @click="onClose()" class="text-white p-1">✕</button>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-2">
                    <div v-for="card in displayCards"
                         :key="card.instanceId"
                         @click="handleCardClick(card)"
                         :class="[isJewelPanel ? ((isMyJewelPanel || isDevMode) ? 'cursor-pointer active:scale-95' : 'cursor-default') : 'cursor-pointer', 'aspect-[55/76] relative group transition-transform']">
                                <img :src="isMainCharacterJewelSelectPanel ? 'images/card_back.jpg' : (isJewelPanel ? (card.localFlipped ? card.image : 'images/card_back.jpg') : (card.isFaceDown ? 'images/card_back.jpg' : card.image))"
                             class="w-full h-full object-cover rounded shadow-md transition-all"
                                :class="{
                                    'opacity-50 grayscale': !isJewelPanel && card.isFaceDown,
                                    'ring-2 ring-amber-400 ring-offset-2 ring-offset-neutral-900 scale-[1.02]': isBondAbilityHighlight && isHighlighted(card)
                                }">

                        <div v-if="!isJewelPanel && card.isFaceDown" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div class="bg-black/60 px-2 py-1 rounded text-[10px] text-amber-500 border border-amber-500/30">已消耗</div>
                        </div>

                        <div v-if="isJewelPanel && ((isMyJewelPanel && !card.localFlipped) || (!isMyJewelPanel && isDevMode && !card.localFlipped))"
                             class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div class="bg-black/70 px-1.5 py-0.5 rounded text-[9px]" :class="isMyJewelPanel ? 'text-emerald-300' : 'text-amber-400'">翻面</div>
                        </div>

                        <div v-if="isMainCharacterJewelSelectPanel"
                             class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div class="bg-cyan-900/70 border border-cyan-400/40 px-1.5 py-0.5 rounded text-[9px] text-cyan-200">选择</div>
                        </div>
                    </div>

                    <div v-if="displayCards.length === 0" class="col-span-4 py-20 text-center text-gray-600 text-xs italic">
                        该区域目前没有卡牌
                    </div>
                </div>
            </div>
        </div>
    `
};
