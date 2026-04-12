export const TopControlBar = {
    props: {
        isDevMode: Boolean,
        isMyTurn: Boolean,
        showDevModeToggle: {
            type: Boolean,
            default: true
        },
        onToggleDevMode: {
            type: Function,
            required: true
        },
        onResetGame: {
            type: Function,
            required: true
        },
        showResetButton: {
            type: Boolean,
            default: true
        },
        onOpenDeckManager: {
            type: Function,
            required: true
        },
        onRunAiDuel: {
            type: Function,
            required: true
        },
        onOpenAiReplay: {
            type: Function,
            required: true
        },
        onToggleAiReplayPanelHidden: {
            type: Function,
            required: true
        },
        onAiReplayPrev: {
            type: Function,
            required: true
        },
        onAiReplayNext: {
            type: Function,
            required: true
        },
        onExitAiReplayMode: {
            type: Function,
            required: true
        },
        showDeckManagerButton: {
            type: Boolean,
            default: true
        },
        showAiDuelButton: {
            type: Boolean,
            default: false
        },
        aiDuelPending: {
            type: Boolean,
            default: false
        },
        showAiReplayButton: {
            type: Boolean,
            default: false
        },
        showAiReplayPanelToggle: {
            type: Boolean,
            default: false
        },
        showAiReplayExitButton: {
            type: Boolean,
            default: false
        },
        aiReplayPanelHidden: {
            type: Boolean,
            default: false
        },
        showAiReplayStepButtons: {
            type: Boolean,
            default: false
        },
        canAiReplayPrev: {
            type: Boolean,
            default: false
        },
        canAiReplayNext: {
            type: Boolean,
            default: false
        },
        showAiReplayCurrentLine: {
            type: Boolean,
            default: false
        },
        aiReplayCurrentLine: {
            type: String,
            default: ''
        },
        showCostCounter: {
            type: Boolean,
            default: true
        },
        remainingCost: {
            type: Number,
            default: 0
        },
        totalBonds: {
            type: Number,
            default: 0
        },
        showTurnOwner: {
            type: Boolean,
            default: true
        },
        hasUndo: Boolean,
        undoDisabled: {
            type: Boolean,
            default: false
        },
        onUndo: {
            type: Function,
            required: true
        },
        phaseName: {
            type: String,
            default: ''
        },
        showPhaseName: {
            type: Boolean,
            default: true
        },
        showNextPhaseButton: Boolean,
        nextPhaseLabel: {
            type: String,
            default: 'NEXT'
        },
        onNextPhase: {
            type: Function,
            required: true
        },
        highlightNextPhase: {
            type: Boolean,
            default: false
        },
        roomStatusText: {
            type: String,
            default: '未加入房间'
        },
        showRoomStatusText: {
            type: Boolean,
            default: true
        },
        showCreateRoomButton: {
            type: Boolean,
            default: true
        },
        showJoinRoomButton: {
            type: Boolean,
            default: true
        },
        showQuickMatchButton: {
            type: Boolean,
            default: true
        },
        onCreateRoom: {
            type: Function,
            required: true
        },
        onJoinRoom: {
            type: Function,
            required: true
        },
        onQuickMatch: {
            type: Function,
            required: true
        },
        onLeaveRoom: {
            type: Function,
            required: true
        },
        showSurrenderButton: {
            type: Boolean,
            default: false
        },
        onSurrender: {
            type: Function,
            default: () => {}
        },
        showLeaveRoomButton: {
            type: Boolean,
            default: false
        },
        roomCanStart: {
            type: Boolean,
            default: false
        },
        showStartRoomButton: {
            type: Boolean,
            default: true
        },
        onStartRoomGame: {
            type: Function,
            required: true
        },
        showExportTutorialSnapshotButton: {
            type: Boolean,
            default: false
        },
        onExportTutorialSnapshot: {
            type: Function,
            default: () => {}
        }
    },
    methods: {
        handleUndoClick() {
            if (this.undoDisabled) {
                window.dispatchEvent(new CustomEvent('fe0:notice', {
                    detail: { message: '本回合已发生战斗，无法撤销。', duration: 2200 }
                }));
                return;
            }
            this.onUndo();
        },
        getReplayLineSizeClass() {
            const len = String(this.aiReplayCurrentLine || '').length;
            if (len > 120) return 'text-[7px]';
            if (len > 80) return 'text-[8px]';
            return 'text-[9px]';
        }
    },
    template: `
        <div :class="showAiReplayCurrentLine ? 'z-[260]' : 'z-[80]'"
             class="phase-control-bar pointer-events-auto w-full px-2 sm:px-4 py-1.5 flex justify-between sm:justify-center sm:gap-12 items-center bg-black/80 backdrop-blur-md border-b border-white/10">
            <div class="flex items-center gap-2 sm:gap-4 shrink-0">
                <div v-if="showDevModeToggle" @click="onToggleDevMode()" class="flex items-center gap-1.5 cursor-pointer">
                    <div :class="isDevMode ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]'" class="w-2 h-2 rounded-full"></div>
                    <span class="text-[9px] sm:text-[10px] font-mono font-bold">{{ isDevMode ? 'DEV' : 'PLAY' }}</span>
                </div>

                <div v-if="showDevModeToggle" class="w-[1px] h-3 bg-white/20"></div>

                <button v-if="showResetButton" @click="onResetGame()" class="bg-red-900/80 hover:bg-red-700 text-white text-[9px] px-1.5 py-1 rounded border border-red-500/50 uppercase">
                    重置
                </button>

                <button
                    v-if="showSurrenderButton"
                    type="button"
                    @click="onSurrender()"
                    class="bg-orange-950/90 hover:bg-orange-800 text-orange-100 text-[9px] px-1.5 py-1 rounded border border-orange-500/45">
                    投降
                </button>

                <button v-if="showDeckManagerButton" @click="onOpenDeckManager()" class="bg-cyan-900/80 hover:bg-cyan-700 text-white text-[9px] px-1.5 py-1 rounded border border-cyan-500/50 uppercase">
                    卡组
                </button>

                <button
                    v-if="showAiDuelButton"
                    @click="onRunAiDuel()"
                    :disabled="aiDuelPending"
                    :class="aiDuelPending ? 'bg-fuchsia-900/30 border-fuchsia-900/60 text-fuchsia-300/50 cursor-not-allowed' : 'bg-fuchsia-900/80 hover:bg-fuchsia-700 border-fuchsia-500/50 text-white'"
                    class="text-[9px] px-1.5 py-1 rounded border uppercase">
                    {{ aiDuelPending ? '对战中...' : 'AI对战' }}
                </button>

                <button
                    v-if="showAiReplayButton"
                    @click="onOpenAiReplay()"
                    class="bg-emerald-900/80 hover:bg-emerald-700 border-emerald-500/50 text-white text-[9px] px-1.5 py-1 rounded border uppercase">
                    AI回放
                </button>

                <button
                    v-if="showAiReplayPanelToggle"
                    @click="onToggleAiReplayPanelHidden()"
                    class="bg-teal-900/80 hover:bg-teal-700 border-teal-500/50 text-white text-[9px] px-1.5 py-1 rounded border uppercase">
                    {{ aiReplayPanelHidden ? '显示回放' : '隐藏回放' }}
                </button>

                <button
                    v-if="showAiReplayExitButton"
                    @click="onExitAiReplayMode()"
                    class="bg-rose-900/80 hover:bg-rose-700 border-rose-500/50 text-white text-[9px] px-1.5 py-1 rounded border uppercase">
                    退出回放
                </button>

                <button v-if="showCreateRoomButton" @click="onCreateRoom()" class="bg-indigo-900/80 hover:bg-indigo-700 text-white text-[9px] px-1.5 py-1 rounded border border-indigo-500/50 uppercase">
                    建房
                </button>

                <button v-if="showJoinRoomButton" @click="onJoinRoom()" class="bg-blue-900/80 hover:bg-blue-700 text-white text-[9px] px-1.5 py-1 rounded border border-blue-500/50 uppercase">
                    加入
                </button>

                <button v-if="showQuickMatchButton" @click="onQuickMatch()" class="bg-violet-900/80 hover:bg-violet-700 text-white text-[9px] px-1.5 py-1 rounded border border-violet-500/50 uppercase">
                    匹配
                </button>

                <button v-if="showLeaveRoomButton" @click="onLeaveRoom()" class="bg-slate-900/80 hover:bg-slate-700 text-white text-[9px] px-1.5 py-1 rounded border border-slate-500/50 uppercase">
                    离房
                </button>

                <button
                    v-if="showStartRoomButton"
                    @click="onStartRoomGame()"
                    :disabled="!roomCanStart"
                    :class="roomCanStart ? 'bg-emerald-900/80 hover:bg-emerald-700 border-emerald-500/50 text-white' : 'bg-emerald-900/30 border-emerald-900/60 text-emerald-300/50 cursor-not-allowed'"
                    class="text-[9px] px-1.5 py-1 rounded border uppercase">
                    开局
                </button>

                <button
                    v-if="showExportTutorialSnapshotButton"
                    type="button"
                    @click="onExportTutorialSnapshot()"
                    class="bg-amber-900/80 hover:bg-amber-700 border-amber-500/50 text-white text-[9px] px-1.5 py-1 rounded border uppercase"
                    title="导出当前局面为教学关 snapshot JSON">
                    导出快照
                </button>
            </div>

            <div class="flex items-center gap-2">
                <div v-if="showCostCounter" class="flex items-center gap-1 px-1.5 py-0.5 bg-green-900/40 border border-green-500/40 rounded shadow-inner min-w-[50px] justify-center">
                    <span class="text-[8px] text-green-200">COST</span>
                    <span class="text-[10px] sm:text-[11px] font-black text-green-400 font-mono">{{ remainingCost }}</span>
                    <span class="text-[9px] text-green-600 font-mono">/ {{ totalBonds }}</span>
                </div>

                <div v-if="showTurnOwner && !isDevMode"
                     :class="isMyTurn ? 'bg-green-900/60 border-green-500/60 text-green-300' : 'bg-red-900/60 border-red-500/60 text-red-300'"
                     class="px-1.5 py-0.5 border rounded text-[8px] font-bold whitespace-nowrap">
                    {{ isMyTurn ? '我方回合' : '对手回合' }}
                </div>

                <button v-if="hasUndo"
                    :title="undoDisabled ? '本回合已发生战斗，无法撤销' : '撤销上一步'"
                        @click="handleUndoClick()"
                        :class="undoDisabled ? 'bg-orange-900/50 text-orange-200/60 border-orange-800/60 cursor-not-allowed' : 'bg-orange-600/90 hover:bg-orange-500 text-white border-orange-400/50 active:scale-95'"
                        class="text-[9px] px-2 py-1 rounded shadow-md flex items-center gap-1 transition-transform">
                    <span>↩</span><span class="hidden sm:inline">撤销</span>
                </button>

                <div
                    v-if="showAiReplayCurrentLine"
                    :class="['max-w-[52vw] sm:max-w-[36vw] text-sky-100/90 px-2 py-1 rounded border border-sky-500/30 bg-slate-900/60 whitespace-normal break-all leading-3', getReplayLineSizeClass()]"
                    :title="aiReplayCurrentLine">
                    {{ aiReplayCurrentLine || '当前步无日志' }}
                </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
                <span v-if="showRoomStatusText" class="text-[9px] text-cyan-300 max-w-[110px] sm:max-w-[180px] truncate" :title="roomStatusText">{{ roomStatusText }}</span>
                <span v-if="showPhaseName" class="text-[9px] sm:text-[10px] font-bold text-amber-500 w-12 sm:w-16 text-center uppercase">{{ phaseName || 'BEGINNING' }}</span>

                <button v-if="showNextPhaseButton"
                        @click="onNextPhase()"
                        :class="highlightNextPhase ? 'next-phase-guide ring-2 ring-amber-300/80 shadow-[0_0_14px_rgba(251,191,36,0.55)]' : ''"
                        class="phase-btn px-2 py-1 text-[9px] sm:text-[10px] min-w-[45px]">
                    {{ nextPhaseLabel }}
                </button>
            </div>
        </div>
    `
};
