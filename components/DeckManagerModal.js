import { CardDetailModal } from './CardDetailModal.js';

export const DeckManagerModal = {
    forceColorNames: Object.freeze({
        '光之剑': '红',
        '圣痕': '蓝',
        '白夜': '白',
        '暗夜': '黑',
        '寻踪的纹章': '绿',
        '神器': '紫',
        '圣战旗': '黄',
        '女神纹章': '茶',
        '无': '无'
    }),
    forceTheme: Object.freeze({
        '光之剑': { primary: '#3f1716', secondary: '#5a2220', accent: '#c08484' },
        '圣痕': { primary: '#18263f', secondary: '#22365a', accent: '#8fa9c7' },
        '白夜': { primary: '#3a3d44', secondary: '#525866', accent: '#b7bec9' },
        '暗夜': { primary: '#241a3f', secondary: '#34265a', accent: '#a79bc9' },
        '寻踪的纹章': { primary: '#1a3528', secondary: '#25503b', accent: '#8eb7a4' },
        '神器': { primary: '#301b3f', secondary: '#46285a', accent: '#b39bc9' },
        '圣战旗': { primary: '#4a3216', secondary: '#654622', accent: '#cdb086' },
        '女神纹章': { primary: '#4b2a1b', secondary: '#663b28', accent: '#c9a592' },
        default: { primary: '#2f1b1b', secondary: '#3d2531', accent: '#b99a84' }
    }),
    supportTimingOptions: Object.freeze([
        { key: 'attack', label: '〖攻击型〗', value: '〖攻击型〗' },
        { key: 'defense', label: '〖防御型〗', value: '〖防御型〗' },
        { key: 'attackDefense', label: '〖攻防型〗', value: '〖攻防型〗' },
        { key: 'burst', label: '〖连发技〗', value: '〖连发技〗' }
    ]),
    components: {
        CardDetailModal
    },
    props: {
        visible: Boolean,
        onClose: {
            type: Function,
            required: true
        }
    },
    data() {
        return {
            loading: false,
            saving: false,
            decks: [],
            cardPool: [],
            selectedDeckId: null,
            activeDeckId: '',
            activeDeckPassword: '',
            currentDeckPassword: '',
            importText: '',
            previewCard: null,
            showPreviewFullImage: false,
            showImportPanel: false,
            showDeckContentsModal: false,
            currentView: 'manager',
            draftDeck: null,
            draftHiddenPassword: '',
            actionDeckId: '',
            activeFilterType: '',
            activeSortDialog: false,
            activeAbilityFilterStep: 'timing',
            selectedForceFilters: [],
            selectedCostFilters: [],
            selectedAttackFilters: [],
            selectedSupportFilters: [],
            selectedSupportTimings: [],
            selectedSupportEmblems: [],
            pendingPreviewCardId: '',
            pendingPreviewTimer: null,
            sortMode: 'id'
        };
    },
    computed: {
        playerDeckPassword() {
            return String(localStorage.getItem('fe0.playerDisplayName') || '').trim();
        },
        selectedDeck() {
            return this.decks.find(d => d.id === this.selectedDeckId) || null;
        },
        isViewingHiddenDecks() {
            return !!this.currentDeckPassword;
        },
        deckListTitle() {
            return this.isViewingHiddenDecks ? '隐藏卡组列表' : '现有卡组列表';
        },
        deckListSubtitle() {
            return `当前显示：${this.currentDeckPassword || '公共'}`;
        },
        deckScopeLabel() {
            if (!this.currentDeckPassword) return '公共';
            return this.currentDeckPassword === this.playerDeckPassword ? `玩家：${this.currentDeckPassword}` : `口令：${this.currentDeckPassword}`;
        },
        builderDeck() {
            return this.draftDeck;
        },
        selectedDeckProtagonistCardId() {
            return String(this.builderDeck?.protagonistCardId || '').trim();
        },
        selectedDeckProtagonistCharaName() {
            return String(this.builderDeck?.protagonistCharaName || '').trim();
        },
        isSelectingProtagonist() {
            return this.currentView === 'builder' && !!this.builderDeck && !this.selectedDeckProtagonistCardId;
        },
        builderCards() {
            let cards = this.cardPool.slice();

            if (this.isSelectingProtagonist) {
                cards = cards
                    .filter(card => String(card.cost || '').trim() === '1')
                    .filter(card => !this.selectedForceFilters.length || this.selectedForceFilters.includes((card.force || '').trim()))
                    .sort((left, right) => {
                        const leftForce = String(left.force || '');
                        const rightForce = String(right.force || '');
                        if (leftForce !== rightForce) return leftForce.localeCompare(rightForce, 'zh-Hans-CN');
                        const leftName = String(left.charaName || left.cardName || '');
                        const rightName = String(right.charaName || right.cardName || '');
                        if (leftName !== rightName) return leftName.localeCompare(rightName, 'zh-Hans-CN');
                        return String(left.id || '').localeCompare(String(right.id || ''));
                    });
                return cards.slice(0, 120);
            }

            cards = cards
                .filter(card => !this.selectedForceFilters.length || this.selectedForceFilters.includes((card.force || '').trim()))
                .filter(card => !this.selectedCostFilters.length || this.selectedCostFilters.includes(String(card.cost || '').trim()))
                .filter(card => !this.selectedAttackFilters.length || this.selectedAttackFilters.includes(String(card.attack || '').trim()))
                .filter(card => !this.selectedSupportFilters.length || this.selectedSupportFilters.includes(String(card.support || '').trim()))
                .filter(card => {
                    if (!this.selectedSupportTimings.length) return true;
                    const timing = String(card.supportAbility?.effectTiming || '').trim();
                    return this.selectedSupportTimings.includes(timing);
                })
                .filter(card => {
                    if (!this.selectedSupportEmblems.length) return true;
                    return this.selectedSupportEmblems.includes(String(card.supportAbility?.effectName || '').trim());
                });

            const protagonistCharaName = this.selectedDeckProtagonistCharaName;
            const pinyinCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
            cards.sort((left, right) => {
                const leftIsProtagonistLine = protagonistCharaName && String(left.charaName || '').trim() === protagonistCharaName;
                const rightIsProtagonistLine = protagonistCharaName && String(right.charaName || '').trim() === protagonistCharaName;
                if (leftIsProtagonistLine !== rightIsProtagonistLine) {
                    return leftIsProtagonistLine ? -1 : 1;
                }

                if (leftIsProtagonistLine && rightIsProtagonistLine) {
                    const leftCost = Number(left.cost || 0);
                    const rightCost = Number(right.cost || 0);
                    if (leftCost !== rightCost) return leftCost - rightCost;
                    return String(left.id || '').localeCompare(String(right.id || ''));
                }

                if (this.sortMode === 'pinyin') {
                    const leftName = String(left.charaName || left.cardName || '');
                    const rightName = String(right.charaName || right.cardName || '');
                    const nameCompare = pinyinCollator.compare(leftName, rightName);
                    if (nameCompare !== 0) return nameCompare;
                }

                return String(left.id || '').localeCompare(String(right.id || ''));
            });

            return cards.slice(0, 120);
        },
        forceOptions() {
            return [...new Set(this.cardPool.map(card => (card.force || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
        },
        costOptions() {
            return [...new Set(this.cardPool.map(card => String(card.cost || '').trim()).filter(Boolean))]
                .sort((a, b) => Number(a) - Number(b));
        },
        attackOptions() {
            return [...new Set(this.cardPool.map(card => String(card.attack || '').trim()).filter(Boolean))]
                .sort((a, b) => Number(a) - Number(b));
        },
        supportValueOptions() {
            return [...new Set(this.cardPool.map(card => String(card.support || '').trim()).filter(Boolean))]
                .sort((a, b) => Number(a) - Number(b));
        },
        filterDialogTitle() {
            if (this.activeFilterType === 'force') return '选择势力';
            if (this.activeFilterType === 'cost') return '选择费用';
            if (this.activeFilterType === 'attack') return '选择战斗力';
            if (this.activeFilterType === 'supportValue') return '选择支援力';
            if (this.activeFilterType === 'supportAbility') return this.activeAbilityFilterStep === 'timing' ? '触发时机' : '具体纹章';
            return '';
        },
        activeFilterOptions() {
            if (this.activeFilterType === 'force') return this.forceOptions;
            if (this.activeFilterType === 'cost') return this.costOptions;
            if (this.activeFilterType === 'attack') return this.attackOptions;
            if (this.activeFilterType === 'supportValue') return this.supportValueOptions;
            if (this.activeFilterType === 'supportAbility') {
                if (this.activeAbilityFilterStep === 'timing') {
                    return this.$options.supportTimingOptions;
                }
                return this.supportEmblemOptions;
            }
            return [];
        },
        activeFilterValues() {
            if (this.activeFilterType === 'force') return this.selectedForceFilters;
            if (this.activeFilterType === 'cost') return this.selectedCostFilters;
            if (this.activeFilterType === 'attack') return this.selectedAttackFilters;
            if (this.activeFilterType === 'supportValue') return this.selectedSupportFilters;
            if (this.activeFilterType === 'supportAbility') {
                return this.activeAbilityFilterStep === 'emblem' ? this.selectedSupportEmblems : this.selectedSupportTimings;
            }
            return [];
        },
        supportEmblemOptions() {
            const names = this.cardPool
                .filter(card => {
                    const effectTiming = String(card.supportAbility?.effectTiming || '').trim();
                    if (!this.selectedSupportTimings.length) return false;
                    return this.selectedSupportTimings.includes(effectTiming);
                })
                .map(card => String(card.supportAbility?.effectName || '').trim())
                .filter(Boolean);
            return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
        },
        filterSummaryText() {
            const parts = [];
            if (this.selectedForceFilters.length) parts.push(`势力:${this.selectedForceFilters.join('、')}`);
            if (this.selectedCostFilters.length) parts.push(`费用:${this.selectedCostFilters.join('、')}`);
            if (this.selectedAttackFilters.length) parts.push(`战斗力:${this.selectedAttackFilters.join('、')}`);
            if (this.selectedSupportFilters.length) parts.push(`支援力:${this.selectedSupportFilters.join('、')}`);
            if (this.selectedSupportTimings.length || this.selectedSupportEmblems.length) {
                const timingLabel = this.selectedSupportTimings.map(timing => timing.replace(/[〖〗]/g, '')).join('、');
                const emblemLabel = this.selectedSupportEmblems.join('、');
                parts.push(`支援:${timingLabel || '未选 Timing'}${emblemLabel ? `-${emblemLabel}` : ''}`);
            }
            return parts.join(' / ');
        },
        selectedDeckMap() {
            const map = new Map();
            if (!this.builderDeck?.cards) return map;
            this.builderDeck.cards.forEach(item => {
                map.set(item.cardId, item.count);
            });
            return map;
        },
        selectedDeckTotal() {
            if (!this.builderDeck?.cards) return 0;
            return this.builderDeck.cards.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
        },
        selectedDeckCardDetails() {
            const map = new Map(this.cardPool.map(card => [card.id, card]));
            return (this.builderDeck?.cards || []).map(item => ({
                ...item,
                card: map.get(item.cardId) || null
            }));
        },
        deckThemePalette() {
            const counter = new Map();
            for (const item of this.selectedDeckCardDetails) {
                const force = String(item?.card?.force || '').trim();
                if (!force) continue;
                counter.set(force, (counter.get(force) || 0) + (Number(item.count) || 0));
            }
            const topForces = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([force]) => force);
            const themes = this.$options.forceTheme || {};
            const first = themes[topForces[0]] || themes.default;
            const second = themes[topForces[1]] || first;
            return { first, second };
        },
        deckThemeModalStyle() {
            const p = this.deckThemePalette;
            return {
                background: `linear-gradient(180deg, ${p.first.primary}66 0%, ${p.second.primary}44 42%, rgba(10,10,12,0.95) 100%)`,
                borderColor: `${p.first.accent}66`
            };
        },
        deckThemeHeaderStyle() {
            const p = this.deckThemePalette;
            return {
                background: `linear-gradient(180deg, ${p.first.secondary}66 0%, ${p.second.primary}44 100%)`,
                borderBottomColor: `${p.first.accent}33`
            };
        },
        previewCardIndex() {
            if (!this.previewCard) return -1;
            return this.builderCards.findIndex(card => String(card.id) === String(this.previewCard.id));
        }
    },
    watch: {
        visible(next) {
            if (next) {
                this.showImportPanel = false;
                this.showDeckContentsModal = false;
                this.activeFilterType = '';
                this.activeSortDialog = false;
                this.activeAbilityFilterStep = 'timing';
                this.currentView = 'manager';
                this.draftDeck = null;
                this.draftHiddenPassword = '';
                this.actionDeckId = '';
                this.selectedForceFilters = [];
                this.selectedCostFilters = [];
                this.selectedAttackFilters = [];
                this.selectedSupportFilters = [];
                this.selectedSupportTimings = [];
                this.selectedSupportEmblems = [];
                this.clearPendingPreview();
                this.bootstrap();
            }
        }
    },
    mounted() {
        window.addEventListener('fe0:player-name-updated', this.handlePlayerNameUpdated);
    },
    unmounted() {
        window.removeEventListener('fe0:player-name-updated', this.handlePlayerNameUpdated);
    },
    methods: {
        themedChipStyle(active = false) {
            const palette = this.deckThemePalette || this.$options.forceTheme.default;
            if (active) {
                return {
                    borderColor: `${palette.first.accent}99`,
                    color: '#fef3c7',
                    background: `${palette.first.primary}66`
                };
            }
            return {
                borderColor: `${palette.second.accent}55`,
                color: '#fbcfe8',
                background: '#24121488'
            };
        },
        clearPendingPreview() {
            if (this.pendingPreviewTimer) {
                clearTimeout(this.pendingPreviewTimer);
            }
            this.pendingPreviewTimer = null;
            this.pendingPreviewCardId = '';
        },
        handlePlayerNameUpdated(event) {
            const nextName = String(event?.detail?.playerName || '').trim();
            const password = String(event?.detail?.password || '');
            if (!nextName) return;
            if (password) {
                this.setIdentityPassword(nextName, password);
            }
            this.currentDeckPassword = nextName;
            if (!this.activeDeckPassword) {
                this.activeDeckPassword = nextName;
            }
            this.refreshDecks(false, nextName, password).catch(() => {});
        },
        async readJsonResponse(res, endpointLabel) {
            const contentType = String(res.headers.get('content-type') || '').toLowerCase();
            const text = await res.text();

            if (!contentType.includes('application/json')) {
                const shortBody = text.slice(0, 120).replace(/\s+/g, ' ');
                throw new Error(`${endpointLabel} 返回了非 JSON 内容（通常是旧版服务或 404 页面）：${shortBody}`);
            }

            try {
                return JSON.parse(text);
            } catch (error) {
                throw new Error(`${endpointLabel} JSON 解析失败：${error.message}`);
            }
        },
        getIdentityPassword(username) {
            const key = String(username || '').trim();
            if (!key) return '';
            try {
                const raw = localStorage.getItem('fe0.identityPasswordMap');
                const parsed = raw ? JSON.parse(raw) : {};
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
                return String(parsed[key] || '');
            } catch {
                return '';
            }
        },
        setIdentityPassword(username, password) {
            const key = String(username || '').trim();
            if (!key) return;
            try {
                const raw = localStorage.getItem('fe0.identityPasswordMap');
                const parsed = raw ? JSON.parse(raw) : {};
                const map = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
                map[key] = String(password || '');
                localStorage.setItem('fe0.identityPasswordMap', JSON.stringify(map));
            } catch {
                // ignore
            }
        },
        buildDeckScopeQuery(password = this.currentDeckPassword, accessPassword = '') {
            const normalized = String(password || '').trim();
            if (!normalized) return '';
            const token = String(accessPassword || '').trim();
            if (!token) return `?password=${encodeURIComponent(normalized)}`;
            return `?password=${encodeURIComponent(normalized)}&accessPassword=${encodeURIComponent(token)}`;
        },
        getDeckEndpoint(path = '', password = this.currentDeckPassword, accessPassword = '') {
            const normalized = String(password || '').trim();
            const resolvedAccess = normalized ? (accessPassword || this.getIdentityPassword(normalized)) : '';
            return `/api/decks${path}${this.buildDeckScopeQuery(password, resolvedAccess)}`;
        },
        getDeckTotal(deck) {
            return (deck?.cards || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
        },
        isDeckBattleReady(deck) {
            return this.getDeckTotal(deck) >= 50;
        },
        isActiveDeck(deck) {
            if (!deck || deck.id !== this.activeDeckId) return false;
            return String(this.currentDeckPassword || '') === String(this.activeDeckPassword || '');
        },
        resetBuilderFilters() {
            this.selectedForceFilters = [];
            this.selectedCostFilters = [];
            this.selectedAttackFilters = [];
            this.selectedSupportFilters = [];
            this.selectedSupportTimings = [];
            this.selectedSupportEmblems = [];
        },
        async ensureActiveDeckExists() {
            if (!this.activeDeckId) return;
            try {
                const res = await fetch(this.getDeckEndpoint(`/${this.activeDeckId}`, this.activeDeckPassword));
                if (!res.ok) {
                    this.activeDeckId = '';
                    this.activeDeckPassword = '';
                    localStorage.removeItem('fe0.selectedDeckId');
                    localStorage.removeItem('fe0.selectedDeckPassword');
                }
            } catch {
                this.activeDeckId = '';
                this.activeDeckPassword = '';
                localStorage.removeItem('fe0.selectedDeckId');
                localStorage.removeItem('fe0.selectedDeckPassword');
            }
        },
        async bootstrap() {
            this.loading = true;
            try {
                this.activeDeckId = localStorage.getItem('fe0.selectedDeckId') || '';
                this.activeDeckPassword = localStorage.getItem('fe0.selectedDeckPassword') || '';
                const playerNamePassword = String(localStorage.getItem('fe0.playerDisplayName') || '').trim();
                this.currentDeckPassword = playerNamePassword;
                if (playerNamePassword && !this.activeDeckPassword) {
                    this.activeDeckPassword = playerNamePassword;
                    localStorage.setItem('fe0.selectedDeckPassword', playerNamePassword);
                }
                const cardsRes = await fetch('/api/cards');
                const cards = await this.readJsonResponse(cardsRes, '/api/cards');
                this.cardPool = Array.isArray(cards) ? cards : [];
                await this.refreshDecks(false, this.currentDeckPassword);
                if (!this.selectedDeckId && this.decks.length > 0) {
                    this.selectedDeckId = this.decks[0].id;
                }
                await this.ensureActiveDeckExists();
            } catch (error) {
                alert(`加载卡组管理数据失败: ${error.message}`);
            } finally {
                this.loading = false;
            }
        },
        async refreshDecks(keepSelection = true, password = this.currentDeckPassword, explicitAccessPassword = '') {
            const normalized = String(password || '').trim();
            const resolvedAccessPassword = normalized ? (explicitAccessPassword || this.getIdentityPassword(normalized)) : '';
            const endpoint = normalized
                ? `/api/decks/hidden?password=${encodeURIComponent(normalized)}${resolvedAccessPassword ? `&accessPassword=${encodeURIComponent(resolvedAccessPassword)}` : ''}`
                : '/api/decks';
            const res = await fetch(endpoint);
            const decks = await this.readJsonResponse(res, endpoint);
            if (!res.ok) {
                throw new Error(decks?.message || '加载卡组列表失败');
            }
            this.decks = Array.isArray(decks) ? decks : [];
            this.currentDeckPassword = normalized;
            if (!keepSelection) {
                this.selectedDeckId = this.decks[0]?.id || null;
                return;
            }
            if (!this.selectedDeckId || !this.decks.some(d => d.id === this.selectedDeckId)) {
                this.selectedDeckId = this.decks[0]?.id || null;
            }
        },
        async createEmptyDeck() {
            this.draftDeck = {
                name: '',
                format: 'standard',
                notes: '',
                protagonistCardId: '',
                protagonistCharaName: '',
                cards: []
            };
            this.draftHiddenPassword = '';
            this.resetBuilderFilters();
            this.currentView = 'builder';
        },
        async promptDeckPasswordAccess() {
            const passwordInput = window.prompt('输入隐藏口令');
            if (passwordInput === null) return;
            const password = passwordInput.trim();
            if (!password) {
                alert('口令不能为空。');
                return;
            }
            try {
                const requirementRes = await fetch(`/api/decks/identity/requirements?username=${encodeURIComponent(password)}`);
                const requirement = await this.readJsonResponse(requirementRes, '/api/decks/identity/requirements');
                let accessPassword = '';
                if (requirementRes.ok && requirement?.requiresPassword) {
                    const pwd = window.prompt('该用户名目录已设置密码，请输入密码：');
                    if (pwd === null) return;
                    accessPassword = String(pwd);
                    const verifyRes = await fetch('/api/decks/identity/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: password, password: accessPassword })
                    });
                    const verifyPayload = await this.readJsonResponse(verifyRes, '/api/decks/identity/verify');
                    if (!verifyRes.ok) {
                        alert(verifyPayload?.message || '密码验证失败');
                        return;
                    }
                    this.setIdentityPassword(password, accessPassword);
                }
                await this.refreshDecks(false, password, accessPassword);
                this.closeDeckActions();
            } catch (error) {
                alert(error.message || '加载隐藏卡组失败');
            }
        },
        async returnToPublicDecks() {
            this.closeDeckActions();
            await this.refreshDecks(false, '');
        },
        async switchToPlayerDecks() {
            const password = this.playerDeckPassword;
            if (!password) {
                alert('当前用户名为空，请先设置用户名。');
                return;
            }
            this.closeDeckActions();
            await this.refreshDecks(false, password);
        },
        async deleteDeck(id) {
            if (!id) return;
            const ok = confirm('确认删除该卡组？');
            if (!ok) return;
            try {
                const endpoint = this.getDeckEndpoint(`/${id}`);
                const res = await fetch(endpoint, { method: 'DELETE' });
                if (!res.ok) {
                    const body = await this.readJsonResponse(res, endpoint);
                    alert(body?.message || '删除失败');
                    return;
                }
                await this.refreshDecks(false, this.currentDeckPassword);
                if (this.activeDeckId === id && this.activeDeckPassword === this.currentDeckPassword) {
                    this.activeDeckId = '';
                    this.activeDeckPassword = '';
                    localStorage.removeItem('fe0.selectedDeckId');
                    localStorage.removeItem('fe0.selectedDeckPassword');
                }
                if (this.actionDeckId === id) {
                    this.actionDeckId = '';
                }
            } catch (error) {
                alert(`删除失败: ${error.message}`);
            }
        },
        setActiveDeck(id) {
            if (!id) return;
            const deck = this.decks.find(item => item.id === id);
            if (deck && !this.isDeckBattleReady(deck)) {
                alert('未满50张的卡组不能设为对战。');
                return;
            }
            this.activeDeckId = id;
            this.activeDeckPassword = this.currentDeckPassword;
            localStorage.setItem('fe0.selectedDeckId', id);
            if (this.currentDeckPassword) localStorage.setItem('fe0.selectedDeckPassword', this.currentDeckPassword);
            else localStorage.removeItem('fe0.selectedDeckPassword');
            this.actionDeckId = '';
            alert('已设置为当前对战卡组。');
        },
        async addCardToDeck(card) {
            const options = arguments[1] || {};
            if (!this.builderDeck) return;
            const map = new Map(this.selectedDeckMap);
            const current = map.get(card.id) || 0;
            if (!this.isSelectingProtagonist && current >= 4) {
                alert('同名卡最多只能加入 4 张。');
                return;
            }
            const next = (map.get(card.id) || 0) + 1;
            map.set(card.id, next);
            this.persistSelectedDeckCards(map, {
                protagonistCardId: this.selectedDeckProtagonistCardId,
                protagonistCharaName: this.selectedDeckProtagonistCharaName
            });
            if (options.keepPreview !== false) {
                this.previewCard = {
                    ...card,
                    _deckCount: next
                };
            }
        },
        async addCardToLimit(card) {
            if (!this.builderDeck || !card || this.isSelectingProtagonist) return;
            const map = new Map(this.selectedDeckMap);
            const current = map.get(card.id) || 0;
            if (current >= 4) {
                alert('该卡已达到 4 张上限。');
                return;
            }
            map.set(card.id, 4);
            this.persistSelectedDeckCards(map, {
                protagonistCardId: this.selectedDeckProtagonistCardId,
                protagonistCharaName: this.selectedDeckProtagonistCharaName
            });
            this.previewCard = {
                ...card,
                _deckCount: 4
            };
        },
        async decreaseCardFromDeck(card) {
            if (!this.builderDeck || !card || this.isSelectingProtagonist) return;
            const map = new Map(this.selectedDeckMap);
            const current = map.get(card.id) || 0;
            if (current <= 0) {
                alert('当前卡组中没有该卡。');
                return;
            }
            if (String(card.id) === this.selectedDeckProtagonistCardId && current <= 1) {
                alert('主人公至少需要保留 1 张，不能继续减少。');
                return;
            }
            const next = current - 1;
            if (next <= 0) map.delete(card.id);
            else map.set(card.id, next);
            this.persistSelectedDeckCards(map, {
                protagonistCardId: this.selectedDeckProtagonistCardId,
                protagonistCharaName: this.selectedDeckProtagonistCharaName
            });
            this.previewCard = {
                ...card,
                _deckCount: Math.max(next, 0)
            };
        },
        async removeAllCopiesFromDeck(card) {
            if (!this.builderDeck || !card || this.isSelectingProtagonist) return;
            const map = new Map(this.selectedDeckMap);
            const current = map.get(card.id) || 0;
            if (current <= 0) {
                alert('当前卡组中没有该卡。');
                return;
            }
            if (String(card.id) === this.selectedDeckProtagonistCardId) {
                alert('主人公至少需要保留 1 张，不能完全去除。');
                return;
            }
            map.delete(card.id);
            this.persistSelectedDeckCards(map, {
                protagonistCardId: this.selectedDeckProtagonistCardId,
                protagonistCharaName: this.selectedDeckProtagonistCharaName
            });
            this.previewCard = {
                ...card,
                _deckCount: 0
            };
        },
        async removeCardFromDeck(cardId) {
            if (!this.builderDeck) return;
            const map = new Map(this.selectedDeckMap);
            const current = map.get(cardId) || 0;
            if (String(cardId) === this.selectedDeckProtagonistCardId && current <= 1) {
                alert('主人公至少需要保留 1 张，不能继续减少。');
                return;
            }
            if (current <= 1) map.delete(cardId);
            else map.set(cardId, current - 1);
            this.persistSelectedDeckCards(map, {
                protagonistCardId: this.selectedDeckProtagonistCardId,
                protagonistCharaName: this.selectedDeckProtagonistCharaName
            });
        },
        persistSelectedDeckCards(cardMap, options = {}) {
            if (!this.builderDeck) return;
            this.draftDeck = {
                ...this.builderDeck,
                protagonistCardId: options.protagonistCardId ?? this.selectedDeckProtagonistCardId,
                protagonistCharaName: options.protagonistCharaName ?? this.selectedDeckProtagonistCharaName,
                cards: [...cardMap.entries()].map(([cardId, count]) => ({ cardId, count }))
            };
        },
        async selectProtagonist(card) {
            if (!this.builderDeck || !card) return;
            const charaName = String(card.charaName || card.cardName || '').trim();
            if (String(card.cost || '').trim() !== '1') {
                alert('请选择 1 费卡作为主人公。');
                return;
            }

            const map = new Map(this.selectedDeckMap);
            map.set(card.id, Math.max(1, map.get(card.id) || 0));
            await this.persistSelectedDeckCards(map, {
                protagonistCardId: String(card.id || '').trim(),
                protagonistCharaName: charaName
            });
            this.selectedForceFilters = [];
            this.selectedCostFilters = [];
            this.closeCardPreview();
        },
        resetProtagonistSelection() {
            if (!this.builderDeck) return;
            this.draftDeck = {
                ...this.builderDeck,
                protagonistCardId: '',
                protagonistCharaName: ''
            };
            this.selectedForceFilters = [];
            this.selectedCostFilters = [];
            this.selectedSupportTimings = [];
            this.selectedSupportEmblems = [];
            this.closeDeckContentsModal();
            this.closeCardPreview();
        },
        buildDefaultDeckName() {
            const forceOrder = Object.keys(this.$options.forceColorNames || {});
            const cardById = new Map(this.cardPool.map(card => [String(card.id), card]));
            const usedForces = new Set();

            for (const item of this.builderDeck?.cards || []) {
                const card = cardById.get(String(item.cardId));
                const force = String(card?.force || '').trim();
                if (force) usedForces.add(force);
            }

            const colorParts = forceOrder
                .filter(force => usedForces.has(force))
                .map(force => this.$options.forceColorNames[force]);

            const protagonist = this.selectedDeckProtagonistCharaName || '主人公';
            if (colorParts.length === 1) {
                return `${colorParts[0]}单${protagonist}`;
            }
            return `${colorParts.join('') || '混色'}${protagonist}`;
        },
        async saveDraftDeck() {
            await this.persistDraftDeck({ hiddenPassword: this.draftHiddenPassword });
        },
        async saveHiddenDraftDeck() {
            const passwordInput = window.prompt('输入隐藏口令');
            if (passwordInput === null) return;
            const password = passwordInput.trim();
            if (!password) {
                alert('隐藏口令不能为空。');
                return;
            }
            this.draftHiddenPassword = password;
            alert(`已设置隐藏口令：${password}`);
        },
        async persistDraftDeck(options = {}) {
            if (!this.builderDeck || !this.selectedDeckProtagonistCardId) return;
            const hiddenPassword = String(options.hiddenPassword || '').trim();

            const requestedName = window.prompt('确认卡组名称', this.buildDefaultDeckName());
            if (requestedName === null) return;

            this.saving = true;
            try {
                const payload = {
                    ...this.builderDeck,
                    name: requestedName.trim() || this.buildDefaultDeckName(),
                    ...(hiddenPassword ? { password: hiddenPassword } : {})
                };
                const endpoint = hiddenPassword ? '/api/decks/hidden' : '/api/decks';
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const body = await this.readJsonResponse(res, endpoint);
                if (!res.ok) {
                    const msg = body?.validation?.errors?.join('\n') || body?.message || '保存失败';
                    alert(msg);
                    return;
                }
                await this.refreshDecks(false, hiddenPassword);
                this.selectedDeckId = body.deck.id;
                this.draftDeck = null;
                this.draftHiddenPassword = '';
                this.currentView = 'manager';
                this.resetBuilderFilters();
                if (!this.isDeckBattleReady(body.deck)) {
                    alert('卡组已保存。未满50张的卡组不能设为对战。');
                    return;
                }
                alert('卡组已保存。');
            } catch (error) {
                alert(`保存失败: ${error.message}`);
            } finally {
                this.saving = false;
            }
        },
        cardTitle(cardId) {
            const card = this.cardPool.find(c => c.id === cardId);
            return card ? `${card.cardName} (${cardId})` : cardId;
        },
        getCardImage(card) {
            return card?.image || card?.imgSrc || '';
        },
        filterButtonLabel(type) {
            if (type === 'force') return this.selectedForceFilters.length ? `势力 ${this.selectedForceFilters.length}` : '势力';
            if (type === 'cost') return this.selectedCostFilters.length ? `费用 ${this.selectedCostFilters.length}` : '费用';
            if (type === 'attack') return this.selectedAttackFilters.length ? `战斗力 ${this.selectedAttackFilters.length}` : '战斗力';
            if (type === 'supportValue') return this.selectedSupportFilters.length ? `支援力 ${this.selectedSupportFilters.length}` : '支援力';
            if (type === 'supportAbility') {
                const total = this.selectedSupportTimings.length + this.selectedSupportEmblems.length;
                return total ? `能力 ${total}` : '能力筛选';
            }
            return '筛选';
        },
        sortButtonLabel() {
            return this.sortMode === 'pinyin' ? '拼音排序' : 'ID排序';
        },
        getPinyinInitial(text) {
            const source = String(text || '').trim();
            if (!source) return '';
            const first = source.charAt(0);
            if (/^[A-Za-z]$/.test(first)) return first.toUpperCase();
            const boundaries = [
                ['A', '阿'],
                ['B', '八'],
                ['C', '嚓'],
                ['D', '咑'],
                ['E', '妸'],
                ['F', '发'],
                ['G', '旮'],
                ['H', '哈'],
                ['J', '击'],
                ['K', '喀'],
                ['L', '垃'],
                ['M', '妈'],
                ['N', '拿'],
                ['O', '哦'],
                ['P', '啪'],
                ['Q', '期'],
                ['R', '然'],
                ['S', '撒'],
                ['T', '塌'],
                ['W', '挖'],
                ['X', '昔'],
                ['Y', '压'],
                ['Z', '匝']
            ];

            let result = '#';
            for (const [letter, marker] of boundaries) {
                if (first.localeCompare(marker, 'zh-Hans-CN-u-co-pinyin') >= 0) {
                    result = letter;
                } else {
                    break;
                }
            }
            return result;
        },
        getSortDisplayName(card) {
            if (!card) return '';
            const name = String(card.charaName || card.cardName || card.name || '').trim();
            if (!name) return '';
            const initial = this.getPinyinInitial(name) || '#';
            return `${initial}${name}`;
        },
        openFilterPicker(type) {
            this.activeFilterType = type;
            if (type === 'supportAbility') {
                this.activeAbilityFilterStep = 'timing';
            }
        },
        closeFilterPicker() {
            this.activeFilterType = '';
            this.activeAbilityFilterStep = 'timing';
        },
        openSortDialog() {
            this.activeSortDialog = true;
        },
        closeSortDialog() {
            this.activeSortDialog = false;
        },
        setSortMode(mode) {
            this.sortMode = mode;
            this.closeSortDialog();
        },
        returnToManagerView() {
            this.currentView = 'manager';
            this.draftDeck = null;
            this.draftHiddenPassword = '';
            this.closeFilterPicker();
            this.closeSortDialog();
            this.closeDeckContentsModal();
            this.closeCardPreview();
            this.clearPendingPreview();
            this.selectedForceFilters = [];
            this.selectedCostFilters = [];
            this.selectedAttackFilters = [];
            this.selectedSupportFilters = [];
            this.selectedSupportTimings = [];
            this.selectedSupportEmblems = [];
        },
        toggleFilterValue(type, value) {
            const targetMap = {
                force: this.selectedForceFilters,
                cost: this.selectedCostFilters,
                attack: this.selectedAttackFilters,
                supportValue: this.selectedSupportFilters
            };
            const target = targetMap[type] || this.selectedCostFilters;
            const idx = target.indexOf(value);
            if (idx > -1) target.splice(idx, 1);
            else target.push(value);
        },
        clearActiveFilterGroup() {
            if (this.activeFilterType === 'force') this.selectedForceFilters = [];
            if (this.activeFilterType === 'cost') this.selectedCostFilters = [];
            if (this.activeFilterType === 'attack') this.selectedAttackFilters = [];
            if (this.activeFilterType === 'supportValue') this.selectedSupportFilters = [];
            if (this.activeFilterType === 'supportAbility') this.clearSupportAbilityFilter();
        },
        clearAllFilters() {
            this.selectedForceFilters = [];
            this.selectedCostFilters = [];
            this.selectedAttackFilters = [];
            this.selectedSupportFilters = [];
            this.selectedSupportTimings = [];
            this.selectedSupportEmblems = [];
            this.activeAbilityFilterStep = 'timing';
            this.closeFilterPicker();
        },
        toggleSupportTiming(value) {
            const idx = this.selectedSupportTimings.indexOf(value);
            if (idx > -1) {
                this.selectedSupportTimings.splice(idx, 1);
            } else {
                this.selectedSupportTimings.push(value);
            }
            this.selectedSupportEmblems = this.selectedSupportEmblems.filter(name => this.supportEmblemOptions.includes(name));
        },
        goToSupportEmblems() {
            if (!this.selectedSupportTimings.length) return;
            this.activeAbilityFilterStep = 'emblem';
        },
        toggleSupportEmblem(name) {
            const idx = this.selectedSupportEmblems.indexOf(name);
            if (idx > -1) {
                this.selectedSupportEmblems.splice(idx, 1);
            } else {
                this.selectedSupportEmblems.push(name);
            }
        },
        backToTimingSelection() {
            this.activeAbilityFilterStep = 'timing';
        },
        clearSupportAbilityFilter() {
            this.selectedSupportTimings = [];
            this.selectedSupportEmblems = [];
            this.activeAbilityFilterStep = 'timing';
        },
        openDeckContentsModal() {
            this.showDeckContentsModal = true;
        },
        closeDeckContentsModal() {
            this.showDeckContentsModal = false;
        },
        handleBuilderCardTap(card) {
            const event = arguments[1] || null;
            if (!card) return;
            if (this.isSelectingProtagonist) {
                this.openCardPreview(card);
                return;
            }

            if (this.pendingPreviewCardId === card.id && this.pendingPreviewTimer) {
                this.clearPendingPreview();
                this.addCardToDeck(card, { keepPreview: false });
                return;
            }

            if (event && Number(event.detail) > 1) return;

            this.clearPendingPreview();
            this.pendingPreviewCardId = card.id;
            this.pendingPreviewTimer = setTimeout(() => {
                this.pendingPreviewTimer = null;
                this.pendingPreviewCardId = '';
                this.openCardPreview(card);
            }, 340);
        },
        handleBuilderCardDoubleTap(card) {
            if (!card || this.isSelectingProtagonist) return;
            this.clearPendingPreview();
            this.addCardToDeck(card, { keepPreview: false });
        },
        openCardPreview(card) {
            this.clearPendingPreview();
            this.previewCard = {
                ...card,
                _deckCount: this.selectedDeckMap.get(card.id) || 0
            };
            this.showPreviewFullImage = false;
        },
        openPreviousPreview() {
            if (this.previewCardIndex <= 0) return;
            this.openCardPreview(this.builderCards[this.previewCardIndex - 1]);
        },
        openNextPreview() {
            if (this.previewCardIndex < 0 || this.previewCardIndex >= this.builderCards.length - 1) return;
            this.openCardPreview(this.builderCards[this.previewCardIndex + 1]);
        },
        closeCardPreview() {
            this.previewCard = null;
            this.showPreviewFullImage = false;
        },
        openPreviewFullImage() {
            this.showPreviewFullImage = true;
        },
        closePreviewFullImage() {
            this.showPreviewFullImage = false;
        },
        async importDeckJson() {
            const text = this.importText.trim();
            if (!text) return;
            try {
                const payload = this.parseDeckImportText(text);
                const res = await fetch('/api/decks/import/json', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const body = await this.readJsonResponse(res, '/api/decks/import/json');
                if (!res.ok) {
                    const msg = body?.validation?.errors?.join('\n') || body?.message || '导入失败';
                    alert(msg);
                    return;
                }
                this.importText = '';
                await this.refreshDecks(false);
                this.selectedDeckId = body.deck.id;
            } catch (error) {
                alert(`导入失败: ${error.message}`);
            }
        },
        parseDeckImportText(rawText) {
            const cleaned = this.normalizeImportJsonText(rawText);
            try {
                return JSON.parse(cleaned);
            } catch (firstError) {
                const relaxed = this.toRelaxedJson(cleaned);
                try {
                    return JSON.parse(relaxed);
                } catch {
                    throw new Error(`JSON 解析失败：${firstError.message}`);
                }
            }
        },
        normalizeImportJsonText(rawText) {
            let text = String(rawText || '').trim();
            if (!text) return text;

            // Remove markdown code fences such as ```json ... ```.
            if (text.startsWith('```')) {
                text = text.replace(/^```[a-zA-Z]*\s*/u, '').replace(/\s*```$/u, '').trim();
            }

            // If user pasted a quoted JSON string, decode it once.
            const startsWithQuote = text.startsWith('"') && text.endsWith('"');
            if (startsWithQuote) {
                try {
                    const decoded = JSON.parse(text);
                    if (typeof decoded === 'string') {
                        text = decoded.trim();
                    }
                } catch {
                    // keep original text
                }
            }

            return text;
        },
        toRelaxedJson(text) {
            let source = String(text || '').trim();
            if (!source) return source;

            // Remove trailing commas in objects/arrays.
            source = source.replace(/,(\s*[}\]])/g, '$1');

            // Convert single-quoted strings to double-quoted strings.
            source = source.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => {
                const normalized = value
                    .replace(/\\"/g, '"')
                    .replace(/"/g, '\\"');
                return `"${normalized}"`;
            });

            // Quote bare property names: { foo: 1 } => { "foo": 1 }
            source = source.replace(/([,{]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3');

            return source;
        },
        async exportDeckJson(id) {
            if (!id) return;
            const res = await fetch(this.getDeckEndpoint(`/${id}/export/json`));
            if (!res.ok) {
                alert('导出失败');
                return;
            }
            const text = await res.text();
            const copied = await this.copyTextToClipboard(text);
            this.actionDeckId = '';
            if (copied) {
                alert('已复制卡组 JSON 到剪贴板');
                return;
            }
            alert('自动复制失败：浏览器拒绝了剪贴板权限。请在浏览器设置中允许剪贴板写入后重试。');
        },
        async copyTextToClipboard(text) {
            const content = String(text || '');
            if (!content) return false;

            if (navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(content);
                    return true;
                } catch {
                    // continue to fallback
                }
            }

            try {
                const textarea = document.createElement('textarea');
                textarea.value = content;
                textarea.setAttribute('readonly', 'readonly');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.left = '-9999px';
                textarea.style.top = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const copied = document.execCommand('copy');
                document.body.removeChild(textarea);
                return copied;
            } catch {
                return false;
            }
        },
        toggleDeckActions(id) {
            this.actionDeckId = this.actionDeckId === id ? '' : id;
        },
        closeDeckActions() {
            this.actionDeckId = '';
        },
        requestModalClose() {
            if (this.currentView === 'builder' && this.draftDeck) {
                const ok = window.confirm('当前卡组未保存，是否要关闭？');
                if (!ok) return;
            }
            this.onClose();
        }
    },
    template: `
        <div v-if="visible" class="fixed inset-0 z-[90] flex items-center justify-center p-4 touch-manipulation" @dragstart.prevent @dblclick.prevent>
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="requestModalClose()"></div>
            <div
                class="relative w-full max-w-6xl h-[92vh] sm:h-[88vh] lg:h-[86vh] rounded-xl overflow-y-auto lg:overflow-hidden"
                :style="deckThemeModalStyle">
                <div v-if="currentView === 'manager'" class="h-full flex flex-col p-3 gap-3">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-base font-bold text-cyan-300">卡组管理</div>
                            <div class="text-[11px] text-gray-400">{{ deckListSubtitle }}</div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <button @click="promptDeckPasswordAccess()" :style="themedChipStyle(false)" class="px-3 py-2 text-xs rounded border shrink-0">
                                输入口令
                            </button>
                            <button @click="createEmptyDeck()" :disabled="saving" :style="themedChipStyle(true)" class="px-3 py-2 text-xs rounded border shrink-0">
                                新建新卡组
                            </button>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <button
                            @click="returnToPublicDecks()"
                            :style="themedChipStyle(!currentDeckPassword)"
                            class="px-3 py-1.5 text-xs rounded border">
                            公共
                        </button>
                        <button
                            @click="switchToPlayerDecks()"
                            :style="themedChipStyle(currentDeckPassword === playerDeckPassword && !!playerDeckPassword)"
                            class="px-3 py-1.5 text-xs rounded border">
                            玩家
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-2 relative z-[2]">
                        <button @click="showImportPanel = !showImportPanel" :style="themedChipStyle(showImportPanel)" class="px-2 py-1 text-xs rounded border">
                            {{ showImportPanel ? '收起导入' : '导入 JSON' }}
                        </button>
                    </div>

                    <div :class="showImportPanel ? 'flex' : 'hidden'" class="flex-col gap-2">
                        <textarea v-model="importText" class="w-full h-24 lg:h-28 text-[10px] p-2 bg-black/40 border border-white/10 rounded" placeholder="粘贴卡组 JSON"></textarea>
                        <button @click="importDeckJson()" :style="themedChipStyle(true)" class="px-2 py-1 text-xs rounded border self-start">导入 JSON</button>
                    </div>

                    <div class="flex-1 min-h-0 border border-white/10 rounded p-2 overflow-y-auto">
                        <div class="text-xs mb-2 text-cyan-300">{{ deckListTitle }}</div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                            <div v-for="deck in decks" :key="deck.id"
                                 @click="selectedDeckId = deck.id; closeDeckActions()"
                                 :class="selectedDeckId === deck.id ? 'border-cyan-400 bg-cyan-900/30' : 'border-white/10 bg-black/20'"
                                 class="relative text-left p-3 border rounded min-h-[96px] cursor-pointer">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0 flex-1">
                                        <div class="text-xs font-bold truncate">{{ deck.name }}</div>
                                        <div class="text-[10px] text-gray-400 truncate mt-1">{{ deck.id }}</div>
                                        <div class="text-[10px] text-gray-500 mt-1">{{ deck.cards?.length || 0 }} 种卡 / {{ getDeckTotal(deck) }} 张</div>
                                        <div class="text-[10px] text-amber-300 mt-1" v-if="!isDeckBattleReady(deck)">未满50张，不能设为对战</div>
                                        <div class="text-[10px] text-emerald-300 mt-1" v-if="isActiveDeck(deck)">当前对战卡组</div>
                                    </div>
                                    <button @click.stop="toggleDeckActions(deck.id)" class="px-2 py-1 text-[10px] rounded bg-white/5 border border-white/10 text-gray-200 shrink-0">
                                        更多
                                    </button>
                                </div>

                                <div v-if="actionDeckId === deck.id" class="absolute right-3 top-10 z-[5] w-32 rounded-lg border border-white/10 bg-neutral-950 shadow-[0_8px_24px_rgba(0,0,0,0.45)] p-1">
                                    <button @click.stop="setActiveDeck(deck.id)" class="w-full text-left px-2 py-2 text-[11px] rounded hover:bg-violet-900/40">设为对战</button>
                                    <button @click.stop="exportDeckJson(deck.id)" class="w-full text-left px-2 py-2 text-[11px] rounded hover:bg-blue-900/40">导出</button>
                                    <button @click.stop="deleteDeck(deck.id)" class="w-full text-left px-2 py-2 text-[11px] rounded hover:bg-red-900/40 text-red-300">删除</button>
                                </div>
                            </div>
                        </div>
                        <div v-if="!decks.length" class="text-[11px] text-gray-500 py-6 text-center">暂无卡组</div>
                    </div>
                </div>

                <div v-else class="h-full w-full p-3 flex flex-col gap-3 min-h-0 overflow-hidden">
                    <div class="sticky top-0 z-10 -mx-3 px-3 pt-0 pb-2 backdrop-blur-sm border-b" :style="deckThemeHeaderStyle">
                        <div class="flex items-center justify-between gap-3 mb-2">
                            <div>
                                <div class="text-sm font-bold text-emerald-300">构筑器</div>
                                <div class="text-[10px] text-gray-400 truncate">{{ selectedDeckProtagonistCharaName || '新卡组（未保存）' }}</div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <button v-if="isSelectingProtagonist" @click="returnToManagerView()" class="px-2 py-1 text-xs rounded border border-white/10 bg-white/5 text-gray-200">
                                    返回列表
                                </button>
                                <button v-else @click="resetProtagonistSelection()" class="px-2 py-1 text-xs rounded border border-white/10 bg-white/5 text-gray-200">
                                    返回
                                </button>
                                <button v-if="!isSelectingProtagonist" @click="openDeckContentsModal()" class="px-2 py-1 text-xs rounded border border-emerald-500/40 bg-emerald-900/20 text-emerald-200">
                                    现有卡组
                                </button>
                                <button v-if="!isSelectingProtagonist" @click="saveDraftDeck()" class="px-2 py-1 text-xs rounded border border-cyan-500/40 bg-cyan-700 text-white">
                                    保存
                                </button>
                                <button v-if="!isSelectingProtagonist" @click="saveHiddenDraftDeck()" class="px-2 py-1 text-xs rounded border border-violet-500/40 bg-violet-700 text-white">
                                    设为隐藏卡组
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center justify-between gap-3 mb-2">
                            <div class="text-xs text-gray-300">当前总数：{{ selectedDeckTotal }}<span v-if="draftHiddenPassword" class="text-violet-300"> / 卡组口令：{{ draftHiddenPassword }}</span></div>
                        </div>
                        <div v-if="isSelectingProtagonist" class="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
                            请先选择主人公。当前只显示 1 费卡，确认主人公后会恢复默认构筑器，并把同名角色卡排到最前面。
                        </div>
                        <template v-else>
                            <div class="flex flex-wrap gap-2">
                                <button @click="openFilterPicker('force')" :style="themedChipStyle(selectedForceFilters.length > 0)" class="px-2 py-1 text-xs rounded border">
                                    {{ filterButtonLabel('force') }}
                                </button>
                                <button @click="openFilterPicker('cost')" :style="themedChipStyle(selectedCostFilters.length > 0)" class="px-2 py-1 text-xs rounded border">
                                    {{ filterButtonLabel('cost') }}
                                </button>
                                <button @click="openFilterPicker('attack')" :style="themedChipStyle(selectedAttackFilters.length > 0)" class="px-2 py-1 text-xs rounded border">
                                    {{ filterButtonLabel('attack') }}
                                </button>
                                <button @click="openFilterPicker('supportValue')" :style="themedChipStyle(selectedSupportFilters.length > 0)" class="px-2 py-1 text-xs rounded border">
                                    {{ filterButtonLabel('supportValue') }}
                                </button>
                                <button @click="openFilterPicker('supportAbility')" :style="themedChipStyle(selectedSupportTimings.length > 0 || selectedSupportEmblems.length > 0)" class="px-2 py-1 text-xs rounded border">
                                    {{ filterButtonLabel('supportAbility') }}
                                </button>
                                <button @click="openSortDialog()" :style="themedChipStyle(sortMode === 'pinyin')" class="px-2 py-1 text-xs rounded border">
                                    {{ sortButtonLabel() }}
                                </button>
                                <button v-if="filterSummaryText" @click="clearAllFilters()" :style="themedChipStyle(false)" class="px-2 py-1 text-xs rounded border">
                                    清除筛选
                                </button>
                            </div>
                            <div v-if="filterSummaryText" class="mt-2 text-[10px] text-gray-400">
                                {{ filterSummaryText }}
                            </div>
                            <div v-if="selectedDeckProtagonistCharaName" class="mt-2 text-[10px] text-cyan-300">
                                主人公：{{ selectedDeckProtagonistCharaName }}
                            </div>
                        </template>
                        <div v-if="isSelectingProtagonist" class="mt-2">
                            <button @click="openFilterPicker('force')" class="px-2 py-1 text-xs rounded border border-cyan-500/40 bg-cyan-900/20 text-cyan-200">
                                {{ filterButtonLabel('force') }}
                            </button>
                            <button v-if="filterSummaryText" @click="clearAllFilters()" class="ml-2 px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-gray-200">
                                清除筛选
                            </button>
                            <div v-if="filterSummaryText" class="mt-2 text-[10px] text-gray-400">
                                {{ filterSummaryText }}
                            </div>
                        </div>
                    </div>
                    <div class="flex-1 min-h-0 overflow-hidden">
                        <div class="border border-white/10 rounded p-2 overflow-y-auto min-h-[220px] h-full">
                            <div class="text-xs mb-2 text-cyan-300">{{ isSelectingProtagonist ? '主人公候选（1 费卡）' : '卡池（单击查看详情，双击快速加入）' }}</div>
                            <div class="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 2xl:grid-cols-5 gap-2">
                                <button v-for="card in builderCards"
                                        :key="card.id"
                                    @click="handleBuilderCardTap(card, $event)"
                                    @dblclick.prevent="handleBuilderCardDoubleTap(card)"
                                        :title="card.cardName || card.name || card.id"
                                        class="group relative rounded-lg border border-amber-700/25 bg-[#1e1111]/45 p-1 hover:border-amber-400/60 hover:shadow-[0_0_18px_rgba(251,191,36,0.2)] transition-all">
                                    <img :src="getCardImage(card)" :alt="card.cardName || card.name || card.id" class="w-full h-[128px] sm:h-[144px] object-contain" draggable="false" />
                                    <div v-if="sortMode === 'pinyin' && !isSelectingProtagonist" class="absolute left-1 top-1 max-w-[70%] rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200 truncate">
                                        {{ getSortDisplayName(card) }}
                                    </div>
                                    <div class="absolute inset-x-1 bottom-1 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-1.5 py-1 text-[9px] text-white/90 opacity-90 group-hover:opacity-100 rounded">
                                        {{ card.id }}
                                    </div>
                                    <div v-if="selectedDeckMap.get(card.id)" class="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
                                        {{ selectedDeckMap.get(card.id) }}
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <card-detail-modal
                    :selected-card="previewCard"
                    :primary-action-label="isSelectingProtagonist ? '设为主人公' : '加入卡组'"
                    :on-primary-action="isSelectingProtagonist ? selectProtagonist : addCardToDeck"
                    :secondary-action-label="isSelectingProtagonist ? '' : '加至上限'"
                    :on-secondary-action="isSelectingProtagonist ? null : addCardToLimit"
                    :tertiary-action-label="isSelectingProtagonist ? '' : '减少一张'"
                    :on-tertiary-action="isSelectingProtagonist ? null : decreaseCardFromDeck"
                    :quaternary-action-label="isSelectingProtagonist ? '' : '完全去除'"
                    :on-quaternary-action="isSelectingProtagonist ? null : removeAllCopiesFromDeck"
                    :on-navigate-prev="previewCardIndex > 0 ? openPreviousPreview : null"
                    :on-navigate-next="previewCardIndex > -1 && previewCardIndex < builderCards.length - 1 ? openNextPreview : null"
                    :is-my-card="() => false"
                    :is-card-in-hand="() => false"
                    :is-dev-mode="false"
                    :is-my-turn="false"
                    current-phase=""
                    :show-full-image="showPreviewFullImage"
                    :formatted-ability="card => card"
                    :formatted-support="card => card"
                    :get-area-name="() => ''"
                    :get-area="() => null"
                    :play-to-field="() => {}"
                    :play-to-bond="() => {}"
                    :return-to-hand-from-board="() => {}"
                    :untap-card="() => {}"
                    :toggle-bond-face="() => {}"
                    :move-to="() => {}"
                    :can-perform-class-change="() => null"
                    :perform-class-change="() => {}"
                    :place-card-to-top-of-deck="() => {}"
                    :on-close="closeCardPreview"
                    :on-open-full-image="null">
                </card-detail-modal>

                <div v-if="showPreviewFullImage && previewCard" class="fixed inset-0 z-[100] bg-black flex items-center justify-center p-2" @click="closePreviewFullImage()">
                    <img :src="getCardImage(previewCard)" class="max-w-full max-h-full object-contain animate-zoom">
                </div>

                <div v-if="showDeckContentsModal" class="absolute inset-0 z-[94] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/75" @click="closeDeckContentsModal()"></div>
                    <div class="relative w-full max-w-lg max-h-[80vh] rounded-xl border border-amber-700/25 bg-[#160f0f]/95 p-4 flex flex-col gap-3">
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <div class="text-sm font-bold text-emerald-300">现有卡组内容</div>
                                <div class="text-[10px] text-gray-400">共 {{ selectedDeckCardDetails.length }} 种 / {{ selectedDeckTotal }} 张</div>
                            </div>
                            <button @click="closeDeckContentsModal()" class="px-2 py-1 text-xs rounded bg-amber-900/30 text-amber-100 border border-amber-700/25">关闭</button>
                        </div>
                        <div class="overflow-y-auto min-h-0">
                            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                <button
                                    v-for="item in selectedDeckCardDetails"
                                    :key="item.cardId"
                                    @click="removeCardFromDeck(item.cardId)"
                                    class="relative rounded-lg border border-amber-700/25 bg-[#1e1111]/45 p-1 hover:border-amber-400/60 transition-all">
                                    <img v-if="item.card" :src="getCardImage(item.card)" class="w-full h-[120px] sm:h-[132px] rounded object-contain" draggable="false" />
                                    <div v-else class="w-full h-[120px] sm:h-[132px] rounded bg-black/40"></div>
                                    <div class="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
                                        {{ item.count }}
                                    </div>
                                    <div class="mt-1 text-[10px] text-amber-100/85 truncate text-left">{{ cardTitle(item.cardId) }}</div>
                                </button>
                            </div>
                            <div v-if="!selectedDeckCardDetails.length" class="text-[11px] text-gray-500">暂无卡牌</div>
                        </div>
                    </div>
                </div>

                <div v-if="activeSortDialog" class="absolute inset-0 z-[95] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/75" @click="closeSortDialog()"></div>
                    <div class="relative w-full max-w-sm rounded-xl border border-white/10 bg-neutral-950 p-4 flex flex-col gap-3">
                        <div class="flex items-center justify-between gap-3">
                            <div class="text-sm font-bold text-white">选择排序</div>
                            <button @click="closeSortDialog()" class="px-2 py-1 text-xs rounded bg-white/5 text-gray-300">关闭</button>
                        </div>
                        <button @click="setSortMode('id')"
                                :class="sortMode === 'id' ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200'"
                                class="px-3 py-3 text-left text-xs rounded border">
                            ID排序
                        </button>
                        <button @click="setSortMode('pinyin')"
                                :class="sortMode === 'pinyin' ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200'"
                                class="px-3 py-3 text-left text-xs rounded border">
                            名字拼音首字母排序（马尔斯 M）
                        </button>
                    </div>
                </div>

                <div v-if="activeFilterType" class="absolute inset-0 z-[95] flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-black/75" @click="closeFilterPicker()"></div>
                    <div class="relative w-full max-w-sm rounded-xl border border-white/10 bg-neutral-950 p-4 flex flex-col gap-3">
                        <div class="flex items-center justify-between gap-3">
                            <div class="text-sm font-bold text-white">{{ filterDialogTitle }}</div>
                            <button @click="closeFilterPicker()" class="px-2 py-1 text-xs rounded bg-white/5 text-gray-300">关闭</button>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                            <div>{{ activeFilterValues.length ? ('已选 ' + activeFilterValues.length + ' 项') : '未选择' }}</div>
                            <button @click="clearActiveFilterGroup()" class="px-2 py-1 rounded bg-white/5 text-gray-200">清空当前</button>
                        </div>
                        <div v-if="activeFilterType !== 'supportAbility'" class="grid grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto pr-1">
                            <button v-for="option in activeFilterOptions"
                                    :key="option"
                                    @click="toggleFilterValue(activeFilterType, option)"
                                    :class="activeFilterValues.includes(option) ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200'"
                                    class="px-2 py-2 text-xs rounded border text-left">
                                {{ option }}
                            </button>
                        </div>
                        <template v-else>
                            <div v-if="activeAbilityFilterStep === 'timing'" class="grid grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto pr-1">
                                <button v-for="option in activeFilterOptions"
                                        :key="option.key"
                                        @click="toggleSupportTiming(option.value)"
                                        :class="selectedSupportTimings.includes(option.value) ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200'"
                                        class="px-2 py-3 text-xs rounded border text-left">
                                    {{ option.label }}
                                </button>
                            </div>
                            <div v-else class="flex flex-col gap-3 max-h-[45vh] overflow-y-auto pr-1">
                                <button @click="backToTimingSelection()" class="self-start px-2 py-1 text-xs rounded border border-white/10 bg-white/5 text-gray-200">
                                    返回触发时机
                                </button>
                                <div class="text-[11px] text-gray-400">
                                    当前：{{ selectedSupportTimings.join('、') }}
                                </div>
                                <div v-if="supportEmblemOptions.length" class="grid grid-cols-1 gap-2">
                                    <button v-for="option in supportEmblemOptions"
                                            :key="option"
                                            @click="toggleSupportEmblem(option)"
                                            :class="selectedSupportEmblems.includes(option) ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200'"
                                            class="px-2 py-2 text-xs rounded border text-left">
                                        {{ option }}
                                    </button>
                                </div>
                                <div v-else class="rounded border border-white/10 bg-white/5 px-3 py-3 text-[11px] text-gray-400">
                                    该 Timing 下暂无纹章。
                                </div>
                            </div>
                        </template>
                        <div class="flex justify-end gap-2">
                            <button v-if="activeFilterType === 'supportAbility' && activeAbilityFilterStep === 'timing'"
                                    @click="goToSupportEmblems()"
                                    :disabled="!selectedSupportTimings.length"
                                    class="px-3 py-1.5 text-xs rounded bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                                具体纹章
                            </button>
                            <button @click="closeFilterPicker()" class="px-3 py-1.5 text-xs rounded bg-cyan-700 text-white">完成</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
