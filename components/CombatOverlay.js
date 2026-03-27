export const CombatOverlay = {
    props: {
        isCombatActive: Boolean,
        mySupportCard: Object,
        oppSupportCard: Object,
        attacker: Object,
        defender: Object,
        combatStats: {
            type: Object,
            default: () => ({})
        },
        onClose: {
            type: Function,
            required: true
        }
    },
    template: `
        <div v-if="isCombatActive" class="fixed inset-0 z-[150] flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden">
            <div class="absolute inset-0 bg-black/90 backdrop-blur-md"></div>

            <div class="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
                <div class="absolute top-1/2 left-0 w-full h-2 bg-blue-600 shadow-[0_0_50px_20px_rgba(37,99,235,0.6)] transform -translate-y-1/2 rotate-12"></div>
                <div class="absolute top-1/2 left-0 w-full h-2 bg-red-600 shadow-[0_0_50px_20px_rgba(220,38,38,0.6)] transform -translate-y-1/2 -rotate-12"></div>
            </div>

            <div class="relative z-10 w-full max-w-4xl flex flex-col items-center">
                <h2 class="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-white to-red-500 mb-6 md:mb-12 italic tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                    BATTLE START
                </h2>

                <div class="flex justify-between items-end w-full px-2 md:px-10 gap-2 md:gap-8">
                    <div class="flex-1 flex flex-col items-center gap-2 md:gap-4 relative animate-slide-in-left">
                        <div class="text-blue-400 font-bold text-sm md:text-xl uppercase tracking-wider mb-2">Attacker</div>

                        <div class="relative w-20 h-28 md:w-32 md:h-44 border-2 border-dashed border-blue-500/50 rounded-lg flex items-center justify-center bg-blue-900/20 perspective-1000">
                            <transition name="flip">
                                <img v-if="mySupportCard" :src="mySupportCard.image" class="w-full h-full object-cover rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                                <span v-else class="text-blue-500/50 text-[10px] md:text-xs font-bold text-center">SUPPORT<br>AREA</span>
                            </transition>
                        </div>

                        <div class="text-center font-mono mt-2">
                            <div class="text-gray-300 text-xs md:text-sm">
                                Base: {{ attacker?.attack || 0 }}
                                <span v-if="mySupportCard" class="text-yellow-400 font-bold drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]">
                                    + {{ mySupportCard.support || 0 }}
                                </span>
                            </div>
                            <div class="text-5xl md:text-7xl font-black text-white text-shadow-glow-blue mt-1 transition-all duration-500">{{ combatStats.myTotalPower || attacker?.attack || 0 }}</div>
                        </div>

                        <div class="w-28 h-40 md:w-48 md:h-64 relative mt-2 z-20 transition-transform hover:scale-105">
                            <img v-if="attacker" :src="attacker.image" class="w-full h-full object-cover rounded-xl shadow-2xl border-2 border-blue-400">
                        </div>
                    </div>

                    <div class="flex items-center justify-center pb-[10vh] md:pb-[15vh] z-30 shrink-0 mx-2 md:mx-4">
                        <div class="text-6xl md:text-8xl font-black text-white italic transform -skew-x-12 text-shadow-vs animate-pulse-fast">VS</div>
                    </div>

                    <div class="flex-1 flex flex-col items-center gap-2 md:gap-4 relative animate-slide-in-right">
                        <div class="text-red-500 font-bold text-sm md:text-xl uppercase tracking-wider mb-2">Defender</div>

                        <div class="relative w-20 h-28 md:w-32 md:h-44 border-2 border-dashed border-red-500/50 rounded-lg flex items-center justify-center bg-red-900/20 perspective-1000">
                            <transition name="flip">
                                <img v-if="oppSupportCard" :src="oppSupportCard.image" class="w-full h-full object-cover rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                                <span v-else class="text-red-500/50 text-[10px] md:text-xs font-bold text-center">SUPPORT<br>AREA</span>
                            </transition>
                        </div>

                        <div class="text-center font-mono mt-2">
                            <div class="text-gray-300 text-xs md:text-sm">
                                Base: {{ defender?.attack || 0 }}
                                <span v-if="oppSupportCard" class="text-yellow-400 font-bold drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]">
                                    + {{ oppSupportCard.support || 0 }}
                                </span>
                            </div>
                            <div class="text-5xl md:text-7xl font-black text-white text-shadow-glow-red mt-1 transition-all duration-500">{{ combatStats.oppTotalPower || defender?.attack || 0 }}</div>
                        </div>

                        <div class="w-28 h-40 md:w-48 md:h-64 relative mt-2 z-20 transition-transform hover:scale-105">
                            <img v-if="defender" :src="defender.image" class="w-full h-full object-cover rounded-xl shadow-2xl border-2 border-red-500">
                        </div>
                    </div>
                </div>

                <div class="mt-10 md:mt-16 z-40">
                    <button @click="onClose()" class="px-8 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-bold rounded-full shadow-lg border border-neutral-600 transition-colors">
                        关闭面板 (调试用)
                    </button>
                </div>
            </div>
        </div>
    `
};
