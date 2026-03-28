const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// --- 配置区 ---
const TARGET_URL = 'https://fecipher.card.moe/Package/B01';
const IMAGE_DIR = path.join(__dirname, 'images', 'cards');
const JSON_OUTPUT = 'cards_b01.json';

// 确保图片存储目录存在
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

/**
 * 下载图片函数
 * 包含 Referer 伪装以绕过图床防盗链
 */
async function downloadImage(url, filename) {
    const filePath = path.join(IMAGE_DIR, filename);
    if (fs.existsSync(filePath)) return; // 跳过已存在的图片

    try {
        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'Referer': 'https://fecipher.card.moe/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', (err) => {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                reject(err);
            });
        });
    } catch (err) {
        console.error(`图片下载失败 [${filename}]:`, err.message);
    }
}

/**
 * 解析技能代价 (Cost)
 * 提取 [翻面X] 中的动作和数量
 */
function parseSkillCost(html) {
    const costMatch = html.match(/\[(.*?)\]/); 
    if (!costMatch) return null;
    
    const content = costMatch[1];
    if (content.includes("翻面")) {
        const numMatch = content.match(/\d+/);
        return {
            raw: content,
            action: "翻面",
            amount: numMatch ? parseInt(numMatch[0]) : 1
        };
    }
    return { raw: content, action: "其他", amount: 0 };
}

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

function parseSupportEffect(text) {
    const supportText = (text || '').trim();
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

    const requiredAttackerForceMatches = [...supportText.matchAll(/<(.*?)>势力/g)].map(match => match[1].trim()).filter(Boolean);
    if (requiredAttackerForceMatches.length === 1) {
        effectParams.requiredAttackerForce = requiredAttackerForceMatches[0];
    }
    if (requiredAttackerForceMatches.length > 1) {
        effectParams.requiredAttackerForces = Array.from(new Set(requiredAttackerForceMatches));
    }
    if (supportText.includes('具备势力')) {
        effectParams.requireHasForce = true;
    }
    if (supportText.includes('不具备势力')) {
        effectParams.requireNoForce = true;
    }

    return {
        effectName,
        effectId,
        effectTiming,
        effectParams
    };
}

/**
 * 拆分卡名：以空格分割为称号(cardName)和角色名(charaName)
 */
function splitCardAndCharaName(rawName) {
    const normalized = (rawName || '').trim();
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

/**
 * 主抓取逻辑
 */
async function startScraping() {
    try {
        console.log('🚀 开始抓取 FE0 B01 系列数据...');
        const { data } = await axios.get(TARGET_URL);
        const $ = cheerio.load(data);
        const cards = [];
        const seenIds = new Set();

        // 遍历所有带有卡牌信息的容器
        $('div[data-v-f2a5317e]').each((i, el) => {
			
            const container = $(el);
            // 1. 提取 ID 和 势力 (从 h2 标签解析)
			const h2Element = container.find('h2');
			const h2Text = h2Element.text().trim(); // 例如: "势力： 光之剑 B01-011 阿利缇亚之盾 杜卡"
			
			const idMatch = h2Text.match(/B\d{2}-\d{3}/);
			if (!idMatch) return;
			const cardId = idMatch[0];

			if (seenIds.has(cardId)) return;
			seenIds.add(cardId);

			// 【新增逻辑】提取势力：匹配 "势力：" 后面到 ID 之前的部分
			const forceMatch = h2Text.match(/势力：\s*(.*?)\s*B\d{2}-\d{3}/);
			const force = forceMatch ? forceMatch[1].trim() : "未知势力";

			// 辅助：获取特定 label 后的 span 内容
			const getVal = (label) => container.find(`.symbolHead:contains("${label}")`).next('span').text().trim();

			// 2. 解析新增的 4 种信息
			const gender = getVal("性别"); // 抓取：男性/女性
			const weapon = getVal("武器"); // 抓取：枪/剑/魔法等
			const rank = getVal("阶级");   // 抓取：上级职业/下级职业

            // 2. 解析基本字段
            const attack = parseInt(getVal("战斗力")) || 0;
            const support = parseInt(getVal("支援力")) || 0;
            const traits = getVal("属性").split('/').map(t => t.trim()).filter(t => t !== "无");

            // 3. 解析能力与代价
            const abilitySpan = container.find('.symbolHead:contains("能力")').next('span');
            const abilityHtml = abilitySpan.html() || "";
            const abilityText = abilitySpan.text().trim();

            // 4. 解析支援能力
            const supportText = container.find('.symbolHead:contains("支援能力")').next('span').text().trim();
            const supportEffect = parseSupportEffect(supportText);

            // 5. 关键词提取 (正则)
            const extractKeywords = (text) => ({
                type: text.match(/【.*?】/g) || [],      // 【常】【起】
                title: text.match(/『.*?』/g) || [],     // 『技能名』
                timing: text.match(/〖.*?〗/g) || []    // 〖1回合1次〗〖攻击型〗
            });

            const rawName = h2Element.find('a').text().trim();
            const { cardName, charaName } = splitCardAndCharaName(rawName);

            const cardInfo = {
                id: cardId,
                cardName: cardName,
                charaName: charaName,
				force: force,   // 存储势力
				gender: gender, // 存储性别
				weapon: weapon, // 存储武器
				rank: rank,     // 存储阶级
                cost: getVal("出击费用"),
                promoteCost: getVal("转职费用") || "N/A",
                attack: attack,
                support: support,
                range: getVal("射程"),
                job: getVal("兵种"),
                traits: traits,
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

        console.log(`📊 共发现 ${cards.length} 张卡牌。准备下载图片并生成数据库...`);

        // 批量处理图片下载
        for (const card of cards) {
            // 定位对应的图片 URL
            const imgUrl = $(`img#img_${card.id}`).attr('src');
            if (imgUrl) {
                process.stdout.write(`正在下载 ${card.id}... `);
                await downloadImage(imgUrl, `${card.id}.png`);
                console.log('完成');
                // 停顿 300ms 保护服务器
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // 写入 JSON
        fs.writeFileSync(JSON_OUTPUT, JSON.stringify(cards, null, 2));
        console.log(`\n✅ 抓取成功！`);
        console.log(`📂 数据文件: ${JSON_OUTPUT}`);
        console.log(`🖼️ 图片目录: ${IMAGE_DIR}`);

    } catch (error) {
        console.error('❌ 抓取过程中出现错误:', error.message);
    }
}

// 执行
startScraping();