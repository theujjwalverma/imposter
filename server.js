const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 100;

const words = [
  "Pizza",
  "Tiger",
  "Mango",
  "Airport",
  "Doctor",
  "Netflix",
  "Elephant",
];

function randomWord() {
  return words[Math.floor(Math.random() * words.length)];
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function chooseImposter(playerIds) {
  return playerIds[Math.floor(Math.random() * playerIds.length)];
}

function generateHostKey() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

const rooms = new Map();

function roomView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    stage: room.stage,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.id === room.hostId,
    })),
    maxPlayers: MAX_PLAYERS,
    reveal: room.reveal,
  };
}

function getPlayerRoleData(room, socketId) {
  if (room.stage === "lobby") return { stage: "lobby" };

  if (room.stage === "started" || room.stage === "voting" || room.stage === "revealed") {
    return {
      stage: room.stage,
      card: room.imposterId === socketId ? "IMPOSTER" : room.word,
      hasVoted: room.votesByVoter.has(socketId),
      votes: Object.fromEntries(room.votesByTarget.entries()),
      reveal: room.reveal,
    };
  }

  return { stage: room.stage };
}

function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("room:update", roomView(room));

  for (const player of room.players.values()) {
    io.to(player.id).emit("game:state", getPlayerRoleData(room, player.id));
  }
}

function removePlayerFromRoom(room, socketId) {
  room.players.delete(socketId);
  room.votesByVoter.delete(socketId);

  for (const [targetId, count] of room.votesByTarget.entries()) {
    if (targetId === socketId) {
      room.votesByTarget.delete(targetId);
    } else {
      room.votesByTarget.set(targetId, count);
    }
  }

  if (room.hostId === socketId) {
    const nextHost = room.players.values().next().value;
    room.hostId = nextHost ? nextHost.id : null;
    room.hostName = nextHost ? nextHost.name : null;
  }
}

function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.players.size === 0) {
    rooms.delete(roomCode);
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }, cb) => {
    const trimmedName = String(name || "").trim().slice(0, 24);
    if (!trimmedName) {
      cb?.({ ok: false, message: "Name is required." });
      return;
    }

    let code = randomRoomCode();
    while (rooms.has(code)) {
      code = randomRoomCode();
    }

    const room = {
      code,
      hostId: socket.id,
      hostKey: generateHostKey(),
      hostName: trimmedName,
      stage: "lobby",
      players: new Map(),
      word: null,
      imposterId: null,
      votesByVoter: new Map(),
      votesByTarget: new Map(),
      reveal: null,
    };

    room.players.set(socket.id, { id: socket.id, name: trimmedName });
    rooms.set(code, room);

    socket.join(code);
    socket.data.roomCode = code;

    cb?.({ ok: true, code, socketId: socket.id, hostKey: room.hostKey });
    emitRoom(code);
  });

  socket.on("room:join", ({ code, name, hostKey }, cb) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const trimmedName = String(name || "").trim().slice(0, 24);

    if (!roomCode || !trimmedName) {
      cb?.({ ok: false, message: "Room code and name are required." });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      cb?.({ ok: false, message: "Room not found." });
      return;
    }

    if (room.stage !== "lobby") {
      cb?.({ ok: false, message: "Game already started." });
      return;
    }

    if (room.players.size >= MAX_PLAYERS) {
      cb?.({ ok: false, message: "Room is full (100/100)." });
      return;
    }

    if (!room.hostName && room.hostId && room.players.has(room.hostId)) {
      room.hostName = room.players.get(room.hostId).name;
    }

    room.players.set(socket.id, { id: socket.id, name: trimmedName });
    const canReclaimWithKey = hostKey && room.hostKey && hostKey === room.hostKey;
    const canReclaimLegacyByName =
      !room.hostKey && room.hostName && trimmedName.toLowerCase() === room.hostName.toLowerCase();
    if (canReclaimWithKey || canReclaimLegacyByName) {
      room.hostId = socket.id;
      room.hostName = trimmedName;
      if (!room.hostKey) {
        room.hostKey = generateHostKey();
      }
    }

    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    cb?.({
      ok: true,
      code: roomCode,
      socketId: socket.id,
      hostKey: room.hostId === socket.id ? room.hostKey : null,
    });
    emitRoom(roomCode);
  });

  socket.on("game:start", (_, cb) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;

    if (!room) {
      cb?.({ ok: false, message: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      cb?.({ ok: false, message: "Only host can start." });
      return;
    }

    if (room.players.size < 3) {
      cb?.({ ok: false, message: "Need at least 3 players." });
      return;
    }

    room.word = randomWord();
    room.imposterId = chooseImposter(Array.from(room.players.keys()));
    room.stage = "started";
    room.votesByVoter.clear();
    room.votesByTarget.clear();
    room.reveal = null;

    cb?.({ ok: true });
    emitRoom(roomCode);
  });

  socket.on("game:goVoting", (_, cb) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;

    if (!room) {
      cb?.({ ok: false, message: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      cb?.({ ok: false, message: "Only host can open voting." });
      return;
    }

    if (room.stage !== "started") {
      cb?.({ ok: false, message: "Game is not in card stage." });
      return;
    }

    room.stage = "voting";
    cb?.({ ok: true });
    emitRoom(roomCode);
  });

  socket.on("game:vote", ({ targetId }, cb) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;

    if (!room) {
      cb?.({ ok: false, message: "Room not found." });
      return;
    }

    if (room.stage !== "voting") {
      cb?.({ ok: false, message: "Voting is not active." });
      return;
    }

    if (!room.players.has(socket.id) || !room.players.has(targetId)) {
      cb?.({ ok: false, message: "Invalid vote." });
      return;
    }

    if (room.votesByVoter.has(socket.id)) {
      cb?.({ ok: false, message: "You already voted." });
      return;
    }

    room.votesByVoter.set(socket.id, targetId);
    room.votesByTarget.set(targetId, (room.votesByTarget.get(targetId) || 0) + 1);

    cb?.({ ok: true });
    emitRoom(roomCode);
  });

  socket.on("game:reveal", (_, cb) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;

    if (!room) {
      cb?.({ ok: false, message: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      cb?.({ ok: false, message: "Only host can reveal." });
      return;
    }

    if (room.stage !== "voting") {
      cb?.({ ok: false, message: "Reveal is allowed after voting starts." });
      return;
    }

    let topTargetId = null;
    let topVotes = -1;

    for (const [targetId, count] of room.votesByTarget.entries()) {
      if (count > topVotes) {
        topVotes = count;
        topTargetId = targetId;
      }
    }

    room.reveal = {
      imposterId: room.imposterId,
      votedOutId: topTargetId,
      imposterName: room.players.get(room.imposterId)?.name || "Unknown",
      votedOutName: topTargetId ? room.players.get(topTargetId)?.name || "Unknown" : null,
      imposterCaught: topTargetId === room.imposterId,
    };
    room.stage = "revealed";

    cb?.({ ok: true });
    emitRoom(roomCode);
  });

  socket.on("game:reset", (_, cb) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;

    if (!room) {
      cb?.({ ok: false, message: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      cb?.({ ok: false, message: "Only host can reset." });
      return;
    }

    room.stage = "lobby";
    room.word = null;
    room.imposterId = null;
    room.votesByVoter.clear();
    room.votesByTarget.clear();
    room.reveal = null;

    cb?.({ ok: true });
    emitRoom(roomCode);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    removePlayerFromRoom(room, socket.id);

    if (room.stage !== "lobby" && room.players.size < 3) {
      room.stage = "lobby";
      room.word = null;
      room.imposterId = null;
      room.votesByVoter.clear();
      room.votesByTarget.clear();
      room.reveal = null;
    }

    emitRoom(roomCode);
    cleanupRoom(roomCode);
  });
});

const indexFilePath = path.join(__dirname, "public", "index.html");

app.get(["/host/:code", "/host/:code/", "/room/:code", "/room/:code/"], (_req, res) => {
  res.sendFile(indexFilePath);
});

app.use(express.static(path.join(__dirname, "public")));

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Imposter game running at http://localhost:${PORT}`);
});
