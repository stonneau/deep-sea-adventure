"use strict";

// Language is a per-viewer preference, not part of the shared game state:
// a French host and an English guest each see their own UI language, since
// only `state.log` entries are structured ({key, vars}) and translated at
// render time from whatever the *viewer's* currentLang is.
const I18N = {
  fr: {
    menuSubtitle: "Clone web (hotseat local ou en ligne), hors plateforme BGA.",
    btnPlayLocal: "Jouer en local (même écran)",
    btnPlayOnline: "Jouer en ligne avec des amis",

    localSetupSubtitle: "Partie locale (hotseat) : tout le monde joue sur le même écran.",
    numPlayersLabel: "Nombre de joueurs ({min}-{max})",
    btnStartGame: "Démarrer la partie",
    btnBack: "Retour",
    playerPlaceholder: "Joueur {n}",

    onlineChoiceSubtitle: "Jouer en ligne",
    hostNameLabel: "Ton nom (pour héberger une partie)",
    hostNamePlaceholder: "Hôte",
    btnHostGame: "Héberger une partie",
    btnJoinGame: "Rejoindre une partie",

    hostLobbySubtitle: "Salon (hôte)",
    roomCodeLabel: "Code de partie :",
    roomCodeHint: "Donne ce code à tes amis. Ils le saisissent dans « Rejoindre une partie ».",
    playersCountLabel: "Joueurs ({n}/{max})",
    youHostTag: " (vous, hôte)",
    btnCancel: "Annuler",

    guestJoinSubtitle: "Rejoindre une partie",
    roomCodeInputLabel: "Code de partie",
    roomCodePlaceholder: "dsa-XXXXX",
    yourNameLabel: "Ton nom",
    yourNamePlaceholder: "Joueur",
    btnJoin: "Rejoindre",

    guestLobbySubtitle: "Salon (en attente de l'hôte)",
    guestLobbyWaiting: "Connecté. En attente que l'hôte démarre la partie…",

    errJoinFailed: "Impossible de rejoindre cette partie (code invalide ou hôte injoignable).",
    errHostConnLost: "Connexion à l'hôte perdue.",
    errNetwork: "Erreur réseau ({type}). Réessaie.",

    hudRound: "Manche",
    hudAir: "Air",
    youTag: " (vous)",
    carriesLabel: "porte {n}",
    carryValueLabel: "valeur {v}",
    totalLabel: "total {n}",

    turnOf: "Tour de {name}",

    declarePrompt: "{name} porte {n} trésor(s). Continuer à plonger ou faire demi-tour ?",
    btnDiveDeeper: "Plonger plus profond",
    btnTurnBack: "Faire demi-tour",
    waitDeclare: "En attente de {name} (doit annoncer s'il/elle continue ou fait demi-tour)…",

    rollPrompt: "{name} est {state}, porte {n} trésor(s).",
    stateOut: "en descente",
    stateBack: "sur le chemin du retour",
    btnRollDice: "Lancer les dés",
    waitRoll: "En attente de {name} (doit lancer les dés)…",

    moveSummary: "Somme {sum} − {carried} porté(s) = {steps} case(s). Nouvelle position : {pos}.",
    btnPickup: "Ramasser le trésor",
    btnDrop: "Déposer trésor #{i} ({n} pièce(s))",
    btnNothing: "Ne rien faire",
    waitAction: "En attente de {name} (choisit une action)…",

    journalTitle: "Journal",
    scoresTitle: "Scores",
    tableRound: "Manche {n}",
    tableTotal: "Total",
    tablePlayer: "Joueur",

    endTie: "Égalité entre {names} !",
    endWinner: "{name} remporte la partie !",
    endHighLevel: "Trésors de niveau 4",
    btnNewGame: "Nouvelle partie",
    onlyHostRestart: "Seul l'hôte peut relancer une partie.",

    logRoundStart: "— Manche {round} — plongée avec {air} d'air.",
    logAirOut: "L'air tombe à {air} — dernier tour de la manche !",
    logTurnBack: "{name} fait demi-tour vers le sous-marin.",
    logContinue: "{name} continue de plonger.",
    logRoll: "{name} lance {d1}+{d2}={sum} (− {carried} porté(s)) → {steps} case(s), de {from} à {to}.",
    logReturned: "{name} est de retour au sous-marin.",
    logPickup: "{name} ramasse un trésor (case {pos}).",
    logDrop: "{name} dépose un trésor (case {pos}).",
    logNone: "{name} ne fait rien.",
    logStrandedLost: "{name} n'est pas rentré et perd {n} trésor(s).",

    subLabel: "SUB",
    and: "et",
  },
  en: {
    menuSubtitle: "Web clone (local hotseat or online), outside the BGA platform.",
    btnPlayLocal: "Play locally (same screen)",
    btnPlayOnline: "Play online with friends",

    localSetupSubtitle: "Local game (hotseat): everyone plays on the same screen.",
    numPlayersLabel: "Number of players ({min}-{max})",
    btnStartGame: "Start game",
    btnBack: "Back",
    playerPlaceholder: "Player {n}",

    onlineChoiceSubtitle: "Play online",
    hostNameLabel: "Your name (to host a game)",
    hostNamePlaceholder: "Host",
    btnHostGame: "Host a game",
    btnJoinGame: "Join a game",

    hostLobbySubtitle: "Lobby (host)",
    roomCodeLabel: "Game code:",
    roomCodeHint: "Give this code to your friends. They enter it under \"Join a game\".",
    playersCountLabel: "Players ({n}/{max})",
    youHostTag: " (you, host)",
    btnCancel: "Cancel",

    guestJoinSubtitle: "Join a game",
    roomCodeInputLabel: "Game code",
    roomCodePlaceholder: "dsa-XXXXX",
    yourNameLabel: "Your name",
    yourNamePlaceholder: "Player",
    btnJoin: "Join",

    guestLobbySubtitle: "Lobby (waiting for host)",
    guestLobbyWaiting: "Connected. Waiting for the host to start the game…",

    errJoinFailed: "Couldn't join this game (invalid code or host unreachable).",
    errHostConnLost: "Lost connection to the host.",
    errNetwork: "Network error ({type}). Try again.",

    hudRound: "Round",
    hudAir: "Air",
    youTag: " (you)",
    carriesLabel: "carrying {n}",
    carryValueLabel: "value {v}",
    totalLabel: "total {n}",

    turnOf: "{name}'s turn",

    declarePrompt: "{name} is carrying {n} treasure(s). Keep diving or turn back?",
    btnDiveDeeper: "Dive deeper",
    btnTurnBack: "Turn back",
    waitDeclare: "Waiting for {name} (must declare whether to continue or turn back)…",

    rollPrompt: "{name} is {state}, carrying {n} treasure(s).",
    stateOut: "diving deeper",
    stateBack: "heading back",
    btnRollDice: "Roll the dice",
    waitRoll: "Waiting for {name} (must roll the dice)…",

    moveSummary: "Total {sum} − {carried} carried = {steps} space(s). New position: {pos}.",
    btnPickup: "Pick up the treasure",
    btnDrop: "Drop treasure #{i} ({n} piece(s))",
    btnNothing: "Do nothing",
    waitAction: "Waiting for {name} (choosing an action)…",

    journalTitle: "Log",
    scoresTitle: "Scores",
    tableRound: "Round {n}",
    tableTotal: "Total",
    tablePlayer: "Player",

    endTie: "Tie between {names}!",
    endWinner: "{name} wins the game!",
    endHighLevel: "Level-4 treasures",
    btnNewGame: "New game",
    onlyHostRestart: "Only the host can start a new game.",

    logRoundStart: "— Round {round} — dive starting with {air} air.",
    logAirOut: "Air drops to {air} — last turn of the dive!",
    logTurnBack: "{name} turns back toward the submarine.",
    logContinue: "{name} keeps diving.",
    logRoll: "{name} rolls {d1}+{d2}={sum} (− {carried} carried) → {steps} space(s), from {from} to {to}.",
    logReturned: "{name} is back at the submarine.",
    logPickup: "{name} picks up a treasure (space {pos}).",
    logDrop: "{name} drops a treasure (space {pos}).",
    logNone: "{name} does nothing.",
    logStrandedLost: "{name} didn't make it back and loses {n} treasure(s).",

    subLabel: "SUB",
    and: "and",
  },
};

function detectDefaultLang() {
  try {
    return (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
  } catch (e) {
    return "en";
  }
}

let currentLang = detectDefaultLang();
try {
  const saved = localStorage.getItem("dsa-lang");
  if (saved && I18N[saved]) currentLang = saved;
} catch (e) {
  /* ignore (private browsing, etc.) */
}

function t(key, vars) {
  const dict = I18N[currentLang] || I18N.en;
  let str = dict[key] !== undefined ? dict[key] : I18N.en[key] !== undefined ? I18N.en[key] : key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      str = str.split("{" + k + "}").join(vars[k]);
    }
  }
  return str;
}

function setLang(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem("dsa-lang", lang);
  } catch (e) {
    /* ignore */
  }
  render();
}

function langSwitcherHtml() {
  return `<div class="lang-switch">
    <button class="lang-btn${currentLang === "fr" ? " active" : ""}" onclick="setLang('fr')">FR</button>
    <button class="lang-btn${currentLang === "en" ? " active" : ""}" onclick="setLang('en')">EN</button>
  </div>`;
}
