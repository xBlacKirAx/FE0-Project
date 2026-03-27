export const CardDetailModal = {
    props: {
        selectedCard: Object,
        isMyCard: {
            type: Function,
            required: true
        },
        isCardInHand: {
            type: Function,
            required: true
        },
        isDevMode: Boolean,
        showFullImage: Boolean,
        formattedAbility: {
            type: Function,
            required: true
        },
        formattedSupport: {
            type: Function,
            required: true
        },
        getAreaName: {
            type: Function,
            required: true
        },
        getArea: {
            type: Function,
            required: true
        },
        playToField: {
            type: Function,
            required: true
        },
        playToBond: {
            type: Function,
            required: true
        },
        returnToHandFromBoard: {
            type: Function,
            required: true
        },
        untapCard: {
            type: Function,
            required: true
        },
        toggleBondFace: {
            type: Function,
            required: true
        },
        moveTo: {
            type: Function,
            required: true
        },
        onClose: {
            type: Function,
            required: true
        },
        onOpenFullImage: {
            type: Function,
            required: true
        }
    },
    template: `
        <div v-if="selectedCard" class="fixed inset-0 z-detail flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="onClose()"></div>
            <div class="relative bg-gray-900 border border-blue-600 rounded-2xl w-full max-w-sm overflow-hidden flex flex-col animate-zoom">
                <div class="flex p-4 gap-4 bg-gray-800/60">
                    <div class="w-20 h-28 flex-shrink-0 shadow-lg" @click="onOpenFullImage()">
                        <img :src="selectedCard.image" class="w-full h-full object-cover rounded shadow-md">
                    </div>
                    <div class="flex-1">
                        <h3 class="font-bold text-white text-sm leading-tight">{{ selectedCard.name }}</h3>
                        <div class="grid grid-cols-2 gap-x-2 mt-2 text-[10px] text-gray-400">
                            <div>费用: <span class="text-white">{{ selectedCard.cost }}</span></div>
                            <div>射程: <span class="text-white">{{ selectedCard.range }}</span></div>
                            <div>战力: <span class="text-red-500 font-bold">{{ selectedCard.attack }}</span></div>
                            <div>支援: <span class="text-yellow-500">{{ selectedCard.support }}</span></div>
                        </div>
                    </div>
                </div>
                <div class="px-4 py-2 bg-black/40 border-y border-white/5 space-y-2">
                    <div class="border-b border-white/5 pb-2">
                        <div class="text-[9px] text-blue-400 font-bold mb-1 uppercase">Unit Ability / 单元能力</div>
                        <div class="max-h-24 overflow-y-auto custom-scrollbar text-[11px] leading-relaxed text-gray-300 pr-1"
                             style="white-space: pre-wrap;"
                             v-html="formattedAbility(selectedCard.ability?.text)">
                        </div>
                    </div>

                    <div>
                        <div class="text-[9px] text-yellow-500 font-bold mb-1 uppercase">Support Ability / 支援能力</div>
                        <div class="max-h-20 overflow-y-auto custom-scrollbar text-[11px] leading-relaxed text-gray-400 pr-1 italic"
                             style="white-space: pre-wrap;"
                             v-html="formattedSupport(selectedCard.supportAbility?.text)">
                        </div>
                    </div>
                </div>
                <div class="p-4 bg-gray-800/20 space-y-2">
                    <div v-if="isMyCard(selectedCard)">
                        <div v-if="isCardInHand(selectedCard)" class="grid grid-cols-3 gap-2">
                            <button @click="playToField(selectedCard, 'front')" class="py-2 bg-blue-700 text-white text-[10px] font-bold rounded">出阵-前</button>
                            <button @click="playToField(selectedCard, 'rear')" class="py-2 bg-indigo-700 text-white text-[10px] font-bold rounded">出阵-后</button>
                            <button @click="playToBond(selectedCard)" class="py-2 bg-green-700 text-white text-[10px] font-bold rounded">羁绊</button>
                        </div>
                        <button v-else @click="returnToHandFromBoard(selectedCard)" class="w-full py-2 bg-gray-700 text-white text-[10px] rounded">收回手牌</button>
                    </div>
                    <div v-if="isMyCard(selectedCard)" class="grid grid-cols-2 gap-2 mt-2 border-t border-white/5 pt-2">
                        <button v-if="isDevMode && selectedCard.isTapped"
                                @click="untapCard(selectedCard)"
                                class="col-span-2 py-2 mb-1 bg-green-600 hover:bg-green-500 rounded text-[10px] font-bold shadow-[0_0_10px_rgba(22,163,74,0.5)] transition-all">
                            【DEV】恢复直立
                        </button>
                        <button v-if="getAreaName(getArea(selectedCard)) === 'bonds'"
                                @click="toggleBondFace(selectedCard)"
                                class="py-2 bg-amber-600 rounded text-[10px] col-span-2 font-bold uppercase">
                            {{ selectedCard.isFaceDown ? '翻开 (起立)' : '翻面 (横置/消耗)' }}
                        </button>
                        <button @click="moveTo(selectedCard, 'graveyard')" class="py-1.5 bg-gray-800 text-[9px] rounded border border-white/10">送入弃牌区</button>
                        <button @click="moveTo(selectedCard, 'jewels')" class="py-1.5 bg-purple-900/40 text-[9px] rounded border border-purple-500/50">转为宝玉</button>
                        <button @click="moveTo(selectedCard, 'boundless')" class="py-1.5 bg-blue-900/40 text-[9px] rounded border border-blue-500/50">送入无限区</button>
                        <button @click="moveTo(selectedCard, 'hand')" class="py-1.5 bg-green-900/40 text-[9px] rounded border border-green-500/50">回手牌</button>
                    </div>
                    <button @click="onOpenFullImage()" class="w-full py-1 text-indigo-400 text-[10px] uppercase font-bold">查看高清大图</button>
                </div>
            </div>
        </div>
    `
};
