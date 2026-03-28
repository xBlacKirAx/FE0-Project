// modules/engine/phaseEngine.js

export const PHASE_ORDER = ['BEGINNING', 'BOND', 'DEPLOY', 'ATTACK', 'END'];

export const PHASE_NAME_MAP = {
    BEGINNING: '开始阶段',
    BOND: '羁绊阶段',
    DEPLOY: '出击阶段',
    ATTACK: '行动阶段',
    END: '结束阶段'
};

export function getNextPhase(currentPhase) {
    const idx = PHASE_ORDER.indexOf(currentPhase);
    if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
    return PHASE_ORDER[idx + 1];
}
