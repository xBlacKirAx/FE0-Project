// modules/state/networkState.js

const { ref } = Vue;

export function createNetworkState() {
    const socket = io();
    return { socket };
}
