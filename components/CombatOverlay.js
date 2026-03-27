export const CombatOverlay = {
    props: {
        isCombatActive: Boolean,
        mySupportCard: Object,
        oppSupportCard: Object,
        attacker: Object,
        defender: Object,
        costCards: {
            type: Array,
            default: () => []
        },
        selectedCostCard: {
            type: Object,
            default: null
        },
        selectedCostCardName: {
            type: String,
            default: ''
        },
        isMyAttacker: Boolean,
        onOpenCostPicker: {
            type: Function,
            required: true
        },
        onCombatDecision: {
            type: Function,
            required: true
        },
        combatDecision: {
            type: Object,
            default: () => ({})
        },
        combatStats: {
            type: Object,
            default: () => ({})
        }
    },
    computed: {
        canAct() {
            const role = this.isMyAttacker ? 'attacker' : 'defender';
            return this.combatDecision?.promptOwner === role;
        },
        defenderCharaName() {
            const direct = (this.defender?.charaName || '').trim();
            if (direct) return direct;

            const fromCardName = (this.defender?.cardName || '').trim();
            if (fromCardName) {
                const idx = fromCardName.search(/\s/);
                if (idx > -1) {
                    const derived = fromCardName.slice(idx).trim();
                    if (derived) return derived;
                }
                return fromCardName;
            }

            const legacyName = (this.defender?.name || '').trim();
            if (legacyName) {
                const idx = legacyName.search(/\s/);
                if (idx > -1) {
                    const derived = legacyName.slice(idx).trim();
                    if (derived) return derived;
                }
                return legacyName;
            }

            return '该单位';
        },
        decisionTitle() {
            if (this.combatDecision?.stage === 'awaiting-attacker-critical') {
                return '本次原本未击破，是否发动必杀？';
            }
            if (this.combatDecision?.stage === 'awaiting-defender-evasion') {
                return `${this.defenderCharaName}将被击破，是否发动回避？`;
            }
            if (this.combatDecision?.stage === 'awaiting-defender-evasion-after-critical') {
                return `对方发动必杀，${this.defenderCharaName}将被击破，是否发动回避？`;
            }
            return '';
        },
        waitingTitle() {
            if (this.combatDecision?.stage === 'awaiting-attacker-critical') {
                return '等待攻击方选择是否发动必杀...';
            }
            if (this.combatDecision?.stage === 'awaiting-defender-evasion' || this.combatDecision?.stage === 'awaiting-defender-evasion-after-critical') {
                return '等待防御方选择是否发动回避...';
            }
            return '正在结算战斗...';
        },
        requiredCharaName() {
            if (this.combatDecision?.stage === 'awaiting-attacker-critical') {
                return this.attackerCharaName;
            }
            if (this.combatDecision?.stage === 'awaiting-defender-evasion' || this.combatDecision?.stage === 'awaiting-defender-evasion-after-critical') {
                return this.defenderCharaName;
            }
            return '';
        },
        attackerCharaName() {
            const direct = (this.attacker?.charaName || '').trim();
            if (direct) return direct;
            const fullName = (this.attacker?.cardName || this.attacker?.name || '').trim();
            if (!fullName) return '';
            const idx = fullName.search(/\s/);
            if (idx > -1) {
                const derived = fullName.slice(idx).trim();
                if (derived) return derived;
            }
            return fullName;
        },
        hasSkillCostCard() {
            return (this.costCards || []).length > 0;
        },
        canActivateSkill() {
            return this.hasSkillCostCard && !!this.selectedCostCard?.instanceId;
        }
    },
    methods: {
        activateDecision(decisionType) {
            if (!this.canActivateSkill) return;
            this.onCombatDecision(decisionType, true, this.selectedCostCard.instanceId);
        },
        declineDecision(decisionType) {
            this.onCombatDecision(decisionType, false, null);
        }
    },
    template: `
        <div v-if="isCombatActive" class="fixed inset-0 z-[150] flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden">
            <div class="absolute inset-0 bg-black/90 backdrop-blur-md"></div>

            <div class="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
                <div class="absolute top-1/2 left-0 w-full h-2 bg-blue-600 shadow-[0_0_50px_20px_rgba(37,99,235,0.6)] transform -translate-y-1/2 rotate-12"></div>
                <div class="absolute top-1/2 left-0 w-full h-2 bg-red-600 shadow-[0_0_50px_20px_rgba(220,38,38,0.6)] transform -translate-y-1/2 -rotate-12"></div>
            </div>

            <!-- 必杀/回避决策面板 - 绝对居中弹层，始终在屏幕内可见 -->
            <div v-if="combatDecision?.stage && combatDecision.stage !== 'idle' && combatDecision.stage !== 'resolved'"
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/20 bg-black/55 backdrop-blur-sm px-6 py-6 text-center shadow-2xl">
                <div v-if="canAct" class="space-y-4">
                    <div class="text-lg md:text-2xl font-black text-white">{{ decisionTitle }}</div>
                    <div v-if="combatDecision.stage === 'awaiting-attacker-critical'" class="text-sm md:text-base text-yellow-300">
                        发动后攻击战力将提升至 {{ combatDecision.criticalPower }}
                    </div>
                    <div class="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-left">
                        <div class="text-xs md:text-sm text-white/80">发动代价：从手牌弃置1张同角色名卡（{{ requiredCharaName || '未知角色' }}）</div>
                        <div v-if="hasSkillCostCard" class="mt-2 space-y-2">
                            <button
                                @click="onOpenCostPicker()"
                                class="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-xs md:text-sm text-white/90 hover:bg-black/45 transition-colors">
                                从手牌筛选并选择代价卡
                            </button>
                            <div class="text-xs md:text-sm text-emerald-300">
                                已选择：{{ selectedCostCardName || selectedCostCard?.cardName || '未选择' }}
                            </div>
                        </div>
                        <div v-else class="mt-2 text-sm text-rose-300">手牌中没有同角色名卡，无法发动。</div>
                    </div>
                    <div class="flex items-center justify-center gap-3 md:gap-4 mt-4">
                        <button
                            v-if="combatDecision.stage === 'awaiting-attacker-critical'"
                            @click="activateDecision('critical')"
                            :disabled="!canActivateSkill"
                            :class="canActivateSkill ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-yellow-900/50 text-yellow-200/60 cursor-not-allowed'"
                            class="px-6 py-3 rounded-full font-black transition-colors text-base md:text-lg">
                            发动必杀
                        </button>
                        <button
                            v-if="combatDecision.stage === 'awaiting-attacker-critical'"
                            @click="declineDecision('critical')"
                            class="px-6 py-3 rounded-full bg-neutral-700 hover:bg-neutral-600 text-white font-bold transition-colors text-base md:text-lg">
                            不发动
                        </button>
                        <button
                            v-if="combatDecision.stage === 'awaiting-defender-evasion' || combatDecision.stage === 'awaiting-defender-evasion-after-critical'"
                            @click="activateDecision('evasion')"
                            :disabled="!canActivateSkill"
                            :class="canActivateSkill ? 'bg-cyan-500 hover:bg-cyan-400 text-black' : 'bg-cyan-900/50 text-cyan-200/60 cursor-not-allowed'"
                            class="px-6 py-3 rounded-full font-black transition-colors text-base md:text-lg">
                            发动回避
                        </button>
                        <button
                            v-if="combatDecision.stage === 'awaiting-defender-evasion' || combatDecision.stage === 'awaiting-defender-evasion-after-critical'"
                            @click="declineDecision('evasion')"
                            class="px-6 py-3 rounded-full bg-neutral-700 hover:bg-neutral-600 text-white font-bold transition-colors text-base md:text-lg">
                            不回避
                        </button>
                    </div>
                </div>
                <div v-else class="space-y-2 text-white/90">
                    <div class="text-lg md:text-2xl font-black">{{ waitingTitle }}</div>
                    <div v-if="combatDecision.criticalUsed" class="text-sm md:text-base text-yellow-300">攻击方已宣言必杀</div>
                </div>
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

            </div>
        </div>
    `
};
