// modules/viewModels.js

export function createPanelViewModels(state, computed) {
    const panelTitleMap = {
        bonds: '羁绊区 (点击卡牌快速翻面)',
        jewels: '宝玉区',
        graveyard: '弃牌区',
        boundless: '无限区',
        deck: '牌组',
        oppBonds: '对手羁绊区',
        oppJewels: '对手宝玉区',
        oppGraveyard: '对手弃牌区',
        oppDeck: '对手牌组',
        oppBoundless: '对手无限区'
    };

    const panelCardMap = {
        bonds: state.bonds,
        jewels: state.jewels,
        graveyard: state.graveyard,
        boundless: state.boundless,
        deck: state.deck,
        oppBonds: state.oppBonds,
        oppJewels: state.oppJewels,
        oppGraveyard: state.oppGraveyard,
        oppBoundless: state.oppBoundless
        // oppDeck 由 OppDeckPanel 单独处理（默认背面）
    };

    const activePanelTitle = computed(() => panelTitleMap[state.activePanel.value] || '区域');
    const activePanelCards = computed(() => panelCardMap[state.activePanel.value]?.value || []);
    const isOpponentPanel = computed(() => state.activePanel.value?.startsWith('opp') || false);

    const playerPanelButtons = computed(() => ([
        { key: 'jewels', label: '宝玉', count: state.jewels.value?.length || 0 },
        { key: 'graveyard', label: '弃牌', count: state.graveyard.value?.length || 0 },
        { key: 'deck', label: '牌组', count: state.deck.value?.length || 0 },
        { key: 'boundless', label: '无限', count: state.boundless.value?.length || 0 }
    ]));

    const enemyPanelButtons = computed(() => ([
        { key: 'oppJewels', label: '宝玉', count: state.oppJewels.value?.length || 0 },
        { key: 'oppGraveyard', label: '弃牌', count: state.oppGraveyard.value?.length || 0 },
        { key: 'oppDeck', label: '牌组', count: state.oppDeck.value?.length || 0 },
        { key: 'oppBoundless', label: '无限', count: state.oppBoundless.value?.length || 0 },
        { key: 'oppHand', label: '手牌', count: state.oppStats.value?.hand || 0 },
        { key: 'oppBonds', label: '羁绊', count: state.oppBonds.value?.length || 0 }
    ]));

    return {
        activePanelTitle,
        activePanelCards,
        isOpponentPanel,
        playerPanelButtons,
        enemyPanelButtons
    };
}
