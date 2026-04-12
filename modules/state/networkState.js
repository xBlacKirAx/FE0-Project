// modules/state/networkState.js

const { ref } = Vue;

export function createNetworkState() {
    const playerName = String(localStorage.getItem('fe0.playerDisplayName') || '').trim();
    const socket = io({
        auth: {
            playerName
        }
    });
    const connectionScene = ref('connected');
    const roomId = ref('');
    const roomRole = ref('');
    const roomHostName = ref('');
    const roomGuestName = ref('');
    const roomPlayerCount = ref(0);
    const roomReady = ref(false);
    const roomIsPrivate = ref(false);
    const roomQueueing = ref(false);
    const roomGameInProgress = ref(false);
    const roomMode = ref('normal');
    const tutorialId = ref('');
    const roomStatusText = ref('未加入房间');

    return {
        socket,
        connectionScene,
        roomId,
        roomRole,
        roomHostName,
        roomGuestName,
        roomPlayerCount,
        roomReady,
        roomIsPrivate,
        roomQueueing,
        roomGameInProgress,
        roomMode,
        tutorialId,
        roomStatusText
    };
}
