// modules/state/networkState.js

const { ref } = Vue;

export function createNetworkState() {
    const socket = io();
    const connectionScene = ref('connected');
    const roomId = ref('');
    const roomRole = ref('');
    const roomPlayerCount = ref(0);
    const roomReady = ref(false);
    const roomIsPrivate = ref(false);
    const roomQueueing = ref(false);
    const roomGameInProgress = ref(false);
    const roomStatusText = ref('未加入房间');

    return {
        socket,
        connectionScene,
        roomId,
        roomRole,
        roomPlayerCount,
        roomReady,
        roomIsPrivate,
        roomQueueing,
        roomGameInProgress,
        roomStatusText
    };
}
