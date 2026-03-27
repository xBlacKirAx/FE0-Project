// modules/formatters.js

export const formatAbility = (text) =>
    text ? text.replace(/能力：/g, '<span class="text-blue-400">【能力】</span>') : '无';

export const formatSupport = (text) =>
    text ? text.replace(/支援技能：/g, '<span class="text-yellow-500">【支援】</span>') : '无支援';
