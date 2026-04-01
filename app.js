// app.js
import { createGameState } from './modules/state.js';
import { createRulesEngine } from './modules/rules.js';
import { createCardOperations } from './modules/cardOps.js';
import { createDragDropHandler } from './modules/dragDrop.js';
import { createTurnManager } from './modules/turnManagement.js';
import { createSocketHandler } from './modules/socketHandler.js';
import { createPanelViewModels } from './modules/viewModels.js';
import { formatAbility, formatSupport } from './modules/formatters.js';
import { createUiActions } from './modules/uiActions.js';
import {
    normalizeRoomPayload,
    deriveRoomRole,
    deriveRoomStatusText,
    didOpponentLeaveRoom,
    deriveRoomScene,
    deriveTopBarUi
} from './modules/roomUiState.js';
import { CombatOverlay } from './components/CombatOverlay.js';
import { RegionPanel } from './components/RegionPanel.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { BattleRow } from './components/BattleRow.js';
import { BondStrip } from './components/BondStrip.js';
import { HandStrip } from './components/HandStrip.js';
import { DeckWidget } from './components/DeckWidget.js';
import { SidePanelButtons } from './components/SidePanelButtons.js';
import { OppHandPanel } from './components/OppHandPanel.js';
import { OppDeckPanel } from './components/OppDeckPanel.js';
import { TopControlBar } from './components/TopControlBar.js';
import { DeckManagerModal } from './components/DeckManagerModal.js';
import { AiReplayPanel } from './components/AiReplayPanel.js';

const { createApp, computed, onMounted, watch, ref } = Vue;

const ROOM_CACHE_KEY = 'fe0.roomCache';
const FORCE_THEME = Object.freeze({
    '光之剑': { primary: '#3f1716', secondary: '#5a2220', accent: '#c08484' },
    '圣痕': { primary: '#18263f', secondary: '#22365a', accent: '#8fa9c7' },
    '白夜': { primary: '#3a3d44', secondary: '#525866', accent: '#b7bec9' },
    '暗夜': { primary: '#241a3f', secondary: '#34265a', accent: '#a79bc9' },
    '寻踪的纹章': { primary: '#1a3528', secondary: '#25503b', accent: '#8eb7a4' },
    '神器': { primary: '#301b3f', secondary: '#46285a', accent: '#b39bc9' },
    '圣战旗': { primary: '#4a3216', secondary: '#654622', accent: '#cdb086' },
    '女神纹章': { primary: '#4b2a1b', secondary: '#663b28', accent: '#c9a592' },
    default: { primary: '#2f1b1b', secondary: '#3d2531', accent: '#b99a84' }
});

function deriveThemeFromCards(cards = []) {
    const counts = new Map();
    for (const card of cards) {
        const force = String(card?.force || '').trim();
        if (!force) continue;
        counts.set(force, (counts.get(force) || 0) + 1);
    }
    const topForces = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([force]) => force);
    const first = FORCE_THEME[topForces[0]] || FORCE_THEME.default;
    const second = FORCE_THEME[topForces[1]] || first;
    return { first, second };
}

function saveRoomCache(cache) {
    try {
        localStorage.setItem(ROOM_CACHE_KEY, JSON.stringify(cache || {}));
    } catch {
        // ignore
    }
}

function loadRoomCache() {
    try {
        const raw = localStorage.getItem(ROOM_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

function clearRoomCache() {
    try {
        localStorage.removeItem(ROOM_CACHE_KEY);
    } catch {
        // ignore
    }
}

// 可选: 'theme1' (默认熔岩对峙), 'theme2' (金属桌垫)
const BATTLE_THEME = 'theme1';

createApp({
    components: {
        BattleRow,
        BondStrip,
        HandStrip,
        DeckWidget,
        SidePanelButtons,
        TopControlBar,
        DeckManagerModal,
        CombatOverlay,
        RegionPanel,
        CardDetailModal,
        OppHandPanel,
        OppDeckPanel,
        AiReplayPanel,
    },
    setup() {
        const state = createGameState();
        const rules = createRulesEngine(state);
        // 👇 加上 rules 参数，让 cardOps 也能使用规则引擎！
        const cardOps = createCardOperations(state, rules); 
        const dragDrop = createDragDropHandler(state, cardOps, rules)
        const turnMgr = createTurnManager(state, cardOps);
        const socketHandler = createSocketHandler(state, cardOps);
        const EVT = globalThis.SOCKET_EVENTS || {};

        const isMyCard = (card) => !!cardOps.getArea(card);
        const isCardInHand = (card) => state.hand.value.some(c => c.instanceId === card.instanceId);
        const formattedAbility = formatAbility;
        const formattedSupport = formatSupport;

        const {
            activePanelTitle,
            activePanelCards,
            isOpponentPanel,
            playerPanelButtons,
            enemyPanelButtons
        } = createPanelViewModels(state, computed);
        const remainingCost = computed(() => Math.max(0, (state.bonds.value?.length || 0) - (state.usedBondsThisTurn.value || 0)));
        const totalBonds = computed(() => state.bonds.value?.length || 0);
        const currentPhaseName = computed(() => state.PHASES?.[state.currentPhase.value]?.name || state.currentPhase.value || '');
        const showNextPhaseButton = computed(() =>
            state.isDevMode.value || (state.isMyTurn.value && (state.currentPhase.value || 'BEGINNING') !== 'BEGINNING')
        );
        const nextPhaseLabel = computed(() => (state.currentPhase.value || 'BEGINNING') === 'END' ? '结束' : 'NEXT');
        const hasDeployableOrClassChangeCard = computed(() => {
            const handCards = Array.isArray(state.hand.value) ? state.hand.value : [];
            return handCards.some((card) => {
                if (rules.canDeployCard(card)?.valid) return true;
                const cc = rules.canPerformClassChange(card);
                return !!cc?.valid;
            });
        });
        const noActionableAttacker = computed(() => {
            const myUnits = [...(state.fieldFront.value || []), ...(state.fieldRear.value || [])];
            const untapped = myUnits.filter(card => !card?.isTapped);
            if (!untapped.length) return true;
            const enemies = [...(state.opponentFront.value || []), ...(state.opponentRear.value || [])];
            if (!enemies.length) return true;
            return !untapped.some(attacker =>
                enemies.some(defender => rules.canAttackTargetByRange(attacker, defender)?.valid)
            );
        });
        const highlightNextPhase = computed(() => {
            if (!showNextPhaseButton.value || state.isDevMode.value || !state.isMyTurn.value) return false;
            if (state.currentPhase.value === 'DEPLOY') {
                return remainingCost.value <= 0 || !hasDeployableOrClassChangeCard.value;
            }
            if (state.currentPhase.value === 'ATTACK') {
                if (state.firstPlayerOpeningTurnLocked?.value) return true;
                return noActionableAttacker.value;
            }
            return false;
        });
        const isMyCombatAttacker = computed(() => ['fieldFront', 'fieldRear'].some(area =>
            state[area].value.some(card => card.instanceId === state.attacker.value?.instanceId)
        ));
        const selectedCombatCostCardId = ref(null);
        const selectedCombatCostCardName = ref('');
        const showDeckManager = ref(false);
        const isAiDuelPending = ref(false);
        const showAiDuelSetup = ref(false);
        const isAiDuelRunning = ref(false);
        const aiDuelLogHtml = ref('');
        const aiDuelOptions = ref({ authors: [], decks: [] });
        const aiDuelSetup = ref({
            author1: 'gemini', deckId1: '',
            author2: 'gemini', deckId2: ''
        });
        const showAiReplayPanel = ref(false);
        const isAiReplayPanelHidden = ref(false);
        const isAiReplayLoading = ref(false);
        const aiReplayLog = ref(null);
        const aiReplayGameIndex = ref(0);
        const aiReplayCursor = ref(0);
        const replayCardCatalog = ref(new Map());
        const currentAiReplayTimelineLength = computed(() => {
            const games = Array.isArray(aiReplayLog.value?.games) ? aiReplayLog.value.games : [];
            const game = games[aiReplayGameIndex.value] || null;
            const timeline = Array.isArray(game?.timeline) ? game.timeline : [];
            return timeline.length;
        });
        const canStepAiReplayPrev = computed(() => aiReplayCursor.value > 0 && currentAiReplayTimelineLength.value > 0);
        const canStepAiReplayNext = computed(() => aiReplayCursor.value < currentAiReplayTimelineLength.value - 1);
        const currentAiReplayEventLine = computed(() => {
            const game = getCurrentReplayGame();
            const timeline = Array.isArray(game?.timeline) ? game.timeline : [];
            const event = timeline[aiReplayCursor.value] || null;
            return String(event?.line || '').trim();
        });
        const showAiReplayStepButtons = computed(() =>
            state.isDevMode.value
            && showAiReplayPanel.value
            && currentAiReplayTimelineLength.value > 0
        );
        const showAiReplayPanelVisible = computed(() => showAiReplayPanel.value && !isAiReplayPanelHidden.value);
        const isCompactMobile = ref(false);
        const aiReplayNavigatorPosition = ref({ x: 12, y: 64 });
        const aiReplayNavigatorInitialized = ref(false);
        const aiReplayNavigatorDrag = ref({
            active: false,
            pointerId: null,
            offsetX: 0,
            offsetY: 0
        });
        const aiReplayNavigatorStyle = computed(() => ({
            left: `${aiReplayNavigatorPosition.value.x}px`,
            top: `${aiReplayNavigatorPosition.value.y}px`
        }));
        const cachedRoomPassword = ref('');
        const startRoomButtonConsumed = ref(false);
        const isHandlingRoomGameStart = ref(false);
        const lastHandledRoomGameStartTs = ref(0);
        const hasShownMulliganWaitNotice = ref(false);
        const hasShownFirstPlayerNoDrawNotice = ref(false);
        const roomMulliganDone = ref(false);
        const roomFlowNotice = ref('');
        let roomFlowNoticeTimer = null;
        const phaseBeforeDevMode = ref(state.currentPhase.value || 'BEGINNING');
        const canStartRoomGame = computed(() => !!state.roomId.value && state.roomReady.value);
        const roomScene = computed(() => deriveRoomScene({
            connectionScene: state.connectionScene.value,
            roomId: state.roomId.value,
            roomQueueing: state.roomQueueing.value,
            roomReady: state.roomReady.value,
            roomGameInProgress: state.roomGameInProgress.value
        }));
        const showBattleUi = computed(() => roomScene.value === 'in-game');
        const showDeckDrawGuide = computed(() =>
            showBattleUi.value
            && state.isMyTurn.value
            && state.currentPhase.value === 'BEGINNING'
            && !state.firstPlayerOpeningTurnLocked.value
            && !state.isDevMode.value
        );
        const topBarUi = computed(() => deriveTopBarUi({
            roomScene: roomScene.value,
            roomGameInProgress: state.roomGameInProgress.value,
            showNextPhaseButton: showNextPhaseButton.value,
            startRoomButtonConsumed: startRoomButtonConsumed.value,
            isCompactMobile: isCompactMobile.value
        }));
        const playerDisplayName = ref('');
        const playerDisplayNameInput = ref('');
        const isEditingPlayerDisplayName = ref(false);
        const entryDeckPreview = ref({ deckName: '', protagonistCharaName: '', cards: [] });
        const entryDeckPreviewMode = ref('all');
        const entryPreviewSelectedCard = ref(null);
        const entryTheme = computed(() => deriveThemeFromCards(entryDeckPreview.value?.cards || []));
        const entryThemeStyle = computed(() => ({
            background: `linear-gradient(180deg, ${entryTheme.value.first.primary}99 0%, ${entryTheme.value.second.primary}66 55%, transparent 100%)`
        }));
        const entryPanelStyle = computed(() => ({
            background: `linear-gradient(180deg, ${entryTheme.value.first.secondary}55 0%, ${entryTheme.value.second.primary}44 60%, transparent 100%)`
        }));
        const entryTabActiveStyle = computed(() => ({
            borderColor: `${entryTheme.value.first.accent}99`,
            color: '#fef3c7',
            background: `${entryTheme.value.first.primary}66`
        }));
        const entryTabInactiveStyle = computed(() => ({
            borderColor: `${entryTheme.value.second.accent}55`,
            color: '#fecdd3',
            background: '#24121488'
        }));
        const entryDeckPreviewSections = computed(() => {
            const cards = Array.isArray(entryDeckPreview.value?.cards) ? entryDeckPreview.value.cards : [];
            const cardMap = new Map();
            for (const card of cards) {
                const key = String(card?.id || card?.cardId || card?.cardName || card?.name || '');
                if (!key) continue;
                if (!cardMap.has(key)) {
                    cardMap.set(key, {
                        ...card,
                        _entryCount: 1
                    });
                    continue;
                }
                const existing = cardMap.get(key);
                existing._entryCount = Number(existing._entryCount || 1) + 1;
            }
            const uniqueCards = [...cardMap.values()];
            const protagonist = String(entryDeckPreview.value?.protagonistCharaName || '').trim();

            if (entryDeckPreviewMode.value === 'protagonist') {
                const filtered = protagonist
                    ? uniqueCards.filter(card => String(card?.charaName || '').trim() === protagonist)
                    : [];
                return [{ key: 'protagonist', title: protagonist ? `主人公线：${protagonist}` : '未设置主人公', cards: filtered }];
            }

            if (entryDeckPreviewMode.value === 'cost') {
                const groups = new Map();
                for (const card of uniqueCards) {
                    const cost = Number.parseInt(card?.cost, 10);
                    const key = Number.isFinite(cost) ? String(cost) : '未知';
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(card);
                }
                return [...groups.entries()]
                    .sort((a, b) => {
                        if (a[0] === '未知') return 1;
                        if (b[0] === '未知') return -1;
                        return Number(a[0]) - Number(b[0]);
                    })
                    .map(([key, groupedCards]) => ({
                        key: `cost-${key}`,
                        title: `费用 ${key}`,
                        cards: groupedCards
                    }));
            }

            if (entryDeckPreviewMode.value === 'force') {
                const groups = new Map();
                for (const card of uniqueCards) {
                    const key = String(card?.force || '未知势力').trim() || '未知势力';
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(card);
                }
                return [...groups.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
                    .map(([key, groupedCards]) => ({
                        key: `force-${key}`,
                        title: `势力 ${key}`,
                        cards: groupedCards
                    }));
            }

            return [{ key: 'all', title: '全部卡牌', cards: uniqueCards }];
        });

        const getCardCharaName = (card) => {
            const direct = (card?.charaName || '').trim();
            if (direct) return direct;
            const fullName = (card?.cardName || card?.name || '').trim();
            if (!fullName) return '';
            const idx = fullName.search(/\s/);
            if (idx > -1) {
                const derived = fullName.slice(idx).trim();
                if (derived) return derived;
            }
            return fullName;
        };

        const showRoomFlowNotice = (message, duration = 2200) => {
            roomFlowNotice.value = String(message || '').trim();
            if (roomFlowNoticeTimer) clearTimeout(roomFlowNoticeTimer);
            if (!duration || duration <= 0) {
                roomFlowNoticeTimer = null;
                return;
            }
            roomFlowNoticeTimer = setTimeout(() => {
                roomFlowNotice.value = '';
                roomFlowNoticeTimer = null;
            }, duration);
        };

        const ensureOpeningHandVisible = () => {
            if ((state.hand.value?.length || 0) > 0) return;
            const toDraw = Math.min(6, state.deck.value?.length || 0);
            for (let i = 0; i < toDraw; i++) {
                const card = state.deck.value.pop();
                if (!card) break;
                card.isFaceDown = false;
                state.hand.value.push(card);
            }
        };
        const finalizeMulliganIfReady = (firstPlayerId) => {
            if (roomMulliganDone.value) return;
            roomMulliganDone.value = true;
            state.opponentMulliganState.value = 'done';
            const iAmFirstPlayer = !!firstPlayerId && String(firstPlayerId) === String(state.socket.id);
            if (iAmFirstPlayer && !hasShownFirstPlayerNoDrawNotice.value) {
                state.currentPhase.value = 'BEGINNING';
                showRoomFlowNotice('双方调度完成。你为先攻，先攻第一回合无法抽卡，直接进入羁绊阶段。', 2800);
                state.currentPhase.value = 'BOND';
                state.hasPlacedBond.value = false;
                if (EVT.SYNC_PHASE) {
                    state.socket.emit(EVT.SYNC_PHASE, {
                        phase: 'BOND',
                        phaseName: state.PHASES?.BOND?.name || 'BOND'
                    });
                }
                hasShownFirstPlayerNoDrawNotice.value = true;
                return;
            }
            if (!iAmFirstPlayer) {
                state.currentPhase.value = 'MULLIGAN';
                showRoomFlowNotice('双方调度完成。等待先攻玩家行动。', 2200);
            }
        };

        const getDefaultPlayerDisplayName = () => {
            const seed = Math.random().toString(36).slice(2, 8).toUpperCase();
            return `玩家${seed}`;
        };

        const getIdentityPasswordMap = () => {
            try {
                const raw = localStorage.getItem('fe0.identityPasswordMap');
                const parsed = raw ? JSON.parse(raw) : {};
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            } catch {
                return {};
            }
        };

        const setIdentityPassword = (username, password) => {
            const key = String(username || '').trim();
            if (!key) return;
            const map = getIdentityPasswordMap();
            map[key] = String(password || '');
            localStorage.setItem('fe0.identityPasswordMap', JSON.stringify(map));
        };

        const getIdentityPassword = (username) => {
            const key = String(username || '').trim();
            if (!key) return '';
            const map = getIdentityPasswordMap();
            return String(map[key] || '');
        };

        const logoutAndClearIdentityData = async () => {
            const ok = window.confirm('确认登出并清除本地身份数据？将重置用户名与本地口令选择。');
            if (!ok) return;
            localStorage.removeItem('fe0.playerDisplayName');
            localStorage.removeItem('fe0.selectedDeckId');
            localStorage.removeItem('fe0.selectedDeckPassword');
            localStorage.removeItem('fe0.identityPasswordMap');
            loadPlayerDisplayName();
            await loadEntryDeckPreview();
            alert('已登出，并清除本地身份数据。');
        };

        const loadPlayerDisplayName = () => {
            const saved = String(localStorage.getItem('fe0.playerDisplayName') || '').trim();
            const nextName = saved || getDefaultPlayerDisplayName();
            playerDisplayName.value = nextName;
            playerDisplayNameInput.value = nextName;
            if (!saved) localStorage.setItem('fe0.playerDisplayName', nextName);
            const accessPassword = getIdentityPassword(nextName);
            const query = accessPassword
                ? `?password=${encodeURIComponent(nextName)}&accessPassword=${encodeURIComponent(accessPassword)}`
                : `?password=${encodeURIComponent(nextName)}`;
            fetch(`/api/decks/hidden${query}`).catch(() => {});
        };

        const startEditPlayerDisplayName = () => {
            playerDisplayNameInput.value = playerDisplayName.value;
            isEditingPlayerDisplayName.value = true;
        };

        const savePlayerDisplayName = async () => {
            const previousName = String(playerDisplayName.value || '').trim();
            const next = String(playerDisplayNameInput.value || '').trim();
            const finalName = next || getDefaultPlayerDisplayName();
            let verifiedPassword = '';
            if (previousName && previousName !== finalName) {
                const password = window.prompt('请输入该用户名对应密码：');
                if (password === null) return;
                if (!String(password).trim()) {
                    alert('密码不能为空。');
                    return;
                }
                const passwordConfirm = window.prompt('请再次输入密码确认：');
                if (passwordConfirm === null) return;
                if (String(passwordConfirm) !== String(password)) {
                    alert('两次输入的密码不一致。');
                    return;
                }
                try {
                    const response = await fetch('/api/decks/identity/switch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            oldUsername: previousName,
                            newUsername: finalName,
                            password: String(password)
                        })
                    });
                    const rawText = await response.text().catch(() => '');
                    let payload = {};
                    try {
                        payload = rawText ? JSON.parse(rawText) : {};
                    } catch {
                        payload = { message: rawText.slice(0, 120) || '服务返回非 JSON，可能未重启到最新版本。' };
                    }
                    if (!response.ok) {
                        alert(payload?.message || '用户名切换失败。');
                        return;
                    }
                    setIdentityPassword(finalName, password);
                    verifiedPassword = String(password);
                } catch {
                    alert('用户名切换失败，请稍后重试。');
                    return;
                }
            }
            playerDisplayName.value = finalName;
            playerDisplayNameInput.value = finalName;
            const currentSelectedDeckPassword = String(localStorage.getItem('fe0.selectedDeckPassword') || '').trim();
            localStorage.setItem('fe0.playerDisplayName', finalName);
            if (currentSelectedDeckPassword) {
                localStorage.setItem('fe0.selectedDeckPassword', finalName);
            } else {
                localStorage.removeItem('fe0.selectedDeckPassword');
            }
            window.dispatchEvent(new CustomEvent('fe0:player-name-updated', { detail: { playerName: finalName, password: verifiedPassword } }));
            if (EVT.PLAYER_SET_NAME) {
                state.socket.emit(EVT.PLAYER_SET_NAME, { playerName: finalName });
            }
            isEditingPlayerDisplayName.value = false;
            await loadEntryDeckPreview();
        };

        const cancelEditPlayerDisplayName = () => {
            playerDisplayNameInput.value = playerDisplayName.value;
            isEditingPlayerDisplayName.value = false;
        };

        const loadEntryDeckPreview = async () => {
            const selectedDeckId = String(localStorage.getItem('fe0.selectedDeckId') || '').trim();
            const selectedDeckPassword = String(localStorage.getItem('fe0.selectedDeckPassword') || '').trim();
            if (!selectedDeckId) {
                entryDeckPreview.value = { deckName: '未选择卡组', protagonistCharaName: '', cards: [] };
                return;
            }
            try {
                const accessPassword = getIdentityPassword(selectedDeckPassword);
                const query = selectedDeckPassword
                    ? `?password=${encodeURIComponent(selectedDeckPassword)}${accessPassword ? `&accessPassword=${encodeURIComponent(accessPassword)}` : ''}`
                    : '';
                const response = await fetch(`/api/decks/${encodeURIComponent(selectedDeckId)}/expanded-cards${query}`);
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    entryDeckPreview.value = { deckName: payload?.message || '卡组加载失败', protagonistCharaName: '', cards: [] };
                    return;
                }
                entryDeckPreview.value = {
                    deckName: String(payload?.deckName || '当前卡组'),
                    protagonistCharaName: String(payload?.protagonistCharaName || '').trim(),
                    cards: Array.isArray(payload?.cards) ? payload.cards : []
                };
            } catch {
                entryDeckPreview.value = { deckName: '卡组加载失败', protagonistCharaName: '', cards: [] };
            }
        };
        const openEntryPreviewCardDetail = (card) => {
            entryPreviewSelectedCard.value = card || null;
        };
        const closeEntryPreviewCardDetail = () => {
            entryPreviewSelectedCard.value = null;
        };
        const getEntryCardAbilityText = (card) => {
            if (!card) return '';
            if (typeof card.ability === 'string') return card.ability;
            const direct = String(card.ability?.text || '').trim();
            if (direct) return direct;
            const entries = Array.isArray(card.ability?.entries) ? card.ability.entries : [];
            if (!entries.length) return '';
            return entries
                .map((entry) => {
                    const title = String(entry?.title || '').trim();
                    const type = String(entry?.type || '').trim();
                    const effect = String(entry?.effectText || entry?.rawText || '').trim();
                    const head = `${title ? `『${title}』` : ''}${type}`.trim();
                    return `${head}${head && effect ? ' ' : ''}${effect}`.trim();
                })
                .filter(Boolean)
                .join('\n');
        };
        const getEntryCardSupportText = (card) => {
            if (!card) return '';
            if (typeof card.supportAbility === 'string') return card.supportAbility;
            const direct = String(card.supportAbility?.text || '').trim();
            if (direct) return direct;
            const effectName = String(card.supportAbility?.effectName || '').trim();
            const effectText = String(card.supportAbility?.effectText || '').trim();
            return `${effectName ? `『${effectName}』` : ''}${effectText ? (effectName ? ' ' : '') + effectText : ''}`.trim();
        };

        const isLocalDecisionActor = computed(() => {
            const owner = state.combatDecision.value?.promptOwner;
            if (!owner) return false;
            return (owner === 'attacker' && isMyCombatAttacker.value) || (owner === 'defender' && !isMyCombatAttacker.value);
        });

        const requiredCombatCharaName = computed(() => {
            const stage = state.combatDecision.value?.stage;
            if (stage === 'awaiting-attacker-critical') return getCardCharaName(state.attacker.value);
            if (stage === 'awaiting-defender-evasion' || stage === 'awaiting-defender-evasion-after-critical') return getCardCharaName(state.defender.value);
            return '';
        });

        const combatCostCandidates = computed(() => {
            if (!isLocalDecisionActor.value) return [];
            const required = requiredCombatCharaName.value;
            if (!required) return [];
            return state.hand.value.filter(card => getCardCharaName(card) === required);
        });

        const selectedCombatCostCard = computed(() =>
            combatCostCandidates.value.find(card => card.instanceId === selectedCombatCostCardId.value) || null
        );

        const resolvedPanelTitle = computed(() => {
            if (state.activePanel.value === 'combatCostHand') {
                return `战斗代价选择（角色名：${requiredCombatCharaName.value || '未知'}）`;
            }
            if (state.activePanel.value === 'supportMagicDiscardHand') {
                return '魔术之纹章：选择1张手牌弃置';
            }
            if (state.activePanel.value === 'supportCourageTopdeckHand') {
                return '勇气之纹章：选择1张手牌放回牌组顶';
            }
            if (state.activePanel.value === 'supportManaketeHandToBond') {
                return '龙人之纹章：选择1张手牌置入羁绊区';
            }
            if (state.activePanel.value === 'supportDarkSelfDiscardHand') {
                return '黑暗之纹章：选择1张手牌弃置';
            }
            if (state.activePanel.value === 'supportSkyMoveCandidates') {
                return '天空之纹章：选择1名我方单位移动';
            }
            if (state.activePanel.value === 'supportDanceUntapCandidates') {
                return '歌舞之纹章：选择1名出击费用2以下的我方单位';
            }
            if (state.activePanel.value === 'supportPeekOwnJewel') {
                return '光明/希望之纹章：选择1张宝玉查看正面';
            }
            if (state.activePanel.value === 'supportMainCharacterJewelSelect') {
                const remaining = state.supportInteraction.value?.remainingCount || 1;
                return `主人公被击破：选择1张宝玉加入手牌（剩余${remaining}张）`;
            }
            if (state.activePanel.value === 'supportStrategyTargetEnemy') {
                return '计略之纹章：选择1名敌方单位移动';
            }
            if (state.activePanel.value === 'supportNinjutsuHandToGrave') {
                return '忍术之纹章：选择1张手牌放置到退避区';
            }
            if (state.activePanel.value === 'supportDespairZombieCandidates') {
                return '绝望之纹章：选择1张尸兵出击';
            }
            if (state.activePanel.value === 'supportMoveAttackerPostBattleCandidates') {
                return '援护之纹章：点击攻击单位执行移动';
            }
            return activePanelTitle.value;
        });

        const resolvedPanelCards = computed(() => {
            if (state.activePanel.value === 'combatCostHand') {
                return combatCostCandidates.value;
            }
            if (state.activePanel.value === 'supportMagicDiscardHand') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportCourageTopdeckHand') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportManaketeHandToBond') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportDarkSelfDiscardHand') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportSkyMoveCandidates') {
                const excludedId = state.supportInteraction.value?.excludedId;
                return [...state.fieldFront.value, ...state.fieldRear.value].filter(card => String(card.instanceId) !== String(excludedId));
            }
            if (state.activePanel.value === 'supportDanceUntapCandidates') {
                const excludedId = state.supportInteraction.value?.excludedId;
                return [...state.fieldFront.value, ...state.fieldRear.value].filter(card => {
                    if (String(card.instanceId) === String(excludedId)) return false;
                    return (parseInt(card.cost, 10) || 0) <= 2;
                });
            }
            if (state.activePanel.value === 'supportPeekOwnJewel') {
                return state.jewels.value;
            }
            if (state.activePanel.value === 'supportMainCharacterJewelSelect') {
                return state.jewels.value;
            }
            if (state.activePanel.value === 'supportStrategyTargetEnemy') {
                const excludedId = state.supportInteraction.value?.excludedId;
                return [...state.opponentFront.value, ...state.opponentRear.value].filter(card => String(card.instanceId) !== String(excludedId));
            }
            if (state.activePanel.value === 'supportNinjutsuHandToGrave') {
                return state.hand.value;
            }
            if (state.activePanel.value === 'supportDespairZombieCandidates') {
                return state.supportInteraction.value?.candidates || [];
            }
            if (state.activePanel.value === 'supportMoveAttackerPostBattleCandidates') {
                const attackerId = state.supportInteraction.value?.attackerId;
                if (!attackerId) return [];
                return [...state.fieldFront.value, ...state.fieldRear.value].filter(card => String(card.instanceId) === String(attackerId));
            }
            return activePanelCards.value;
        });

        const resolvedIsOpponentPanel = computed(() => {
            if (state.activePanel.value === 'supportStrategyTargetEnemy') {
                return true;
            }
            return isOpponentPanel.value;
        });

        const closeActivePanel = () => {
            state.activePanel.value = null;
        };

        const openCombatCostPicker = () => {
            state.activePanel.value = 'combatCostHand';
        };

        const closeSelectedCard = () => {
            state.selectedCard.value = null;
        };

        const selectedCardActivatableAbilities = computed(() => {
            const card = state.selectedCard.value;
            if (!card || !cardOps.getActivatableUnitAbilities) return [];
            return cardOps.getActivatableUnitAbilities(card).filter(item => item.canActivate).slice(0, 4);
        });

        const selectedCardAbilityPrimaryLabel = computed(() =>
            selectedCardActivatableAbilities.value[0] ? `发动能力：${selectedCardActivatableAbilities.value[0].title}` : ''
        );
        const selectedCardAbilitySecondaryLabel = computed(() =>
            selectedCardActivatableAbilities.value[1] ? `发动能力：${selectedCardActivatableAbilities.value[1].title}` : ''
        );
        const selectedCardAbilityTertiaryLabel = computed(() =>
            selectedCardActivatableAbilities.value[2] ? `发动能力：${selectedCardActivatableAbilities.value[2].title}` : ''
        );
        const selectedCardAbilityQuaternaryLabel = computed(() =>
            selectedCardActivatableAbilities.value[3] ? `发动能力：${selectedCardActivatableAbilities.value[3].title}` : ''
        );

        const activateSelectedCardAbilityByIndex = (index) => {
            const card = state.selectedCard.value;
            const ability = selectedCardActivatableAbilities.value[index] || null;
            if (!card || !ability || !cardOps.activateUnitAbility) return;
            const ok = cardOps.activateUnitAbility(card, ability.title);
            if (!ok) {
                showRoomFlowNotice('能力发动失败：费用不足或条件不满足。', 2400);
            }
        };

        const openFullImage = () => {
            state.showFullImage.value = true;
        };

        const openPanel = (panelKey) => {
            state.activePanel.value = panelKey;
        };

        const toggleDevMode = () => {
            const nextIsDevMode = !state.isDevMode.value;
            const currentPhaseSnapshot = state.currentPhase.value || 'BEGINNING';

            if (nextIsDevMode) {
                phaseBeforeDevMode.value = currentPhaseSnapshot;
            }

            state.isDevMode.value = nextIsDevMode;

            const resumePhase = nextIsDevMode
                ? currentPhaseSnapshot
                : (phaseBeforeDevMode.value || currentPhaseSnapshot || 'BEGINNING');
            const openingTurnLocked = !nextIsDevMode;

            // 切到 PLAY 时，由切换者拥有当前回合；对手会被同步为非回合方。
            if (!nextIsDevMode) {
                state.isMyTurn.value = true;
                state.currentPhase.value = resumePhase;
                state.hasPlacedBond.value = false;
                state.usedBondsThisTurn.value = 0;
                state.firstPlayerOpeningTurnLocked.value = openingTurnLocked;
            } else {
                state.firstPlayerOpeningTurnLocked.value = false;
            }

            state.socket.emit('sync-dev-mode', {
                isDevMode: nextIsDevMode,
                turnOwner: !nextIsDevMode ? 'sender' : null,
                phase: resumePhase,
                openingTurnLocked
            });
        };

        const updateRoomState = (payload = {}) => {
            const prevRoomState = {
                roomId: String(state.roomId.value || ''),
                playerCount: Number(state.roomPlayerCount.value || 0),
                ready: !!state.roomReady.value
            };
            const nextRoomState = normalizeRoomPayload(payload);

            state.roomId.value = nextRoomState.roomId;
            state.roomPlayerCount.value = nextRoomState.playerCount;
            state.roomQueueing.value = nextRoomState.queueing;
            state.roomReady.value = nextRoomState.ready;
            state.roomGameInProgress.value = !!nextRoomState.gameInProgress;
            state.roomIsPrivate.value = nextRoomState.isPrivate;
            if (!nextRoomState.roomId) {
                state.roomGameInProgress.value = false;
            } else if (state.connectionScene.value === 'recovering') {
                state.connectionScene.value = 'connected';
            }

            if (!prevRoomState.roomId && nextRoomState.roomId) {
                startRoomButtonConsumed.value = false;
            }
            if (nextRoomState.ready && !prevRoomState.ready) {
                startRoomButtonConsumed.value = false;
            }

            state.roomRole.value = deriveRoomRole({
                roomId: nextRoomState.roomId,
                hostId: nextRoomState.hostId,
                guestId: nextRoomState.guestId,
                myId: state.socket.id
            });
            if (state.roomHostName) state.roomHostName.value = String(nextRoomState.hostName || '');
            if (state.roomGuestName) state.roomGuestName.value = String(nextRoomState.guestName || '');

            state.roomStatusText.value = deriveRoomStatusText(nextRoomState);

            if (nextRoomState.queueing) {
                return;
            }
            if (!nextRoomState.roomId) {
                clearRoomCache();
                startRoomButtonConsumed.value = false;
                state.connectionScene.value = state.socket.connected ? 'connected' : 'disconnected';
                return;
            }

            if (didOpponentLeaveRoom(prevRoomState, nextRoomState)) {
                showRoomFlowNotice('你的对手已离开房间。', 2600);
            }

            if (
                prevRoomState.roomId
                && prevRoomState.roomId === nextRoomState.roomId
                && prevRoomState.playerCount === 1
                && nextRoomState.playerCount === 2
            ) {
                const opponentName = state.roomRole.value === 'host'
                    ? String(nextRoomState.guestName || '')
                    : state.roomRole.value === 'guest'
                        ? String(nextRoomState.hostName || '')
                        : '';
                if (opponentName) {
                    showRoomFlowNotice(`${opponentName} 加入房间`, 2200);
                } else {
                    showRoomFlowNotice('有玩家加入房间', 2200);
                }
            }

            saveRoomCache({
                roomId: nextRoomState.roomId,
                password: cachedRoomPassword.value || ''
            });
        };

        const createRoom = () => {
            if (!EVT.ROOM_CREATE) return;
            const password = prompt('可选：输入房间口令（留空=公开房）') || '';
            cachedRoomPassword.value = String(password || '').trim();
            if (!cachedRoomPassword.value) {
                if (EVT.ROOM_QUICK_MATCH) {
                    state.socket.emit(EVT.ROOM_QUICK_MATCH);
                } else {
                    state.socket.emit(EVT.ROOM_CREATE, { password: '' });
                }
                return;
            }
            state.socket.emit(EVT.ROOM_CREATE, { password: cachedRoomPassword.value });
        };

        const joinRoom = () => {
            if (!EVT.ROOM_JOIN) return;
            const roomId = prompt('输入房间号（6位）');
            if (!roomId) return;
            const password = prompt('若为私密房请输入口令（公开房可留空）') || '';
            cachedRoomPassword.value = String(password || '').trim();
            state.socket.emit(EVT.ROOM_JOIN, {
                roomId: roomId.trim(),
                password: cachedRoomPassword.value
            });
        };

        const quickMatch = () => {
            if (!EVT.ROOM_QUICK_MATCH) return;
            state.socket.emit(EVT.ROOM_QUICK_MATCH);
        };

        const leaveRoom = () => {
            if (!EVT.ROOM_LEAVE) return;
            startRoomButtonConsumed.value = false;
            state.roomGameInProgress.value = false;
            clearRoomCache();
            cachedRoomPassword.value = '';
            state.socket.emit(EVT.ROOM_LEAVE);
        };

        const startRoomGame = () => {
            if (!EVT.ROOM_START_GAME) return;
            if (!canStartRoomGame.value) {
                alert('双方就绪后才可开局。');
                return;
            }
            startRoomButtonConsumed.value = true;
            state.socket.emit(EVT.ROOM_START_GAME);
        };

        const resetByControlBar = () => {
            cardOps.resetGame(false);
        };

        const openDeckManager = () => {
            showDeckManager.value = true;
        };

        const runAiDuelFromControlBar = async () => {
            if (!state.isDevMode.value) {
                alert('仅开发者模式可使用 AI 对战功能。');
                return;
            }
            showAiDuelSetup.value = true;
            // 每次打开弹窗时都重新获取最新卡组，加上时间戳防止浏览器缓存
            try {
                const res = await fetch('/api/ai-duel-options?t=' + Date.now());
                const data = await res.json();
                aiDuelOptions.value = data;
                if (data.authors && data.authors.length > 0) {
                    if (!aiDuelSetup.value.author1) aiDuelSetup.value.author1 = data.authors[0].key;
                    if (!aiDuelSetup.value.author2) aiDuelSetup.value.author2 = data.authors[0].key;
                }
                if (data.decks && data.decks.length > 0) {
                    if (!aiDuelSetup.value.deckId1 || !data.decks.find(d => d.id === aiDuelSetup.value.deckId1)) aiDuelSetup.value.deckId1 = data.decks[0].id;
                    if (!aiDuelSetup.value.deckId2 || !data.decks.find(d => d.id === aiDuelSetup.value.deckId2)) aiDuelSetup.value.deckId2 = data.decks[Math.min(1, data.decks.length - 1)].id;
                }
            } catch (err) {
                console.error('获取对战选项失败', err);
            }
        };

        const startAiDuel = async () => {
            if (isAiDuelRunning.value) return;
            
            isAiDuelRunning.value = true;
            aiDuelLogHtml.value = '正在运行 AI 对战，请稍候...\n';
            if (!aiDuelSetup.value.deckId1 || !aiDuelSetup.value.deckId2) {
                aiDuelLogHtml.value += `错误: 请先在上方选择有效卡组\n`;
                isAiDuelRunning.value = false;
                return;
            }
            try {
                const response = await fetch('/api/ai/duel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: 'AI',
                        games: 10,
                        maxTurns: 35,
                        deckA: aiDuelSetup.value.deckId1,
                        deckB: aiDuelSetup.value.deckId2,
                        authorA: aiDuelSetup.value.author1,
                        authorB: aiDuelSetup.value.author2
                    })
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    aiDuelLogHtml.value += `错误: ${payload?.message || '执行失败'}\n`;
                    return;
                }

                const wins = payload?.wins || {};
                const summary = [
                    'AI 对战完成（DEV）',
                    `先手 (${payload.profileALabel}): ${wins[payload.profileALabel] ?? 0} 胜`,
                    `后手 (${payload.profileBLabel}): ${wins[payload.profileBLabel] ?? 0} 胜`,
                    `平局: ${wins.draw || 0}`,
                    `日志ID: ${payload?.logId || '无'}`
                ].join('\n');
                aiDuelLogHtml.value += summary + '\n';
            } catch (err) {
                console.error('[AI Duel] 运行失败', err);
                aiDuelLogHtml.value += `错误: AI 对战运行失败 (${err.message})\n`;
            } finally {
                isAiDuelRunning.value = false;
            }
        };

        const ensureReplayCardCatalogLoaded = async () => {
            if (replayCardCatalog.value.size > 0) return;

            const payload = await fetch('/api/cards').then(res => res.json()).catch(() => []);
            const list = Array.isArray(payload) ? payload : [];
            const nextMap = new Map();
            for (const card of list) {
                const key = String(card?.id || '').trim();
                if (!key) continue;
                nextMap.set(key, card);
            }
            replayCardCatalog.value = nextMap;
        };

        const hydrateReplayCard = (cardRef) => {
            return hydrateReplayCardWithFallback(cardRef, null);
        };

        const hasReplayProp = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

        const hydrateReplayCardWithFallback = (cardRef, fallbackCard) => {
            if (!cardRef && !fallbackCard) return null;

            const source = cardRef && typeof cardRef === 'object' ? cardRef : {};
            const fallback = fallbackCard && typeof fallbackCard === 'object' ? fallbackCard : {};
            const id = String(source.id || fallback.id || '').trim();
            const base = replayCardCatalog.value.get(id) || {};
            const nextStacks = hasReplayProp(source, '_stackedCards') ? source._stackedCards : fallback._stackedCards;
            const fallbackStacks = Array.isArray(fallback._stackedCards) ? fallback._stackedCards : [];

            return {
                ...base,
                ...fallback,
                ...source,
                id,
                instanceId: source.instanceId || fallback.instanceId || `${id}-replay`,
                isTapped: hasReplayProp(source, 'isTapped') ? !!source.isTapped : !!fallback.isTapped,
                isMainCharacter: hasReplayProp(source, 'isMainCharacter') ? !!source.isMainCharacter : !!fallback.isMainCharacter,
                _stackedCards: Array.isArray(nextStacks)
                    ? nextStacks.map((stackedCard, index) => hydrateReplayCardWithFallback(stackedCard, fallbackStacks[index] || null)).filter(Boolean)
                    : []
            };
        };

        const cloneReplayCards = (cards) =>
            Array.isArray(cards)
                ? cards.map(hydrateReplayCard).filter(Boolean)
                : [];

        const getReplayCardKey = (card, fallback = '') => {
            const instanceId = String(card?.instanceId || '').trim();
            if (instanceId) return instanceId;
            const id = String(card?.id || '').trim();
            if (id) return id;
            return fallback;
        };

        const applyReplayZonePatch = (targetRef, zonePatch) => {
            if (!targetRef || !zonePatch || typeof zonePatch !== 'object') return;

            // 兼容数组直写格式（若后端返回整区数组）
            if (Array.isArray(zonePatch)) {
                targetRef.value = cloneReplayCards(zonePatch);
                return;
            }

            const currentList = Array.isArray(targetRef.value) ? [...targetRef.value] : [];
            const currentMap = new Map(currentList.map((card, idx) => [getReplayCardKey(card, `current-${idx}`), card]));

            const removeList = Array.isArray(zonePatch.remove) ? zonePatch.remove : [];
            for (const key of removeList) {
                currentMap.delete(String(key || '').trim());
            }

            const updateList = Array.isArray(zonePatch.update) ? zonePatch.update : [];
            for (const cardRef of updateList) {
                const key = getReplayCardKey(cardRef);
                if (!key) continue;
                const hydrated = hydrateReplayCardWithFallback(cardRef, currentMap.get(key) || null);
                if (hydrated) currentMap.set(key, hydrated);
            }

            const addList = Array.isArray(zonePatch.add) ? zonePatch.add : [];
            for (const cardRef of addList) {
                const key = getReplayCardKey(cardRef);
                if (!key) continue;
                const hydrated = hydrateReplayCardWithFallback(cardRef, currentMap.get(key) || null);
                if (hydrated) currentMap.set(key, hydrated);
            }

            const nextList = [];
            const order = Array.isArray(zonePatch.order) ? zonePatch.order : [];
            if (order.length > 0) {
                for (const rawKey of order) {
                    const key = String(rawKey || '').trim();
                    if (!key) continue;
                    const card = currentMap.get(key);
                    if (!card) continue;
                    nextList.push(card);
                    currentMap.delete(key);
                }
            }

            if (currentMap.size > 0) {
                nextList.push(...currentMap.values());
            }

            targetRef.value = nextList;
        };

        const applyReplaySeatPatch = (seatPatch, areaSetters) => {
            if (!seatPatch || typeof seatPatch !== 'object') return;
            if (Object.prototype.hasOwnProperty.call(seatPatch, 'front')) applyReplayZonePatch(areaSetters.front, seatPatch.front);
            if (Object.prototype.hasOwnProperty.call(seatPatch, 'rear')) applyReplayZonePatch(areaSetters.rear, seatPatch.rear);
            if (Object.prototype.hasOwnProperty.call(seatPatch, 'hand')) applyReplayZonePatch(areaSetters.hand, seatPatch.hand);
            if (Object.prototype.hasOwnProperty.call(seatPatch, 'bonds')) applyReplayZonePatch(areaSetters.bonds, seatPatch.bonds);
            if (Object.prototype.hasOwnProperty.call(seatPatch, 'jewels')) applyReplayZonePatch(areaSetters.jewels, seatPatch.jewels);
            if (Object.prototype.hasOwnProperty.call(seatPatch, 'graveyard')) applyReplayZonePatch(areaSetters.graveyard, seatPatch.graveyard);
            if (Object.prototype.hasOwnProperty.call(seatPatch, 'drawPile')) applyReplayZonePatch(areaSetters.deck, seatPatch.drawPile);
        };

        const applyReplayPatch = (patch, seatAName) => {
            if (!patch || typeof patch !== 'object') return;

            applyReplaySeatPatch(patch.seatAState, {
                front: state.fieldFront,
                rear: state.fieldRear,
                hand: state.hand,
                bonds: state.bonds,
                jewels: state.jewels,
                graveyard: state.graveyard,
                deck: state.deck
            });

            applyReplaySeatPatch(patch.seatBState, {
                front: state.opponentFront,
                rear: state.opponentRear,
                hand: state.oppHand,
                bonds: state.oppBonds,
                jewels: state.oppJewels,
                graveyard: state.oppGraveyard,
                deck: state.oppDeck
            });

            state.oppStats.value = {
                ...(state.oppStats.value || {}),
                hand: state.oppHand.value.length,
                bonds: state.oppBonds.value.length,
                active: state.opponentFront.value.length
            };

            if (Object.prototype.hasOwnProperty.call(patch, 'activeSeat')) {
                state.isMyTurn.value = String(patch.activeSeat || '') === String(seatAName || '');
            }
            if (patch.turnLabel || patch.turn) {
                state.currentPhase.value = 'ATTACK';
            }
        };

        const applyReplaySnapshot = (snapshot) => {
            if (!snapshot) return;
            const seatAName = snapshot.seatA;
            const seatAState = snapshot.seatAState || {};
            const seatBState = snapshot.seatBState || {};
            if (!seatAName) return;

            state.fieldFront.value = cloneReplayCards(seatAState.front);
            state.fieldRear.value = cloneReplayCards(seatAState.rear);
            state.hand.value = cloneReplayCards(seatAState.hand);
            state.bonds.value = cloneReplayCards(seatAState.bonds);
            state.jewels.value = cloneReplayCards(seatAState.jewels);
            state.graveyard.value = cloneReplayCards(seatAState.graveyard);
            state.deck.value = cloneReplayCards(seatAState.drawPile);

            state.opponentFront.value = cloneReplayCards(seatBState.front);
            state.opponentRear.value = cloneReplayCards(seatBState.rear);
            state.oppHand.value = cloneReplayCards(seatBState.hand);
            state.oppBonds.value = cloneReplayCards(seatBState.bonds);
            state.oppJewels.value = cloneReplayCards(seatBState.jewels);
            state.oppGraveyard.value = cloneReplayCards(seatBState.graveyard);
            state.oppDeck.value = cloneReplayCards(seatBState.drawPile);

            state.oppStats.value = {
                ...(state.oppStats.value || {}),
                hand: Array.isArray(seatBState.hand) ? seatBState.hand.length : 0,
                bonds: Array.isArray(seatBState.bonds) ? seatBState.bonds.length : 0,
                active: Array.isArray(seatBState.front) ? seatBState.front.length : 0
            };

            state.isCombatActive.value = false;
            state.attacker.value = null;
            state.defender.value = null;
            state.mySupportCard.value = null;
            state.oppSupportCard.value = null;
            state.supportInteraction.value = null;
            state.selectedCard.value = null;

            state.currentPhase.value = 'ATTACK';
            state.isMyTurn.value = String(snapshot.activeSeat || '') === String(snapshot.seatA || '');
        };

        const getCurrentReplayGame = () => {
            const games = Array.isArray(aiReplayLog.value?.games) ? aiReplayLog.value.games : [];
            return games[aiReplayGameIndex.value] || null;
        };

        const getReplayBaseSnapshot = (game) => {
            if (!game) return null;
            return game.initialSnapshot || null;
        };

        const clearReplayCombatState = () => {
            state.isCombatActive.value = false;
            state.attacker.value = null;
            state.defender.value = null;
            state.mySupportCard.value = null;
            state.oppSupportCard.value = null;
            state.combatDecision.value = {
                ...(state.combatDecision.value || {}),
                stage: 'idle',
                promptOwner: null,
                criticalPower: 0,
                criticalUsed: false,
                evaded: false,
                finalAttackerWins: null
            };
            state.combatStats.value = {
                ...(state.combatStats.value || {}),
                myCardPower: 0,
                mySupportPower: 0,
                myTotalPower: 0,
                oppTotalPower: 0,
                attackerSupportApplied: 0,
                defenderSupportApplied: 0,
                supportNotice: null,
                finalAttackerWins: null
            };
        };

        const findReplayCombatEvent = (timeline, cursor, tag) => {
            if (!Array.isArray(timeline)) return null;
            for (let idx = cursor; idx >= 0; idx--) {
                const event = timeline[idx] || null;
                if (!event) continue;
                if (event.tag === tag) return event;
                if (tag !== 'attack-declare' && event.tag === 'attack-declare') break;
            }
            return null;
        };

        const applyReplayCombatState = (timeline, cursor) => {
            clearReplayCombatState();

            const currentEvent = Array.isArray(timeline) ? timeline[cursor] || null : null;
            if (!currentEvent) return;

            const combatTags = new Set(['battle-preview', 'battle-support-effect', 'battle-result']);
            if (!combatTags.has(currentEvent.tag)) return;

            const declareEvent = findReplayCombatEvent(timeline, cursor, 'attack-declare');
            const previewEvent = findReplayCombatEvent(timeline, cursor, 'battle-preview');
            const resultEvent = findReplayCombatEvent(timeline, cursor, 'battle-result');

            const declareExtra = declareEvent?.extra || {};
            const previewExtra = previewEvent?.extra || {};
            const resultExtra = resultEvent?.extra || {};

            const attacker = hydrateReplayCardWithFallback(previewExtra.attacker || declareExtra.attacker || null, null);
            const defender = hydrateReplayCardWithFallback(previewExtra.defender || declareExtra.defender || null, null);
            const attackerSupportCard = hydrateReplayCardWithFallback(previewExtra.attackerSupportCard || resultExtra.attackerSupportCard || null, null);
            const defenderSupportCard = hydrateReplayCardWithFallback(previewExtra.defenderSupportCard || resultExtra.defenderSupportCard || null, null);

            if (!attacker || !defender) return;

            state.isCombatActive.value = true;
            state.attacker.value = attacker;
            state.defender.value = defender;
            state.mySupportCard.value = attackerSupportCard;
            state.oppSupportCard.value = defenderSupportCard;

            const attackerSupportApplied = Number.parseInt(previewExtra.attackerSupport?.supportValue, 10) || 0;
            const defenderSupportApplied = Number.parseInt(previewExtra.defenderSupport?.supportValue, 10) || 0;
            const attackerPower = Number.parseInt(previewExtra.attackerPower, 10) || Number.parseInt(attacker.attack, 10) || 0;
            const defenderPower = Number.parseInt(previewExtra.defenderPower, 10) || Number.parseInt(defender.attack, 10) || 0;
            const supportNotice = currentEvent.tag === 'battle-support-effect'
                ? String(currentEvent.line || '').replace(/^\[[^\]]+\]\s*/, '')
                : null;

            state.combatStats.value = {
                ...(state.combatStats.value || {}),
                myCardPower: Number.parseInt(attacker.attack, 10) || 0,
                mySupportPower: attackerSupportApplied,
                myTotalPower: attackerPower,
                oppTotalPower: defenderPower,
                attackerSupportApplied,
                defenderSupportApplied,
                supportNotice,
                finalAttackerWins: Object.prototype.hasOwnProperty.call(resultExtra, 'finalAttackerWins')
                    ? !!resultExtra.finalAttackerWins
                    : null,
                attackerCriticalLocked: false,
                defenderEvasionLocked: false,
                encourageDrawOnBreakMainCharacter: false,
                opponentSupportEffectSealed: false,
                jewelBreakCount: 1,
                postBattleEffects: []
            };

            state.combatDecision.value = {
                ...(state.combatDecision.value || {}),
                stage: 'resolved',
                promptOwner: null,
                criticalPower: attackerPower * 2,
                criticalUsed: false,
                evaded: false,
                finalAttackerWins: Object.prototype.hasOwnProperty.call(resultExtra, 'finalAttackerWins')
                    ? !!resultExtra.finalAttackerWins
                    : null
            };
        };

        const applyCurrentReplayCursor = () => {
            const game = getCurrentReplayGame();
            if (!game) return;
            const timeline = Array.isArray(game.timeline) ? game.timeline : [];
            if (!timeline.length) return;
            const safeCursor = Math.max(0, Math.min(aiReplayCursor.value, timeline.length - 1));
            aiReplayCursor.value = safeCursor;

            const baseSnapshot = getReplayBaseSnapshot(game);
            if (!baseSnapshot) return;
            applyReplaySnapshot(baseSnapshot);

            for (let idx = 0; idx <= safeCursor; idx++) {
                const eventPatch = timeline[idx]?.extra?.replayPatch || null;
                if (eventPatch) {
                    applyReplayPatch(eventPatch, baseSnapshot.seatA);
                }
            }

            applyReplayCombatState(timeline, safeCursor);
        };

        const loadLatestAiReplayLog = async () => {
            if (!state.isDevMode.value) {
                alert('仅开发者模式可使用 AI 回放功能。');
                return;
            }

            isAiReplayLoading.value = true;
            try {
                const listResponse = await fetch('/api/ai/duel/logs?limit=1');
                const listPayload = await listResponse.json().catch(() => ({}));
                if (!listResponse.ok) {
                    alert(listPayload?.message || '读取回放日志列表失败。');
                    return;
                }
                const latest = Array.isArray(listPayload?.items) ? listPayload.items[0] : null;
                if (!latest?.id) {
                    aiReplayLog.value = null;
                    alert('暂无 AI 对战日志，请先运行一次 AI 对战。');
                    return;
                }

                const detailResponse = await fetch(`/api/ai/duel/logs/${encodeURIComponent(latest.id)}`);
                const detailPayload = await detailResponse.json().catch(() => ({}));
                if (!detailResponse.ok) {
                    alert(detailPayload?.message || '读取回放日志失败。');
                    return;
                }

                await ensureReplayCardCatalogLoaded();
                aiReplayLog.value = detailPayload;
                aiReplayGameIndex.value = 0;
                aiReplayCursor.value = 0;
                applyCurrentReplayCursor();
            } catch (err) {
                console.error('[AI Replay] 加载失败', err);
                alert('加载 AI 回放失败，请查看控制台。');
            } finally {
                isAiReplayLoading.value = false;
            }
        };

        const openAiReplayFromControlBar = async () => {
            if (!state.isDevMode.value) {
                alert('仅开发者模式可使用 AI 回放功能。');
                return;
            }
            showAiReplayPanel.value = true;
            isAiReplayPanelHidden.value = false;
            await loadLatestAiReplayLog();
        };

        const toggleAiReplayPanelHiddenFromControlBar = () => {
            if (!showAiReplayPanel.value) return;
            isAiReplayPanelHidden.value = !isAiReplayPanelHidden.value;
        };

        const closeAiReplayPanel = () => {
            showAiReplayPanel.value = false;
            isAiReplayPanelHidden.value = false;
        };

        const selectAiReplayGame = (index) => {
            aiReplayGameIndex.value = Math.max(0, Number.parseInt(index, 10) || 0);
            aiReplayCursor.value = 0;
            applyCurrentReplayCursor();
        };

        const stepAiReplayPrev = () => {
            aiReplayCursor.value -= 1;
            applyCurrentReplayCursor();
        };

        const stepAiReplayNext = () => {
            aiReplayCursor.value += 1;
            applyCurrentReplayCursor();
        };

        const jumpAiReplayTo = (cursor) => {
            aiReplayCursor.value = Number.parseInt(cursor, 10) || 0;
            applyCurrentReplayCursor();
        };

        const resetAiReplayNavigatorDefaultPosition = () => {
            const width = isCompactMobile.value ? 216 : 260;
            const height = 96;
            const centeredX = Math.round((window.innerWidth - width) / 2);
            const nearBondY = Math.round(window.innerHeight - height - 132);
            aiReplayNavigatorPosition.value = clampAiReplayNavigatorPosition(centeredX, nearBondY, width, height);
            aiReplayNavigatorInitialized.value = true;
        };

        const clampAiReplayNavigatorPosition = (x, y, panelWidth = 260, panelHeight = 96) => {
            const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
            const maxY = Math.max(56, window.innerHeight - panelHeight - 8);
            return {
                x: Math.min(Math.max(8, Math.round(x)), maxX),
                y: Math.min(Math.max(56, Math.round(y)), maxY)
            };
        };

        const startAiReplayNavigatorDrag = (event) => {
            const panelEl = event?.currentTarget?.closest?.('[data-ai-replay-nav-panel]');
            if (!panelEl) return;
            const rect = panelEl.getBoundingClientRect();
            aiReplayNavigatorDrag.value = {
                active: true,
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
        };

        const moveAiReplayNavigatorDrag = (event) => {
            const drag = aiReplayNavigatorDrag.value;
            if (!drag.active || drag.pointerId !== event.pointerId) return;
            const panelEl = event?.currentTarget?.closest?.('[data-ai-replay-nav-panel]');
            const rect = panelEl?.getBoundingClientRect();
            const panelWidth = rect?.width || 260;
            const panelHeight = rect?.height || 96;
            const next = clampAiReplayNavigatorPosition(
                event.clientX - drag.offsetX,
                event.clientY - drag.offsetY,
                panelWidth,
                panelHeight
            );
            aiReplayNavigatorPosition.value = next;
        };

        const endAiReplayNavigatorDrag = (event) => {
            const drag = aiReplayNavigatorDrag.value;
            if (!drag.active || drag.pointerId !== event.pointerId) return;
            aiReplayNavigatorDrag.value = {
                active: false,
                pointerId: null,
                offsetX: 0,
                offsetY: 0
            };
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        };

        const closeDeckManager = () => {
            showDeckManager.value = false;
        };

        const setDraggingOver = (value) => {
            state.isDraggingOver.value = value;
        };

        const clearDraggingOver = () => {
            state.isDraggingOver.value = null;
            state.hoveredAttackTargetId.value = null;
            state.hoveredAttackTargetRect.value = null;
        };

        const openBondsPanel = () => {
            state.activePanel.value = 'bonds';
        };

        const selectCard = (card) => {
            state.selectedCard.value = card;
        };

        const handleCombatDecision = (decisionType, useSkill, costCardId = null) => {
            const idToUse = useSkill ? (costCardId || selectedCombatCostCardId.value) : null;
            const success = cardOps.respondCombatDecision(state, decisionType, useSkill, idToUse);
            if (success) {
                selectedCombatCostCardId.value = null;
                selectedCombatCostCardName.value = '';
                if (state.activePanel.value === 'combatCostHand') {
                    closeActivePanel();
                }
            }
        };

        const handleRegionPanelCardClick = (card) => {
            if (state.activePanel.value === 'combatCostHand') {
                selectedCombatCostCardId.value = card.instanceId;
                selectedCombatCostCardName.value = card.cardName || card.name || '';
                closeActivePanel();
                return;
            }
            if (
                state.activePanel.value === 'supportMagicDiscardHand' ||
                state.activePanel.value === 'supportCourageTopdeckHand' ||
                state.activePanel.value === 'supportManaketeHandToBond' ||
                state.activePanel.value === 'supportDarkSelfDiscardHand' ||
                state.activePanel.value === 'supportSkyMoveCandidates' ||
                state.activePanel.value === 'supportDanceUntapCandidates' ||
                state.activePanel.value === 'supportPeekOwnJewel' ||
                state.activePanel.value === 'supportMainCharacterJewelSelect' ||
                state.activePanel.value === 'supportStrategyTargetEnemy' ||
                state.activePanel.value === 'supportNinjutsuHandToGrave' ||
                state.activePanel.value === 'supportDespairZombieCandidates' ||
                state.activePanel.value === 'supportMoveAttackerPostBattleCandidates'
            ) {
                const ok = cardOps.resolveSupportInteraction(state, card.instanceId);
                if (ok) {
                    closeActivePanel();
                }
                return;
            }
            handleMinifiedClick(card);
        };

        watch(state.currentPhase, (newPhase) => {
            if (newPhase === 'BEGINNING') {
                state.usedBondsThisTurn.value = 0;
            }

            // 进军时点1：己方回合结束阶段
            if (newPhase === 'END' && state.isMyTurn.value && !state.isCombatActive.value) {
                cardOps.marchRearToFrontIfNeeded?.('己方结束阶段');
            }
        });
        const { handleMinifiedClick, safePlayToField } = createUiActions({ state, cardOps, rules });

        // 进军时点2：敌方回合所有阶段（通过敌方回合内的场面变化持续判定）
        watch(
            () => [
                state.isMyTurn.value,
                state.isCombatActive.value,
                state.fieldFront.value.length,
                state.fieldRear.value.length
            ],
            ([isMyTurn, isCombatActive, frontCount, rearCount]) => {
                if (isMyTurn) return;
                if (isCombatActive) return;
                if (frontCount > 0 || rearCount === 0) return;
                cardOps.marchRearToFrontIfNeeded?.('敌方回合自动判定');
            }
        );

        watch(() => state.combatDecision.value?.stage, () => {
            selectedCombatCostCardId.value = null;
            selectedCombatCostCardName.value = '';
            if (state.activePanel.value === 'combatCostHand') {
                closeActivePanel();
            }
        });

        watch(requiredCombatCharaName, () => {
            selectedCombatCostCardId.value = null;
            selectedCombatCostCardName.value = '';
        });

        watch(() => state.supportInteraction.value?.type, (type) => {
            if (type === 'magic-discard') {
                state.activePanel.value = 'supportMagicDiscardHand';
                return;
            }
            if (type === 'courage-topdeck') {
                state.activePanel.value = 'supportCourageTopdeckHand';
                return;
            }
            if (type === 'manakete-hand-to-bond') {
                state.activePanel.value = 'supportManaketeHandToBond';
                return;
            }
            if (type === 'dark-self-discard') {
                state.activePanel.value = 'supportDarkSelfDiscardHand';
                return;
            }
            if (type === 'sky-move') {
                state.activePanel.value = 'supportSkyMoveCandidates';
                return;
            }
            if (type === 'dance-untap-ally') {
                state.activePanel.value = 'supportDanceUntapCandidates';
                return;
            }
            if (type === 'peek-own-jewel') {
                state.activePanel.value = 'supportPeekOwnJewel';
                return;
            }
            if (type === 'main-character-jewel-select') {
                state.activePanel.value = 'supportMainCharacterJewelSelect';
                return;
            }
            if (type === 'strategy-select-enemy') {
                state.activePanel.value = 'supportStrategyTargetEnemy';
                return;
            }
            if (type === 'ninjutsu-hand-to-grave') {
                state.activePanel.value = 'supportNinjutsuHandToGrave';
                return;
            }
            if (type === 'despair-select-zombie') {
                state.activePanel.value = 'supportDespairZombieCandidates';
                return;
            }
            if (type === 'support-move-attacker-post-battle') {
                state.activePanel.value = 'supportMoveAttackerPostBattleCandidates';
                return;
            }
            if (type === 'phantom-post-battle') {
                const attackerId = state.supportInteraction.value?.attackerId || state.attacker.value?.instanceId || null;
                cardOps.resolveSupportInteraction(state, attackerId);
                return;
            }

            if (
                state.activePanel.value === 'supportMagicDiscardHand' ||
                state.activePanel.value === 'supportCourageTopdeckHand' ||
                state.activePanel.value === 'supportManaketeHandToBond' ||
                state.activePanel.value === 'supportDarkSelfDiscardHand' ||
                state.activePanel.value === 'supportSkyMoveCandidates' ||
                state.activePanel.value === 'supportDanceUntapCandidates' ||
                state.activePanel.value === 'supportPeekOwnJewel' ||
                state.activePanel.value === 'supportMainCharacterJewelSelect' ||
                state.activePanel.value === 'supportStrategyTargetEnemy' ||
                state.activePanel.value === 'supportNinjutsuHandToGrave' ||
                state.activePanel.value === 'supportDespairZombieCandidates' ||
                state.activePanel.value === 'supportMoveAttackerPostBattleCandidates'
            ) {
                closeActivePanel();
            }
        });
        const updateHeight = () => {
            document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
            isCompactMobile.value = window.innerWidth < 640;
            if (!aiReplayNavigatorInitialized.value) {
                resetAiReplayNavigatorDefaultPosition();
            }
            aiReplayNavigatorPosition.value = clampAiReplayNavigatorPosition(
                aiReplayNavigatorPosition.value.x,
                aiReplayNavigatorPosition.value.y,
                isCompactMobile.value ? 216 : 260,
                96
            );
        };

        const confirmMulligan = () => {
            state.mulliganState.value = 'done';
            state.socket.emit(EVT.MULLIGAN_DECISION, { state: 'done' });
            if (state.opponentMulliganState.value !== 'done') {
                showRoomFlowNotice('你已完成调度，等待对手完成调度...', 0);
                hasShownMulliganWaitNotice.value = true;
            }
        };
        // 补全缺少的 performMulligan 函数
        const performMulligan = () => {
            // 如果已经调度过，阻止重复执行
            if (state.hasMulliganed.value) return;
            
            // 标记已调度
            state.hasMulliganed.value = true;
            state.mulliganState.value = 'done';

            // 调用底层的调度洗牌/抽卡逻辑
            if (cardOps.performMulliganOps) {
                cardOps.performMulliganOps();
            }

            // 发送给服务器已完成调度（假设与 confirmMulligan 发送相同状态）
            if (EVT.MULLIGAN_DECISION) {
                state.socket.emit(EVT.MULLIGAN_DECISION, { state: 'done' });
            }
            if (state.opponentMulliganState.value !== 'done') {
                showRoomFlowNotice('你已完成调度，等待对手完成调度...', 0);
                hasShownMulliganWaitNotice.value = true;
            }
        };
        watch([() => state.mulliganState.value, () => state.opponentMulliganState.value], ([myState, oppState]) => {
            if (roomMulliganDone.value) return;
            if (myState === 'done' && oppState !== 'done' && !hasShownMulliganWaitNotice.value) {
                showRoomFlowNotice('你已完成调度，等待对手完成调度...', 0);
                hasShownMulliganWaitNotice.value = true;
            }
            // 兜底：若房间完成事件丢失，但本地已观测到双方完成，则直接推进。
            if (myState === 'done' && oppState === 'done') {
                const fallbackFirstPlayerId = state.firstPlayerOpeningTurnLocked?.value ? state.socket.id : null;
                finalizeMulliganIfReady(fallbackFirstPlayerId);
            }
        });
        watch(showDeckManager, async (visible) => {
            if (!visible) await loadEntryDeckPreview();
        });

        onMounted(async () => {
            document.documentElement.setAttribute('data-battle-theme', BATTLE_THEME);
            window.addEventListener('resize', updateHeight);
            updateHeight();
            window.addEventListener('fe0:notice', (event) => {
                const message = event?.detail?.message || '';
                const duration = Number(event?.detail?.duration || 2200);
                if (!message) return;
                showRoomFlowNotice(message, duration);
            });
            if (!window.__fe0AlertPatched) {
                const nativeAlert = window.alert.bind(window);
                window.alert = (message) => {
                    const text = String(message || '');
                    if (
                        text.includes('开局完成') ||
                        text.includes('请先进行调度') ||
                        text.includes('已完成调度') ||
                        text.includes('先攻第一回合无法抽卡')
                    ) {
                        showRoomFlowNotice(text, 2800);
                        return;
                    }
                    nativeAlert(message);
                };
                window.__fe0AlertPatched = true;
            }

            // 启动网络监听
            socketHandler.setupSocketListeners();
            turnMgr.setupTurnListener();

            if (EVT.ROOM_STATE) {
                state.socket.on(EVT.ROOM_STATE, (payload) => {
                    updateRoomState(payload || {});
                });
            }
            if (EVT.ROOM_ERROR) {
                state.socket.on(EVT.ROOM_ERROR, (payload) => {
                    const message = payload?.message || '房间操作失败';
                    showRoomFlowNotice(message, 3200);
                });
            }
            if (EVT.ROOM_GAME_STARTED) {
                state.socket.on(EVT.ROOM_GAME_STARTED, async (payload = {}) => {
                    const eventTs = Number(payload?.ts || 0);
                    if (isHandlingRoomGameStart.value) {
                        return;
                    }
                    if (eventTs > 0 && eventTs === lastHandledRoomGameStartTs.value) {
                        return;
                    }

                    isHandlingRoomGameStart.value = true;
                    if (eventTs > 0) {
                        lastHandledRoomGameStartTs.value = eventTs;
                    }
                    const startedBy = payload?.startedBy || null;
                    const firstPlayerId = payload?.firstPlayerId || startedBy || null;
                    startRoomButtonConsumed.value = true;
                    state.roomGameInProgress.value = true;
                    try {
                        // 开局事件两端都会收到，这里使用 remote reset 避免双方互发 SYNC_RESET 导致重复重置。
                        await cardOps.resetGame(true);

                        // 开局后统一进入游玩模式，并按开局发起者确定先后手。
                        state.isDevMode.value = false;
                        ensureOpeningHandVisible();
                        const iAmStarter = !!firstPlayerId && String(firstPlayerId) === String(state.socket.id);
                        state.isMyTurn.value = iAmStarter;
                        state.currentPhase.value = 'MULLIGAN';
                        state.opponentMulliganState.value = 'awaiting';
                        roomMulliganDone.value = false;
                        hasShownMulliganWaitNotice.value = false;
                        hasShownFirstPlayerNoDrawNotice.value = false;
                        state.hasPlacedBond.value = false;
                        state.usedBondsThisTurn.value = 0;
                        if (state.firstPlayerOpeningTurnLocked) {
                            state.firstPlayerOpeningTurnLocked.value = iAmStarter;
                        }
                        showRoomFlowNotice(iAmStarter ? '开局完成：你是先攻，请先进行调度。' : '开局完成：对手为先攻，请先进行调度。', 0);
                    } finally {
                        isHandlingRoomGameStart.value = false;
                    }
                });
            }
            if (EVT.ROOM_MULLIGAN_STATE) {
                state.socket.on(EVT.ROOM_MULLIGAN_STATE, (payload = {}) => {
                    const hostDone = !!payload?.hostDone;
                    const guestDone = !!payload?.guestDone;
                    const bothDone = hostDone && guestDone;
                    const myRole = String(state.roomRole.value || '');
                    const myDone = myRole === 'host' ? hostDone : myRole === 'guest' ? guestDone : state.mulliganState.value === 'done';
                    const oppDone = myRole === 'host' ? guestDone : myRole === 'guest' ? hostDone : false;
                    if (myDone) state.mulliganState.value = 'done';
                    state.opponentMulliganState.value = oppDone ? 'done' : 'awaiting';
                    if (state.mulliganState.value === 'done' && !bothDone && !hasShownMulliganWaitNotice.value) {
                        showRoomFlowNotice('你已完成调度，等待对手完成调度...', 0);
                        hasShownMulliganWaitNotice.value = true;
                    }
                    if (bothDone) {
                        finalizeMulliganIfReady(payload?.firstPlayerId || null);
                    }
                });
            }
            if (EVT.ROOM_MULLIGAN_DONE) {
                state.socket.on(EVT.ROOM_MULLIGAN_DONE, (payload = {}) => {
                    finalizeMulliganIfReady(payload?.firstPlayerId || null);
                });
            }
            if (EVT.SYNC_PHASE) {
                state.socket.on(EVT.SYNC_PHASE, (payload = {}) => {
                    const phase = String(payload?.phase || '').trim();
                    if (!phase) return;
                    state.currentPhase.value = phase;
                    if (phase === 'BOND') {
                        state.hasPlacedBond.value = false;
                    }
                });
            }

            state.socket.on('connect', () => {
                state.connectionScene.value = state.roomId.value ? 'recovering' : 'connected';
                if (EVT.PLAYER_SET_NAME) {
                    state.socket.emit(EVT.PLAYER_SET_NAME, { playerName: playerDisplayName.value });
                }
                const cache = loadRoomCache();
                if (!cache?.roomId) return;
                cachedRoomPassword.value = String(cache.password || '');
                if (EVT.ROOM_JOIN) {
                    state.socket.emit(EVT.ROOM_JOIN, {
                        roomId: String(cache.roomId || '').trim(),
                        password: cachedRoomPassword.value
                    });
                }
            });

            state.socket.on('disconnect', () => {
                state.connectionScene.value = state.roomId.value ? 'recovering' : 'disconnected';
            });

            loadPlayerDisplayName();
            await loadEntryDeckPreview();
            if (!state.roomId.value) {
                state.connectionScene.value = state.socket.connected ? 'connected' : 'disconnected';
            }
        });

        return {
            ...state,
            ...cardOps,
            ...dragDrop, // 自动暴露拖拽与攻击指令
			playToField: safePlayToField,
            nextPhase: turnMgr.nextPhase,
            canPerformAction: rules.canPerformAction,
            canPerformClassChange: rules.canPerformClassChange,
            getCardFactionInfo: rules.getCardFactionInfo,
            topBarUi,
            roomScene,
            roomFlowNotice,
            showBattleUi,
            showDeckDrawGuide,
            isCompactMobile,
            playerDisplayName,
            playerDisplayNameInput,
            isEditingPlayerDisplayName,
            startEditPlayerDisplayName,
            savePlayerDisplayName,
            cancelEditPlayerDisplayName,
            logoutAndClearIdentityData,
            entryDeckPreview,
            entryDeckPreviewMode,
            entryThemeStyle,
            entryPanelStyle,
            entryTabActiveStyle,
            entryTabInactiveStyle,
            entryDeckPreviewSections,
            entryPreviewSelectedCard,
            openEntryPreviewCardDetail,
            closeEntryPreviewCardDetail,
            getEntryCardAbilityText,
            getEntryCardSupportText,
            activePanelTitle,
            activePanelCards,
            resolvedPanelTitle,
            resolvedPanelCards,
            isOpponentPanel: resolvedIsOpponentPanel,
            remainingCost,
            totalBonds,
            currentPhaseName,
            showNextPhaseButton,
            highlightNextPhase,
            nextPhaseLabel,
            isMyCombatAttacker,
            playerPanelButtons,
            enemyPanelButtons,
            closeActivePanel,
            closeSelectedCard,
            openFullImage,
            openPanel,
            toggleDevMode,
            resetByControlBar,
            openDeckManager,
            closeDeckManager,
            showDeckManager,
            isAiDuelPending,
            runAiDuelFromControlBar,
            showAiDuelSetup,
            aiDuelSetup,
            aiDuelOptions,
            isAiDuelRunning,
            aiDuelLogHtml,
            startAiDuel,
            showAiReplayPanel,
            showAiReplayPanelVisible,
            isAiReplayPanelHidden,
            showAiReplayStepButtons,
            canStepAiReplayPrev,
            canStepAiReplayNext,
            currentAiReplayEventLine,
            currentAiReplayTimelineLength,
            isAiReplayLoading,
            aiReplayLog,
            aiReplayGameIndex,
            aiReplayCursor,
            openAiReplayFromControlBar,
            toggleAiReplayPanelHiddenFromControlBar,
            closeAiReplayPanel,
            loadLatestAiReplayLog,
            selectAiReplayGame,
            stepAiReplayPrev,
            stepAiReplayNext,
            jumpAiReplayTo,
            aiReplayNavigatorStyle,
            startAiReplayNavigatorDrag,
            moveAiReplayNavigatorDrag,
            endAiReplayNavigatorDrag,
            createRoom,
            joinRoom,
            quickMatch,
            leaveRoom,
            canStartRoomGame,
            startRoomGame,
            setDraggingOver,
            clearDraggingOver,
            openBondsPanel,
            selectCard,
            handleCombatDecision,
            handleRegionPanelCardClick,
            openCombatCostPicker,
            selectedCombatCostCardId,
            selectedCombatCostCard,
            selectedCombatCostCardName,
            combatCostCandidates,
            selectedCardAbilityPrimaryLabel,
            selectedCardAbilitySecondaryLabel,
            selectedCardAbilityTertiaryLabel,
            selectedCardAbilityQuaternaryLabel,
            onSelectedCardAbilityPrimary: () => activateSelectedCardAbilityByIndex(0),
            onSelectedCardAbilitySecondary: () => activateSelectedCardAbilityByIndex(1),
            onSelectedCardAbilityTertiary: () => activateSelectedCardAbilityByIndex(2),
            onSelectedCardAbilityQuaternary: () => activateSelectedCardAbilityByIndex(3),
            isMyCard, isCardInHand, formattedAbility, formattedSupport, handleMinifiedClick, updateHeight,
            confirmMulligan,
            performMulligan
        };
    }
}).mount('#app');