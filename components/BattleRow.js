export const BattleRow = {
    props: {
        cards: {
            type: Array,
            default: () => []
        },
        rowClass: {
            type: String,
            default: ''
        },
        area: {
            type: String,
            default: ''
        },
        areaLabel: {
            type: String,
            default: ''
        },
        hoveredAttackTargetId: {
            type: [String, Number, null],
            default: null
        },
        attackRangeTargetIds: {
            type: Array,
            default: () => []
        },
        attackRangeTargetAreas: {
            type: Array,
            default: () => []
        },
        rowKey: {
            type: String,
            default: ''
        },
        isEnemy: Boolean,
        isGuideActive: Boolean,
        isDraggingOver: Boolean,
        setDraggingOver: {
            type: Function,
            required: true
        },
        clearDraggingOver: {
            type: Function,
            required: true
        },
        onDropArea: {
            type: Function,
            required: true
        },
        onAttackDrop: {
            type: Function,
            required: true
        },
        onCardClick: {
            type: Function,
            required: true
        },
        onDragStart: {
            type: Function,
            required: true
        },
        onDragOver: {
            type: Function,
            required: true
        },
        onTouchStart: {
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
    data() {
        return {
            assistDragging: false,
            assistStartX: 0,
            assistStartScrollLeft: 0,
            assistHandleRect: null,
            rowScrollLeft: 0,
            rowViewportWidth: 0,
            rowCardWidth: 68,
            isMobileViewport: false
        };
    },
    computed: {
        rowClasses() {
            const hasTarget = this.isEnemy
                && this.hoveredAttackTargetId
                && (this.cards || []).some(c => String(c.instanceId) === String(this.hoveredAttackTargetId));
            return {
                'guide-deploy-active': !this.isEnemy && this.isGuideActive,
                'dragging-over': !this.isEnemy && this.isDraggingOver,
                'has-attack-target': hasTarget,
                'attack-range-row-active': this.isEnemy && this.rowKey && this.attackRangeTargetAreas.includes(this.rowKey),
                'row-scroll-assist-active': this.showScrollAssist
            };
        },
        showScrollAssist() {
            return this.isMobileViewport && (this.cards || []).length >= 5;
        },
        assistHandleStyle() {
            const left = this.rowScrollLeft + (this.rowViewportWidth / 2);
            return {
                left: `${Math.max(0, left)}px`,
                transform: 'translateX(-50%)'
            };
        },
        assistHintStyle() {
            const rightSafeGap = 52;
            const left = this.rowScrollLeft + Math.max(88, this.rowViewportWidth - rightSafeGap);
            return {
                left: `${Math.max(0, left)}px`,
                transform: 'translateX(-100%)'
            };
        },
        trackAssistStyle() {
            if (!this.showScrollAssist) return null;
            const viewport = Math.max(0, this.rowViewportWidth || 0);
            const cardWidth = Math.max(44, this.rowCardWidth || 68);
            const count = (this.cards || []).length;
            const base = Math.max(20, (viewport - cardWidth) / 2);
            // 旧模型对左侧补偿过重，导致最左卡初始明显偏右；改为更轻量的分段补偿。
            const sideComp = this.areaLabel ? 28 : 16;
            const densityStart = count >= 9 ? 12 : count >= 8 ? 8 : count >= 7 ? 5 : count >= 6 ? 3 : 1;
            const densityEnd = count >= 9 ? 10 : count >= 8 ? 8 : count >= 7 ? 6 : count >= 6 ? 4 : 2;
            const startPad = Math.max(20, base + sideComp + densityStart);
            const endPad = Math.max(20, base + densityEnd);
            return {
                justifyContent: 'flex-start',
                minWidth: 'max-content',
                paddingLeft: `${startPad}px`,
                paddingRight: `${endPad}px`
            };
        }
    },
    methods: {
        syncRowMetrics() {
            const rowEl = this.$refs.rowEl;
            if (!rowEl) return;
            this.rowScrollLeft = rowEl.scrollLeft || 0;
            this.rowViewportWidth = rowEl.clientWidth || 0;
            const firstCardEl = rowEl.querySelector('.battle-row-track .card-adaptive');
            if (firstCardEl?.getBoundingClientRect) {
                const rect = firstCardEl.getBoundingClientRect();
                if (rect.width > 0) this.rowCardWidth = rect.width;
            }
        },
        syncViewportFlags() {
            if (typeof window === 'undefined') return;
            this.isMobileViewport = window.matchMedia('(max-width: 640px)').matches;
        },
        startScrollAssist(clientX) {
            const rowEl = this.$refs.rowEl;
            if (!rowEl) return;
            this.assistDragging = true;
            this.assistStartX = clientX;
            this.assistStartScrollLeft = rowEl.scrollLeft || 0;
        },
        moveScrollAssist(clientX) {
            if (!this.assistDragging) return;
            const rowEl = this.$refs.rowEl;
            if (!rowEl) return;
            const maxScroll = Math.max(0, rowEl.scrollWidth - rowEl.clientWidth);
            if (maxScroll <= 0) return;

            // 把手按压点在把手轨道中的位置，直接映射到整段滚动范围。
            const rect = this.assistHandleRect || this.$refs.assistHandleEl?.getBoundingClientRect?.();
            if (rect && rect.width > 0) {
                const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
                rowEl.scrollLeft = ratio * maxScroll;
                return;
            }

            // 兜底：若无法获取轨道尺寸，使用增强的增量滚动。
            const deltaX = clientX - this.assistStartX;
            rowEl.scrollLeft = this.assistStartScrollLeft - (deltaX * 3.2);
        },
        endScrollAssist() {
            this.assistDragging = false;
            this.assistHandleRect = null;
        },
        onAssistTouchStart(e) {
            const touch = e.touches?.[0];
            if (!touch) return;
            this.assistHandleRect = e.currentTarget?.getBoundingClientRect?.() || null;
            this.startScrollAssist(touch.clientX);
        },
        onAssistTouchMove(e) {
            const touch = e.touches?.[0];
            if (!touch) return;
            this.moveScrollAssist(touch.clientX);
        },
        onAssistTouchEnd() {
            this.endScrollAssist();
        },
        onRowScroll() {
            this.syncRowMetrics();
        }
    },
    mounted() {
        this.syncViewportFlags();
        this.syncRowMetrics();
        window.addEventListener('resize', this.syncViewportFlags);
        window.addEventListener('resize', this.syncRowMetrics);
    },
    beforeUnmount() {
        window.removeEventListener('resize', this.syncViewportFlags);
        window.removeEventListener('resize', this.syncRowMetrics);
    },
    template: `
        <div :class="['battle-row row-scroll', rowClass, rowClasses]"
             ref="rowEl"
             :data-area="isEnemy ? null : area"
             @scroll.passive="onRowScroll"
               @dragover.prevent="!isEnemy ? onDragOver($event, area) : null"
             @dragleave="!isEnemy ? clearDraggingOver() : null"
             @drop="!isEnemy ? onDropArea(area) : null">
            <span v-if="areaLabel" class="area-label">{{ areaLabel }}</span>

            <div class="battle-row-track" :style="trackAssistStyle">
                <div v-for="card in cards"
                     :key="card.instanceId"
                     class="card-adaptive deployable-card"
                     :class="{
                         'is-mc-card': card.isMainCharacter,
                         'card-tapped': card.isTapped,
                         'attack-range-mark': isEnemy && attackRangeTargetIds.includes(String(card.instanceId)) && String(hoveredAttackTargetId) !== String(card.instanceId),
                         'attack-target-lift': isEnemy && String(hoveredAttackTargetId) === String(card.instanceId)
                     }"
                     draggable="true"
                     :data-enemy-id="isEnemy ? card.instanceId : null"
                     @dragstart="!isEnemy ? onDragStart(card, $event) : null"
                     @dragend="!isEnemy ? clearDraggingOver() : null"
                     @touchstart="!isEnemy ? onTouchStart($event, card, area || 'field') : null"
                     @touchmove="!isEnemy ? onTouchMove($event) : null"
                     @touchend="!isEnemy ? onTouchEnd($event, card) : null"
                     @dragover.prevent="isEnemy ? onDragOver($event, 'attack-target', card.instanceId) : null"
                     @dragleave="isEnemy ? clearDraggingOver() : null"
                     @drop.stop="isEnemy ? onAttackDrop(card) : null"
                     @click="onCardClick(card)">
                    <div v-if="card.isMainCharacter" class="mc-crown-marker">主</div>
                    <div v-if="card._stackedCards && card._stackedCards.length > 0"
                         class="stacked-badge">{{ card._stackedCards.length }}</div>
                    <img :src="card.image">
                </div>
            </div>

            <div v-if="showScrollAssist" class="row-scroll-assist-hint" :style="assistHintStyle">可左右滑动</div>
            <div v-if="showScrollAssist"
                 class="row-scroll-assist-handle"
                 :style="assistHandleStyle"
                 @touchstart.prevent.stop="onAssistTouchStart"
                 @touchmove.prevent.stop="onAssistTouchMove"
                 @touchend.prevent.stop="onAssistTouchEnd"
                 @touchcancel.prevent.stop="onAssistTouchEnd">
                <span class="handle-bar"></span>
            </div>
        </div>
    `
};