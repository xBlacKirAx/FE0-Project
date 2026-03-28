export const DeckManagerModal = {
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
            searchText: '',
            newDeckName: '新卡组',
            importText: ''
        };
    },
    computed: {
        selectedDeck() {
            return this.decks.find(d => d.id === this.selectedDeckId) || null;
        },
        filteredCards() {
            const q = this.searchText.trim().toLowerCase();
            if (!q) return this.cardPool.slice(0, 80);
            return this.cardPool
                .filter(card => {
                    const hay = `${card.id} ${card.cardName || ''} ${card.charaName || ''} ${card.force || ''}`.toLowerCase();
                    return hay.includes(q);
                })
                .slice(0, 120);
        },
        selectedDeckMap() {
            const map = new Map();
            if (!this.selectedDeck?.cards) return map;
            this.selectedDeck.cards.forEach(item => {
                map.set(item.cardId, item.count);
            });
            return map;
        },
        selectedDeckTotal() {
            if (!this.selectedDeck?.cards) return 0;
            return this.selectedDeck.cards.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
        },
        selectedDeckValidationSummary() {
            if (!this.selectedDeck?.validation) return '';
            const v = this.selectedDeck.validation;
            if (v.valid) return '合法';
            return `不合法 (${(v.errors || []).length} 项)`;
        }
    },
    watch: {
        visible(next) {
            if (next) {
                this.bootstrap();
            }
        }
    },
    methods: {
        async bootstrap() {
            this.loading = true;
            try {
                this.activeDeckId = localStorage.getItem('fe0.selectedDeckId') || '';
                const [cardsRes, decksRes] = await Promise.all([
                    fetch('/api/cards'),
                    fetch('/api/decks')
                ]);
                const [cards, decks] = await Promise.all([cardsRes.json(), decksRes.json()]);
                this.cardPool = Array.isArray(cards) ? cards : [];
                this.decks = Array.isArray(decks) ? decks : [];
                if (!this.selectedDeckId && this.decks.length > 0) {
                    this.selectedDeckId = this.decks[0].id;
                }
                if (this.activeDeckId && !this.decks.some(d => d.id === this.activeDeckId)) {
                    this.activeDeckId = '';
                    localStorage.removeItem('fe0.selectedDeckId');
                }
            } catch (error) {
                alert(`加载卡组管理数据失败: ${error.message}`);
            } finally {
                this.loading = false;
            }
        },
        async refreshDecks(keepSelection = true) {
            const res = await fetch('/api/decks');
            const decks = await res.json();
            this.decks = Array.isArray(decks) ? decks : [];
            if (!keepSelection) {
                this.selectedDeckId = this.decks[0]?.id || null;
                return;
            }
            if (!this.selectedDeckId || !this.decks.some(d => d.id === this.selectedDeckId)) {
                this.selectedDeckId = this.decks[0]?.id || null;
            }
        },
        async createEmptyDeck() {
            this.saving = true;
            try {
                const payload = {
                    name: this.newDeckName || '新卡组',
                    format: 'standard',
                    cards: []
                };
                const res = await fetch('/api/decks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const body = await res.json();
                if (!res.ok) {
                    const msg = body?.validation?.errors?.join('\n') || body?.message || '创建失败';
                    alert(msg);
                    return;
                }
                await this.refreshDecks(false);
                this.selectedDeckId = body.deck.id;
            } catch (error) {
                alert(`创建卡组失败: ${error.message}`);
            } finally {
                this.saving = false;
            }
        },
        async validateDeck(id) {
            if (!id) return;
            try {
                const res = await fetch(`/api/decks/${id}/validate`, { method: 'POST' });
                const validation = await res.json();
                const idx = this.decks.findIndex(d => d.id === id);
                if (idx > -1) {
                    this.decks[idx] = {
                        ...this.decks[idx],
                        validation
                    };
                    this.decks = [...this.decks];
                }
            } catch (error) {
                alert(`校验失败: ${error.message}`);
            }
        },
        async deleteDeck(id) {
            if (!id) return;
            const ok = confirm('确认删除该卡组？');
            if (!ok) return;
            try {
                const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const body = await res.json();
                    alert(body?.message || '删除失败');
                    return;
                }
                await this.refreshDecks(false);
                if (this.activeDeckId === id) {
                    this.activeDeckId = '';
                    localStorage.removeItem('fe0.selectedDeckId');
                }
            } catch (error) {
                alert(`删除失败: ${error.message}`);
            }
        },
        setActiveDeck(id) {
            if (!id) return;
            this.activeDeckId = id;
            localStorage.setItem('fe0.selectedDeckId', id);
            alert('已设置为当前对战卡组。下次重置将使用该卡组。');
        },
        clearActiveDeck() {
            this.activeDeckId = '';
            localStorage.removeItem('fe0.selectedDeckId');
            alert('已清除当前对战卡组，将回退默认卡池。');
        },
        async addCardToDeck(card) {
            if (!this.selectedDeck) return;
            const map = new Map(this.selectedDeckMap);
            const next = (map.get(card.id) || 0) + 1;
            map.set(card.id, next);
            await this.persistSelectedDeckCards(map);
        },
        async removeCardFromDeck(cardId) {
            if (!this.selectedDeck) return;
            const map = new Map(this.selectedDeckMap);
            const current = map.get(cardId) || 0;
            if (current <= 1) map.delete(cardId);
            else map.set(cardId, current - 1);
            await this.persistSelectedDeckCards(map);
        },
        async persistSelectedDeckCards(cardMap) {
            if (!this.selectedDeck) return;
            this.saving = true;
            try {
                const cards = [...cardMap.entries()].map(([cardId, count]) => ({ cardId, count }));
                const payload = {
                    name: this.selectedDeck.name,
                    format: this.selectedDeck.format,
                    notes: this.selectedDeck.notes || '',
                    cards
                };
                const res = await fetch(`/api/decks/${this.selectedDeck.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const body = await res.json();
                if (!res.ok) {
                    const msg = body?.validation?.errors?.join('\n') || body?.message || '保存失败';
                    alert(msg);
                    return;
                }
                const idx = this.decks.findIndex(d => d.id === this.selectedDeck.id);
                if (idx > -1) {
                    this.decks[idx] = { ...body.deck, validation: body.validation };
                    this.decks = [...this.decks];
                }
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
        async importDeckJson() {
            const text = this.importText.trim();
            if (!text) return;
            try {
                const payload = JSON.parse(text);
                const res = await fetch('/api/decks/import/json', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const body = await res.json();
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
        async exportDeckJson(id) {
            if (!id) return;
            const res = await fetch(`/api/decks/${id}/export/json`);
            if (!res.ok) {
                alert('导出失败');
                return;
            }
            const text = await res.text();
            navigator.clipboard?.writeText(text);
            alert('已复制卡组 JSON 到剪贴板');
        }
    },
    template: `
        <div v-if="visible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="onClose()"></div>
            <div class="relative w-full max-w-6xl h-[86vh] bg-neutral-900 border border-cyan-600/40 rounded-xl flex overflow-hidden">
                <div class="w-1/3 border-r border-white/10 p-3 flex flex-col gap-3">
                    <div class="text-sm font-bold text-cyan-300">卡组列表</div>
                    <div class="flex gap-2">
                        <input v-model="newDeckName" class="flex-1 px-2 py-1 text-xs bg-black/40 border border-white/10 rounded" placeholder="新卡组名称" />
                        <button @click="createEmptyDeck()" :disabled="saving" class="px-2 py-1 text-xs bg-cyan-700 rounded">新建</button>
                    </div>
                    <div class="flex-1 overflow-y-auto space-y-2">
                        <button v-for="deck in decks" :key="deck.id" @click="selectedDeckId = deck.id"
                                :class="selectedDeckId === deck.id ? 'border-cyan-400 bg-cyan-900/30' : 'border-white/10 bg-black/20'"
                                class="w-full text-left p-2 border rounded">
                            <div class="text-xs font-bold truncate">{{ deck.name }}</div>
                            <div class="text-[10px] text-gray-400">{{ deck.id }}</div>
                            <div class="text-[10px] text-emerald-300" v-if="deck.id === activeDeckId">当前对战卡组</div>
                            <div class="text-[10px] text-amber-300" v-if="deck.validation">{{ deck.validation.valid ? '合法' : '不合法' }}</div>
                        </button>
                    </div>
                    <div class="flex gap-2">
                        <button @click="validateDeck(selectedDeckId)" class="px-2 py-1 text-xs bg-emerald-700 rounded">校验</button>
                        <button @click="setActiveDeck(selectedDeckId)" class="px-2 py-1 text-xs bg-violet-700 rounded">设为对战</button>
                        <button @click="clearActiveDeck()" class="px-2 py-1 text-xs bg-slate-700 rounded">清除</button>
                        <button @click="exportDeckJson(selectedDeckId)" class="px-2 py-1 text-xs bg-blue-700 rounded">导出</button>
                        <button @click="deleteDeck(selectedDeckId)" class="px-2 py-1 text-xs bg-red-700 rounded">删除</button>
                    </div>
                    <textarea v-model="importText" class="w-full h-28 text-[10px] p-2 bg-black/40 border border-white/10 rounded" placeholder="粘贴卡组 JSON"></textarea>
                    <button @click="importDeckJson()" class="px-2 py-1 text-xs bg-fuchsia-700 rounded">导入 JSON</button>
                </div>

                <div class="w-2/3 p-3 flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="text-sm font-bold text-emerald-300">构筑器</div>
                        <div class="text-xs text-gray-300">当前总数：{{ selectedDeckTotal }}</div>
                    </div>
                    <input v-model="searchText" class="w-full px-2 py-1 text-xs bg-black/40 border border-white/10 rounded" placeholder="搜索卡名/角色名/编号/势力" />
                    <div class="grid grid-cols-2 gap-3 flex-1 min-h-0">
                        <div class="border border-white/10 rounded p-2 overflow-y-auto">
                            <div class="text-xs mb-2 text-cyan-300">卡池（点击加入）</div>
                            <button v-for="card in filteredCards" :key="card.id" @click="addCardToDeck(card)" class="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-cyan-900/30">
                                {{ card.cardName }}
                                <span class="text-[10px] text-gray-400">({{ card.id }})</span>
                            </button>
                        </div>
                        <div class="border border-white/10 rounded p-2 overflow-y-auto">
                            <div class="text-xs mb-2 text-emerald-300">卡组内容（点击减少）</div>
                            <button v-for="item in selectedDeck?.cards || []" :key="item.cardId" @click="removeCardFromDeck(item.cardId)" class="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-emerald-900/30">
                                x{{ item.count }} {{ cardTitle(item.cardId) }}
                            </button>
                            <div v-if="!(selectedDeck?.cards || []).length" class="text-[11px] text-gray-500">暂无卡牌</div>
                        </div>
                    </div>
                    <div class="text-[11px] text-amber-300" v-if="selectedDeck?.validation && !selectedDeck.validation.valid">
                        {{ (selectedDeck.validation.errors || []).join(' / ') }}
                    </div>
                </div>
            </div>
        </div>
    `
};
