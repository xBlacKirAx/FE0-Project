function createConnectionRegistry(io, EVT) {
    const playerMap = new Map();
    const socketRoomMap = new Map();
    const rooms = new Map(); // roomId -> { hostId, guestId, password }

    const playerLabel = (socketId) => playerMap.get(socketId) || `(?${String(socketId || '').slice(-4)})`;
    const log = (socketId, msg) => {
        console.log(`[LOG ${new Date().toTimeString().slice(0, 8)}] [${playerLabel(socketId)}] ${msg}`);
    };

    const generateRoomId = () => {
        let roomId = '';
        do {
            roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
        } while (rooms.has(roomId));
        return roomId;
    };

    const getRoomStatePayload = (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            return {
                roomId: '',
                hostId: null,
                guestId: null,
                playerCount: 0,
                ready: false,
                gameInProgress: false,
                queueing: false
            };
        }
        const hostConnected = !!room.hostId && io.sockets.sockets.has(room.hostId);
        const guestConnected = !!room.guestId && io.sockets.sockets.has(room.guestId);
        const hostId = hostConnected ? room.hostId : null;
        const guestId = guestConnected ? room.guestId : null;
        const playerCount = (hostId ? 1 : 0) + (guestId ? 1 : 0);

        return {
            roomId,
            hostId,
            guestId,
            playerCount,
            ready: playerCount === 2,
            gameInProgress: !!room.gameInProgress,
            isPrivate: !!room.password,
            queueing: false
        };
    };

    const emitRoomStateToMember = (socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) return;
        const roomId = socketRoomMap.get(socketId) || '';
        if (!roomId) {
            socket.emit(EVT.ROOM_STATE, {
                roomId: '',
                hostId: null,
                guestId: null,
                playerCount: 0,
                ready: false,
                gameInProgress: false,
                isPrivate: false,
                queueing: false
            });
            return;
        }
        socket.emit(EVT.ROOM_STATE, getRoomStatePayload(roomId));
    };

    const emitRoomStateToRoom = (roomId) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (room.hostId) emitRoomStateToMember(room.hostId);
        if (room.guestId) emitRoomStateToMember(room.guestId);
    };

    const leaveCurrentRoom = (socket) => {
        const roomId = socketRoomMap.get(socket.id);
        if (!roomId) {
            emitRoomStateToMember(socket.id);
            return;
        }

        const room = rooms.get(roomId);
        socketRoomMap.delete(socket.id);
        socket.leave(roomId);

        if (!room) return;
        if (room.hostId === socket.id) room.hostId = null;
        if (room.guestId === socket.id) room.guestId = null;

        emitRoomStateToMember(socket.id);

        if (!room.hostId && !room.guestId) {
            rooms.delete(roomId);
            return;
        }

        emitRoomStateToRoom(roomId);
    };

    const createRoom = (socket, payload = {}) => {
        leaveCurrentRoom(socket);

        const roomId = generateRoomId();
        const password = String(payload.password || '').trim();
        rooms.set(roomId, { hostId: socket.id, guestId: null, password: password || null, lastGameStartAt: 0, gameInProgress: false });
        socket.join(roomId);
        socketRoomMap.set(socket.id, roomId);
        emitRoomStateToRoom(roomId);
        log(socket.id, `创建房间 ${roomId}${password ? '（私密）' : ''}`);
        return roomId;
    };

    const joinRoom = (socket, rawRoomId, payload = {}) => {
        const roomId = String(rawRoomId || '').trim().toUpperCase();
        if (!roomId) {
            socket.emit(EVT.ROOM_ERROR, { message: '房间号不能为空' });
            return false;
        }

        const room = rooms.get(roomId);
        if (!room) {
            socket.emit(EVT.ROOM_ERROR, { message: `房间 ${roomId} 不存在` });
            return false;
        }

        if (room.hostId === socket.id || room.guestId === socket.id) {
            emitRoomStateToMember(socket.id);
            return true;
        }

        if (room.password) {
            const provided = String(payload.password || '').trim();
            if (!provided || provided !== room.password) {
                socket.emit(EVT.ROOM_ERROR, { message: `房间 ${roomId} 口令错误` });
                return false;
            }
        }

        if (room.hostId && room.guestId) {
            socket.emit(EVT.ROOM_ERROR, { message: `房间 ${roomId} 已满` });
            return false;
        }

        leaveCurrentRoom(socket);

        if (!room.hostId) room.hostId = socket.id;
        else room.guestId = socket.id;

        socket.join(roomId);
        socketRoomMap.set(socket.id, roomId);
        emitRoomStateToRoom(roomId);
        log(socket.id, `加入房间 ${roomId}`);
        return true;
    };

    const quickMatch = (socket) => {
        if (socketRoomMap.get(socket.id)) {
            emitRoomStateToMember(socket.id);
            return;
        }

        // 新匹配逻辑：优先加入人数为1的公开房（password 为空）
        for (const [roomId, room] of rooms.entries()) {
            if (room.password) continue;

            const hostConnected = !!room.hostId && io.sockets.sockets.has(room.hostId);
            const guestConnected = !!room.guestId && io.sockets.sockets.has(room.guestId);
            const playerCount = (hostConnected ? 1 : 0) + (guestConnected ? 1 : 0);
            if (playerCount !== 1) continue;
            if (room.hostId === socket.id || room.guestId === socket.id) {
                emitRoomStateToMember(socket.id);
                return;
            }

            if (!hostConnected) room.hostId = null;
            if (!guestConnected) room.guestId = null;
            if (!room.hostId) room.hostId = socket.id;
            else room.guestId = socket.id;

            socket.join(roomId);
            socketRoomMap.set(socket.id, roomId);
            emitRoomStateToRoom(roomId);
            log(socket.id, `匹配成功，加入公开房 ${roomId}`);
            return;
        }

        // 没有可加入的公开单人房，则创建公开房并等待下一位匹配者
        const roomId = generateRoomId();
        rooms.set(roomId, { hostId: socket.id, guestId: null, password: null, lastGameStartAt: 0, gameInProgress: false });
        socket.join(roomId);
        socketRoomMap.set(socket.id, roomId);
        emitRoomStateToRoom(roomId);
        log(socket.id, `未找到可加入公开房，已创建公开房 ${roomId}`);
    };

    const relayToRoomPeers = (socket, eventName, payload) => {
        const roomId = socketRoomMap.get(socket.id);
        if (!roomId) return false;
        socket.to(roomId).emit(eventName, payload);
        return true;
    };

    const startRoomGame = (socket) => {
        const roomId = socketRoomMap.get(socket.id);
        if (!roomId) {
            socket.emit(EVT.ROOM_ERROR, { message: '你尚未加入房间' });
            return false;
        }
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit(EVT.ROOM_ERROR, { message: '房间不存在' });
            return false;
        }
        if (!room.hostId || !room.guestId) {
            socket.emit(EVT.ROOM_ERROR, { message: '人数不足，无法开局' });
            return false;
        }

        const now = Date.now();
        const lastGameStartAt = Number(room.lastGameStartAt || 0);
        if (now - lastGameStartAt < 2000) {
            log(socket.id, `房间 ${roomId} 开局请求过快，已忽略重复请求`);
            return false;
        }
        room.lastGameStartAt = now;
        room.gameInProgress = true;

        io.to(roomId).emit(EVT.ROOM_GAME_STARTED, {
            roomId,
            startedBy: socket.id,
            ts: now
        });
        log(socket.id, `房间 ${roomId} 开局`);
        return true;
    };

    const onConnect = (socket) => {
        const label = playerMap.size === 0 ? '玩家A' : playerMap.size === 1 ? '玩家B' : `观战${playerMap.size - 1}`;
        playerMap.set(socket.id, label);
        console.log(`[连接] ${label} (${socket.id.slice(-4)}) 已连接，当前在线: ${io.engine.clientsCount}`);
        socket.emit(EVT.ROOM_STATE, {
            roomId: '',
            hostId: null,
            guestId: null,
            playerCount: 0,
            ready: false,
            gameInProgress: false,
            isPrivate: false,
            queueing: false
        });
    };

    const onDisconnect = (socketId) => {
        console.log(`[断连] ${playerLabel(socketId)} 已断开，当前在线: ${io.engine.clientsCount - 1}`);

        const roomId = socketRoomMap.get(socketId);
        if (roomId) {
            const room = rooms.get(roomId);
            socketRoomMap.delete(socketId);
            if (room) {
                if (room.hostId === socketId) room.hostId = null;
                if (room.guestId === socketId) room.guestId = null;
                if (!room.hostId && !room.guestId) {
                    rooms.delete(roomId);
                } else {
                    emitRoomStateToRoom(roomId);
                }
            }
        }

        playerMap.delete(socketId);
    };

    return {
        log,
        onConnect,
        onDisconnect,
        createRoom,
        joinRoom,
        quickMatch,
        leaveCurrentRoom,
        relayToRoomPeers,
        startRoomGame
    };
}

module.exports = { createConnectionRegistry };
