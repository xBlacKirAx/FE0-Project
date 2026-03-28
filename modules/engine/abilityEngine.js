// modules/engine/abilityEngine.js
// 单位能力（自/常/起/特）最小可用引擎 — 第一阶段
//
// 本模块职责：
//   1. 从卡片 ability.text 解析各段能力（parseAbilitySegments）
//   2. 判断【常】被动是否生效（evaluatePassive）
//   3. 判断【特】特殊部署条件是否满足（checkSpecialDeployCondition）
//   4. 列出当前可激活的【起】能力（getActivatableAbilities）
//   5. 触发【自】触发型能力（triggerAuto）
//
// 所有函数均为纯函数，接受"快照"对象，不直接修改 Vue 响应式状态，
// 由调用方决定如何将返回值写回状态。

// ─────────────────────────────────────────────────────────────────────────────
// 1. 解析：将 ability.text 切割为若干独立能力段
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 把 ability.text 中的每段能力切割为独立对象。
 * 格式：『能力名』【类型】〖限制〗[费用]效果文本
 *
 * @param {object} card - 完整卡片对象（使用 card.ability.text 和 card.ability.keywords）
 * @returns {AbilitySegment[]}
 *
 * @typedef {object} AbilitySegment
 * @property {string} title      - 能力名（不含书名号），如"英雄的凯歌"
 * @property {string} type       - "自"|"常"|"起"|"特"|"支"
 * @property {string} timing     - 附加限制文本，如"1回合1次"，无则为 ""
 * @property {string} costRaw    - 原始费用文本 "[翻面3...]"，无则为 ""
 * @property {string} effectText - 效果正文（不含 title/type/timing/cost）
 * @property {string} raw        - 该段原始文本
 */
export function parseAbilitySegments(card) {
    const text = card?.ability?.text;
    if (!text) return [];

    // 以『 开头的位置切分（保留分隔符）
    const rawSegments = text.split(/(?=『)/).map(s => s.trim()).filter(Boolean);
    const results = [];

    for (const raw of rawSegments) {
        // 提取  『标题』
        const titleMatch = raw.match(/^『([^』]+)』/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();

        // 提取 【类型】
        const typeMatch = raw.match(/【([^】]+)】/);
        if (!typeMatch) continue;
        const type = typeMatch[1].trim();  // 自|常|起|特|支

        // 提取 〖限制〗（可选）
        const timingMatch = raw.match(/〖([^〗]+)〗/);
        const timing = timingMatch ? timingMatch[1].trim() : '';

        // 提取 [费用]（可选）
        const costMatch = raw.match(/\[([^\]]+)\]/);
        const costRaw = costMatch ? costMatch[0] : '';

        // 效果正文 = 去掉所有前缀标记后的文本
        let effectText = raw
            .replace(/^『[^』]+』/, '')     // 标题
            .replace(/【[^】]+】/, '')       // 类型
            .replace(/〖[^〗]+〗/g, '')     // 限制（可能多个）
            .replace(/\[[^\]]+\]/, '')      // 费用（第一个方括号）
            .trim();

        results.push({ title, type, timing, costRaw, effectText, raw });
    }

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 【常】被动：评估在当前战场状态下是否生效及战斗力加成
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 快照：传入 evaluatePassive 的战场信息（纯 JS 对象，不含 Vue ref）。
 *
 * @typedef {object} PassiveContext
 * @property {object}   unit              - 持有该能力的单位卡
 * @property {string}   fieldArea         - unit 所在区域："front"|"rear"
 * @property {object[]} myFront           - 我方前排所有单位
 * @property {object[]} myRear            - 我方后排所有单位
 * @property {object[]} oppFront          - 对方前排
 * @property {object[]} oppRear           - 对方后排
 * @property {object|null} attacker       - 当前攻击单位（战斗中）
 * @property {object|null} defender       - 当前防御单位（战斗中）
 * @property {object|null} supportCard    - 当前支援卡
 * @property {number}   myJewels          - 我方宝玉数
 * @property {number}   oppJewels         - 对方宝玉数
 * @property {number}   myHandCount       - 我方手牌数
 * @property {number}   oppHandCount      - 对方手牌数
 * @property {number}   myBondCount       - 我方羁绊数
 * @property {number}   oppBondCount      - 对方羁绊数
 * @property {boolean}  isMyTurn          - 是否我方回合
 * @property {boolean}  isClassChanged    - unit 是否经过转职
 */

/**
 * 对一段【常】能力进行简单规则评估，返回它在当前上下文下的战斗力加成。
 * 本版本实现"最常见模式"，无法识别的模式返回 { powerDelta: 0, matched: false }。
 *
 * @param {AbilitySegment} segment
 * @param {PassiveContext} ctx
 * @returns {{ powerDelta: number, matched: boolean, note: string }}
 */
export function evaluatePassive(segment, ctx) {
    if (segment.type !== '常') return { powerDelta: 0, matched: false, note: '非常时能力' };

    const txt = segment.effectText;
    const unit = ctx.unit;
    const myAll = [...(ctx.myFront || []), ...(ctx.myRear || [])];
    const oppAll = [...(ctx.oppFront || []), ...(ctx.oppRear || [])];

    // ── 模式1：「这名单位攻击<X>属性单位的期间，战斗力+N」
    // 仅在战斗中有效
    const attackTraitMatch = txt.match(/攻击<([^>]+)>属性单位的期间.*?战斗力\+(\d+)/);
    if (attackTraitMatch) {
        const requiredTrait = attackTraitMatch[1];
        const delta = parseInt(attackTraitMatch[2], 10) || 0;
        // 仅当此单位是攻击方且对手防御单位具备该 trait
        const isAttacker = ctx.attacker && ctx.attacker.instanceId === unit.instanceId;
        const defenderHasTrait = (ctx.defender?.traits || []).includes(requiredTrait);
        if (isAttacker && defenderHasTrait) {
            return { powerDelta: delta, matched: true, note: `攻击<${requiredTrait}>+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `攻击<${requiredTrait}>+${delta}（条件未满足）` };
    }

    // ── 模式1b：「攻击<兽马>或<重甲>属性单位的期间，战斗力+N」
    const attackMultiTraitMatch = txt.match(/攻击<([^>]+)>或<([^>]+)>属性单位的期间.*?战斗力\+(\d+)/);
    if (attackMultiTraitMatch) {
        const reqA = attackMultiTraitMatch[1];
        const reqB = attackMultiTraitMatch[2];
        const delta = parseInt(attackMultiTraitMatch[3], 10) || 0;
        const isAttacker = ctx.attacker && ctx.attacker.instanceId === unit.instanceId;
        const defenderTraits = ctx.defender?.traits || [];
        if (isAttacker && (defenderTraits.includes(reqA) || defenderTraits.includes(reqB))) {
            return { powerDelta: delta, matched: true, note: `攻击<${reqA}>/<${reqB}>+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `攻击<${reqA}>/<${reqB}>+${delta}（未生效）` };
    }

    // ── 模式2：「我方战场上有N名以上其他<X>势力单位，战斗力+N」
    const allyFactionMatch = txt.match(/我方战场上有(\d+)名以上其他<([^>]+)>势力的单位.*?战斗力\+(\d+)/);
    if (allyFactionMatch) {
        const reqCount = parseInt(allyFactionMatch[1], 10);
        const reqFaction = allyFactionMatch[2];
        const delta = parseInt(allyFactionMatch[3], 10) || 0;
        const otherAllies = myAll.filter(c => c.instanceId !== unit.instanceId && c.force === reqFaction);
        if (otherAllies.length >= reqCount) {
            return { powerDelta: delta, matched: true, note: `我方${reqFaction}×${otherAllies.length}≥${reqCount}，+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `我方${reqFaction}×${otherAllies.length}<${reqCount}，+${delta}（未生效）` };
    }

    // ── 模式3：「我方战场上有N名以上其他出击费用X以下的单位，战斗力+N」
    const allyCostMatch = txt.match(/我方战场上有(\d+)名以上其他出击费用(\d+)以下的单位.*?战斗力\+(\d+)/);
    if (allyCostMatch) {
        const reqCount = parseInt(allyCostMatch[1], 10);
        const maxCost = parseInt(allyCostMatch[2], 10);
        const delta = parseInt(allyCostMatch[3], 10) || 0;
        const qualifying = myAll.filter(c => c.instanceId !== unit.instanceId && (parseInt(c.cost, 10) || 0) <= maxCost);
        if (qualifying.length >= reqCount) {
            return { powerDelta: delta, matched: true, note: `我方费用≤${maxCost}单位×${qualifying.length}≥${reqCount}，+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `我方费用≤${maxCost}单位×${qualifying.length}<${reqCount}，+${delta}（未生效）` };
    }

    // ── 模式4：「我方战场上每有1名其他<X>属性单位，战斗力+N」
    const perTraitMatch = txt.match(/我方战场上每有1名.*?<([^>]+)>属性.*?战斗力\+(\d+)/);
    if (perTraitMatch) {
        const reqTrait = perTraitMatch[1];
        const delta = parseInt(perTraitMatch[2], 10) || 0;
        const count = myAll.filter(c => c.instanceId !== unit.instanceId && (c.traits || []).includes(reqTrait)).length;
        return { powerDelta: delta * count, matched: true, note: `每有1名<${reqTrait}>+${delta}，共×${count}` };
    }

    // ── 模式5：「我方战场上每有1名其他「X」，战斗力+N」
    const perNameMatch = txt.match(/战场上每有1名.*?「([^」]+)」.*?战斗力\+(\d+)/);
    if (perNameMatch) {
        const reqName = perNameMatch[1];
        const delta = parseInt(perNameMatch[2], 10) || 0;
        const count = myAll.filter(c => c.instanceId !== unit.instanceId && c.charaName === reqName).length;
        return { powerDelta: delta * count, matched: true, note: `每有1名${reqName}+${delta}，共×${count}` };
    }

    // ── 模式6：「被「X」支援的期间，战斗力+N」
    const supportedByMatch = txt.match(/被「([^」]+)」支援的期间.*?战斗力\+(\d+)/);
    if (supportedByMatch) {
        const reqChara = supportedByMatch[1];
        const delta = parseInt(supportedByMatch[2], 10) || 0;
        const supportChara = (ctx.supportCard?.charaName || '').trim();
        if (supportChara === reqChara) {
            return { powerDelta: delta, matched: true, note: `被「${reqChara}」支援+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `被「${reqChara}」支援+${delta}（支援方不符）` };
    }

    // ── 模式7：「自己的回合中，战斗力+N」（或同效变体）
    const myTurnMatch = txt.match(/自己的回合.*?战斗力\+(\d+)/);
    if (myTurnMatch) {
        const delta = parseInt(myTurnMatch[1], 10) || 0;
        if (ctx.isMyTurn) {
            return { powerDelta: delta, matched: true, note: `我方回合+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `我方回合+${delta}（非我方回合）` };
    }

    // ── 模式7b：「自己的回合中，我方战场上存在「X」时，战斗力+N」
    const myTurnWithNameMatch = txt.match(/自己的回合.*?存在「([^」]+)」.*?战斗力\+(\d+)/);
    if (myTurnWithNameMatch) {
        const reqName = myTurnWithNameMatch[1];
        const delta = parseInt(myTurnWithNameMatch[2], 10) || 0;
        const hasNamed = myAll.some(c => (c.charaName || '') === reqName);
        if (ctx.isMyTurn && hasNamed) {
            return { powerDelta: delta, matched: true, note: `我方回合且存在${reqName}+${delta}` };
        }
        return { powerDelta: 0, matched: true, note: `我方回合且存在${reqName}+${delta}（未生效）` };
    }

    // ── 模式8：「对手没有手牌时，战斗力+N」
    const oppNoHandMatch = txt.match(/对手没有手牌.*?战斗力\+(\d+)/);
    if (oppNoHandMatch) {
        const delta = parseInt(oppNoHandMatch[1], 10) || 0;
        if ((ctx.oppHandCount || 0) === 0) {
            return { powerDelta: delta, matched: true, note: `对手无手牌+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `对手无手牌+${delta}（未生效）` };
    }

    // ── 模式9：「自己的手牌比对手多时，战斗力+N」
    const moreHandMatch = txt.match(/自己的手牌.*?比对手.*?战斗力\+(\d+)/);
    if (moreHandMatch) {
        const delta = parseInt(moreHandMatch[1], 10) || 0;
        if ((ctx.myHandCount || 0) > (ctx.oppHandCount || 0)) {
            return { powerDelta: delta, matched: true, note: `手牌比对手多+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `手牌比对手多+${delta}（未生效）` };
    }

    // ── 模式9b：「对手手牌在N张以下时，战斗力+N」
    const oppHandAtMostMatch = txt.match(/对手.*?手牌.*?(\d+)张以下.*?战斗力\+(\d+)/);
    if (oppHandAtMostMatch) {
        const maxHand = parseInt(oppHandAtMostMatch[1], 10);
        const delta = parseInt(oppHandAtMostMatch[2], 10) || 0;
        if ((ctx.oppHandCount || 0) <= maxHand) {
            return { powerDelta: delta, matched: true, note: `对手手牌≤${maxHand}+${delta}` };
        }
        return { powerDelta: 0, matched: true, note: `对手手牌≤${maxHand}+${delta}（未生效）` };
    }

    // ── 模式10：「自己的宝玉数量比对手少时，战斗力+N」
    const fewerJewelMatch = txt.match(/自己的宝玉.*?比对手少.*?战斗力\+(\d+)/);
    if (fewerJewelMatch) {
        const delta = parseInt(fewerJewelMatch[1], 10) || 0;
        if ((ctx.myJewels || 0) < (ctx.oppJewels || 0)) {
            return { powerDelta: delta, matched: true, note: `宝玉比对手少+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `宝玉比对手少+${delta}（未生效）` };
    }

    // ── 模式11：「自己的羁绊区有N张以上时，战斗力+N」
    const bondCountMatch = txt.match(/自己的羁绊卡有(\d+)张以上.*?战斗力\+(\d+)/);
    if (bondCountMatch) {
        const reqBonds = parseInt(bondCountMatch[1], 10);
        const delta = parseInt(bondCountMatch[2], 10) || 0;
        if ((ctx.myBondCount || 0) >= reqBonds) {
            return { powerDelta: delta, matched: true, note: `羁绊≥${reqBonds}+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `羁绊≥${reqBonds}+${delta}（未生效）` };
    }

    // ── 模式11b：「自己的羁绊张数是奇数时，战斗力+N」
    const oddBondMatch = txt.match(/羁绊卡.*?奇数.*?战斗力\+(\d+)/);
    if (oddBondMatch) {
        const delta = parseInt(oddBondMatch[1], 10) || 0;
        const bondCount = ctx.myBondCount || 0;
        if (bondCount % 2 === 1) {
            return { powerDelta: delta, matched: true, note: `羁绊奇数+${delta}` };
        }
        return { powerDelta: 0, matched: true, note: `羁绊奇数+${delta}（未生效）` };
    }

    // ── 模式12：「经过转职后，战斗力+N」（转职技标志）
    const classChangedMatch = txt.match(/经过转职.*?战斗力\+(\d+)/);
    if (classChangedMatch) {
        const delta = parseInt(classChangedMatch[1], 10) || 0;
        const isChanged = !!(unit._stackedCards?.length > 0 || ctx.isClassChanged);
        if (isChanged) {
            return { powerDelta: delta, matched: true, note: `转职后+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `转职后+${delta}（未转职）` };
    }

    // ── 模式13：「这名单位与〈X〉武器的单位战斗期间，战斗力+N」
    const vsWeaponMatch = txt.match(/(?:与|攻击)<([^>]+)>武器.*?战斗期间.*?战斗力\+(\d+)/);
    if (vsWeaponMatch) {
        const reqWeapon = vsWeaponMatch[1];
        const delta = parseInt(vsWeaponMatch[2], 10) || 0;
        const opponent = unit.instanceId === ctx.attacker?.instanceId ? ctx.defender : ctx.attacker;
        if ((opponent?.weapon || '') === reqWeapon) {
            return { powerDelta: delta, matched: true, note: `对阵<${reqWeapon}>武器+${delta}（生效）` };
        }
        return { powerDelta: 0, matched: true, note: `对阵<${reqWeapon}>武器+${delta}（未生效）` };
    }

    // ── 模式14：「这名单位被<魔法>以外的武器攻击期间，战斗力+N」
    const defendByNonWeaponMatch = txt.match(/被<([^>]+)>以外的武器攻击.*?战斗力\+(\d+)/);
    if (defendByNonWeaponMatch) {
        const exceptWeapon = defendByNonWeaponMatch[1];
        const delta = parseInt(defendByNonWeaponMatch[2], 10) || 0;
        const isDefender = ctx.defender && ctx.defender.instanceId === unit.instanceId;
        const attackerWeapon = ctx.attacker?.weapon || '';
        if (isDefender && attackerWeapon !== exceptWeapon) {
            return { powerDelta: delta, matched: true, note: `被<${exceptWeapon}>外武器攻击+${delta}` };
        }
        return { powerDelta: 0, matched: true, note: `被<${exceptWeapon}>外武器攻击+${delta}（未生效）` };
    }

    // 未匹配任何已知模式
    return { powerDelta: 0, matched: false, note: `【常】文本未识别：${txt.substring(0, 40)}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 【特】特殊出击条件检查
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} DeployContext
 * @property {object}   card           - 正在出击的卡
 * @property {object[]} myFront        - 我方前排
 * @property {object[]} myRear         - 我方后排
 * @property {object[]} myGraveyard    - 我方退避区
 * @property {number}   myGraveyardCount
 * @property {string|null} protagonistCharaName - 当前主人公角色名
 */

/**
 * 检查一段【特】能力描述的出击限制条件是否满足。
 * 返回 { allowed: boolean, note: string }。
 *
 * @param {AbilitySegment} segment
 * @param {DeployContext} ctx
 * @returns {{ allowed: boolean, blocked: boolean, note: string }}
 */
export function checkSpecialDeployCondition(segment, ctx) {
    if (segment.type !== '特') return { allowed: true, blocked: false, note: '非特殊能力' };

    const txt = segment.effectText;
    const card = ctx.card;
    const myAll = [...(ctx.myFront || []), ...(ctx.myRear || [])];

    // ── 限制：「退避区中的卡有N张以上时才能出击」
    const graveyardReqMatch = txt.match(/退避区.*?(\d+)张以上.*?才能出击/);
    if (graveyardReqMatch) {
        const req = parseInt(graveyardReqMatch[1], 10);
        const count = ctx.myGraveyardCount || ctx.myGraveyard?.length || 0;
        if (count >= req) {
            return { allowed: true, blocked: false, note: `退避区${count}张≥${req}，可出击` };
        }
        return { allowed: false, blocked: true, note: `退避区${count}张<${req}，禁止出击` };
    }

    // ── 权限：「即便战场上存在同名单位也可以出击，且战场上可以存在2名以上的同名单位」
    const multipleAllowedMatch = txt.match(/即便.*战场上存在.*也可以出击/);
    if (multipleAllowedMatch) {
        return { allowed: true, blocked: false, note: '特殊规则：允许场上存在多名同名单位' };
    }

    // ── 限制：「这张卡不能放置到羁绊区」（出击时不影响，记录即可）
    const noBondMatch = txt.match(/不能放置到羁绊区/);
    if (noBondMatch) {
        return { allowed: true, blocked: false, note: '此卡不能置入羁绊区（出击可行）' };
    }

    // ── 权限：「这张卡的单位名也当作「X」」（别名卡，不阻止出击）
    const aliasMatch = txt.match(/单位名也当作「([^」]+)」/);
    if (aliasMatch) {
        return { allowed: true, blocked: false, note: `${card.charaName} 也视为「${aliasMatch[1]}」` };
    }

    // 未识别的特殊能力文本，不阻止出击
    return { allowed: true, blocked: false, note: `【特】文本未识别，默认放行：${txt.substring(0, 40)}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 【起】激活型：列出当前可激活的能力
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ActivateContext
 * @property {object}   unit          - 持有能力的单位
 * @property {string}   fieldArea     - "front"|"rear"
 * @property {object[]} myHand        - 我方手牌
 * @property {object[]} myFront
 * @property {object[]} myRear
 * @property {object[]} bonds         - 我方羁绊区（用于翻面）
 * @property {number}   faceUpBonds   - 当前正面朝上的羁绊数（可翻面费用上限）
 * @property {boolean}  isMyTurn
 * @property {object}   usedOnceThisTurn - { [abilityTitle]: boolean } 记录本回合已用
 */

/**
 * 返回给定单位上所有当前可发动的【起】能力列表。
 *
 * @param {object} card
 * @param {ActivateContext} ctx
 * @returns {ActivatableAbility[]}
 *
 * @typedef {object} ActivatableAbility
 * @property {string}  title
 * @property {string}  costRaw
 * @property {string}  effectText
 * @property {boolean} canActivate
 * @property {string}  reason      - 不可用时的原因
 */
export function getActivatableAbilities(card, ctx) {
    const segments = parseAbilitySegments(card);
    const results = [];

    for (const seg of segments) {
        if (seg.type !== '起') continue;

        const timingLimit = seg.timing; // e.g. "1回合1次"
        // 〖1回合1次〗检查
        if (timingLimit === '1回合1次') {
            const alreadyUsed = !!(ctx.usedOnceThisTurn?.[seg.title]);
            if (alreadyUsed) {
                results.push({
                    title: seg.title,
                    costRaw: seg.costRaw,
                    effectText: seg.effectText,
                    canActivate: false,
                    reason: '本回合已使用（〖1回合1次〗）'
                });
                continue;
            }
        }

        // 位置限制检查：「仅限这名单位位于前卫区」
        if (seg.effectText.includes('仅限这名单位位于前卫区') && ctx.fieldArea !== 'front') {
            results.push({
                title: seg.title,
                costRaw: seg.costRaw,
                effectText: seg.effectText,
                canActivate: false,
                reason: '仅限前卫区可使用'
            });
            continue;
        }

        // 行动状态限制检查：「只能在这名单位处于未行动状态时使用」
        if (seg.effectText.includes('未行动状态时使用') && ctx.unit?.isTapped) {
            results.push({
                title: seg.title,
                costRaw: seg.costRaw,
                effectText: seg.effectText,
                canActivate: false,
                reason: '该单位已横置，需处于未行动状态'
            });
            continue;
        }

        // 费用初步检查：翻面N
        const flipMatch = seg.costRaw.match(/翻面(\d+)/);
        if (flipMatch) {
            const flipCost = parseInt(flipMatch[1], 10);
            if ((ctx.faceUpBonds || 0) < flipCost) {
                results.push({
                    title: seg.title,
                    costRaw: seg.costRaw,
                    effectText: seg.effectText,
                    canActivate: false,
                    reason: `翻面费用不足（需${flipCost}，现有${ctx.faceUpBonds || 0}）`
                });
                continue;
            }
        }

        // 费用：横置（消耗自身）
        if (seg.costRaw.includes('横置') && !seg.costRaw.includes('名其他')) {
            if (ctx.unit?.isTapped) {
                results.push({
                    title: seg.title,
                    costRaw: seg.costRaw,
                    effectText: seg.effectText,
                    canActivate: false,
                    reason: '该单位已横置，无法再次横置'
                });
                continue;
            }
        }

        results.push({
            title: seg.title,
            costRaw: seg.costRaw,
            effectText: seg.effectText,
            canActivate: true,
            reason: ''
        });
    }

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 【自】触发判断：给定触发点，返回在该时机应触发的能力列表
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 支持的触发时机（TriggerTiming）：
 *   'on-attack'          - 这名单位攻击时
 *   'on-attack-break'    - 这名单位的攻击击破敌方单位时
 *   'on-ally-deploy'     - 我方单位（其他）出击时
 *   'on-ally-attacked'   - 其他我方单位被攻击时
 *   'on-bond-flip'       - 翻面羁绊时（当做费用支付时）
 */

/**
 * @typedef {object} AutoTriggerContext
 * @property {string}   timing              - TriggerTiming
 * @property {object}   unit                - 持有能力的单位
 * @property {object|null} attacker
 * @property {object|null} defender
 * @property {object|null} deployedUnit     - 出击的目标（on-ally-deploy）
 * @property {object|null} attackedUnit     - 被攻击的我方单位（on-ally-attacked）
 * @property {object[]} myFront
 * @property {object[]} myRear
 * @property {string}   fieldArea           - unit 所在区域
 */

/**
 * 给定触发时机，返回该单位上所有【自】能力中与之匹配的段落列表。
 * 不执行能力效果，只做"是否触发"的判断（费用由调用方决定是否支付）。
 *
 * @param {object} card
 * @param {AutoTriggerContext} ctx
 * @returns {AutoTrigger[]}
 *
 * @typedef {object} AutoTrigger
 * @property {string}  title
 * @property {string}  costRaw
 * @property {string}  effectText
 * @property {boolean} hasCost      - 是否有可选费用（可选择不支付）
 * @property {string}  timing       - 匹配到的时机描述
 */
export function getAutoTriggers(card, ctx) {
    const segments = parseAbilitySegments(card);
    const results = [];

    for (const seg of segments) {
        if (seg.type !== '自') continue;

        const txt = seg.effectText;
        let matched = false;

        // ── 时机：「这名单位攻击时」
        if (ctx.timing === 'on-attack' && txt.match(/这名单位攻击时/)) {
            const isAttacker = ctx.attacker && ctx.attacker.instanceId === ctx.unit.instanceId;
            if (isAttacker) matched = true;
        }

        // ── 时机：「这名单位的攻击击破敌方单位时」
        if (ctx.timing === 'on-attack-break' && txt.match(/这名单位的攻击击破敌方单位时/)) {
            const isAttacker = ctx.attacker && ctx.attacker.instanceId === ctx.unit.instanceId;
            if (isAttacker) matched = true;
        }

        // ── 时机：「其他我方单位被攻击时」
        if (ctx.timing === 'on-ally-attacked' && txt.match(/其他我方单位被攻击时/)) {
            const notAttacked = !ctx.attackedUnit || ctx.unit.instanceId !== ctx.attackedUnit.instanceId;
            if (notAttacked) matched = true;
        }

        // ── 时机：「出击费用N以下的我方单位出击时」
        if (ctx.timing === 'on-ally-deploy' && ctx.deployedUnit) {
            const deployTriggerMatch = txt.match(/出击费用(\d+)以下的我方单位出击时/);
            if (deployTriggerMatch) {
                const maxCost = parseInt(deployTriggerMatch[1], 10);
                const deployCost = parseInt(ctx.deployedUnit.cost, 10) || 0;
                if (deployCost <= maxCost) matched = true;
            }
        }

        if (!matched) continue;

        const hasCost = seg.costRaw.length > 0;
        results.push({
            title: seg.title,
            costRaw: seg.costRaw,
            effectText: seg.effectText,
            hasCost,
            timing: ctx.timing
        });
    }

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. 工具：从游戏状态快照组装 PassiveContext / ActivateContext
//    （方便 app.js 和 combatCommands 调用，避免散落各处）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从 Vue 响应式 state 对象组装 PassiveContext 快照（脱引用）。
 * 传入 attacker/defender 是可选的（战斗阶段才有）。
 *
 * @param {object} state        - createGameFlowState() 返回的响应式状态对象
 * @param {object} unit         - 要评估的单位卡（已有 instanceId）
 * @param {object|null} attackerOverride
 * @param {object|null} defenderOverride
 * @param {object|null} supportCardOverride
 * @returns {PassiveContext}
 */
export function buildPassiveContext(state, unit, attackerOverride, defenderOverride, supportCardOverride) {
    return {
        unit,
        fieldArea: (state.fieldFront?.value || []).some(c => c.instanceId === unit.instanceId) ? 'front' : 'rear',
        myFront: [...(state.fieldFront?.value || [])],
        myRear: [...(state.fieldRear?.value || [])],
        oppFront: [...(state.opponentFront?.value || [])],
        oppRear: [...(state.opponentRear?.value || [])],
        attacker: attackerOverride ?? state.attacker?.value ?? null,
        defender: defenderOverride ?? state.defender?.value ?? null,
        supportCard: supportCardOverride ?? state.mySupportCard?.value ?? null,
        myJewels: (state.jewels?.value || []).length,
        oppJewels: (state.oppJewels?.value || state.oppStats?.value?.jewels || 0),
        myHandCount: (state.hand?.value || []).length,
        oppHandCount: (state.oppStats?.value?.hand || 0),
        myBondCount: (state.bonds?.value || []).length,
        oppBondCount: (state.oppStats?.value?.bonds || 0),
        isMyTurn: !!(state.isMyTurn?.value),
        isClassChanged: !!(unit._stackedCards?.length > 0)
    };
}

/**
 * 计算单位身上所有【常】被动在当前语境下的总战斗力加成。
 * 返回 { totalDelta, breakdown }
 *
 * @param {object} card
 * @param {PassiveContext} ctx
 */
export function computePassivePowerBonus(card, ctx) {
    const segments = parseAbilitySegments(card);
    let totalDelta = 0;
    const breakdown = [];

    for (const seg of segments) {
        if (seg.type !== '常') continue;
        const result = evaluatePassive(seg, ctx);
        if (result.powerDelta) totalDelta += result.powerDelta;
        breakdown.push({ title: seg.title, ...result });
    }

    // 光环类被动：从其他我方单位的【常】能力为当前单位追加加成。
    const allies = [...(ctx.myFront || []), ...(ctx.myRear || [])].filter(c => c.instanceId !== card.instanceId);
    allies.forEach(ally => {
        const allySegs = parseAbilitySegments(ally).filter(seg => seg.type === '常');
        allySegs.forEach(seg => {
            const txt = seg.effectText || '';

            const traitAura = txt.match(/其他所有<([^>]+)>属性的我方单位的战斗力\+(\d+)/);
            if (traitAura) {
                const reqTrait = traitAura[1];
                const delta = parseInt(traitAura[2], 10) || 0;
                if ((card.traits || []).includes(reqTrait)) {
                    totalDelta += delta;
                    breakdown.push({ title: `${seg.title}（光环）`, powerDelta: delta, matched: true, note: `获得<${reqTrait}>光环+${delta}` });
                }
            }

            const namedAura = txt.match(/我方的「([^」]+)」(?:和「([^」]+)」)?的战斗力\+(\d+)/);
            if (namedAura) {
                const nameA = namedAura[1];
                const nameB = namedAura[2] || '';
                const delta = parseInt(namedAura[3], 10) || 0;
                const myName = card.charaName || '';
                if (myName === nameA || (nameB && myName === nameB)) {
                    totalDelta += delta;
                    breakdown.push({ title: `${seg.title}（光环）`, powerDelta: delta, matched: true, note: `获得点名光环+${delta}` });
                }
            }
        });
    });

    return { totalDelta, breakdown };
}

/**
 * 检查卡片的所有【特】能力，返回第一个阻止出击的条件（若存在）。
 * 若全部放行则返回 null。
 *
 * @param {object} card
 * @param {DeployContext} ctx
 * @returns {{ blocked: boolean, note: string } | null}
 */
export function checkAllSpecialDeployConditions(card, ctx) {
    const segments = parseAbilitySegments(card);
    for (const seg of segments) {
        if (seg.type !== '特') continue;
        const result = checkSpecialDeployCondition(seg, ctx);
        if (result.blocked) return result;
    }
    return null;
}
