const socket = io();

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sfx = {
  playTone: (freq, type, duration, vol) => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  },
  click: () => sfx.playTone(600, 'sine', 0.1, 0.05),
  join: () => { sfx.playTone(400, 'square', 0.1, 0.02); setTimeout(()=>sfx.playTone(600, 'square', 0.15, 0.02), 100); },
  start: () => { sfx.playTone(300, 'sawtooth', 0.1, 0.05); setTimeout(()=>sfx.playTone(400, 'sawtooth', 0.1, 0.05), 100); setTimeout(()=>sfx.playTone(500, 'sawtooth', 0.2, 0.05), 200); },
  voting: () => { sfx.playTone(200, 'triangle', 0.2, 0.1); },
  voteCast: () => { sfx.playTone(800, 'sine', 0.1, 0.05); },
  success: () => { sfx.playTone(400, 'sine', 0.1, 0.05); setTimeout(()=>sfx.playTone(600, 'sine', 0.3, 0.05), 100); },
  fail: () => { sfx.playTone(200, 'sawtooth', 0.3, 0.05); setTimeout(()=>sfx.playTone(150, 'sawtooth', 0.4, 0.05), 300); },
  error: () => { sfx.playTone(150, 'square', 0.2, 0.05); }
};

const joinPanel = document.getElementById("joinPanel");
const gamePanel = document.getElementById("gamePanel");
const errorText = document.getElementById("errorText");
const joinHint = document.getElementById("joinHint");
const codeField = document.getElementById("codeField");

const nameInput = document.getElementById("nameInput");
const codeInput = document.getElementById("codeInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");

const roomCodeEl = document.getElementById("roomCode");
const playerCountEl = document.getElementById("playerCount");
const playersListEl = document.getElementById("playersList");
const shareLine = document.getElementById("shareLine");
const shareLink = document.getElementById("shareLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const imposterCountRow = document.getElementById("imposterCountRow");
const imposterCountSelect = document.getElementById("imposterCountSelect");

const lobbyView = document.getElementById("lobbyView");
const cardView = document.getElementById("cardView");
const votingView = document.getElementById("votingView");
const revealView = document.getElementById("revealView");

const startBtn = document.getElementById("startBtn");
const cardTitle = document.getElementById("cardTitle");
const cardBox = document.getElementById("cardBox");
const goVotingBtn = document.getElementById("goVotingBtn");
const voteList = document.getElementById("voteList");
const votesLeftText = document.getElementById("votesLeftText");
const revealBtn = document.getElementById("revealBtn");
const revealMain = document.getElementById("revealMain");
const revealSub = document.getElementById("revealSub");
const resetBtn = document.getElementById("resetBtn");
const footerLine = document.getElementById("footerLine");
const footerRevealBtn = document.getElementById("footerRevealBtn");
const cursorSplashRoot = document.getElementById("cursorSplashRoot");
const cursorDot = document.getElementById("cursorDot");
const cursorRing = document.getElementById("cursorRing");

const state = {
  socketId: null,
  room: null,
  game: { stage: "lobby" },
  prefilledCode: null,
  urlMode: "home",
  currentName: "",
  didAutoJoin: false,
};

function sessionStorageKey(roomCode) {
  return `imposter:session:${String(roomCode || "").toUpperCase()}`;
}

function saveSession(roomCode, data) {
  if (!roomCode) return;
  localStorage.setItem(sessionStorageKey(roomCode), JSON.stringify(data || {}));
}

function loadSession(roomCode) {
  if (!roomCode) return null;
  try {
    const raw = localStorage.getItem(sessionStorageKey(roomCode));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseRoomTargetFromUrl() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const prefix = parts[0] ? parts[0].toLowerCase() : "";
  if (parts.length >= 2 && (prefix === "host" || prefix === "room")) {
    return { code: parts[1].toUpperCase(), mode: prefix };
  }
  const params = new URLSearchParams(window.location.search);
  const queryCode = params.get("room");
  if (queryCode) {
    return { code: queryCode.toUpperCase(), mode: "room" };
  }
  return { code: null, mode: "home" };
}

function buildHostUrl(code) {
  const roomCode = String(code || "").trim().toUpperCase();
  return `${window.location.origin}/host/${roomCode}`;
}

function buildPlayerUrl(code) {
  const roomCode = String(code || "").trim().toUpperCase();
  return `${window.location.origin}/room/${roomCode}`;
}

function applyPrefilledCodeUI() {
  const code = state.prefilledCode;
  if (!code) return;
  const saved = loadSession(code);

  codeInput.value = code;
  codeInput.readOnly = true;
  codeField.classList.add("hidden");
  createBtn.classList.add("hidden");
  if (saved?.name) {
    nameInput.value = String(saved.name).slice(0, 24);
  }
  if (state.urlMode === "host") {
    joinHint.textContent = `Host room ${code}. Enter your name to continue.`;
  } else {
    joinHint.textContent = `Enter your name to join room ${code}.`;
  }
  joinBtn.textContent = "Enter Game";
}

function tryAutoJoinFromSavedSession() {
  if (state.didAutoJoin) return;
  if (!state.prefilledCode) return;
  if (!socket.connected) return;

  const code = state.prefilledCode;
  const saved = loadSession(code);
  if (!saved?.name) return;

  state.didAutoJoin = true;
  nameInput.value = String(saved.name).slice(0, 24);
  joinRoom(code, String(saved.name).slice(0, 24));
}

function setError(msg) {
  if (msg) sfx.error();
  errorText.textContent = msg || "";
}

function showJoinedUI() {
  joinPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
}

function hideAllViews() {
  lobbyView.classList.add("hidden");
  cardView.classList.add("hidden");
  votingView.classList.add("hidden");
  revealView.classList.add("hidden");
}

function meIsHost() {
  return state.room && state.socketId && state.room.hostId === state.socketId;
}

function renderPlayers() {
  playersListEl.innerHTML = "";
  state.room.players.forEach((p) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${p.name}</span>${p.isHost ? '<span class="badge">Host</span>' : ""}`;
    playersListEl.appendChild(li);
  });
}

function renderVoteList() {
  voteList.innerHTML = "";
  const voteMap = state.game.votes || {};
  const votesCast = Object.values(voteMap).reduce((sum, count) => sum + count, 0);
  const votesLeft = Math.max(0, state.room.players.length - votesCast);
  votesLeftText.textContent = `${votesLeft} vote${votesLeft === 1 ? "" : "s"} left`;

  state.room.players.forEach((p) => {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = p.name;

    const right = document.createElement("div");
    const count = voteMap[p.id] || 0;

    if (!state.game.hasVoted) {
      const btn = document.createElement("button");
      btn.className = "voteBtn";
      btn.textContent = "Vote";
      btn.onclick = () => {
        sfx.click();
        socket.emit("game:vote", { targetId: p.id }, (res) => {
          if (!res?.ok) setError(res?.message || "Could not vote.");
          else sfx.voteCast();
        });
      };
      right.appendChild(btn);
    }

    const tag = document.createElement("span");
    tag.className = "badge";
    tag.textContent = `${count} vote${count === 1 ? "" : "s"}`;
    right.appendChild(tag);

    li.append(left, right);
    voteList.appendChild(li);
  });
}

function renderCard() {
  if (state.game.card === "IMPOSTER") {
    cardTitle.textContent = "YOU ARE THE";
    cardBox.className = "card imposter";
    cardBox.textContent = "IMPOSTER";
  } else {
    cardTitle.textContent = "YOUR WORD";
    cardBox.className = "card";
    cardBox.textContent = state.game.card || "...";
  }
}

function renderReveal() {
  const reveal = state.game.reveal;
  if (!reveal) {
    revealMain.textContent = "No reveal data.";
    revealSub.textContent = "";
    return;
  }

  const names = Array.isArray(reveal.imposterNames) ? reveal.imposterNames : [reveal.imposterName];
  revealMain.textContent = reveal.imposterCaught ? "Players Win" : "Imposters Win";
  if (!reveal.votedOutName) {
    revealSub.textContent = `No votes were cast. Imposters: ${names.join(", ")}`;
  } else if (reveal.imposterCaught) {
    revealSub.textContent = `Players voted out ${reveal.votedOutName}. Caught an imposter. All imposters: ${names.join(", ")}`;
  } else {
    revealSub.textContent = `Players voted out ${reveal.votedOutName}. No imposter caught. All imposters: ${names.join(", ")}`;
  }
}

function render() {
  if (!state.room) return;

  roomCodeEl.textContent = state.room.code;
  playerCountEl.textContent = `${state.room.players.length}/${state.room.maxPlayers}`;
  const playerUrl = buildPlayerUrl(state.room.code);
  shareLink.href = playerUrl;
  shareLink.textContent = playerUrl;
  shareLine.classList.remove("hidden");

  renderPlayers();

  const host = meIsHost();
  startBtn.classList.toggle("hidden", !host);
  goVotingBtn.classList.toggle("hidden", !host);
  revealBtn.classList.toggle("hidden", false);
  resetBtn.classList.toggle("hidden", !host);
  imposterCountRow.classList.toggle("hidden", !host);

  const maxImposters = Math.max(1, Math.min(6, state.room.players.length - 1));
  for (const option of imposterCountSelect.options) {
    option.disabled = Number(option.value) > maxImposters;
  }
  const roomCount = Number(state.room.imposterCount || 1);
  const safeCount = Math.min(Math.max(roomCount, 1), maxImposters);
  imposterCountSelect.value = String(safeCount);
  imposterCountSelect.disabled = !host || state.room.stage !== "lobby";

  hideAllViews();

  switch (state.room.stage) {
    case "lobby":
      lobbyView.classList.remove("hidden");
      startBtn.disabled = state.room.players.length < 3;
      break;
    case "started":
      cardView.classList.remove("hidden");
      renderCard();
      break;
    case "voting":
      votingView.classList.remove("hidden");
      renderVoteList();
      break;
    case "revealed":
      revealView.classList.remove("hidden");
      renderReveal();
      break;
    default:
      lobbyView.classList.remove("hidden");
  }
}

function joinRoom(code, name) {
  const saved = loadSession(code);
  const hostKey = state.urlMode === "host" ? saved?.hostKey || null : null;

  socket.emit("room:join", { name, code, hostKey }, (res) => {
    if (!res?.ok) {
      setError(res?.message || "Unable to join room.");
      return;
    }
    sfx.join();
    state.socketId = res.socketId;
    state.currentName = name;
    saveSession(res.code, { name: state.currentName, hostKey: res.hostKey || hostKey || null });
    if (res.code) {
      const newUrl = state.urlMode === "host" ? `/host/${res.code}` : `/room/${res.code}`;
      window.history.replaceState({}, "", newUrl);
    }
    showJoinedUI();
  });
}

createBtn.onclick = () => {
  sfx.click();
  setError("");
  const name = nameInput.value.trim();
  socket.emit("room:create", { name }, (res) => {
    if (!res?.ok) {
      setError(res?.message || "Unable to create room.");
      return;
    }
    sfx.join();
    state.socketId = res.socketId;
    state.currentName = name;
    saveSession(res.code, { name: state.currentName, hostKey: res.hostKey || null });
    if (res.code) {
      const newUrl = `/host/${res.code}`;
      window.history.replaceState({}, "", newUrl);
    }
    showJoinedUI();
  });
};

joinBtn.onclick = () => {
  sfx.click();
  setError("");
  const name = nameInput.value.trim();
  const code = (state.prefilledCode || codeInput.value).trim().toUpperCase();
  joinRoom(code, name);
};

startBtn.onclick = () => {
  sfx.click();
  socket.emit("game:start", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to start game.");
  });
};

imposterCountSelect.onchange = () => {
  if (!meIsHost()) return;
  const count = Number(imposterCountSelect.value);
  socket.emit("game:setImposterCount", { count }, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to set imposter count.");
  });
};

goVotingBtn.onclick = () => {
  sfx.click();
  socket.emit("game:goVoting", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to open voting.");
  });
};

revealBtn.onclick = () => {
  sfx.click();
  socket.emit("game:reveal", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to reveal.");
  });
};

resetBtn.onclick = () => {
  sfx.click();
  socket.emit("game:reset", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to reset.");
  });
};

socket.on("room:update", (room) => {
  state.room = room;
  render();
});

socket.on("game:state", (game) => {
  const oldStage = state.game.stage;
  state.game = game;
  if (oldStage !== game.stage) {
    if (game.stage === "started") sfx.start();
    else if (game.stage === "voting") sfx.voting();
    else if (game.stage === "revealed") {
      if (game.reveal && game.reveal.imposterCaught) sfx.success();
      else sfx.fail();
    }
  }
  render();
});

socket.on("connect", () => {
  state.socketId = socket.id;
  tryAutoJoinFromSavedSession();
});

copyLinkBtn.onclick = async () => {
  sfx.click();
  const text = shareLink.href;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyLinkBtn.textContent = "Copied";
    setTimeout(() => {
      copyLinkBtn.textContent = "Copy";
    }, 1200);
  } catch {
    setError("Copy failed. Please copy the link manually.");
  }
};

nameInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (state.prefilledCode) {
    joinBtn.click();
    return;
  }
  if (codeInput.value.trim()) {
    joinBtn.click();
    return;
  }
  createBtn.click();
});

{
  const parsed = parseRoomTargetFromUrl();
  state.prefilledCode = parsed.code;
  state.urlMode = parsed.mode;
}
applyPrefilledCodeUI();
tryAutoJoinFromSavedSession();

footerRevealBtn.onclick = () => {
  footerLine.textContent = "Somebody in this room vibe coded this game. Guess who? The Imposter Ujjwal Verma";
  footerRevealBtn.classList.add("hidden");
};

function initSplashCursor() {
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (isTouch || !cursorSplashRoot || !cursorDot || !cursorRing) return;

  document.body.classList.add("splashCursorEnabled");

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let rx = mx;
  let ry = my;
  let lastParticleAt = 0;
  let visible = false;

  function setCursorVisibility(show) {
    visible = show;
    const opacity = show ? "1" : "0";
    cursorDot.style.opacity = opacity;
    cursorRing.style.opacity = opacity;
  }

  setCursorVisibility(false);

  function spawnParticle(x, y, spread = 14) {
    const p = document.createElement("span");
    p.className = "cursorParticle";
    const ox = (Math.random() - 0.5) * spread;
    const oy = (Math.random() - 0.5) * spread;
    p.style.left = `${x + ox}px`;
    p.style.top = `${y + oy}px`;
    cursorSplashRoot.appendChild(p);
    p.addEventListener("animationend", () => p.remove(), { once: true });
  }

  document.addEventListener("mousemove", (event) => {
    mx = event.clientX;
    my = event.clientY;
    if (!visible) setCursorVisibility(true);

    const now = performance.now();
    if (now - lastParticleAt > 28) {
      lastParticleAt = now;
      spawnParticle(mx, my, 10);
    }
  });

  document.addEventListener("mousedown", (event) => {
    for (let i = 0; i < 6; i += 1) {
      spawnParticle(event.clientX, event.clientY, 24);
    }
  });

  document.addEventListener("mouseleave", () => setCursorVisibility(false));
  document.addEventListener("mouseenter", () => setCursorVisibility(true));

  function tick() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    cursorDot.style.left = `${mx}px`;
    cursorDot.style.top = `${my}px`;
    cursorRing.style.left = `${rx}px`;
    cursorRing.style.top = `${ry}px`;
    requestAnimationFrame(tick);
  }

  tick();
}

initSplashCursor();
