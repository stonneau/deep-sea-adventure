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
    name: name || t("playerPlaceholder", { n: i + 1 }),
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

  addLog("logRoundStart", { round: state.round, air: CONFIG.STARTING_AIR });
  beginTurn();
}

// Log entries are stored as {key, vars} rather than rendered strings, so
// each viewer can translate them in their own language at render time
// (a French host and an English guest read the same log differently).
function addLog(key, vars) {
  state.log.push({ key, vars });
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
    addLog("logAirOut", { air: state.air });
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
    addLog("logTurnBack", { name: p.name });
  } else {
    addLog("logContinue", { name: p.name });
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

  addLog("logRoll", {
    name: p.name,
    d1,
    d2,
    sum,
    carried: p.carrying.length,
    steps,
    from: fromPos === 0 ? t("subLabel") : fromPos,
    to: toPos === 0 ? t("subLabel") : toPos,
  });

  if (toPos === 0) {
    p.returned = true;
    state.returnOrderLog.push(p.id);
    addLog("logReturned", { name: p.name });
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
    addLog("logPickup", { name: p.name, pos: p.pos });
  } else if (action === "drop") {
    const unit = p.carrying.splice(payload, 1)[0];
    state.line[slotIdx] = unit.type === "chip" ? { type: "chip", chip: unit.chip } : { type: "stack", chips: unit.chips };
    addLog("logDrop", { name: p.name, pos: p.pos });
  } else {
    addLog("logNone", { name: p.name });
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
      addLog("logStrandedLost", { name: p.name, n: p.carrying.length });
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

// Single entry point for all player-triggered mutations. In online mode a
// guest's clicks are relayed here on the host through the network layer
// instead of running locally (see net.js: dispatchAction / canAct).
function applyAction(kind, payload) {
  if (kind === "declare") handleDeclare(payload);
  else if (kind === "roll") handleRoll();
  else if (kind === "action") handleAction(payload.type, payload.idx);
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
// The top-level screen router (menu / lobby / game) lives in net.js as
// `render()`, since it needs to know about the network session. The
// functions below render the "game" and "local setup" screens specifically.
const app = document.getElementById("app");

function renderLocalSetup() {
  app.innerHTML = `
    <div class="top-row"><h1>Deep Sea Adventure — prototype</h1>${langSwitcherHtml()}</div>
    <p class="subtitle">${t("localSetupSubtitle")}</p>
    <div class="card">
      <label for="numPlayers">${t("numPlayersLabel", { min: CONFIG.MIN_PLAYERS, max: CONFIG.MAX_PLAYERS })}</label>
      <input type="number" id="numPlayers" min="${CONFIG.MIN_PLAYERS}" max="${CONFIG.MAX_PLAYERS}" value="4">
      <div id="nameFields"></div>
      <button id="startBtn" style="margin-top:14px;">${t("btnStartGame")}</button>
      <button id="backBtn" class="secondary" style="margin-top:14px;">${t("btnBack")}</button>
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
        <input type="text" data-idx="${i}" class="nameInput" placeholder="${t("playerPlaceholder", { n: i + 1 })}">
      </div>
    `).join("");
  }
  numInput.addEventListener("input", renderNameFields);
  renderNameFields();

  document.getElementById("startBtn").addEventListener("click", () => {
    const names = Array.from(document.querySelectorAll(".nameInput")).map((inp) => inp.value.trim());
    session.mode = "local";
    session.myPlayerId = null;
    session.isHost = false;
    startGame(names);
    session.screen = "game";
    render();
  });
  document.getElementById("backBtn").addEventListener("click", () => {
    session.screen = "menu";
    render();
  });
}

// Column count adapts to the available width (recomputed on load/resize by
// syncBoardColsAndMaybeRerender below) instead of being hardcoded, so the
// snake board doesn't fall out of alignment on wide windows.
const BOARD_MIN_COLS = 5;
const BOARD_MAX_COLS = 16;
let boardCols = 8;

function computeBoardCols(availableWidth) {
  const cellSpan = 58 + 8; // must match --cell-w + .board-row gap in style.css
  const padding = 8; // .board-snake left+right padding, cancels the trailing gap math
  const n = Math.floor((availableWidth - padding) / cellSpan);
  return Math.max(BOARD_MIN_COLS, Math.min(BOARD_MAX_COLS, n || BOARD_MIN_COLS));
}

function syncBoardColsAndMaybeRerender() {
  const el = document.querySelector(".board-snake");
  if (!el || el.clientWidth === 0) return;
  const next = computeBoardCols(el.clientWidth);
  if (next !== boardCols) {
    boardCols = next;
    render();
  }
}

let boardResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(boardResizeTimer);
  boardResizeTimer = setTimeout(syncBoardColsAndMaybeRerender, 150);
});

function pipsHtml(level) {
  return `<div class="pips">${Array.from({ length: level }, () => `<span class="pip"></span>`).join("")}</div>`;
}

function renderSlotCell(slot, pos) {
  const diversHere = state.players.filter((p) => p.pos === pos);
  let tileClass = "slot-tile blank";
  let inner = `<span class="blank-mark">×</span>`;
  let extraAttr = "";
  if (slot.type === "chip") {
    tileClass = `slot-tile ${levelClass(slot.chip.level)}`;
    inner = pipsHtml(slot.chip.level);
  } else if (slot.type === "stack") {
    tileClass = `slot-tile stack ${levelClass(slot.chips[0].level)}`;
    inner = pipsHtml(slot.chips[0].level);
    extraAttr = ` data-count="${slot.chips.length}"`;
  }
  return `
    <div class="slot-cell">
      <div class="divers-on-slot">
        ${diversHere.map((p) => `<div class="diver-token${p.facing === "back" ? " facing-back" : ""}" style="background:${p.color}" title="${p.name}">${p.name[0].toUpperCase()}</div>`).join("")}
      </div>
      <div class="${tileClass}"${extraAttr}>${inner}</div>
      <div class="slot-index">${pos}</div>
    </div>
  `;
}

// Snake layout: rows alternate direction (like a Chutes-and-Ladders board),
// so the whole line is visible at once instead of one long horizontal strip.
function renderBoard() {
  const items = [
    { html: `<div class="sub-cell">${t("subLabel")}</div>` },
    ...state.line.map((slot, i) => ({ html: renderSlotCell(slot, i + 1) })),
  ];

  const rows = [];
  for (let i = 0; i < items.length; i += boardCols) rows.push(items.slice(i, i + boardCols));

  const rowsHtml = rows
    .map((row, rowIdx) => {
      const reversed = rowIdx % 2 === 1;
      const isLastRow = rowIdx === rows.length - 1;
      const cellsHtml = row
        .map((item, idxInRow) => {
          if (idxInRow !== row.length - 1 || isLastRow) return item.html;
          // tag the last cell of a non-final row so CSS can draw the turn connector
          return item.html.replace(/class="(sub-cell|slot-cell)"/, 'class="$1 row-connector-down"');
        })
        .join("");
      return `<div class="board-row${reversed ? " reversed" : ""}">${cellsHtml}</div>`;
    })
    .join("");

  return `<div class="board-snake">${rowsHtml}</div>`;
}

function renderPlayersStrip() {
  const activeId = currentPlayer().id;
  return `<div class="players-strip">${state.players
    .map((p) => `
      <div class="player-chip ${p.id === activeId ? "active" : ""} ${p.returned ? "returned" : ""}">
        <span class="swatch" style="background:${p.color}"></span>
        <span>${p.name}${session.mode === "online" && p.id === session.myPlayerId ? t("youTag") : ""}</span>
        <span class="small-note">· ${t("carriesLabel", { n: p.carrying.length })} · ${t("totalLabel", { n: totalScore(p) })}</span>
      </div>
    `)
    .join("")}</div>`;
}

function isMyTurn() {
  return session.mode !== "online" || currentPlayer().id === session.myPlayerId;
}

function renderTurnPanel() {
  const p = currentPlayer();
  const mine = isMyTurn();
  let inner = "";

  if (state.phase === "declare") {
    if (mine) {
      inner = `
        <p>${t("declarePrompt", { name: p.name, n: p.carrying.length })}</p>
        <button id="btnContinue">${t("btnDiveDeeper")}</button>
        <button id="btnTurnBack" class="secondary">${t("btnTurnBack")}</button>
      `;
    } else {
      inner = `<p class="small-note">${t("waitDeclare", { name: p.name })}</p>`;
    }
  } else if (state.phase === "roll") {
    if (mine) {
      inner = `
        <p>${t("rollPrompt", { name: p.name, state: p.facing === "out" ? t("stateOut") : t("stateBack"), n: p.carrying.length })}</p>
        <button id="btnRoll">${t("btnRollDice")}</button>
      `;
    } else {
      inner = `<p class="small-note">${t("waitRoll", { name: p.name })}</p>`;
    }
  } else if (state.phase === "action") {
    const dice = state.lastDice
      ? `<div class="dice-row"><div class="die">${state.lastDice[0]}</div><div class="die">${state.lastDice[1]}</div></div>
         <p class="move-summary">${t("moveSummary", { sum: state.lastMove.sum, carried: state.lastMove.carried, steps: state.lastMove.steps, pos: state.lastMove.toPos === 0 ? t("subLabel") : state.lastMove.toPos })}</p>`
      : "";

    if (mine) {
      let actions = "";
      const slot = state.line[p.pos - 1];
      const canPickup = slot.type === "chip" || slot.type === "stack";
      const canDrop = slot.type === "blank" && p.carrying.length > 0;
      actions += `<div>`;
      if (canPickup) {
        actions += `<button id="btnPickup">${t("btnPickup")}</button>`;
      }
      if (canDrop) {
        p.carrying.forEach((unit, i) => {
          actions += `<button class="secondary btnDrop" data-idx="${i}">${t("btnDrop", { i: i + 1, n: unitChips(unit).length })}</button>`;
        });
      }
      actions += `<button class="secondary" id="btnNone">${t("btnNothing")}</button>`;
      actions += `</div>`;
      inner = dice + actions;
    } else {
      inner = dice + `<p class="small-note">${t("waitAction", { name: p.name })}</p>`;
    }
  }

  return `<div class="card turn-panel"><h2>${t("turnOf", { name: p.name })}${session.mode === "online" && mine ? t("youTag") : ""}</h2>${inner}</div>`;
}

function renderGame() {
  const airPct = Math.max(0, Math.min(100, (state.air / CONFIG.STARTING_AIR) * 100));
  app.innerHTML = `
    <div class="top-row"><h1>Deep Sea Adventure — prototype</h1>${langSwitcherHtml()}</div>
    <div class="card">
      <div class="hud">
        <div class="stat"><span class="label">${t("hudRound")}</span><span class="value">${state.round}/${CONFIG.MAX_ROUNDS}</span></div>
        <div class="stat"><span class="label">${t("hudAir")}</span><span class="value">${Math.max(0, state.air)}</span></div>
        <div class="air-bar-wrap"><div class="air-bar"><div class="air-bar-fill" style="width:${airPct}%"></div></div></div>
      </div>
      ${renderPlayersStrip()}
    </div>
    <div class="card">${renderBoard()}</div>
    ${renderTurnPanel()}
    <div class="card">
      <h2 style="margin-top:0;font-size:0.95rem;">${t("journalTitle")}</h2>
      <div class="log-panel">${state.log.slice().reverse().slice(0, 40).map((l) => `<div>${t(l.key, l.vars)}</div>`).join("")}</div>
    </div>
    ${renderScoreTable()}
  `;

  attachHandlers();
  syncBoardColsAndMaybeRerender();
}

function renderScoreTable() {
  return `
    <div class="card">
      <h2 style="margin-top:0;font-size:0.95rem;">${t("scoresTitle")}</h2>
      <table class="score-table">
        <thead><tr><th>${t("tablePlayer")}</th>${Array.from({ length: CONFIG.MAX_ROUNDS }, (_, i) => `<th>${t("tableRound", { n: i + 1 })}</th>`).join("")}<th>${t("tableTotal")}</th></tr></thead>
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
    winners.length > 1
      ? t("endTie", { names: winners.map((w) => w.name).join(` ${t("and")} `) })
      : t("endWinner", { name: winners[0].name });

  app.innerHTML = `
    <div class="top-row"><h1>Deep Sea Adventure — prototype</h1>${langSwitcherHtml()}</div>
    <div class="card">
      <div class="winner-banner">${winnerText}</div>
      <table class="score-table">
        <thead><tr><th>${t("tablePlayer")}</th><th>${t("tableTotal")}</th><th>${t("endHighLevel")}</th></tr></thead>
        <tbody>
          ${ranked
            .map((p) => `<tr><td>${p.name}</td><td><strong>${totalScore(p)}</strong></td><td>${highLevelCount(p)}</td></tr>`)
            .join("")}
        </tbody>
      </table>
      ${
        session.mode === "online" && !session.isHost
          ? `<p class="small-note">${t("onlyHostRestart")}</p>`
          : `<button id="btnRestart" style="margin-top:14px;">${t("btnNewGame")}</button>`
      }
    </div>
    ${renderScoreTable()}
  `;
  const restartBtn = document.getElementById("btnRestart");
  if (restartBtn) restartBtn.addEventListener("click", () => resetToMenu());
}

function attachHandlers() {
  const byId = (id) => document.getElementById(id);
  if (byId("btnContinue")) byId("btnContinue").addEventListener("click", () => dispatchAction("declare", false));
  if (byId("btnTurnBack")) byId("btnTurnBack").addEventListener("click", () => dispatchAction("declare", true));
  if (byId("btnRoll")) byId("btnRoll").addEventListener("click", () => dispatchAction("roll"));
  if (byId("btnPickup")) byId("btnPickup").addEventListener("click", () => dispatchAction("action", { type: "pickup" }));
  if (byId("btnNone")) byId("btnNone").addEventListener("click", () => dispatchAction("action", { type: "none" }));
  document.querySelectorAll(".btnDrop").forEach((btn) => {
    btn.addEventListener("click", () => dispatchAction("action", { type: "drop", idx: parseInt(btn.dataset.idx, 10) }));
  });
}
