"use strict";

// ---- Component counts, straight from the Oink Games rulebook -------------
// (cross-checked: BGG summary + the Jeff Hohner rules transliteration).
// Kept as named constants so they're easy to retune later.
const CONFIG = {
  MAX_ROUNDS: 3,
  STARTING_AIR: 25,
  DICE_COUNT: 2,
  DICE_FACES: [1, 1, 2, 2, 3, 3], // "1-3 dots, 2x on each die"
  MAX_PLAYERS: 6,
  MIN_PLAYERS: 2,
  BLANK_CHIP_COUNT: 12,
  STACK_SIZE: 3, // stranded chips regroup in stacks of this many
  LEVELS: [
    { level: 1, shape: "lvl1", min: 0, max: 3 },
    { level: 2, shape: "lvl2", min: 4, max: 7 },
    { level: 3, shape: "lvl3", min: 8, max: 11 },
    { level: 4, shape: "lvl4", min: 12, max: 15 },
  ],
  HIGH_LEVEL_TIEBREAK_MIN_VALUE: 12, // level-4 chips break ties
};

const PLAYER_COLORS = ["#e63946", "#56ccf2", "#6fcf97", "#f2994a", "#bb6bd9", "#f4d35e"];

let state = null; // the whole game/session state lives here

// ---------------------------------------------------------------- helpers --
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildLine() {
  const line = [];
  for (const lvl of CONFIG.LEVELS) {
    const values = [];
    for (let v = lvl.min; v <= lvl.max; v++) {
      values.push(v, v);
    }
    shuffle(values);
    for (const v of values) {
      line.push({ type: "chip", chip: { level: lvl.level, value: v } });
    }
  }
  return line; // low level (near sub) -> high level (far), shuffled within level
}

function unitValue(unit) {
  return unit.type === "chip" ? unit.chip.value : unit.chips.reduce((s, c) => s + c.value, 0);
}

function unitChips(unit) {
  return unit.type === "chip" ? [unit.chip] : unit.chips;
}

function levelClass(level) {
  return "lvl" + level;
}

// -------------------------------------------------------------- game setup --
function startGame(playerNames) {
  const players = playerNames.map((name, i) => ({
    id: i,
    name: name || `Joueur ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    pos: 0,
    facing: "out",
    declaredBack: false,
    returned: false,
    carrying: [],
    banked: [], // [{round, value, chips:[...]}]
  }));

  state = {
    players,
    seatOrder: players.map((p) => p.id),
    round: 1,
    air: CONFIG.STARTING_AIR,
    line: buildLine(),
    turnOrder: [],
    currentTurnIdx: 0,
    phase: "setup",
    lastDice: null,
    lastMove: null,
    finalTurnFlag: false,
    returnOrderLog: [],
    log: [],
    screen: "game",
  };

  startRound(state.seatOrder[0]);
}

function startRound(startPlayerId) {
  state.air = CONFIG.STARTING_AIR;
  state.finalTurnFlag = false;
  state.returnOrderLog = [];
  state.lastDice = null;
  state.lastMove = null;

  for (const p of state.players) {
    p.pos = 0;
    p.facing = "out";
    p.declaredBack = false;
    p.returned = false;
    p.carrying = [];
  }

  const startIdx = state.seatOrder.indexOf(startPlayerId);
  state.turnOrder = state.seatOrder.slice(startIdx).concat(state.seatOrder.slice(0, startIdx));
  state.currentTurnIdx = 0;

  addLog(`— Manche ${state.round} — plongée avec ${CONFIG.STARTING_AIR} d'air.`);
  beginTurn();
}

function addLog(msg) {
  state.log.push(msg);
}

function currentPlayer() {
  return state.players[state.turnOrder[state.currentTurnIdx]];
}

// ------------------------------------------------------------- turn phases --
function beginTurn() {
  const p = currentPlayer();

  // Step 1: breathe
  state.air -= p.carrying.length;
  if (state.air <= 0) {
    state.finalTurnFlag = true;
    addLog(`L'air tombe à ${state.air} — dernier tour de la manche !`);
  }

  // Step 2: declare, only if relevant
  const needsDeclare = !p.declaredBack && p.carrying.length > 0;
  state.phase = needsDeclare ? "declare" : "roll";
  state.lastDice = null;
  state.lastMove = null;
  render();
}

function handleDeclare(turnBack) {
  const p = currentPlayer();
  if (turnBack) {
    p.declaredBack = true;
    p.facing = "back";
    addLog(`${p.name} fait demi-tour vers le sous-marin.`);
  } else {
    addLog(`${p.name} continue de plonger.`);
  }
  state.phase = "roll";
  render();
}

function isOccupied(pos, self) {
  if (pos <= 0) return false;
  return state.players.some((pl) => pl !== self && !pl.returned && pl.pos === pos);
}

function moveDiver(p, steps) {
  const dir = p.facing === "out" ? 1 : -1;
  let remaining = steps;
  let pos = p.pos;

  while (remaining > 0) {
    const next = pos + dir;
    if (dir === 1 && next > state.line.length) {
      pos = state.line.length; // stop on the last chip
      break;
    }
    if (dir === -1 && next < 0) {
      pos = 0; // stop at the sub
      break;
    }
    pos = next;
    if (isOccupied(pos, p)) {
      continue; // jump over an occupied chip, doesn't count as a step
    }
    remaining--;
  }
  return pos;
}

function handleRoll() {
  const p = currentPlayer();
  const d1 = CONFIG.DICE_FACES[Math.floor(Math.random() * CONFIG.DICE_FACES.length)];
  const d2 = CONFIG.DICE_FACES[Math.floor(Math.random() * CONFIG.DICE_FACES.length)];
  const sum = d1 + d2;
  const steps = Math.max(0, sum - p.carrying.length);

  const fromPos = p.pos;
  const toPos = moveDiver(p, steps);
  p.pos = toPos;

  state.lastDice = [d1, d2];
  state.lastMove = { sum, carried: p.carrying.length, steps, fromPos, toPos };

  addLog(
    `${p.name} lance ${d1}+${d2}=${sum} (− ${p.carrying.length} porté${p.carrying.length > 1 ? "s" : ""}) → ${steps} case(s), de ${fromPos === 0 ? "SUB" : fromPos} à ${toPos === 0 ? "SUB" : toPos}.`
  );

  if (toPos === 0) {
    p.returned = true;
    state.returnOrderLog.push(p.id);
    addLog(`${p.name} est de retour au sous-marin.`);
    endTurn();
    return;
  }

  state.phase = "action";
  render();
}

function handleAction(action, payload) {
  const p = currentPlayer();
  const slotIdx = p.pos - 1;
  const slot = state.line[slotIdx];

  if (action === "pickup") {
    const unit = slot.type === "chip" ? { type: "chip", chip: slot.chip } : { type: "stack", chips: slot.chips };
    p.carrying.push(unit);
    state.line[slotIdx] = { type: "blank" };
    addLog(`${p.name} ramasse un trésor (case ${p.pos}).`);
  } else if (action === "drop") {
    const unit = p.carrying.splice(payload, 1)[0];
    state.line[slotIdx] = unit.type === "chip" ? { type: "chip", chip: unit.chip } : { type: "stack", chips: unit.chips };
    addLog(`${p.name} dépose un trésor (case ${p.pos}).`);
  } else {
    addLog(`${p.name} ne fait rien.`);
  }

  endTurn();
}

function endTurn() {
  if (state.finalTurnFlag || state.players.every((pl) => pl.returned)) {
    endRound();
    return;
  }
  let idx = state.currentTurnIdx;
  for (let i = 0; i < state.turnOrder.length; i++) {
    idx = (idx + 1) % state.turnOrder.length;
    const candidate = state.players[state.turnOrder[idx]];
    if (!candidate.returned) {
      state.currentTurnIdx = idx;
      beginTurn();
      return;
    }
  }
  endRound(); // safety net, shouldn't be reached
}

function endRound() {
  // Bank treasure for those who made it back.
  for (const p of state.players) {
    if (p.returned) {
      for (const unit of p.carrying) {
        p.banked.push({
          round: state.round,
          value: unitValue(unit),
          chips: unitChips(unit),
        });
      }
      p.carrying = [];
    }
  }

  // Stranded divers lose their treasure; it re-stacks at the end of the line.
  const stranded = state.players.filter((p) => !p.returned).sort((a, b) => a.pos - b.pos);
  const lostQueue = [];
  for (const p of stranded) {
    lostQueue.push(...p.carrying);
    if (p.carrying.length) {
      addLog(`${p.name} n'est pas rentré et perd ${p.carrying.length} trésor(s).`);
    }
    p.carrying = [];
  }
  for (let i = 0; i < lostQueue.length; i += CONFIG.STACK_SIZE) {
    const group = lostQueue.slice(i, i + CONFIG.STACK_SIZE);
    const chips = group.flatMap(unitChips);
    state.line.push({ type: "stack", chips });
  }

  // Clear blanks, close gaps.
  state.line = state.line.filter((s) => s.type !== "blank");

  const nextStart = state.returnOrderLog.length
    ? state.returnOrderLog[state.returnOrderLog.length - 1]
    : state.turnOrder[0];

  if (state.round >= CONFIG.MAX_ROUNDS) {
    endGame();
  } else {
    state.round += 1;
    startRound(nextStart);
  }
}

function endGame() {
  state.phase = "gameEnd";
  render();
}

function totalScore(p) {
  return p.banked.reduce((s, b) => s + b.value, 0);
}
function highLevelCount(p) {
  return p.banked.reduce(
    (s, b) => s + b.chips.filter((c) => c.value >= CONFIG.HIGH_LEVEL_TIEBREAK_MIN_VALUE).length,
    0
  );
}

function computeStandings() {
  const ranked = [...state.players].sort((a, b) => {
    const diff = totalScore(b) - totalScore(a);
    if (diff !== 0) return diff;
    return highLevelCount(b) - highLevelCount(a);
  });
  let winners = [ranked[0]];
  for (let i = 1; i < ranked.length; i++) {
    const a = ranked[0], b = ranked[i];
    if (totalScore(a) === totalScore(b) && highLevelCount(a) === highLevelCount(b)) {
      winners.push(b);
    } else break;
  }
  return { ranked, winners };
}

// ------------------------------------------------------------------ render --
const app = document.getElementById("app");

function render() {
  if (!state) {
    renderSetup();
    return;
  }
  if (state.phase === "gameEnd") {
    renderEndGame();
    return;
  }
  renderGame();
}

function renderSetup() {
  app.innerHTML = `
    <h1>Deep Sea Adventure — prototype</h1>
    <p class="subtitle">Clone local (hotseat) pour tester les règles, hors plateforme BGA.</p>
    <div class="card">
      <label for="numPlayers">Nombre de joueurs (${CONFIG.MIN_PLAYERS}-${CONFIG.MAX_PLAYERS})</label>
      <input type="number" id="numPlayers" min="${CONFIG.MIN_PLAYERS}" max="${CONFIG.MAX_PLAYERS}" value="4">
      <div id="nameFields"></div>
      <button id="startBtn" style="margin-top:14px;">Démarrer la partie</button>
    </div>
  `;
  const numInput = document.getElementById("numPlayers");
  const nameFields = document.getElementById("nameFields");

  function renderNameFields() {
    const n = Math.min(CONFIG.MAX_PLAYERS, Math.max(CONFIG.MIN_PLAYERS, parseInt(numInput.value, 10) || CONFIG.MIN_PLAYERS));
    numInput.value = n;
    nameFields.innerHTML = Array.from({ length: n }, (_, i) => `
      <div class="player-setup-row">
        <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
        <input type="text" data-idx="${i}" class="nameInput" placeholder="Joueur ${i + 1}">
      </div>
    `).join("");
  }
  numInput.addEventListener("input", renderNameFields);
  renderNameFields();

  document.getElementById("startBtn").addEventListener("click", () => {
    const names = Array.from(document.querySelectorAll(".nameInput")).map((inp) => inp.value.trim());
    startGame(names);
    render();
  });
}

function renderBoard() {
  const cells = [`<div class="sub-cell">SUB</div>`];
  state.line.forEach((slot, i) => {
    const pos = i + 1;
    const diversHere = state.players.filter((p) => p.pos === pos);
    let tileClass = "slot-tile blank";
    let label = "";
    if (slot.type === "chip") {
      tileClass = `slot-tile ${levelClass(slot.chip.level)}`;
      label = "?";
    } else if (slot.type === "stack") {
      tileClass = `slot-tile stack ${levelClass(slot.chips[0].level)}`;
      label = slot.chips.length;
    }
    cells.push(`
      <div class="slot-cell">
        <div class="divers-on-slot">
          ${diversHere.map((p) => `<div class="diver-token${p.facing === "back" ? " facing-back" : ""}" style="background:${p.color}" title="${p.name}">${p.name[0].toUpperCase()}</div>`).join("")}
        </div>
        <div class="${tileClass}">${label}</div>
        <div class="slot-index">${pos}</div>
      </div>
    `);
  });
  return `<div class="board-scroll"><div class="board-track">${cells.join("")}</div></div>`;
}

function renderPlayersStrip() {
  const activeId = currentPlayer().id;
  return `<div class="players-strip">${state.players
    .map((p) => `
      <div class="player-chip ${p.id === activeId ? "active" : ""} ${p.returned ? "returned" : ""}">
        <span class="swatch" style="background:${p.color}"></span>
        <span>${p.name}</span>
        <span class="small-note">· porte ${p.carrying.length} · total ${totalScore(p)}</span>
      </div>
    `)
    .join("")}</div>`;
}

function renderTurnPanel() {
  const p = currentPlayer();
  let inner = "";

  if (state.phase === "declare") {
    inner = `
      <p>${p.name} porte ${p.carrying.length} trésor(s). Continuer à plonger ou faire demi-tour ?</p>
      <button id="btnContinue">Plonger plus profond</button>
      <button id="btnTurnBack" class="secondary">Faire demi-tour</button>
    `;
  } else if (state.phase === "roll") {
    inner = `
      <p>${p.name} est ${p.facing === "out" ? "en descente" : "sur le chemin du retour"}, porte ${p.carrying.length} trésor(s).</p>
      <button id="btnRoll">Lancer les dés</button>
    `;
  } else if (state.phase === "action") {
    const dice = state.lastDice
      ? `<div class="dice-row"><div class="die">${state.lastDice[0]}</div><div class="die">${state.lastDice[1]}</div></div>
         <p class="move-summary">Somme ${state.lastMove.sum} − ${state.lastMove.carried} porté(s) = ${state.lastMove.steps} case(s). Nouvelle position : ${state.lastMove.toPos === 0 ? "SUB" : state.lastMove.toPos}.</p>`
      : "";

    let actions = "";
    const slot = state.line[p.pos - 1];
    const canPickup = slot.type === "chip" || slot.type === "stack";
    const canDrop = slot.type === "blank" && p.carrying.length > 0;
    actions += `<div>`;
    if (canPickup) {
      actions += `<button id="btnPickup">Ramasser le trésor</button>`;
    }
    if (canDrop) {
      p.carrying.forEach((unit, i) => {
        actions += `<button class="secondary btnDrop" data-idx="${i}">Déposer trésor #${i + 1} (${unitChips(unit).length} pièce${unitChips(unit).length > 1 ? "s" : ""})</button>`;
      });
    }
    actions += `<button class="secondary" id="btnNone">Ne rien faire</button>`;
    actions += `</div>`;
    inner = dice + actions;
  }

  return `<div class="card turn-panel"><h2>Tour de ${p.name}</h2>${inner}</div>`;
}

function renderGame() {
  const airPct = Math.max(0, Math.min(100, (state.air / CONFIG.STARTING_AIR) * 100));
  app.innerHTML = `
    <h1>Deep Sea Adventure — prototype</h1>
    <div class="card">
      <div class="hud">
        <div class="stat"><span class="label">Manche</span><span class="value">${state.round}/${CONFIG.MAX_ROUNDS}</span></div>
        <div class="stat"><span class="label">Air</span><span class="value">${Math.max(0, state.air)}</span></div>
        <div class="air-bar-wrap"><div class="air-bar"><div class="air-bar-fill" style="width:${airPct}%"></div></div></div>
      </div>
      ${renderPlayersStrip()}
    </div>
    <div class="card">${renderBoard()}</div>
    ${renderTurnPanel()}
    <div class="card">
      <h2 style="margin-top:0;font-size:0.95rem;">Journal</h2>
      <div class="log-panel">${state.log.slice().reverse().slice(0, 40).map((l) => `<div>${l}</div>`).join("")}</div>
    </div>
    ${renderScoreTable()}
  `;

  attachHandlers();
}

function renderScoreTable() {
  return `
    <div class="card">
      <h2 style="margin-top:0;font-size:0.95rem;">Scores</h2>
      <table class="score-table">
        <thead><tr><th>Joueur</th>${Array.from({ length: CONFIG.MAX_ROUNDS }, (_, i) => `<th>Manche ${i + 1}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          ${state.players
            .map((p) => {
              const perRound = Array.from({ length: CONFIG.MAX_ROUNDS }, (_, i) =>
                p.banked.filter((b) => b.round === i + 1).reduce((s, b) => s + b.value, 0)
              );
              return `<tr><td>${p.name}</td>${perRound.map((v, i) => `<td>${i + 1 <= state.round || state.phase === "gameEnd" ? v : "—"}</td>`).join("")}<td><strong>${totalScore(p)}</strong></td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEndGame() {
  const { ranked, winners } = computeStandings();
  const winnerText =
    winners.length > 1 ? `Égalité entre ${winners.map((w) => w.name).join(" et ")} !` : `${winners[0].name} remporte la partie !`;

  app.innerHTML = `
    <h1>Deep Sea Adventure — prototype</h1>
    <div class="card">
      <div class="winner-banner">${winnerText}</div>
      <table class="score-table">
        <thead><tr><th>Joueur</th><th>Total</th><th>Trésors de niveau 4</th></tr></thead>
        <tbody>
          ${ranked
            .map((p) => `<tr><td>${p.name}</td><td><strong>${totalScore(p)}</strong></td><td>${highLevelCount(p)}</td></tr>`)
            .join("")}
        </tbody>
      </table>
      <button id="btnRestart" style="margin-top:14px;">Nouvelle partie</button>
    </div>
    ${renderScoreTable()}
  `;
  document.getElementById("btnRestart").addEventListener("click", () => {
    state = null;
    render();
  });
}

function attachHandlers() {
  const byId = (id) => document.getElementById(id);
  if (byId("btnContinue")) byId("btnContinue").addEventListener("click", () => handleDeclare(false));
  if (byId("btnTurnBack")) byId("btnTurnBack").addEventListener("click", () => handleDeclare(true));
  if (byId("btnRoll")) byId("btnRoll").addEventListener("click", handleRoll);
  if (byId("btnPickup")) byId("btnPickup").addEventListener("click", () => handleAction("pickup"));
  if (byId("btnNone")) byId("btnNone").addEventListener("click", () => handleAction("none"));
  document.querySelectorAll(".btnDrop").forEach((btn) => {
    btn.addEventListener("click", () => handleAction("drop", parseInt(btn.dataset.idx, 10)));
  });
}

render();
