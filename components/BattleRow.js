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
    computed: {
        rowClasses() {
            return {
                'guide-deploy-active': !this.isEnemy && this.isGuideActive,
                'dragging-over': !this.isEnemy && this.isDraggingOver
            };
        }
    },
    template: `
        <div :class="['battle-row row-scroll', rowClass, rowClasses]"
             :data-area="isEnemy ? null : area"
               @dragover.prevent="!isEnemy ? onDragOver($event, area) : null"
             @dragleave="!isEnemy ? clearDraggingOver() : null"
             @drop="!isEnemy ? onDropArea(area) : null">
            <span v-if="areaLabel" class="area-label">{{ areaLabel }}</span>

            <div class="battle-row-track">
                <div v-for="card in cards"
                     :key="card.instanceId"
                     class="card-adaptive deployable-card"
                     :class="{
                         'is-mc-card': card.isMainCharacter,
                         'card-tapped': card.isTapped,
                         'attack-target-highlight': isEnemy && String(hoveredAttackTargetId) === String(card.instanceId),
                         'attack-target-mc-highlight': isEnemy && card.isMainCharacter && String(hoveredAttackTargetId) === String(card.instanceId)
                     }"
                     draggable="true"
                     :data-enemy-id="isEnemy ? card.instanceId : null"
                     @dragstart="!isEnemy ? onDragStart(card) : null"
                     @dragend="!isEnemy ? clearDraggingOver() : null"
                     @touchstart="!isEnemy ? onTouchStart($event, card, area || 'field') : null"
                     @touchmove="!isEnemy ? onTouchMove($event) : null"
                     @touchend="!isEnemy ? onTouchEnd($event, card) : null"
                     @dragover.prevent="isEnemy ? onDragOver($event, 'attack-target', card.instanceId) : null"
                     @dragleave="isEnemy ? clearDraggingOver() : null"
                     @drop.stop="isEnemy ? onAttackDrop(card) : null"
                     @click="onCardClick(card)">
                    <div v-if="card.isMainCharacter" class="mc-crown-marker">主</div>
                    <img :src="card.image">
                </div>
            </div>
        </div>
    `
};