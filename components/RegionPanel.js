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
        isOpponentPanel: Boolean,
        onClose: {
            type: Function,
            required: true
        },
        onCardClick: {
            type: Function,
            required: true
        }
    },
    template: `
        <div v-if="activePanel" class="fixed inset-0 z-region flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="onClose()"></div>

            <div class="relative bg-neutral-900 border border-white/10 w-full max-w-lg h-[70vh] rounded-xl flex flex-col animate-zoom">
                <div class="p-3 border-b border-white/10 flex justify-between bg-white/5">
                    <span class="text-sm font-bold uppercase" :class="isOpponentPanel ? 'text-red-500' : 'text-blue-400'">
                        {{ isOpponentPanel ? '对手的' : '我的' }} {{ panelTitle }}
                    </span>
                    <button @click="onClose()" class="text-white p-1">✕</button>
                </div>

                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-2">
                    <div v-for="card in panelCards"
                         :key="card.instanceId"
                         @click="onCardClick(card)"
                         class="aspect-[55/76] relative group">
                        <img :src="card.isFaceDown ? 'images/card_back.jpg' : card.image"
                             class="w-full h-full object-cover rounded shadow-md transition-all"
                             :class="{ 'opacity-50 grayscale': card.isFaceDown }">

                        <div v-if="card.isFaceDown" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div class="bg-black/60 px-2 py-1 rounded text-[10px] text-amber-500 border border-amber-500/30">已消耗</div>
                        </div>
                    </div>

                    <div v-if="panelCards.length === 0" class="col-span-4 py-20 text-center text-gray-600 text-xs italic">
                        该区域目前没有卡牌
                    </div>
                </div>
            </div>
        </div>
    `
};
