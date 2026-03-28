export const CardDetailModal = {
    props: {
        selectedCard: Object,
        primaryActionLabel: {
            type: String,
            default: ''
        },
        onPrimaryAction: {
            type: Function,
            default: null
        },
        secondaryActionLabel: {
            type: String,
            default: ''
        },
        onSecondaryAction: {
            type: Function,
            default: null
        },
        tertiaryActionLabel: {
            type: String,
            default: ''
        },
        onTertiaryAction: {
            type: Function,
            default: null
        },
        quaternaryActionLabel: {
            type: String,
            default: ''
        },
        onQuaternaryAction: {
            type: Function,
            default: null
        },
        onNavigatePrev: {
            type: Function,
            default: null
        },
        onNavigateNext: {
            type: Function,
            default: null
        },
        isMyCard: {
            type: Function,
            required: true
        },
        isCardInHand: {
            type: Function,
            required: true
        },
        isDevMode: Boolean,
        isMyTurn: Boolean,
        currentPhase: String,
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
        moveFieldUnit: {
            type: Function,
            required: true
        },
        canPerformClassChange: {
            type: Function,
            required: true
        },
        performClassChange: {
            type: Function,
            required: true
        },
        placeCardToTopOfDeck: {
            type: Function,
            required: true
        },
        onClose: {
            type: Function,
            required: true
        },
        onOpenFullImage: {
            type: Function,
            default: null
        }
    },
    methods: {
        getImageSrc(card) {
            return card?.image || card?.imgSrc || '';
        },
        getDisplayName(card) {
            return card?.cardName || card?.name || '';
        },
        getRangeDisplay(card) {
            const value = String(card?.range || '').trim();
            return value || '-';
        },
        getRangeHint(card) {
            const range = this.getRangeDisplay(card);
            if (range === '-') return '无射程/射程0：不能攻击对方单位';
            if (range === '1') return '前场可攻击对方前场';
            if (range === '2') return '后场打对方前场；前场打对方后场';
            if (range === '1-2') return '前场打对方前后场；后场打对方前场';
            return '射程规则未定义';
        },
        handlePrimaryAction() {
            if (!this.onPrimaryAction || !this.selectedCard) return;
            this.onPrimaryAction(this.selectedCard);
        },
        handleSecondaryAction() {
            if (!this.onSecondaryAction || !this.selectedCard) return;
            this.onSecondaryAction(this.selectedCard);
        },
        handleTertiaryAction() {
            if (!this.onTertiaryAction || !this.selectedCard) return;
            this.onTertiaryAction(this.selectedCard);
        },
        handleQuaternaryAction() {
            if (!this.onQuaternaryAction || !this.selectedCard) return;
            this.onQuaternaryAction(this.selectedCard);
        },
        handleTouchStart(event) {
            const touch = event.touches?.[0];
            this._touchStartX = touch?.clientX || 0;
        },
        handleTouchEnd(event) {
            const touch = event.changedTouches?.[0];
            const endX = touch?.clientX || 0;
            const deltaX = endX - (this._touchStartX || 0);
            if (Math.abs(deltaX) < 48) return;
            if (deltaX < 0 && this.onNavigateNext) {
                this.onNavigateNext();
                return;
            }
            if (deltaX > 0 && this.onNavigatePrev) {
                this.onNavigatePrev();
            }
        }
    },
    template: `
        <div v-if="selectedCard" class="fixed inset-0 z-detail flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="onClose()"></div>
            <div class="relative bg-gray-900 border border-blue-600 rounded-2xl w-full max-w-sm overflow-hidden flex flex-col animate-zoom"
                 @dblclick.prevent
                 @touchstart="handleTouchStart"
                 @touchend="handleTouchEnd">
                <div class="flex p-4 gap-4 bg-gray-800/60">
                    <div class="w-20 h-28 flex-shrink-0 shadow-lg relative" @click="onOpenFullImage && onOpenFullImage()">
                        <img :src="getImageSrc(selectedCard)" class="w-full h-full object-cover rounded shadow-md">
                        <div v-if="selectedCard._deckCount" class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-cyan-500 text-[10px] font-bold text-black flex items-center justify-center">
                            {{ selectedCard._deckCount }}
                        </div>
                    </div>
                    <div class="flex-1">
                        <h3 class="font-bold text-white text-sm leading-tight">{{ getDisplayName(selectedCard) }}</h3>
                        <div class="grid grid-cols-2 gap-x-2 mt-2 text-[10px] text-gray-400">
                            <div>费用: <span class="text-white">{{ selectedCard.cost }}</span></div>
                            <div>射程: <span class="text-white">{{ getRangeDisplay(selectedCard) }}</span></div>
                            <div>战力: <span class="text-red-500 font-bold">{{ selectedCard.attack }}</span></div>
                            <div>支援: <span class="text-yellow-500">{{ selectedCard.support }}</span></div>
                        </div>
                        <div class="mt-2 text-[9px] text-cyan-300/90 leading-tight border border-cyan-500/30 bg-cyan-950/20 rounded px-2 py-1">
                            射程规则：{{ getRangeHint(selectedCard) }}
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
                    <div v-if="onNavigatePrev || onNavigateNext" class="flex items-center justify-between text-[10px] text-gray-400">
                        <button @click="onNavigatePrev && onNavigatePrev()" :disabled="!onNavigatePrev" class="px-2 py-1 rounded bg-white/5 disabled:opacity-30">上一张</button>
                        <div>左右滑动可切换</div>
                        <button @click="onNavigateNext && onNavigateNext()" :disabled="!onNavigateNext" class="px-2 py-1 rounded bg-white/5 disabled:opacity-30">下一张</button>
                    </div>
                    <div v-if="isMyCard(selectedCard) && (isDevMode || isMyTurn)">
                        <div v-if="isCardInHand(selectedCard)" class="space-y-2">
                            <!-- 转职按钮（如果有转职目标） -->
                            <div v-if="canPerformClassChange(selectedCard) !== null" class="grid grid-cols-1 gap-2 mb-2 p-3 bg-gradient-to-r from-purple-900/60 to-pink-900/60 border border-purple-500/50 rounded">
                                <div class="text-[10px] text-purple-300 font-bold">
                                    🔄 转职 · 费用 {{ selectedCard.promoteCost }} 羁绊
                                </div>
                                <button v-if="canPerformClassChange(selectedCard)?.valid" @click="() => {
                                    const classChangeRes = canPerformClassChange(selectedCard);
                                    if (classChangeRes && classChangeRes.valid) {
                                        performClassChange(selectedCard, classChangeRes.targetCard);
                                        onClose();
                                    }
                                }" class="py-2 bg-gradient-to-r from-purple-700 to-pink-700 text-white text-[10px] font-bold rounded hover:shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                                    转职为 {{ canPerformClassChange(selectedCard)?.targetCard?.cardName || '目标' }}
                                </button>
                                <div v-else class="py-2 text-center text-[10px] text-red-400 bg-red-900/30 rounded">
                                    {{ canPerformClassChange(selectedCard)?.reason === 'insufficient-bonds' ? '羁绊不足，无法转职' : '缺少对应势力羁绊' }}
                                </div>
                            </div>
                            <!-- 普通出击按钮（如果不能转职） -->
                            <div v-if="canPerformClassChange(selectedCard) === null" class="grid grid-cols-3 gap-2">
                                <button
                                    @click="playToField(selectedCard, 'front')"
                                    :disabled="!isDevMode && currentPhase !== 'DEPLOY'"
                                    :class="(!isDevMode && currentPhase !== 'DEPLOY') ? 'opacity-40 cursor-not-allowed' : ''"
                                    class="py-2 bg-blue-700 text-white text-[10px] font-bold rounded">出阵-前</button>
                                <button
                                    @click="playToField(selectedCard, 'rear')"
                                    :disabled="!isDevMode && currentPhase !== 'DEPLOY'"
                                    :class="(!isDevMode && currentPhase !== 'DEPLOY') ? 'opacity-40 cursor-not-allowed' : ''"
                                    class="py-2 bg-indigo-700 text-white text-[10px] font-bold rounded">出阵-后</button>
                                <button
                                    @click="playToBond(selectedCard)"
                                    :disabled="!isDevMode && currentPhase !== 'BOND'"
                                    :class="(!isDevMode && currentPhase !== 'BOND') ? 'opacity-40 cursor-not-allowed' : ''"
                                    class="py-2 bg-green-700 text-white text-[10px] font-bold rounded">羁绊</button>
                            </div>
                        </div>
                        <button
                            v-else-if="['front', 'rear'].includes(getAreaName(getArea(selectedCard))) && (isDevMode || currentPhase === 'ATTACK')"
                            @click="() => {
                                const from = getAreaName(getArea(selectedCard));
                                const to = from === 'front' ? 'rear' : 'front';
                                moveFieldUnit(selectedCard, to);
                                onClose();
                            }"
                            :disabled="!isDevMode && selectedCard.isTapped"
                            :class="(!isDevMode && selectedCard.isTapped) ? 'opacity-40 cursor-not-allowed' : ''"
                            class="w-full py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] rounded font-bold">
                            {{ (!isDevMode && selectedCard.isTapped) ? '已横置：不能再移动' : ('移动到' + (getAreaName(getArea(selectedCard)) === 'front' ? '后场' : '前场') + '（并横置）') }}
                        </button>
                        <button v-else-if="isDevMode" @click="returnToHandFromBoard(selectedCard)" class="w-full py-2 bg-gray-700 text-white text-[10px] rounded">收回手牌</button>
                    </div>
                    <!-- 叠放卡牌显示（转职叠放的下级卡） -->
                    <div v-if="selectedCard._stackedCards && selectedCard._stackedCards.length > 0"
                         class="mx-4 mb-2 p-3 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/40 rounded">
                        <div class="text-[10px] text-indigo-300 font-bold mb-2">
                            📚 叠放记录（{{ selectedCard._stackedCards.length }} 张）
                        </div>
                        <div v-for="(sc, idx) in selectedCard._stackedCards" :key="sc.instanceId || idx"
                             class="flex items-center gap-2 py-1 border-b border-white/5 last:border-0">
                            <span class="text-[9px] text-gray-400">{{ idx + 1 }}.</span>
                            <img v-if="sc.imgSrc || sc.image" :src="sc.imgSrc || sc.image" class="w-6 h-8 object-cover rounded" />
                            <div class="flex-1 min-w-0">
                                <div class="text-[10px] text-white truncate">{{ sc.cardName || sc.name }}</div>
                                <div class="text-[9px] text-gray-400">{{ sc.jobClass || sc.rank || '' }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-if="isMyCard(selectedCard) && (isDevMode || isMyTurn)" class="grid grid-cols-2 gap-2 mt-2 border-t border-white/5 pt-2">
                        <button v-if="isDevMode && selectedCard.isTapped"
                                @click="untapCard(selectedCard)"
                                class="col-span-2 py-2 mb-1 bg-green-600 hover:bg-green-500 rounded text-[10px] font-bold shadow-[0_0_10px_rgba(22,163,74,0.5)] transition-all">
                            【DEV】恢复直立
                        </button>
                        <button v-if="isDevMode"
                                @click="() => { placeCardToTopOfDeck(selectedCard); onClose(); }"
                                class="col-span-2 py-2 bg-blue-600 hover:bg-blue-500 rounded text-[10px] font-bold shadow-[0_0_10px_rgba(37,99,235,0.5)] transition-all">
                            【DEV】放到牌组顶
                        </button>
                        <button v-if="getAreaName(getArea(selectedCard)) === 'bonds'"
                                @click="toggleBondFace(selectedCard)"
                                class="py-2 bg-amber-600 rounded text-[10px] col-span-2 font-bold uppercase">
                            {{ selectedCard.isFaceDown ? '翻开 (起立)' : '翻面 (横置/消耗)' }}
                        </button>
                        <template v-if="isDevMode">
                            <button @click="moveTo(selectedCard, 'graveyard')" class="py-1.5 bg-gray-800 text-[9px] rounded border border-white/10">送入弃牌区</button>
                            <button @click="moveTo(selectedCard, 'jewels')" class="py-1.5 bg-purple-900/40 text-[9px] rounded border border-purple-500/50">转为宝玉</button>
                            <button @click="moveTo(selectedCard, 'boundless')" class="py-1.5 bg-blue-900/40 text-[9px] rounded border border-blue-500/50">送入无限区</button>
                            <button @click="moveTo(selectedCard, 'hand')" class="py-1.5 bg-green-900/40 text-[9px] rounded border border-green-500/50">回手牌</button>
                        </template>
                    </div>
                    <button v-if="primaryActionLabel && onPrimaryAction"
                            @click="handlePrimaryAction()"
                            class="w-full py-2 bg-cyan-700 hover:bg-cyan-600 rounded text-[10px] font-bold uppercase tracking-wide">
                        {{ primaryActionLabel }}
                    </button>
                    <button v-if="secondaryActionLabel && onSecondaryAction"
                            @click="handleSecondaryAction()"
                            class="w-full py-2 bg-teal-700 hover:bg-teal-600 rounded text-[10px] font-bold uppercase tracking-wide">
                        {{ secondaryActionLabel }}
                    </button>
                    <button v-if="tertiaryActionLabel && onTertiaryAction"
                            @click="handleTertiaryAction()"
                            class="w-full py-2 bg-amber-700 hover:bg-amber-600 rounded text-[10px] font-bold uppercase tracking-wide">
                        {{ tertiaryActionLabel }}
                    </button>
                    <button v-if="quaternaryActionLabel && onQuaternaryAction"
                            @click="handleQuaternaryAction()"
                            class="w-full py-2 bg-rose-700 hover:bg-rose-600 rounded text-[10px] font-bold uppercase tracking-wide">
                        {{ quaternaryActionLabel }}
                    </button>
                    <button v-if="onOpenFullImage" @click="onOpenFullImage()" class="w-full py-1 text-indigo-400 text-[10px] uppercase font-bold">查看高清大图</button>
                </div>
            </div>
        </div>
    `
};
