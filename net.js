"use strict";

// Online play uses WebRTC (via PeerJS's free public broker) with a
// host-authoritative model: only the host ever mutates `state` (game.js).
// Guests send action requests over the data channel and just render
// whatever state the host broadcasts back. No backend server involved.

const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
const PEER_ID_PREFIX = "dsa-"; // namespaces our ids on the shared PeerJS broker, hidden from players

function peerIdFor(roomCode) {
  return PEER_ID_PREFIX + roomCode;
}

let session = {
  screen: "menu", // menu | local-setup | online-choice | online-host-lobby | online-guest-join | online-guest-lobby | game
  mode: null, // null | "local" | "online"
  isHost: false,
  myPlayerId: null,
  peer: null,
  hostConn: null, // guest's connection to the host
  guestConns: [], // host's connections to each guest, in join order
  lobbyPlayers: [], // [{name, connId}], index 0 is always the host
  roomCode: null,
  error: null,
  lastBeepKey: null,
};

let audioCtx = null;

function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {
    /* no audio support */
  }
}

function playTurnBeep() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

function notifyMyTurn() {
  if (session.mode !== "online" || state.phase === "gameEnd" || !isMyTurn()) return;
  const key = `${state.gameId}:${state.turnNo}`;
  if (session.lastBeepKey === key) return;
  session.lastBeepKey = key;
  playTurnBeep();
}

function render() {
  switch (session.screen) {
    case "menu":
      return renderMenu();
    case "local-setup":
      return renderLocalSetup();
    case "online-choice":
      return renderOnlineChoice();
    case "online-host-lobby":
      return renderHostLobby();
    case "online-guest-join":
      return renderGuestJoin();
    case "online-guest-lobby":
      return renderGuestLobby();
    case "game":
      if (!state) {
        session.screen = "menu";
        return renderMenu();
      }
      if (state.phase === "gameEnd") return renderEndGame();
      renderGame();
      notifyMyTurn();
      return;
  }
}

function makeRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  return code;
}

function shell(title, bodyHtml) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="top-row"><h1>Deep Sea Adventure — prototype</h1>${langSwitcherHtml()}</div>
    <p class="subtitle">${title}</p>
    ${bodyHtml}
  `;
}

// ------------------------------------------------------------------ menus --
function renderMenu() {
  shell(t("menuSubtitle"), `
    <div class="card">
      <button id="btnLocal">${t("btnPlayLocal")}</button>
      <button id="btnOnline" class="secondary">${t("btnPlayOnline")}</button>
    </div>
  `);
  document.getElementById("btnLocal").addEventListener("click", () => {
    session.screen = "local-setup";
    render();
  });
  document.getElementById("btnOnline").addEventListener("click", () => {
    session.screen = "online-choice";
    session.error = null;
    render();
  });
}

function renderOnlineChoice() {
  shell(t("onlineChoiceSubtitle"), `
    <div class="card">
      ${session.error ? `<p class="small-note" style="color:var(--danger)">${session.error}</p>` : ""}
      <label for="hostNameInput">${t("hostNameLabel")}</label>
      <input type="text" id="hostNameInput" placeholder="${t("hostNamePlaceholder")}">
      <button id="btnHost" style="margin-top:10px;">${t("btnHostGame")}</button>
      <button id="btnJoin" class="secondary">${t("btnJoinGame")}</button>
      <button id="btnBack" class="secondary">${t("btnBack")}</button>
    </div>
  `);
  document.getElementById("btnHost").addEventListener("click", () => {
    unlockAudio();
    const name = document.getElementById("hostNameInput").value.trim() || t("hostNamePlaceholder");
    startHosting(name);
  });
  document.getElementById("btnJoin").addEventListener("click", () => {
    session.screen = "online-guest-join";
    render();
  });
  document.getElementById("btnBack").addEventListener("click", () => {
    session.screen = "menu";
    render();
  });
}

// -------------------------------------------------------------------- host --
function startHosting(hostName) {
  session.isHost = true;
  session.mode = "online";
  session.myPlayerId = 0;
  session.guestConns = [];
  session.lobbyPlayers = [{ name: hostName || t("hostNamePlaceholder"), connId: "host" }];
  session.error = null;
  session.roomCode = makeRoomCode();
  session.screen = "online-host-lobby";
  render();

  openPeer(peerIdFor(session.roomCode), (peer) => {
    peer.on("connection", (conn) => {
      conn.on("open", () => {
        conn.on("data", (msg) => handleHostMessage(conn, msg));
        conn.on("close", () => removeGuest(conn));
      });
    });
  });
}

function removeGuest(conn) {
  const idx = session.guestConns.indexOf(conn);
  if (idx === -1) return;
  session.guestConns.splice(idx, 1);
  session.lobbyPlayers.splice(idx + 1, 1); // +1: index 0 is the host
  broadcastLobby();
  render();
}

function handleHostMessage(conn, msg) {
  if (msg.type === "join") {
    if (session.lobbyPlayers.length >= CONFIG.MAX_PLAYERS) return;
    session.guestConns.push(conn);
    session.lobbyPlayers.push({ name: msg.name || t("playerPlaceholder", { n: session.lobbyPlayers.length + 1 }), connId: conn.peer });
    broadcastLobby();
    render();
  } else if (msg.type === "action") {
    if (!state) return;
    const playerId = session.guestConns.indexOf(conn) + 1; // +1: host is player 0
    if (playerId <= 0 || currentPlayer().id !== playerId) return; // ignore out-of-turn/unknown senders
    applyAction(msg.kind, msg.payload);
    broadcastState();
  }
}

function broadcastLobby() {
  const msg = { type: "lobby", players: session.lobbyPlayers };
  session.guestConns.forEach((c) => c.send(msg));
}

function broadcastState() {
  const msg = { type: "state", state };
  session.guestConns.forEach((c) => c.send(msg));
  render();
}

function renderHostLobby() {
  shell(t("hostLobbySubtitle"), `
    <div class="card">
      <p>${t("roomCodeLabel")} <strong style="font-size:1.3rem;letter-spacing:0.05em;">${session.roomCode || "…"}</strong></p>
      <p class="small-note">${t("roomCodeHint")}</p>
      <h2 style="font-size:0.95rem;">${t("playersCountLabel", { n: session.lobbyPlayers.length, max: CONFIG.MAX_PLAYERS })}</h2>
      <div class="players-strip">
        ${session.lobbyPlayers
          .map((p, i) => `<div class="player-chip"><span class="swatch" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]}"></span><span>${p.name}${i === 0 ? t("youHostTag") : ""}</span></div>`)
          .join("")}
      </div>
      <button id="btnStart" style="margin-top:14px;" ${session.lobbyPlayers.length < CONFIG.MIN_PLAYERS ? "disabled" : ""}>${t("btnStartGame")}</button>
      <button id="btnCancel" class="secondary" style="margin-top:14px;">${t("btnCancel")}</button>
    </div>
  `);
  document.getElementById("btnStart").addEventListener("click", () => {
    const names = session.lobbyPlayers.map((p) => p.name);
    startGame(names);
    session.screen = "game";
    session.guestConns.forEach((conn, i) => conn.send({ type: "welcome", yourPlayerId: i + 1 }));
    render();
    broadcastState();
  });
  document.getElementById("btnCancel").addEventListener("click", () => resetToMenu());
}

// ------------------------------------------------------------------- guest --
function renderGuestJoin() {
  shell(t("guestJoinSubtitle"), `
    <div class="card">
      ${session.error ? `<p class="small-note" style="color:var(--danger)">${session.error}</p>` : ""}
      <label for="roomCodeInput">${t("roomCodeInputLabel")}</label>
      <input type="text" id="roomCodeInput" placeholder="${t("roomCodePlaceholder")}">
      <label for="guestNameInput">${t("yourNameLabel")}</label>
      <input type="text" id="guestNameInput" placeholder="${t("yourNamePlaceholder")}">
      <button id="btnJoinRoom" style="margin-top:14px;">${t("btnJoin")}</button>
      <button id="btnBack" class="secondary" style="margin-top:14px;">${t("btnBack")}</button>
    </div>
  `);
  document.getElementById("btnBack").addEventListener("click", () => {
    session.screen = "online-choice";
    render();
  });
  document.getElementById("btnJoinRoom").addEventListener("click", () => {
    unlockAudio();
    const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();
    const name = document.getElementById("guestNameInput").value.trim() || t("yourNamePlaceholder");
    if (!code) return;
    joinRoom(code, name);
  });
}

function joinRoom(roomCode, name) {
  session.isHost = false;
  session.mode = "online";
  session.error = null;
  session.lobbyPlayers = [];

  openPeer(null, (peer) => {
    const conn = peer.connect(peerIdFor(roomCode), { reliable: true });
    session.hostConn = conn;

    conn.on("open", () => {
      conn.send({ type: "join", name });
      session.screen = "online-guest-lobby";
      render();
    });
    conn.on("data", (msg) => handleGuestMessage(msg));
    conn.on("close", () => {
      resetToMenu(t("errHostConnLost"));
    });
    conn.on("error", () => {
      session.error = t("errJoinFailed");
      session.screen = "online-guest-join";
      render();
    });
  });
}

function handleGuestMessage(msg) {
  if (msg.type === "lobby") {
    session.lobbyPlayers = msg.players;
    if (session.screen === "online-guest-lobby") render();
  } else if (msg.type === "welcome") {
    session.myPlayerId = msg.yourPlayerId;
  } else if (msg.type === "state") {
    state = msg.state;
    session.screen = "game";
    render();
  }
}

function renderGuestLobby() {
  shell(t("guestLobbySubtitle"), `
    <div class="card">
      <p class="small-note">${t("guestLobbyWaiting")}</p>
      <div class="players-strip">
        ${session.lobbyPlayers
          .map((p, i) => `<div class="player-chip"><span class="swatch" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]}"></span><span>${p.name}</span></div>`)
          .join("")}
      </div>
      <button id="btnCancel" class="secondary" style="margin-top:14px;">${t("btnCancel")}</button>
    </div>
  `);
  document.getElementById("btnCancel").addEventListener("click", () => resetToMenu());
}

// --------------------------------------------------------------- plumbing --
function openPeer(customId, onReady) {
  const peer = customId ? new Peer(customId) : new Peer();
  session.peer = peer;

  peer.on("open", () => onReady(peer));
  peer.on("error", (err) => {
    if (err.type === "unavailable-id" && customId) {
      // extremely unlikely collision on the shared broker; just retry with a new code
      session.roomCode = makeRoomCode();
      peer.destroy();
      openPeer(peerIdFor(session.roomCode), onReady);
      return;
    }
    session.error = t("errNetwork", { type: err.type });
    session.screen = session.isHost ? "online-choice" : "online-guest-join";
    render();
  });
}

function dispatchAction(kind, payload) {
  if (session.mode === "online" && !session.isHost) {
    if (session.hostConn) session.hostConn.send({ type: "action", kind, payload });
    return;
  }
  applyAction(kind, payload);
  if (session.mode === "online" && session.isHost) broadcastState();
}

function resetToMenu(errorMsg) {
  if (session.peer) {
    try { session.peer.destroy(); } catch (e) { /* ignore */ }
  }
  state = null;
  session = {
    screen: errorMsg ? "online-choice" : "menu",
    mode: null,
    isHost: false,
    myPlayerId: null,
    peer: null,
    hostConn: null,
    guestConns: [],
    lobbyPlayers: [],
    roomCode: null,
    error: errorMsg || null,
    lastBeepKey: null,
  };
  render();
}

render();
