// modules/state.js
// 集中管理所有响应式数据

const { ref } = Vue;

function createGameState() {
    // ===== 我方区域 =====
    const hand = ref([]);
    const fieldFront = ref([]);
    const fieldRear = ref([]);
    const bonds = ref([]);
    const jewels = ref([]);
    const graveyard = ref([]);
    const boundless = ref([]);
    const deck = ref([]);
    
    // ===== 对手区域 =====
    const opponentFront = ref([]);
    const opponentRear = ref([]);
    const oppJewels = ref([]);
    const oppGraveyard = ref([]);
    const oppBonds = ref([]);
    
    // ===== UI 相关状态 =====
    const selectedCard = ref(null);
    const activePanel = ref(null);
    const showFullImage = ref(false);
    const allCards = ref([]);
    
    // ===== 交互状态 =====
    const isDraggingOver = ref(null);
    const draggedCard = ref(null);
    const undoStack = ref([]);
    
    // ===== 游戏状态 =====
    const isDevMode = ref(true);
    const currentPhase = ref('BEGINNING');
    const isMyTurn = ref(true);
    const hasPlacedBond = ref(false);
    
    // ===== 对手统计 =====
    const oppStats = ref({ hand: 6, bonds: 0, active: 0 });
    
    // ===== Socket 连接 =====
    const socket = io();
    
    // ===== 游戏阶段定义 =====
    const PHASES = {
        BEGINNING: { name: '开始阶段' },
        BOND:      { name: '羁绊阶段' },
        DEPLOY:    { name: '出击阶段' },
        ATTACK:    { name: '攻击阶段' },
        END:       { name: '结束阶段' }
    };

    return {
        // 我方区域
        hand, fieldFront, fieldRear, bonds, jewels, graveyard, boundless, deck,
        // 对手区域
        opponentFront, opponentRear, oppJewels, oppGraveyard, oppBonds,
        // UI
        selectedCard, activePanel, showFullImage, allCards,
        // 交互
        isDraggingOver, draggedCard, undoStack,
        // 游戏状态
        isDevMode, currentPhase, isMyTurn, hasPlacedBond,
        oppStats, socket, PHASES
    };
}
