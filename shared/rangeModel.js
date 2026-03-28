(function initRangeModel(globalScope, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    globalScope.RANGE_MODEL = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRangeModel() {
    function normalizeRange(raw) {
        const text = String(raw || '').trim();
        if (text === '1' || text === '2' || text === '1-2' || text === '-') return text;
        return '-';
    }

    function getAreaIndex(areaName) {
        if (areaName === 'my-rear') return 0;
        if (areaName === 'my-front') return 1;
        if (areaName === 'opp-front') return 2;
        if (areaName === 'opp-rear') return 3;
        return null;
    }

    function getAttackDistance(attackerArea, defenderArea) {
        const attackerIndex = getAreaIndex(attackerArea);
        const defenderIndex = getAreaIndex(defenderArea);
        if (attackerIndex === null || defenderIndex === null) return null;
        return Math.abs(defenderIndex - attackerIndex);
    }

    function getAllowedDistances(rangeOrRaw) {
        const range = normalizeRange(rangeOrRaw);
        if (range === '-') return [0];
        if (range === '1') return [1];
        if (range === '2') return [2];
        if (range === '1-2') return [1, 2];
        return [];
    }

    function canHitByRange(rangeOrRaw, attackerArea, defenderArea) {
        const distance = getAttackDistance(attackerArea, defenderArea);
        if (distance === null) {
            return {
                valid: false,
                range: normalizeRange(rangeOrRaw),
                distance: null,
                allowedDistances: [],
                reason: 'invalid-distance'
            };
        }

        const range = normalizeRange(rangeOrRaw);
        const allowedDistances = getAllowedDistances(range);
        if (!allowedDistances.length) {
            return {
                valid: false,
                range,
                distance,
                allowedDistances,
                reason: 'unsupported-range'
            };
        }

        return {
            valid: allowedDistances.includes(distance),
            range,
            distance,
            allowedDistances,
            reason: allowedDistances.includes(distance) ? 'ok' : 'range-distance-mismatch'
        };
    }

    function describeRange(rangeOrRaw) {
        const range = normalizeRange(rangeOrRaw);
        if (range === '-') return '射程0：仅可命中同区域（实战中无可攻击敌方目标）';

        const allowedDistances = getAllowedDistances(range);
        if (!allowedDistances.length) return '射程规则未定义';

        if (allowedDistances.length === 1) {
            return `可命中距离${allowedDistances[0]}区域`;
        }
        return `可命中距离${allowedDistances.join('或')}区域`;
    }

    return Object.freeze({
        normalizeRange,
        getAreaIndex,
        getAttackDistance,
        getAllowedDistances,
        canHitByRange,
        describeRange
    });
});
