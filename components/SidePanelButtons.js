export const SidePanelButtons = {
    props: {
        mode: {
            type: String,
            default: 'player'
        },
        items: {
            type: Array,
            default: () => []
        },
        onOpenPanel: {
            type: Function,
            required: true
        }
    },
    computed: {
        isEnemy() {
            return this.mode === 'enemy';
        },
        containerClass() {
            return this.isEnemy
                ? 'fixed left-2 top-20 z-panel flex flex-col gap-3'
                : 'fixed right-2 top-24 z-[60] flex flex-col gap-2';
        }
    },
    template: `
        <div :class="containerClass">
            <div v-if="isEnemy" class="text-[8px] text-red-500 font-bold text-center uppercase opacity-50">Enemy</div>

            <button v-for="item in items"
                    :key="item.key"
                    @click="onOpenPanel(item.key)"
                    :class="item.className">
                <span>{{ item.label }}</span>
                <span :class="item.countClass">{{ item.count || 0 }}</span>
            </button>
        </div>
    `
};
