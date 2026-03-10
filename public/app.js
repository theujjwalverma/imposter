const socket = io();

const joinPanel = document.getElementById("joinPanel");
const gamePanel = document.getElementById("gamePanel");
const errorText = document.getElementById("errorText");

const nameInput = document.getElementById("nameInput");
const codeInput = document.getElementById("codeInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");

const roomCodeEl = document.getElementById("roomCode");
const playerCountEl = document.getElementById("playerCount");
const playersListEl = document.getElementById("playersList");

const lobbyView = document.getElementById("lobbyView");
const cardView = document.getElementById("cardView");
const votingView = document.getElementById("votingView");
const revealView = document.getElementById("revealView");

const startBtn = document.getElementById("startBtn");
const cardTitle = document.getElementById("cardTitle");
const cardBox = document.getElementById("cardBox");
const goVotingBtn = document.getElementById("goVotingBtn");
const voteList = document.getElementById("voteList");
const revealBtn = document.getElementById("revealBtn");
const revealMain = document.getElementById("revealMain");
const revealSub = document.getElementById("revealSub");
const resetBtn = document.getElementById("resetBtn");

const state = {
  socketId: null,
  room: null,
  game: { stage: "lobby" },
};

function setError(msg) {
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
        socket.emit("game:vote", { targetId: p.id }, (res) => {
          if (!res?.ok) setError(res?.message || "Could not vote.");
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

  revealMain.textContent = `The imposter was ${reveal.imposterName}`;
  if (!reveal.votedOutName) {
    revealSub.textContent = "No votes were cast.";
  } else if (reveal.imposterCaught) {
    revealSub.textContent = `Players voted out ${reveal.votedOutName}. Imposter caught.`;
  } else {
    revealSub.textContent = `Players voted out ${reveal.votedOutName}. Imposter escaped.`;
  }
}

function render() {
  if (!state.room) return;

  roomCodeEl.textContent = state.room.code;
  playerCountEl.textContent = `${state.room.players.length}/${state.room.maxPlayers}`;

  renderPlayers();

  const host = meIsHost();
  startBtn.classList.toggle("hidden", !host);
  goVotingBtn.classList.toggle("hidden", !host);
  revealBtn.classList.toggle("hidden", !host);
  resetBtn.classList.toggle("hidden", !host);

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

createBtn.onclick = () => {
  setError("");
  const name = nameInput.value.trim();
  socket.emit("room:create", { name }, (res) => {
    if (!res?.ok) {
      setError(res?.message || "Unable to create room.");
      return;
    }
    state.socketId = res.socketId;
    showJoinedUI();
  });
};

joinBtn.onclick = () => {
  setError("");
  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  socket.emit("room:join", { name, code }, (res) => {
    if (!res?.ok) {
      setError(res?.message || "Unable to join room.");
      return;
    }
    state.socketId = res.socketId;
    showJoinedUI();
  });
};

startBtn.onclick = () => {
  socket.emit("game:start", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to start game.");
  });
};

goVotingBtn.onclick = () => {
  socket.emit("game:goVoting", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to open voting.");
  });
};

revealBtn.onclick = () => {
  socket.emit("game:reveal", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to reveal.");
  });
};

resetBtn.onclick = () => {
  socket.emit("game:reset", {}, (res) => {
    if (!res?.ok) setError(res?.message || "Unable to reset.");
  });
};

socket.on("room:update", (room) => {
  state.room = room;
  render();
});

socket.on("game:state", (game) => {
  state.game = game;
  render();
});

socket.on("connect", () => {
  state.socketId = socket.id;
});
