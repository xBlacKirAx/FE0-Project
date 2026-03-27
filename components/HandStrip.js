export const HandStrip = {
    props: {
        hand: {
            type: Array,
            default: () => []
        },
        isDraggingOver: String,
        getCardFactionInfo: {
            type: Function,
            required: true
        },
        onCardClick: {
            type: Function,
            required: true
        },
        onTouchStart: {
            type: Function,
            required: true
        },
        onDragStart: {
            type: Function,
            required: true
        },
        onTouchMove: {
            type: Function,
            required: true
        },
        onTouchEnd: {
            type: Function,
            required: true
        }
    },
    template: `
        <div class="flex-1 flex items-center gap-2 px-2 overflow-x-auto overflow-y-hidden hand-strip-scroll">
            <div v-for="card in hand"
                 :key="card.instanceId"
                 class="card-base flex-shrink-0 relative overflow-hidden h-[var(--hand-card-height)]"
                 :class="{
                     'bond-active': isDraggingOver === 'hand',
                     'border-2': true,
                     [getCardFactionInfo(card).borderColor]: true
                 }"
                 draggable="true"
                 @dragstart="onDragStart(card)"
                 @click="onCardClick(card)"
                 @touchstart="onTouchStart($event, card, 'hand')"
                 @touchmove="onTouchMove($event)"
                 @touchend="onTouchEnd($event, card)">
                <div class="absolute top-0 left-0 z-10 flex flex-col items-center justify-center font-bold text-white bg-black/70 rounded-br px-1 py-0.5 leading-none shadow-[2px_2px_5px_rgba(0,0,0,0.5)]"
                     style="min-width: 22px;">
                    <div class="text-[12px] sm:text-[14px] text-yellow-400 drop-shadow-md">{{ card.cost }}</div>
                    <div v-if="card.promoteCost && String(card.promoteCost).toUpperCase() !== 'N/A'"
                         class="text-[9px] sm:text-[10px] border-t border-yellow-400/50 mt-0.5 pt-0.5 text-cyan-300 drop-shadow-md w-full text-center">
                        {{ card.promoteCost }}
                    </div>
                </div>
                <img :src="card.image" class="h-full w-auto object-contain">
            </div>
        </div>
    `
};
