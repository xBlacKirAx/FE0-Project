export const AiReplayPanel = {
    props: {
        visible: Boolean,
        compact: {
            type: Boolean,
            default: false
        },
        loading: Boolean,
        replayLog: {
            type: Object,
            default: null
        },
        selectedGameIndex: {
            type: Number,
            default: 0
        },
        cursor: {
            type: Number,
            default: 0
        },
        onClose: {
            type: Function,
            required: true
        },
        onLoadLatest: {
            type: Function,
            required: true
        },
        onSelectGame: {
            type: Function,
            required: true
        },
        onStepPrev: {
            type: Function,
            required: true
        },
        onStepNext: {
            type: Function,
            required: true
        },
        onJumpTo: {
            type: Function,
            required: true
        }
    },
    data() {
        return {
            jumpInput: '',
            showFullLog: false,
        };
    },
    computed: {
        panelClass() {
            return this.compact
                ? 'fixed inset-x-2 top-12 bottom-2 z-[90] rounded-lg border border-fuchsia-500/40 bg-black/88 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.45)] overflow-hidden'
                : 'fixed right-2 sm:right-4 top-14 z-[90] w-[320px] max-h-[75vh] rounded-lg border border-fuchsia-500/40 bg-black/80 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.45)] overflow-hidden';
        },
        gameOptions() {
            return Array.isArray(this.replayLog?.games)
                ? this.replayLog.games.map((game, idx) => ({
                    idx,
                    label: `第${idx + 1}局 · 胜者: ${game.winner || 'draw'} · ${game.reason || ''}`
                }))
                : [];
        },
        currentGame() {
            if (!Array.isArray(this.replayLog?.games)) return null;
            return this.replayLog.games[this.selectedGameIndex] || null;
        },
        timelineLength() {
            return Array.isArray(this.currentGame?.timeline) ? this.currentGame.timeline.length : 0;
        },
        currentEvent() {
            const timeline = this.currentGame?.timeline || [];
            return timeline[this.cursor] || null;
        }
    },
    methods: {
        jump() {
            const parsed = Number.parseInt(this.jumpInput, 10);
            if (!Number.isFinite(parsed)) return;
            this.onJumpTo(parsed - 1);
            this.jumpInput = '';
        }
    },
    template: `
        <div v-if="visible" :class="panelClass">
            <div class="px-3 py-2 border-b border-fuchsia-700/40 flex items-center justify-between">
                <div>
                    <div class="text-[11px] text-fuchsia-200 font-bold">AI 对战回放</div>
                    <div class="text-[10px] text-fuchsia-300/80" v-if="replayLog">log: {{ replayLog.id }}</div>
                </div>
                <div class="flex items-center gap-1">
                    <button @click="onLoadLatest()" class="text-[10px] px-2 py-1 rounded border border-fuchsia-500/40 text-fuchsia-100 hover:bg-fuchsia-900/40">刷新</button>
                    <button @click="showFullLog = !showFullLog" class="text-[10px] px-2 py-1 rounded border border-fuchsia-500/40 text-fuchsia-100 hover:bg-fuchsia-900/40">完整日志</button>
                    <button @click="onClose()" class="text-[10px] px-2 py-1 rounded border border-slate-500/40 text-slate-100 hover:bg-slate-800/50">关闭</button>
                </div>
            </div>

            <div v-if="loading" class="px-3 py-5 text-[11px] text-slate-300 text-center">加载回放中...</div>
            <div v-else-if="!replayLog" class="px-3 py-5 text-[11px] text-slate-300 text-center">暂无回放日志</div>
            <div v-else class="p-3 space-y-2 text-[10px] h-full overflow-y-auto">
                <div class="text-slate-300">{{ replayLog.deckA }} vs {{ replayLog.deckB }}</div>
                <div class="text-slate-400">总局: {{ replayLog.totalGames }} · 创建于: {{ replayLog.createdAt }}</div>

                <select
                    class="w-full bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1 text-[10px] text-slate-100"
                    :value="selectedGameIndex"
                    @change="onSelectGame(Number($event.target.value))">
                    <option v-for="item in gameOptions" :key="item.idx" :value="item.idx">{{ item.label }}</option>
                </select>

                <div class="flex items-center gap-1.5 flex-wrap">
                    <button @click="onStepPrev()" class="text-[10px] px-2 py-1 rounded border border-slate-500/40 text-slate-100 hover:bg-slate-800/50">上一步</button>
                    <button @click="onStepNext()" class="text-[10px] px-2 py-1 rounded border border-slate-500/40 text-slate-100 hover:bg-slate-800/50">下一步</button>
                    <input v-model="jumpInput" type="number" min="1" placeholder="步数" class="w-[64px] bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1 text-[10px] text-slate-100">
                    <button @click="jump()" class="text-[10px] px-2 py-1 rounded border border-slate-500/40 text-slate-100 hover:bg-slate-800/50">跳转</button>
                </div>

                <div class="text-slate-300">当前: {{ cursor + 1 }} / {{ timelineLength }}</div>
                <div class="text-slate-400" v-if="currentEvent">回合: {{ currentEvent.turnLabel || ('T' + currentEvent.turn) }}</div>
                <div class="rounded border border-slate-700/50 bg-slate-900/55 px-2 py-2 min-h-[58px]">
                    <div class="text-[10px] text-slate-200 break-words leading-4" v-if="currentEvent">{{ currentEvent.line }}</div>
                    <div class="text-[10px] text-slate-500" v-else>当前步无事件</div>
                </div>

                <div v-if="showFullLog" class="absolute inset-0 bg-black/90 p-3 text-[10px] text-slate-200">
                    <div class="h-full overflow-y-auto" v-if="currentGame">
                        <div v-for="(event, index) in currentGame.timeline" :key="index"
                             class="leading-4 whitespace-pre-wrap"
                             :class="{ 'text-amber-300': index === cursor }">
                            {{ (index + 1) + ': ' + event.line }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
