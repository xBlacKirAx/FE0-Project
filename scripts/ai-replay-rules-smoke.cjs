const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function resolveLogPath() {
    const rawArg = String(process.argv[2] || '').trim();
    if (rawArg) {
        return path.isAbsolute(rawArg) ? rawArg : path.join(projectRoot, rawArg);
    }

    const logDir = path.join(projectRoot, 'data', 'ai-duel-logs');
    const latest = fs.readdirSync(logDir)
        .filter(name => name.endsWith('.json'))
        .map(name => {
            const full = path.join(logDir, name);
            const stat = fs.statSync(full);
            return { full, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

    if (!latest?.full) {
        throw new Error('未找到可用的 AI 回放日志');
    }
    return latest.full;
}

function buildEffectTimingMap() {
    const catalogPath = path.join(projectRoot, 'data', 'support_effect_catalog_full.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const map = new Map();

    for (const item of Array.isArray(catalog) ? catalog : []) {
        const effectId = String(item?.effectId || '').trim();
        if (!effectId) continue;
        const timings = Array.isArray(item?.timings)
            ? item.timings.map(text => String(text || '').trim()).filter(Boolean)
            : [];
        map.set(effectId, timings);
    }

    return map;
}

function classifyRoleMismatch(effectId, role, effectTimingMap) {
    const timings = effectTimingMap.get(effectId) || [];
    if (timings.length === 0) return null;

    const hasAttack = timings.includes('〖攻击型〗');
    const hasDefense = timings.includes('〖防御型〗');
    const hasBoth = timings.includes('〖攻防型〗') || (hasAttack && hasDefense);
    if (hasBoth) return null;

    if (role === 'attacker' && hasDefense) return '攻击方错误触发防御型纹章';
    if (role === 'defender' && hasAttack) return '防御方错误触发攻击型纹章';
    return null;
}

function main() {
    const logPath = resolveLogPath();
    const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const effectTimingMap = buildEffectTimingMap();

    const violations = [];
    let sameNameSampleCount = 0;
    let timingCheckSampleCount = 0;

    for (const game of data.games || []) {
        for (const event of game.timeline || []) {
            if (event.tag === 'battle-preview') {
                const details = event.details || {};
                const attackerName = String(details.attacker?.charaName || '').trim();
                const defenderName = String(details.defender?.charaName || '').trim();
                const attackerSupport = details.attackerSupport || {};
                const defenderSupport = details.defenderSupport || {};

                const attackerSupportName = String(attackerSupport.charaName || '').trim();
                const defenderSupportName = String(defenderSupport.charaName || '').trim();

                const attackerSameName = attackerName && attackerSupportName && attackerName === attackerSupportName;
                const defenderSameName = defenderName && defenderSupportName && defenderName === defenderSupportName;

                if (attackerSameName) {
                    sameNameSampleCount += 1;
                    if (Number(attackerSupport.supportValue || 0) !== 0 || attackerSupport.supportFailed !== true) {
                        violations.push({
                            gameNo: game.gameNo,
                            seq: event.seq,
                            tag: event.tag,
                            line: event.line,
                            reason: '攻击方同名支援未被判定失败'
                        });
                    }
                }

                if (defenderSameName) {
                    sameNameSampleCount += 1;
                    if (Number(defenderSupport.supportValue || 0) !== 0 || defenderSupport.supportFailed !== true) {
                        violations.push({
                            gameNo: game.gameNo,
                            seq: event.seq,
                            tag: event.tag,
                            line: event.line,
                            reason: '防御方同名支援未被判定失败'
                        });
                    }
                }
            }

            if (event.tag === 'battle-support-effect') {
                const attackerEffect = event.details?.attackerSupportEffect || null;
                const defenderEffect = event.details?.defenderSupportEffect || null;

                const attackerEffectId = String(attackerEffect?.effectId || '').trim();
                const defenderEffectId = String(defenderEffect?.effectId || '').trim();

                if (attackerEffectId) {
                    const mismatchReason = classifyRoleMismatch(attackerEffectId, 'attacker', effectTimingMap);
                    if (mismatchReason) {
                        timingCheckSampleCount += 1;
                        if (attackerEffect.used === true || attackerEffect.canUse === true) {
                            violations.push({
                                gameNo: game.gameNo,
                                seq: event.seq,
                                tag: event.tag,
                                line: event.line,
                                reason: `${mismatchReason}: ${attackerEffectId}`
                            });
                        }
                    }
                }

                if (defenderEffectId) {
                    const mismatchReason = classifyRoleMismatch(defenderEffectId, 'defender', effectTimingMap);
                    if (mismatchReason) {
                        timingCheckSampleCount += 1;
                        if (defenderEffect.used === true || defenderEffect.canUse === true) {
                            violations.push({
                                gameNo: game.gameNo,
                                seq: event.seq,
                                tag: event.tag,
                                line: event.line,
                                reason: `${mismatchReason}: ${defenderEffectId}`
                            });
                        }
                    }
                }

            }
        }
    }

    assert(violations.length === 0, `发现规则回归: ${JSON.stringify(violations.slice(0, 10), null, 2)}`);

    console.log(
        `AI 回放规则烟测通过: ${path.basename(logPath)} | 同名支援样本=${sameNameSampleCount} | 时机越权样本=${timingCheckSampleCount}`
    );
}

try {
    main();
} catch (error) {
    console.error(`AI 回放规则烟测失败: ${error.message}`);
    process.exit(1);
}
