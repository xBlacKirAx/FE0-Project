const { toInt } = require('./deckAiProfileUtils');
const { copilotMidrangeProfile, copilotAggroProfile } = require('./copilotDeckAiProfiles');
const { geminiMidrangeProfile, geminiAggroProfile } = require('./geminiDeckAiProfiles');

const authorProfileRegistry = Object.create(null);
const aiProfiles = Object.create(null);

function getCardName(card) {
    return String(card?.cardName || card?.name || '未知卡').trim();
}

function normalizeAuthor(author) {
    return String(author || 'gemini').trim().toLowerCase();
}

function registerAuthorProfiles(author, config = {}) {
    const normalizedAuthor = normalizeAuthor(author);
    const {
        midrangeProfile = null,
        aggroProfile = null,
        aggroKeywords = ['光剑', '光之剑', '飞兵']
    } = config;

    authorProfileRegistry[normalizedAuthor] = {
        midrangeProfile,
        aggroProfile,
        aggroKeywords: Array.isArray(aggroKeywords) ? aggroKeywords : ['光剑', '光之剑', '飞兵']
    };

    if (midrangeProfile?.key) aiProfiles[midrangeProfile.key] = midrangeProfile;
    if (aggroProfile?.key) aiProfiles[aggroProfile.key] = aggroProfile;
}

function inferProfileByDeckName(deckName = '', author = 'gemini') {
    const normalizedAuthor = normalizeAuthor(author);
    const profileSet = authorProfileRegistry[normalizedAuthor] || authorProfileRegistry.gemini;
    const text = String(deckName || '');
    const isAggro = (profileSet?.aggroKeywords || []).some(keyword => text.includes(keyword));
    return isAggro ? profileSet.aggroProfile : profileSet.midrangeProfile;
}

function cardBrief(card) {
    if (!card) return '空';
    return `${getCardName(card)}(攻${toInt(card.attack, 0)}/援${toInt(card.support, 0)}/费${toInt(card.cost, 0)})`;
}

registerAuthorProfiles('gemini', {
    midrangeProfile: geminiMidrangeProfile,
    aggroProfile: geminiAggroProfile,
    aggroKeywords: ['光剑', '光之剑', '飞兵']
});

registerAuthorProfiles('copilot', {
    midrangeProfile: copilotMidrangeProfile,
    aggroProfile: copilotAggroProfile,
    aggroKeywords: ['光剑', '光之剑', '飞兵']
});

module.exports = {
    copilotMidrangeProfile,
    copilotAggroProfile,
    geminiMidrangeProfile,
    geminiAggroProfile,
    aiProfiles,
    registerAuthorProfiles,
    inferProfileByDeckName,
    toInt,
    cardBrief
};
