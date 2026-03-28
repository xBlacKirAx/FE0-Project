const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const PACKAGE_LIST_URL = 'https://fecipher.card.moe/package';
const PACKAGE_BASE_URL = 'https://fecipher.card.moe';
const OUTPUT_JSON = path.join(__dirname, '..', 'data', 'cards_emblems_full.json');
const OUTPUT_CATALOG_JSON = path.join(__dirname, '..', 'data', 'support_effect_catalog_full.json');

const SUPPORT_EFFECT_ID_MAP = Object.freeze({
    '兄妹之纹章': 'EMBLEM_SIBLING',
    '光明之纹章': 'EMBLEM_LIGHT',
    '共斗之纹章': 'EMBLEM_COOP',
    '勇气之纹章': 'EMBLEM_COURAGE',
    '命运之纹章': 'EMBLEM_FATE',
    '圣血之纹章': 'EMBLEM_HOLY_BLOOD',
    '天空之纹章': 'EMBLEM_SKY',
    '封咒之纹章': 'EMBLEM_SEAL_CURSE',
    '希望之纹章': 'EMBLEM_HOPE',
    '幻影之纹章': 'EMBLEM_PHANTOM',
    '强者之纹章': 'EMBLEM_STRONG',
    '必中之纹章': 'EMBLEM_CERTAINTY',
    '忍术之纹章': 'EMBLEM_NINJUTSU',
    '抵抗之纹章': 'EMBLEM_RESISTANCE',
    '指挥之纹章': 'EMBLEM_COMMAND',
    '援护之纹章': 'EMBLEM_SUPPORT',
    '攻击之纹章': 'EMBLEM_ATTACK',
    '歌舞之纹章': 'EMBLEM_DANCE',
    '激励之纹章': 'EMBLEM_ENCOURAGE',
    '盗贼之纹章': 'EMBLEM_THIEF',
    '祈祷之纹章': 'EMBLEM_PRAYER',
    '筹措之纹章': 'EMBLEM_PROCUREMENT',
    '绝望之纹章': 'EMBLEM_DESPAIR',
    '英雄之纹章': 'EMBLEM_HERO',
    '计略之纹章': 'EMBLEM_STRATEGY',
    '连携之纹章': 'EMBLEM_LINK',
    '锻炼之纹章': 'EMBLEM_TRAINING',
    '防御之纹章': 'EMBLEM_DEFENSE',
    '预言之纹章': 'EMBLEM_PROPHECY',
    '魔术之纹章': 'EMBLEM_MAGIC',
    '黑暗之纹章': 'EMBLEM_DARK',
    '龙人之纹章': 'EMBLEM_MANAKETE',
    '龙血之纹章': 'EMBLEM_DRAGON_BLOOD',
    '龙鳞之纹章': 'EMBLEM_DRAGON_SCALE'
});

function parseSkillCost(html) {
    const costMatch = String(html || '').match(/\[(.*?)\]/);
    if (!costMatch) return null;

    const content = costMatch[1];
    if (content.includes('翻面')) {
        const numMatch = content.match(/\d+/);
        return {
            raw: content,
            action: '翻面',
            amount: numMatch ? parseInt(numMatch[0], 10) : 1
        };
    }
    return { raw: content, action: '其他', amount: 0 };
}

function parseSupportEffect(text) {
    const supportText = String(text || '').trim();
    if (!supportText) {
        return {
            effectName: null,
            effectId: null,
            effectTiming: null,
            effectParams: {}
        };
    }

    const titleMatch = supportText.match(/『(.*?)』/);
    const timingMatch = supportText.match(/〖(.*?)〗/);
    const effectName = titleMatch ? titleMatch[1].trim() : null;
    const effectTiming = timingMatch ? `〖${timingMatch[1].trim()}〗` : null;
    const effectId = effectName ? (SUPPORT_EFFECT_ID_MAP[effectName] || null) : null;
    const effectParams = {};

    const requiredAttackerForceMatch = supportText.match(/自己的攻击单位是<(.*?)>势力的场合/);
    if (requiredAttackerForceMatch) {
        effectParams.requiredAttackerForce = requiredAttackerForceMatch[1].trim();
    }

    const powerDeltaMatch = supportText.match(/战斗力\+([0-9]+)/);
    if (powerDeltaMatch) {
        effectParams.powerDelta = parseInt(powerDeltaMatch[1], 10);
    }

    const jewelBreakMatch = supportText.match(/破坏的宝玉变为([0-9]+)颗/);
    if (jewelBreakMatch) {
        effectParams.jewelBreakCount = parseInt(jewelBreakMatch[1], 10);
    }

    return {
        effectName,
        effectId,
        effectTiming,
        effectParams
    };
}

function splitCardAndCharaName(rawName) {
    const normalized = String(rawName || '').trim();
    if (!normalized) {
        return { cardName: '', charaName: '' };
    }

    const firstSpaceIndex = normalized.search(/\s/);
    if (firstSpaceIndex === -1) {
        return { cardName: normalized, charaName: '' };
    }

    return {
        cardName: normalized,
        charaName: normalized.slice(firstSpaceIndex).trim()
    };
}

function extractKeywords(text) {
    return {
        type: String(text || '').match(/【.*?】/g) || [],
        title: String(text || '').match(/『.*?』/g) || [],
        timing: String(text || '').match(/〖.*?〗/g) || []
    };
}

function toAbsoluteUrl(href) {
    if (!href) return null;
    return href.startsWith('http') ? href : `${PACKAGE_BASE_URL}${href}`;
}

async function fetchWithRetry(url, attempts = 3) {
    let lastError = null;
    for (let index = 1; index <= attempts; index += 1) {
        try {
            return await axios.get(url, { timeout: 20000 });
        } catch (error) {
            lastError = error;
            if (index < attempts) {
                await new Promise(resolve => setTimeout(resolve, index * 400));
            }
        }
    }
    throw lastError;
}

async function fetchPackageLinks() {
    const { data } = await fetchWithRetry(PACKAGE_LIST_URL);
    const $ = cheerio.load(data);
    const links = [];
    const seen = new Set();

    $('a[href^="/Package/"]').each((_, el) => {
        const href = $(el).attr('href');
        const code = String(href || '').split('/').pop();
        if (!code || seen.has(code)) return;
        seen.add(code);
        links.push({
            code,
            name: $(el).text().trim(),
            url: toAbsoluteUrl(href)
        });
    });

    return links;
}

function parseCardId(h2Text) {
    const match = String(h2Text || '').match(/([A-Z0-9]{2,3}-\d{3})/);
    return match ? match[1] : null;
}

function parseForce(h2Text, cardId) {
    if (!cardId) return '未知势力';
    const escapedCardId = cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(h2Text || '').match(new RegExp(`势力：\\s*(.*?)\\s*${escapedCardId}`));
    return match ? match[1].trim() : '未知势力';
}

function parsePackageCards(packageInfo, html) {
    const $ = cheerio.load(html);
    const cards = [];
    const seenIds = new Set();

    $('div[data-v-f2a5317e]').each((_, el) => {
        const container = $(el);
        const h2Element = container.find('h2');
        const h2Text = h2Element.text().trim();
        const cardId = parseCardId(h2Text);
        if (!cardId || seenIds.has(cardId)) return;
        seenIds.add(cardId);

        const getVal = (label) => container.find(`.symbolHead:contains("${label}")`).next('span').text().trim();
        const rawName = h2Element.find('a').text().trim();
        const { cardName, charaName } = splitCardAndCharaName(rawName);
        const abilitySpan = container.find('.symbolHead:contains("能力")').next('span');
        const abilityHtml = abilitySpan.html() || '';
        const abilityText = abilitySpan.text().trim();
        const supportText = container.find('.symbolHead:contains("支援能力")').next('span').text().trim();
        const supportEffect = parseSupportEffect(supportText);

        if (!supportEffect.effectId) return;

        const cardInfo = {
            id: cardId,
            packageCode: packageInfo.code,
            packageName: packageInfo.name,
            cardName,
            charaName,
            force: parseForce(h2Text, cardId),
            gender: getVal('性别'),
            weapon: getVal('武器'),
            rank: getVal('阶级'),
            cost: getVal('出击费用'),
            promoteCost: getVal('转职费用') || 'N/A',
            attack: parseInt(getVal('战斗力'), 10) || 0,
            support: parseInt(getVal('支援力'), 10) || 0,
            range: getVal('射程'),
            job: getVal('兵种'),
            traits: getVal('属性').split('/').map(t => t.trim()).filter(t => t && t !== '无'),
            ability: {
                text: abilityText,
                keywords: extractKeywords(abilityText),
                skillCost: parseSkillCost(abilityHtml)
            },
            supportAbility: {
                text: supportText,
                keywords: extractKeywords(supportText),
                effectName: supportEffect.effectName,
                effectId: supportEffect.effectId,
                effectTiming: supportEffect.effectTiming,
                effectParams: supportEffect.effectParams
            },
            image: `/images/cards/${cardId}.png`
        };

        cards.push(cardInfo);
    });

    return cards;
}

function buildCatalog(cards) {
    const catalog = new Map();
    for (const card of cards) {
        const effectId = card.supportAbility?.effectId;
        if (!effectId) continue;
        if (!catalog.has(effectId)) {
            catalog.set(effectId, {
                effectId,
                effectName: card.supportAbility.effectName,
                count: 0,
                timings: new Set(),
                exampleTexts: new Set(),
                requiredAttackerForces: new Set(),
                packages: new Set()
            });
        }
        const entry = catalog.get(effectId);
        entry.count += 1;
        if (card.supportAbility.effectTiming) entry.timings.add(card.supportAbility.effectTiming);
        if (card.supportAbility.text) entry.exampleTexts.add(card.supportAbility.text);
        if (card.supportAbility.effectParams?.requiredAttackerForce) {
            entry.requiredAttackerForces.add(card.supportAbility.effectParams.requiredAttackerForce);
        }
        if (card.packageCode) entry.packages.add(card.packageCode);
    }

    return Array.from(catalog.values())
        .map(entry => ({
            effectId: entry.effectId,
            effectName: entry.effectName,
            count: entry.count,
            timings: Array.from(entry.timings).sort(),
            requiredAttackerForces: Array.from(entry.requiredAttackerForces).sort(),
            packages: Array.from(entry.packages).sort(),
            exampleTexts: Array.from(entry.exampleTexts).slice(0, 10)
        }))
        .sort((a, b) => a.effectId.localeCompare(b.effectId));
}

async function main() {
    console.log('开始抓取全卡池纹章支援数据...');
    const packageLinks = await fetchPackageLinks();
    const cards = [];

    for (const packageInfo of packageLinks) {
        try {
            const { data } = await fetchWithRetry(packageInfo.url);
            const packageCards = parsePackageCards(packageInfo, data);
            cards.push(...packageCards);
            console.log(`${packageInfo.code}: 抓到 ${packageCards.length} 张纹章支援卡`);
        } catch (error) {
            console.error(`${packageInfo.code}: 抓取失败 - ${error.message}`);
        }
    }

    cards.sort((a, b) => a.id.localeCompare(b.id, 'zh-Hans-CN'));
    const catalog = buildCatalog(cards);

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(cards, null, 2), 'utf8');
    fs.writeFileSync(OUTPUT_CATALOG_JSON, JSON.stringify(catalog, null, 2), 'utf8');

    console.log(`完成：共 ${cards.length} 张纹章支援卡`);
    console.log(`数据文件：${OUTPUT_JSON}`);
    console.log(`目录文件：${OUTPUT_CATALOG_JSON}`);
}

main().catch((error) => {
    console.error(`抓取失败: ${error.message}`);
    process.exit(1);
});
