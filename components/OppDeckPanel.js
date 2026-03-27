const { ref, computed, watch } = Vue;

export const OppDeckPanel = {
    props: {
        activePanel: String,
        oppDeckCards: { type: Array, default: () => [] },
        isDevMode: Boolean,
        onClose: { type: Function, required: true }
    },
    setup(props) {
        const flippedIds = ref(new Set());

        // 面板打开时重置翻面状态
        watch(() => props.activePanel, (val) => {
            if (val === 'oppDeck') flippedIds.value = new Set();
        });

        const displayCards = computed(() => {
            return props.oppDeckCards.map(card => ({
                ...card,
                localFlipped: flippedIds.value.has(card.instanceId),
            }));
        });

        const toggleFlip = (card) => {
            if (!props.isDevMode) return;
            const next = new Set(flippedIds.value);
            if (next.has(card.instanceId)) next.delete(card.instanceId);
            else next.add(card.instanceId);
            flippedIds.value = next;
        };

        return { displayCards, toggleFlip };
    },
    template: `
        <div v-if="activePanel === 'oppDeck'" class="fixed inset-0 z-region flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="onClose()"></div>

            <div class="relative bg-neutral-900 border border-white/10 w-full max-w-lg h-[70vh] rounded-xl flex flex-col animate-zoom">
                <div class="p-3 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <span class="text-sm font-bold uppercase text-red-500">
                        对手的 牌组 <span class="text-xs text-gray-400 font-normal ml-1">({{ displayCards.length }})</span>
                    </span>
                    <div class="flex items-center gap-2">
                        <span v-if="isDevMode" class="text-[9px] text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded">DEV · 点击翻面</span>
                        <button @click="onClose()" class="text-white p-1">✕</button>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-2">
                    <div v-for="card in displayCards"
                         :key="card.instanceId"
                         @click="toggleFlip(card)"
                         :class="[isDevMode ? 'cursor-pointer active:scale-95' : 'cursor-default', 'aspect-[55/76] relative transition-transform group']">
                        <img :src="card.localFlipped ? card.image : 'images/card_back.jpg'"
                             class="w-full h-full object-cover rounded shadow-md transition-all duration-200">
                        <div v-if="isDevMode && !card.localFlipped"
                             class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div class="bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-amber-400">翻面</div>
                        </div>
                    </div>

                    <div v-if="displayCards.length === 0" class="col-span-4 py-20 text-center text-gray-600 text-xs italic">
                        对手牌组中没有卡牌
                    </div>
                </div>
            </div>
        </div>
    `
};
