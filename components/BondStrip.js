export const BondStrip = {
    props: {
        bonds: {
            type: Array,
            default: () => []
        },
        currentPhase: String,
        isMyTurn: Boolean,
        hasPlacedBond: Boolean,
        isDevMode: Boolean,
        isDraggingOver: String,
        getCardFactionInfo: {
            type: Function,
            required: true
        },
        setDraggingOver: {
            type: Function,
            required: true
        },
        onDrop: {
            type: Function,
            required: true
        },
        onOpenPanel: {
            type: Function,
            required: true
        },
        onSelectCard: {
            type: Function,
            required: true
        }
    },
    template: `
        <div class="h-10 px-2 flex items-center gap-1 bonds-area bond-strip-scroll"
             data-area="bonds"
             :class="{
                 'guide-bond-active': isMyTurn && currentPhase === 'BOND' && !hasPlacedBond && !isDevMode,
                 'dragging-over': isDraggingOver === 'bonds'
             }"
             @dragover.prevent="setDraggingOver('bonds')"
             @drop="onDrop('bonds')"
             @click.self="onOpenPanel()">
            <div v-for="card in bonds"
                 :key="card.instanceId"
                 class="card-base bond-card relative overflow-hidden"
                 :class="{
                     'border-2': !card.isFaceDown,
                     [card.isFaceDown ? 'border-gray-800' : getCardFactionInfo(card).borderColor]: true
                 }"
                 @click="onSelectCard(card)">
                <div v-if="!card.isFaceDown"
                     class="absolute top-0 left-0 z-10 flex flex-col items-center justify-center font-bold text-white bg-black/60 rounded-br p-0.5 leading-none"
                     style="min-width: 22px;">
                    <div class="text-[11px] sm:text-[13px] text-amber-300">{{ card.cost }}</div>
                    <div v-if="card.promote_cost" class="text-[9px] sm:text-[10px] border-t border-amber-300/50 mt-0.5 pt-0.5 text-blue-300">
                        {{ card.promote_cost }}
                    </div>
                </div>
                <img :src="card.isFaceDown ? 'images/card_back.jpg' : card.image" class="h-full w-auto object-contain">
            </div>
        </div>
    `
};
