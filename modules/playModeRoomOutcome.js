// 房间游玩模式：决杀 / 败北 / 抽空卡组 等结局的统一通知（可挂接「保存录像」）。

let handler = null;

export function setPlayModeRoomOutcomeHandler(fn) {
    handler = typeof fn === 'function' ? fn : null;
}

export function notifyPlayModeRoomOutcome(detail) {
    const payload = detail && typeof detail === 'object' ? detail : { message: String(detail || '') };
    if (handler) {
        handler(payload);
        return;
    }
    const msg = String(payload.message || '').trim();
    if (msg) window.alert(msg);
}
