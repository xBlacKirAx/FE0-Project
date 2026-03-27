export const SpectatorInfoPanel = {
    props: {
        isSpectator: Boolean,
        roomId: {
            type: String,
            default: 'global'
        },
        latestSeq: {
            type: Number,
            default: 0
        },
        totalActions: {
            type: Number,
            default: 0
        },
        replayActions: {
            type: Array,
            default: () => []
        },
        replayPaused: Boolean,
        replayCursorSeq: {
            type: [Number, null],
            default: null
        },
        currentReplayAction: {
            type: Object,
            default: null
        },
        replayLastUpdatedAt: {
            type: Number,
            default: 0
        },
        onRefreshReplay: {
            type: Function,
            required: true
        },
        onToggleReplayPause: {
            type: Function,
            required: true
        },
        onReplayStepPrev: {
            type: Function,
            required: true
        },
        onReplayStepNext: {
            type: Function,
            required: true
        },
        onReplayJumpToSeq: {
            type: Function,
            required: true
        }
    },
    data() {
        return { jumpSeqInput: '' };
    },
    computed: {
        latestActions() {
            return this.replayActions.slice(-8).reverse();
        },
        updatedAtLabel() {
            if (!this.replayLastUpdatedAt) return '--:--:--';
            return new Date(this.replayLastUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false });
        },
        actionLabelMap() {
            return {
                'sync-attack': '攻击',
                'sync-defense-support': '防御支援',
                'sync-card-move': '移动',
                'player-draw': '抽牌',
                'sync-bond-flip': '羁绊翻面',
                'sync-card-untap': '回正',
                'sync-untap-all': '全体回正',
                'turn-end': '结束回合',
                'sync-dev-mode': '模式切换',
                'full-state-sync': '全量同步',
                'request-sync': '请求同步',
                'sync-reset': '重置'
            };
        },
        areaLabelMap() {
            return {
                hand: '手牌区',
                front: '前排',
                rear: '后排',
                bonds: '羁绊区',
                jewels: '宝玉区',
                graveyard: '弃牌区',
                deck: '牌组',
                boundless: '无限区'
            };
        }
    },
    methods: {
        actionLabel(type) {
            return this.actionLabelMap[type] || type;
        },
        areaLabel(areaName) {
            return this.areaLabelMap[areaName] || areaName || '未知区域';
        },
        actorLabel(action) {
            if (action?.actorRole === 'primary') return '我方';
            if (action?.actorRole === 'secondary') return '对方';
            return '旁观者';
        },
        cardName(card) {
            return card?.name || card?.cardName || card?.id || '未知卡牌';
        },
        actionDescription(action) {
            const type = action?.type;
            const payload = action?.payload || {};
            const actor = this.actorLabel(action);

            if (type === 'sync-card-move') {
                const name = this.cardName(payload.card);
                if (payload.to === 'bonds') return `${actor} 把 ${name} 放入 羁绊区`;
                if (payload.from === 'hand' && (payload.to === 'front' || payload.to === 'rear')) {
                    return `${actor} 让 ${name} 出击到 ${this.areaLabel(payload.to)}`;
                }
                return `${actor} 把 ${name} 从 ${this.areaLabel(payload.from)} 移动到 ${this.areaLabel(payload.to)}`;
            }

            if (type === 'player-draw') {
                const name = this.cardName(payload.card);
                return `${actor} 抽了 1 张牌（${name}）`;
            }

            if (type === 'sync-attack') {
                const attacker = this.cardName(payload.attacker);
                const defender = this.cardName(payload.defender);
                const myTotal = payload.myTotalPower || 0;
                const oppTotal = payload.oppTotalPower || 0;
                const result = myTotal >= oppTotal ? '击破' : '未击破';
                return `${actor} 用 ${attacker} 攻击 ${defender}（${myTotal}VS${oppTotal}）→ ${result}`;
            }

            if (type === 'sync-defense-support') {
                const support = this.cardName(payload.supportCard);
                const myTotal = payload.myTotalPower || 0;
                const oppTotal = payload.oppTotalPower || 0;
                const result = myTotal >= oppTotal ? '击破' : '未击破';
                return `${actor} 防御支援 ${support}（对方${myTotal}VS我方${oppTotal}）→ ${result}`;
            }

            if (type === 'sync-bond-flip') {
                return `${actor} ${payload.isFaceDown ? '盖放' : '翻开'}了 1 张羁绊`;
            }

            if (type === 'sync-untap-all') return `${actor} 进行了 全体回正`;
            if (type === 'sync-card-untap') return `${actor} 回正了 1 张单位`;
            if (type === 'turn-end') return `${actor} 结束了回合`;

            return `${actor} ${this.actionLabel(type)}`;
        },
        actionTime(ts) {
            if (!ts) return '--:--:--';
            return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
        },
        jumpToSeq() {
            this.onReplayJumpToSeq(this.jumpSeqInput);
            this.jumpSeqInput = '';
        }
    },
    template: `
        <div v-if="isSpectator" class="fixed right-2 sm:right-4 top-12 sm:top-14 z-[85] w-[220px] sm:w-[260px] rounded-lg border border-slate-500/40 bg-black/70 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-hidden">
            <div class="px-3 py-2 border-b border-slate-600/40 bg-slate-900/55 flex items-center justify-between">
                <div>
                    <div class="text-[10px] text-slate-300 font-semibold tracking-wide uppercase">Spectator</div>
                    <div class="text-[11px] text-amber-300 font-mono">房间: {{ roomId }}</div>
                </div>
                <button @click="onRefreshReplay()" class="text-[10px] px-2 py-1 rounded border border-slate-400/40 text-slate-200 hover:bg-slate-700/35">
                    刷新
                </button>
            </div>

            <div class="px-3 py-2 border-b border-slate-700/40 grid grid-cols-2 gap-2 text-[10px]">
                <div class="bg-slate-800/45 rounded px-2 py-1">
                    <div class="text-slate-400">Latest Seq</div>
                    <div class="text-sky-300 font-mono text-[11px]">{{ latestSeq }}</div>
                </div>
                <div class="bg-slate-800/45 rounded px-2 py-1">
                    <div class="text-slate-400">动作总数</div>
                    <div class="text-emerald-300 font-mono text-[11px]">{{ totalActions }}</div>
                </div>
            </div>

            <div class="px-3 py-2 border-b border-slate-700/40 space-y-2">
                <div class="flex items-center gap-1.5">
                    <button @click="onToggleReplayPause()" class="text-[10px] px-2 py-1 rounded border border-slate-400/40 text-slate-200 hover:bg-slate-700/35">
                        {{ replayPaused ? '继续直播' : '暂停回放' }}
                    </button>
                    <button @click="onReplayStepPrev()" class="text-[10px] px-2 py-1 rounded border border-slate-400/40 text-slate-200 hover:bg-slate-700/35">上一步</button>
                    <button @click="onReplayStepNext()" class="text-[10px] px-2 py-1 rounded border border-slate-400/40 text-slate-200 hover:bg-slate-700/35">下一步</button>
                </div>

                <div class="flex items-center gap-1.5">
                    <input v-model="jumpSeqInput" type="number" min="1" placeholder="跳到Seq" class="w-[84px] text-[10px] px-2 py-1 rounded bg-slate-900/70 border border-slate-600/50 text-slate-100 outline-none">
                    <button @click="jumpToSeq()" class="text-[10px] px-2 py-1 rounded border border-slate-400/40 text-slate-200 hover:bg-slate-700/35">跳转</button>
                    <span class="text-[10px] text-slate-400 font-mono">游标: {{ replayCursorSeq || '-' }}</span>
                </div>

                <div class="text-[10px] text-slate-400" v-if="currentReplayAction">
                    当前: #{{ currentReplayAction.seq }} · {{ actionLabel(currentReplayAction.type) }}
                </div>
            </div>

            <div class="max-h-[220px] overflow-y-auto">
                <div v-if="latestActions.length === 0" class="px-3 py-6 text-center text-[11px] text-slate-400">暂无动作日志</div>
                <div v-for="action in latestActions" :key="action.seq" class="px-3 py-1.5 border-b border-slate-700/30 text-[10px] leading-tight">
                    <div class="flex items-center justify-between">
                        <span class="text-slate-300 font-mono">#{{ action.seq }}</span>
                        <span class="text-slate-500">{{ actionTime(action.ts) }}</span>
                    </div>
                    <div class="text-rose-300">{{ actionDescription(action) }}</div>
                </div>
            </div>

            <div class="px-3 py-1.5 text-[10px] text-slate-500 bg-slate-900/45">更新于 {{ updatedAtLabel }}</div>
        </div>
    `
};
