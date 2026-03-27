export const TopControlBar = {
    props: {
        isDevMode: Boolean,
        isMyTurn: Boolean,
        onToggleDevMode: {
            type: Function,
            required: true
        },
        onResetGame: {
            type: Function,
            required: true
        },
        remainingCost: {
            type: Number,
            default: 0
        },
        totalBonds: {
            type: Number,
            default: 0
        },
        hasUndo: Boolean,
        onUndo: {
            type: Function,
            required: true
        },
        phaseName: {
            type: String,
            default: ''
        },
        showNextPhaseButton: Boolean,
        nextPhaseLabel: {
            type: String,
            default: 'NEXT'
        },
        onNextPhase: {
            type: Function,
            required: true
        }
    },
    template: `
        <div class="phase-control-bar pointer-events-auto w-full px-2 sm:px-4 py-1.5 flex justify-between sm:justify-center sm:gap-12 items-center bg-black/80 backdrop-blur-md border-b border-white/10 z-[80]">
            <div class="flex items-center gap-2 sm:gap-4 shrink-0">
                <div @click="onToggleDevMode()" class="flex items-center gap-1.5 cursor-pointer">
                    <div :class="isDevMode ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]'" class="w-2 h-2 rounded-full"></div>
                    <span class="text-[9px] sm:text-[10px] font-mono font-bold">{{ isDevMode ? 'DEV' : 'PLAY' }}</span>
                </div>

                <div class="w-[1px] h-3 bg-white/20"></div>

                <button @click="onResetGame()" class="bg-red-900/80 hover:bg-red-700 text-white text-[9px] px-1.5 py-1 rounded border border-red-500/50 uppercase">
                    重置
                </button>
            </div>

            <div class="flex items-center gap-2">
                <div class="flex items-center gap-1 px-1.5 py-0.5 bg-green-900/40 border border-green-500/40 rounded shadow-inner min-w-[50px] justify-center">
                    <span class="text-[8px] text-green-200">COST</span>
                    <span class="text-[10px] sm:text-[11px] font-black text-green-400 font-mono">{{ remainingCost }}</span>
                    <span class="text-[9px] text-green-600 font-mono">/ {{ totalBonds }}</span>
                </div>

                <div v-if="!isDevMode"
                     :class="isMyTurn ? 'bg-green-900/60 border-green-500/60 text-green-300' : 'bg-red-900/60 border-red-500/60 text-red-300'"
                     class="px-1.5 py-0.5 border rounded text-[8px] font-bold whitespace-nowrap">
                    {{ isMyTurn ? '我方回合' : '对手回合' }}
                </div>

                <button v-if="hasUndo"
                        @click="onUndo()"
                        class="bg-orange-600/90 hover:bg-orange-500 text-white text-[9px] px-2 py-1 rounded border border-orange-400/50 shadow-md flex items-center gap-1 transition-transform active:scale-95">
                    <span>↩</span><span class="hidden sm:inline">撤销</span>
                </button>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[9px] sm:text-[10px] font-bold text-amber-500 w-12 sm:w-16 text-center uppercase">{{ phaseName || 'BEGINNING' }}</span>

                <button v-if="showNextPhaseButton"
                        @click="onNextPhase()"
                        class="phase-btn px-2 py-1 text-[9px] sm:text-[10px] min-w-[45px]">
                    {{ nextPhaseLabel }}
                </button>
            </div>
        </div>
    `
};
