// modules/formatters.js

const escapeHtml = (raw) => String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeRichText = (text) => {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    return escapeHtml(normalized).replace(/\r?\n/g, '<br>');
};

export const formatAbility = (text) => {
    const safe = normalizeRichText(text);
    if (!safe) return '无';
    return safe.replace(/能力：/g, '<span class="text-blue-400">【能力】</span>');
};

export const formatSupport = (text) => {
    const safe = normalizeRichText(text);
    if (!safe) return '无支援';
    return safe.replace(/支援技能：/g, '<span class="text-yellow-500">【支援】</span>');
};
