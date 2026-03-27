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
                ? 'hud-strip hud-strip--enemy'
                : 'hud-strip hud-strip--player';
        }
    },
    template: `
        <div :class="containerClass">
            <button v-for="item in items"
                    :key="item.key"
                    @click="onOpenPanel(item.key)"
                    :class="['hud-tag', isEnemy ? 'hud-tag--enemy' : 'hud-tag--player']">
                <span class="hud-tag__label">{{ item.label }}</span>
                <span class="hud-tag__count">{{ item.count || 0 }}</span>
            </button>
        </div>
    `
};
