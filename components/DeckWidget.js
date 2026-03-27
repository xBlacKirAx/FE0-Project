export const DeckWidget = {
    props: {
        deckCount: {
            type: Number,
            default: 0
        },
        onDrawCard: {
            type: Function,
            required: true
        }
    },
    template: `
        <div class="fixed right-2 sm:right-6 bottom-[130px] sm:bottom-[150px] z-[90] flex flex-col items-center cursor-pointer group" @click="onDrawCard()">
            <span class="text-[10px] sm:text-xs text-white font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] bg-black/60 px-2 py-0.5 rounded-full mb-1">
                Deck: {{ deckCount }}
            </span>

            <div class="relative transition-transform duration-200 group-hover:-translate-y-2 group-active:scale-95">
                <img v-if="deckCount === 0" src="images/card_back.jpg" class="opacity-30 grayscale w-12 sm:w-16 aspect-[55/76] object-cover rounded shadow border border-white/10">
                <img v-else src="images/card_back.jpg" class="w-12 sm:w-16 aspect-[55/76] object-cover rounded shadow-[0_5px_15px_rgba(0,0,0,0.6)] border border-white/30">

                <div v-if="deckCount > 1" class="absolute inset-0 rounded border-t border-r border-white/30 translate-x-[2px] -translate-y-[2px] -z-10 bg-[#1a1a1a]"></div>
                <div v-if="deckCount > 10" class="absolute inset-0 rounded border-t border-r border-white/20 translate-x-[4px] -translate-y-[4px] -z-20 bg-[#1a1a1a]"></div>
            </div>
        </div>
    `
};
