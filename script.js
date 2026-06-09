// ═════════════════════════════════════════════════════════════
//  STATE
// ═════════════════════════════════════════════════════════════
let state = {
  players: [],
  matches: [],
  planned: [],
  currentMatch: null
};


const POINTS = ['0','15','30','40','AD'];
const LS_KEY  = 'padeltrack';
const LS_GIST = 'padeltrack_gist';
const GIST_FILENAME = 'padeltrack.json';

// ═════════════════════════════════════════════════════════════
//  GIST — CONFIG
// ═════════════════════════════════════════════════════════════

function getGistConfig() {
  try { return JSON.parse(localStorage.getItem(LS_GIST)) || null; }
  catch { return null; }
}
function setGistConfig(token, gistId) {
  localStorage.setItem(LS_GIST, JSON.stringify({ token, gistId }));
}
function setGistDot(status) {
  const dot = document.getElementById('gist-status-dot');
  if (!dot) return;
  dot.className = `gist-dot gist-dot--${status}`;
}
function setModalStatus(msg, color) {
  color = color || 'var(--text-muted)';
  const el = document.getElementById('gist-modal-status');
  if (el) { el.textContent = msg; el.style.color = color; }
}
function openGistModal() {
  const cfg = getGistConfig();
  if (cfg) {
    document.getElementById('cfg-token').value   = cfg.token   || '';
    document.getElementById('cfg-gist-id').value = cfg.gistId  || '';
  }
  setModalStatus('');
  document.getElementById('gist-modal-cancel-btn').style.display = cfg ? '' : 'none';
  document.getElementById('gist-modal').style.display = 'flex';
}
function closeGistModal() {
  document.getElementById('gist-modal').style.display = 'none';
}
async function saveGistConfig() {
  const token  = document.getElementById('cfg-token').value.trim();
  const gistId = document.getElementById('cfg-gist-id').value.trim();
  if (!token) { setModalStatus('Le token est obligatoire.', 'var(--lose)'); return; }
  setModalStatus('Connexion en cours...', 'var(--accent3)');
  try {
    let resolvedId = gistId;
    if (!resolvedId) {
      resolvedId = await createGist(token);
      document.getElementById('cfg-gist-id').value = resolvedId;
      setModalStatus('Gist cree : ' + resolvedId, 'var(--win)');
    } else {
      await fetchGist(token, resolvedId);
      setModalStatus('Connexion reussie !', 'var(--win)');
    }
    setGistConfig(token, resolvedId);
    setGistDot('ok');
    await loadStateFromGist();
    setTimeout(closeGistModal, 1200);
  } catch (err) {
    setModalStatus('Erreur : ' + err.message, 'var(--lose)');
    setGistDot('error');
  }
}

// ═════════════════════════════════════════════════════════════
//  GIST — API
// ═════════════════════════════════════════════════════════════

const GIST_API = 'https://api.github.com/gists';

async function createGist(token) {
  const res = await fetch(GIST_API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'PadelTrack — donnees application',
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify({ players:[], matches:[], planned:[] }) } }
    })
  });
  if (!res.ok) throw new Error('GitHub API ' + res.status + ' — verifiez le token (scope gist requis)');
  const data = await res.json();
  return data.id;
}

async function fetchGist(token, gistId) {
  const res = await fetch(GIST_API + '/' + gistId, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (res.status === 404) throw new Error('Gist introuvable — verifiez le Gist ID');
  if (!res.ok) throw new Error('GitHub API ' + res.status);
  const data = await res.json();
  const file = data.files[GIST_FILENAME];
  if (!file) throw new Error('Fichier "' + GIST_FILENAME + '" absent du Gist');
  return JSON.parse(file.content);
}

async function pushGist(token, gistId) {
  const payload = { players: state.players, matches: state.matches, planned: state.planned };
  const res = await fetch(GIST_API + '/' + gistId, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } }
    })
  });
  if (!res.ok) throw new Error('GitHub API ' + res.status);
}

// ═════════════════════════════════════════════════════════════
//  LOAD / SAVE — hybride localStorage + Gist
// ═════════════════════════════════════════════════════════════

function loadState() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) state = Object.assign({}, state, JSON.parse(s));
  } catch(e) {}

  const cfg = getGistConfig();
  if (cfg) {
    setGistDot('syncing');
    loadStateFromGist().catch(function() { setGistDot('error'); });
  } else {
    setGistDot('off');
    if (!localStorage.getItem(LS_KEY)) {
      setTimeout(openGistModal, 600);
    }
  }
}

async function loadStateFromGist() {
  const cfg = getGistConfig();
  if (!cfg) return;
  setGistDot('syncing');
  try {
    const remote = await fetchGist(cfg.token, cfg.gistId);
    state.players = remote.players || state.players;
    state.matches = remote.matches || state.matches;
    state.planned = remote.planned || state.planned;
    localStorage.setItem(LS_KEY, JSON.stringify({
      players: state.players, matches: state.matches, planned: state.planned
    }));
    refreshAllViews();
    setGistDot('ok');
  } catch (err) {
    console.warn('Gist load error:', err);
    setGistDot('error');
    toast('Synchro Gist echouee : ' + err.message, 'error');
  }
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      players: state.players, matches: state.matches, planned: state.planned
    }));
  } catch(e) {}

  const cfg = getGistConfig();
  if (!cfg) return;
  setGistDot('syncing');
  pushGist(cfg.token, cfg.gistId)
    .then(function() { setGistDot('ok'); })
    .catch(function(err) {
      console.warn('Gist save error:', err);
      setGistDot('error');
      toast('Synchro Gist echouee : ' + err.message, 'error');
    });
}

function refreshAllViews() {
  const activePage = (document.querySelector('.page.active') || {}).id;
  if (activePage) activePage.replace('page-', '');
  document.getElementById('history-count').textContent = state.matches.length;
  document.getElementById('players-count').textContent = state.players.length;
  populateSelects();
  const page = activePage ? activePage.replace('page-', '') : '';
  if (page === 'history')  renderHistory();
  if (page === 'players')  renderPlayers();
  if (page === 'ranking')  renderRanking();
  if (page === 'planning') renderPlanned();
}



// ─── TOAST ───
function toast(msg, type='success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = {success:'✓', error:'✕', info:'ℹ'};
  t.innerHTML = `<span>${icons[type]||'●'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'slideOut .3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

// ═════════════════════════════════════════════════════════════
//  NAVIGATION
// ═════════════════════════════════════════════════════════════
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#main-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  // refresh views
  if (page === 'history') renderHistory();
  if (page === 'players') renderPlayers();
  if (page === 'ranking') renderRanking();
  if (page === 'planning') renderPlanned();
  if (page === 'match') populateSelects();
}

document.querySelectorAll('#main-nav button').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// ═════════════════════════════════════════════════════════════
//  PLAYERS
// ═════════════════════════════════════════════════════════════
function addPlayer() {
  const input = document.getElementById('new-player-name');
  const name = input.value.trim();
  if (!name) { toast('Entrez un nom de joueur', 'error'); return; }
  if (state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    toast('Ce joueur existe déjà', 'error'); return;
  }
  state.players.push({ id: Date.now(), name, wins: 0, losses: 0, played: 0 });
  saveState();
  input.value = '';
  renderPlayers();
  populateSelects();
  toast(`${name} ajouté !`);
}

function deletePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  saveState();
  renderPlayers();
  populateSelects();
  renderRanking();
  toast('Joueur supprimé', 'info');
}

function renderPlayers() {
  const grid = document.getElementById('player-grid');
  document.getElementById('players-count').textContent = state.players.length;
  if (!state.players.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">👤</div><div class="empty-text">Aucun joueur créé</div></div>`;
    return;
  }
  grid.innerHTML = state.players.map(p => {
    const wr = p.played ? Math.round(p.wins/p.played*100) : 0;
    const initials = p.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `<div class="player-card">
      <button class="player-delete" onclick="deletePlayer(${p.id})">✕</button>
      <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem;">
        <div class="player-avatar" style="background:${avatarGrad(p.id)}">${initials}</div>
        <div class="player-name">${p.name}</div>
      </div>
      <div class="player-stats">
        <span class="stat-chip blue">🎮 ${p.played} matchs</span>
        <span class="stat-chip green">✓ ${p.wins} V</span>
        <span class="stat-chip red">✗ ${p.losses} D</span>
        <span class="stat-chip">${wr}% WR</span>
      </div>
    </div>`;
  }).join('');
}

function avatarGrad(id) {
  const colors = [
    'linear-gradient(135deg,#00e5a0,#4d9fff)',
    'linear-gradient(135deg,#ff6b35,#ff4757)',
    'linear-gradient(135deg,#4d9fff,#9b59b6)',
    'linear-gradient(135deg,#ffd700,#ff6b35)',
    'linear-gradient(135deg,#00e5a0,#9b59b6)',
  ];
  return colors[id % colors.length];
}

function populateSelects() {
  ['setup-a1','setup-a2','setup-b1','setup-b2'].forEach(id => {
    const sel = document.getElementById(id);
    const val = sel.value;
    sel.innerHTML = '<option value="">— Choisir —</option>' +
      state.players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    sel.value = val;
  });
}

// ═════════════════════════════════════════════════════════════
//  MATCH SETUP
// ═════════════════════════════════════════════════════════════
let matchFormat = '2v2';
let matchSets = 1;

function setFormat(fmt, el) {
  matchFormat = fmt;
  document.querySelectorAll('[data-format]').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('setup-a2-group').style.display = fmt==='2v2' ? '' : 'none';
  document.getElementById('setup-b2-group').style.display = fmt==='2v2' ? '' : 'none';
}
function setSets(n, el) {
  matchSets = n;
  document.querySelectorAll('[data-sets]').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

function startMatch() {
  const a1id = +document.getElementById('setup-a1').value;
  const b1id = +document.getElementById('setup-b1').value;
  const a2id = matchFormat==='2v2' ? +document.getElementById('setup-a2').value : null;
  const b2id = matchFormat==='2v2' ? +document.getElementById('setup-b2').value : null;

  if (!a1id || !b1id) { toast('Sélectionnez au moins 1 joueur par équipe', 'error'); return; }
  if (matchFormat==='2v2' && (!a2id || !b2id)) { toast('Sélectionnez 2 joueurs par équipe', 'error'); return; }

  // Collision check
  const ids = [a1id, b1id, a2id, b2id].filter(Boolean);
  if (new Set(ids).size !== ids.length) { toast('Un joueur ne peut jouer dans les deux équipes', 'error'); return; }

  const getP = id => state.players.find(p=>p.id===id);

  const teamAPlayers = [getP(a1id), a2id ? getP(a2id) : null].filter(Boolean);
  const teamBPlayers = [getP(b1id), b2id ? getP(b2id) : null].filter(Boolean);

  state.currentMatch = {
    id: Date.now(),
    format: matchFormat,
    totalSets: matchSets,
    teamA: { players: teamAPlayers, games: 0, setsWon: 0, pointSeq: 0, history: [] },
    teamB: { players: teamBPlayers, games: 0, setsWon: 0, pointSeq: 0, history: [] },
    sets: [],  // [{a:x, b:y}, ...]
    currentSet: 0,
    startTime: Date.now(),
    history: []  // for undo
  };

  renderScoreboard();
  document.getElementById('match-setup').style.display = 'none';
  document.getElementById('match-scoreboard').style.display = 'block';
  startTimer();
  toast('Match démarré !');
}

// ═════════════════════════════════════════════════════════════
//  TIMER
// ═════════════════════════════════════════════════════════════
let timerInterval = null;
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!state.currentMatch) return;
    const elapsed = Math.floor((Date.now() - state.currentMatch.startTime) / 1000);
    const m = String(Math.floor(elapsed/60)).padStart(2,'0');
    const s = String(elapsed%60).padStart(2,'0');
    document.getElementById('match-timer').textContent = `${m}:${s}`;
  }, 1000);
}

// ═════════════════════════════════════════════════════════════
//  SCORING
// ═════════════════════════════════════════════════════════════
function addPoint(team) {
  const m = state.currentMatch;
  if (!m) return;

  // Save snapshot for undo
  m.history.push(JSON.parse(JSON.stringify({
    teamA: { games: m.teamA.games, setsWon: m.teamA.setsWon, pointSeq: m.teamA.pointSeq },
    teamB: { games: m.teamB.games, setsWon: m.teamB.setsWon, pointSeq: m.teamB.pointSeq },
    sets: m.sets.map(s => ({...s}))
  })));

  const scorer   = team === 'A' ? m.teamA : m.teamB;
  const opponent = team === 'A' ? m.teamB : m.teamA;
  const sp = scorer.pointSeq;
  const op = opponent.pointSeq;

  // ── Logique exhaustive et sans ambiguïté ──────────────────
  // Cas 1 : L'adversaire avait l'avantage → retour à deuce (les deux à 3)
  if (op === 4) {
    opponent.pointSeq = 3;
    // scorer reste à 3 (deuce)
  }
  // Cas 2 : Le marqueur avait l'avantage → il gagne le jeu
  else if (sp === 4) {
    scorer.pointSeq = 0;
    opponent.pointSeq = 0;
    winGame(team);
  }
  // Cas 3 : Les deux à 40 → le marqueur prend l'avantage
  else if (sp === 3 && op === 3) {
    scorer.pointSeq = 4;
  }
  // Cas 4 : Le marqueur à 40, adversaire < 40 → il gagne le jeu
  else if (sp === 3 && op < 3) {
    scorer.pointSeq = 0;
    opponent.pointSeq = 0;
    winGame(team);
  }
  // Cas 5 : Progression normale (0→1, 1→2, 2→3)
  else {
    scorer.pointSeq++;
  }

  renderScoreboard();
  toast(`Point ${team === 'A' ? m.teamA.players.map(p=>p.name).join('/') : m.teamB.players.map(p=>p.name).join('/')} ✓`);
}

function winGame(team) {
  const m = state.currentMatch;
  const scorer = team === 'A' ? m.teamA : m.teamB;
  const opponent = team === 'A' ? m.teamB : m.teamA;
  scorer.games++;
  toast(`Jeu ${team === 'A' ? 'Équipe A' : 'Équipe B'} ! 🎾`, 'info');

  // Check set win (first to 6 games, lead by 2; or tie-break at 6-6)
  const ag = m.teamA.games, bg = m.teamB.games;
  let setWinner = null;

  if (ag >= 6 && ag - bg >= 2) setWinner = 'A';
  else if (bg >= 6 && bg - ag >= 2) setWinner = 'B';
  else if (ag === 7) setWinner = 'A';  // tie-break
  else if (bg === 7) setWinner = 'B';

  if (setWinner) {
    m.sets.push({ a: m.teamA.games, b: m.teamB.games });
    const sw = setWinner === 'A' ? m.teamA : m.teamB;
    sw.setsWon++;
    m.teamA.games = 0; m.teamB.games = 0;

    // Check match win
    const setsNeeded = m.totalSets === 1 ? 1 : 2;
    if (sw.setsWon >= setsNeeded) {
      endMatch(setWinner);
      return;
    }
    toast(`Set remporté par ${setWinner === 'A' ? 'Équipe A' : 'Équipe B'} !`, 'info');
  }
}

function undoPoint() {
  const m = state.currentMatch;
  if (!m || !m.history.length) { toast('Rien à annuler', 'error'); return; }
  const prev = m.history.pop();
  m.teamA.games = prev.teamA.games; m.teamA.setsWon = prev.teamA.setsWon; m.teamA.pointSeq = prev.teamA.pointSeq;
  m.teamB.games = prev.teamB.games; m.teamB.setsWon = prev.teamB.setsWon; m.teamB.pointSeq = prev.teamB.pointSeq;
  m.sets = prev.sets;
  renderScoreboard();
  toast('Point annulé', 'info');
}

function confirmEndMatch() {
  if (!confirm('Terminer le match maintenant ?')) return;
  // Determine winner by games/sets
  const m = state.currentMatch;
  const winner = m.teamA.setsWon > m.teamB.setsWon ? 'A' : m.teamB.setsWon > m.teamA.setsWon ? 'B' :
    m.teamA.games >= m.teamB.games ? 'A' : 'B';
  endMatch(winner);
}

function endMatch(winner) {
  clearInterval(timerInterval);
  const m = state.currentMatch;
  const duration = Math.floor((Date.now() - m.startTime) / 1000);

  // Marque le match comme terminé (pour l'affichage des sets)
  m.finished = true;

  // Le set courant (jeux en cours) n'est inclus dans l'historique
  // que s'il n'est pas déjà enregistré (cas de fin manuelle sans fin de set)
  const lastSet = m.sets[m.sets.length - 1];
  const currentHasGames = m.teamA.games > 0 || m.teamB.games > 0;
  const currentAlreadySaved =
    lastSet &&
    lastSet.a === m.teamA.games &&
    lastSet.b === m.teamB.games;

  let allSets = [...m.sets];
  // Ajoute le set en cours seulement s'il a des jeux joués et n'est pas déjà enregistré
  if (currentHasGames && !currentAlreadySaved) {
    allSets.push({ a: m.teamA.games, b: m.teamB.games });
  }

  // Build history record
  const record = {
    id: m.id,
    date: new Date().toISOString(),
    duration,
    format: m.format,
    teamA: { players: m.teamA.players.map(p=>p.name), setsWon: m.teamA.setsWon },
    teamB: { players: m.teamB.players.map(p=>p.name), setsWon: m.teamB.setsWon },
    sets: allSets,
    winner
  };

  state.matches.unshift(record);

  // Update player stats
  const winTeam = winner === 'A' ? m.teamA : m.teamB;
  const loseTeam = winner === 'A' ? m.teamB : m.teamA;
  winTeam.players.forEach(p => { p.wins++; p.played++; });
  loseTeam.players.forEach(p => { p.losses++; p.played++; });

  saveState();

  // Show winner
  const winName = winTeam.players.map(p=>p.name).join(' / ');
  const scoreStr = allSets.map(s=>`${s.a}-${s.b}`).join(', ');
  document.getElementById('winner-name').textContent = winName;
  document.getElementById('winner-score').textContent = `Sets: ${m.teamA.setsWon} - ${m.teamB.setsWon} | ${scoreStr}`;
  document.getElementById('winner-overlay').style.display = 'flex';

  state.currentMatch = null;
}

function closeWinner() {
  document.getElementById('winner-overlay').style.display = 'none';
  document.getElementById('match-scoreboard').style.display = 'none';
  document.getElementById('match-setup').style.display = '';
  populateSelects();
  showPage('history');
}

// ═════════════════════════════════════════════════════════════
//  RENDER SCOREBOARD
// ═════════════════════════════════════════════════════════════
function renderScoreboard() {
  const m = state.currentMatch;
  if (!m) return;

  document.getElementById('team-a-name').textContent = m.teamA.players.map(p=>p.name).join(' / ');
  document.getElementById('team-b-name').textContent = m.teamA.players.map(p=>p.name).join(' & ');
  document.getElementById('team-b-name').textContent = m.teamB.players.map(p=>p.name).join(' / ');
  document.getElementById('btn-a-label').textContent = m.teamA.players[0].name.toUpperCase();
  document.getElementById('btn-b-label').textContent = m.teamB.players[0].name.toUpperCase();

  document.getElementById('score-a').textContent = m.teamA.games;
  document.getElementById('score-b').textContent = m.teamB.games;

  // Points display
  const pa = m.teamA.pointSeq, pb = m.teamB.pointSeq;
  const pA = document.getElementById('point-a');
  const pB = document.getElementById('point-b');
  pA.textContent = pa === 4 ? 'AD' : POINTS[pa];
  pB.textContent = pb === 4 ? 'AD' : POINTS[pb];
  pA.className = 'point-pill' + (pa > pb ? ' active' : '');
  pB.className = 'point-pill' + (pb > pa ? ' active' : '');

  // Sets row — n'affiche que les sets réellement joués
  const setsRow = document.getElementById('sets-row');
  let setsHtml = '';
  m.sets.forEach((s, i) => {
    const aw = s.a > s.b;
    setsHtml += `<span class="set-badge ${aw?'won':''}">Set ${i+1}: ${s.a}-${s.b}</span>`;
  });
  // N'affiche "en cours" que si le match n'est pas terminé
  if (!m.finished) {
    setsHtml += `<span class="set-badge" style="color:var(--accent3)">Set ${m.sets.length+1} en cours</span>`;
  }
  setsRow.innerHTML = setsHtml;

  // Match meta
  document.getElementById('match-meta-label').textContent =
    `${m.format.toUpperCase()} • ${m.totalSets} SET${m.totalSets>1?'S':''} • ${m.teamA.setsWon}-${m.teamB.setsWon} SETS`;
}

// ═════════════════════════════════════════════════════════════
//  HISTORY — SUPPRESSION
// ═════════════════════════════════════════════════════════════
let historySelectMode = false;
let undoDeleteStack = null;  // { record, index }
let undoTimer = null;

/** Bascule le mode sélection multiple */
function toggleSelectMode() {
  historySelectMode = !historySelectMode;
  const btnToggle = document.getElementById('btn-toggle-select');
  const btnDel    = document.getElementById('btn-delete-selection');
  btnToggle.textContent = historySelectMode ? '✕ Annuler' : '☑ Sélectionner';
  btnDel.style.display  = historySelectMode ? 'inline-flex' : 'none';
  // Re-rend pour afficher/cacher les checkboxes
  renderHistory();
}

/** Supprime un match par son id (avec animation + undo) */
function deleteMatchById(id) {
  const idx = state.matches.findIndex(m => m.id === id);
  if (idx === -1) return;

  // Sauvegarde pour undo
  undoDeleteStack = { record: state.matches[idx], index: idx };

  // Animation de sortie
  const card = document.querySelector(`.match-card[data-id="${id}"]`);
  const doRemove = () => {
    state.matches.splice(idx, 1);
    saveState();
    renderHistory();
    document.getElementById('history-count').textContent = state.matches.length;
  };

  if (card) {
    card.classList.add('removing');
    card.addEventListener('animationend', doRemove, { once: true });
  } else {
    doRemove();
  }

  toast('🗑 Match supprimé', 'info');
  showUndoBar('Match supprimé');
}

/** Confirmation avant suppression individuelle */
function confirmDeleteSingle(id) {
  const m = state.matches.find(e => e.id === id);
  if (!m) return;
  if (!confirm(`Supprimer le match ${m.teamA.players.join('/')} vs ${m.teamB.players.join('/')} ?`)) return;
  deleteMatchById(id);
}

/** Supprime les matchs cochés */
function deleteSelected() {
  const checked = Array.from(document.querySelectorAll('.match-select-cb:checked'));
  if (!checked.length) { toast('Aucun match sélectionné', 'error'); return; }
  if (!confirm(`Supprimer ${checked.length} match(s) sélectionné(s) ?`)) return;

  const ids = new Set(checked.map(cb => +cb.dataset.id));
  state.matches = state.matches.filter(m => !ids.has(m.id));
  saveState();

  // Réinitialise undo (multiple ne supporte pas l'undo)
  undoDeleteStack = null;
  clearUndoBar();

  renderHistory();
  document.getElementById('history-count').textContent = state.matches.length;
  toast(`🗑 ${ids.size} match(s) supprimé(s)`, 'info');

  // Quitte le mode sélection
  if (historySelectMode) toggleSelectMode();
}

/** Efface tout l'historique */
function confirmClearAll() {
  if (!state.matches.length) { toast('Historique déjà vide', 'info'); return; }
  if (!confirm(`Effacer les ${state.matches.length} match(s) de l'historique ? Cette action est irréversible.`)) return;

  undoDeleteStack = null;
  clearUndoBar();
  state.matches = [];
  saveState();
  renderHistory();
  document.getElementById('history-count').textContent = 0;
  toast('🧹 Historique vidé', 'info');
}

/** Annule la dernière suppression individuelle */
function undoDeleteMatch() {
  if (!undoDeleteStack) return;
  const { record, index } = undoDeleteStack;
  state.matches.splice(index, 0, record);
  saveState();
  undoDeleteStack = null;
  clearUndoBar();
  renderHistory();
  document.getElementById('history-count').textContent = state.matches.length;
  toast('↩ Suppression annulée', 'info');
}

function showUndoBar(msg) {
  const bar = document.getElementById('undo-bar');
  document.getElementById('undo-message').textContent = msg;
  bar.classList.remove('hidden');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(clearUndoBar, 6000);
}

function clearUndoBar() {
  document.getElementById('undo-bar').classList.add('hidden');
  clearTimeout(undoTimer);
}

// ═════════════════════════════════════════════════════════════
//  HISTORY
// ═════════════════════════════════════════════════════════════
function renderHistory() {
  const list = document.getElementById('history-list');
  document.getElementById('history-count').textContent = state.matches.length;

  if (!state.matches.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Aucun match enregistré</div></div>`;
    return;
  }

  list.innerHTML = state.matches.map(m => {
    const date = new Date(m.date);
    const dateStr = date.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
    const timeStr = date.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
    const dur = m.duration ? `${Math.floor(m.duration/60)}min` : '';
    const setsStr = m.sets.map(s=>`${s.a}-${s.b}`).join(' / ');
    return `<div class="match-card ${historySelectMode ? 'select-mode' : ''}" data-id="${m.id}" style="display:grid;grid-template-columns:${historySelectMode ? 'auto ' : ''}1fr auto 1fr auto;gap:1rem;align-items:center;">
      ${historySelectMode ? `<input type="checkbox" class="match-select-cb" data-id="${m.id}" onclick="this.closest('.match-card').classList.toggle('selected', this.checked)">` : ''}
      <div class="match-team">
        <div class="match-team-name ${m.winner==='A'?'winner':''}">${m.winner==='A'?'🏆 ':''}${m.teamA.players.join(' / ')}</div>
        <div class="match-team-players">${m.teamA.setsWon} set${m.teamA.setsWon>1?'s':''}</div>
      </div>
      <div class="match-score-display">${m.teamA.setsWon} — ${m.teamB.setsWon}</div>
      <div class="match-team">
        <div class="match-team-name ${m.winner==='B'?'winner':''}">${m.winner==='B'?'🏆 ':''}${m.teamB.players.join(' / ')}</div>
        <div class="match-team-players">${m.teamB.setsWon} set${m.teamB.setsWon>1?'s':''}</div>
      </div>
      <div class="match-meta">
        <span class="match-date">${dateStr} ${timeStr}</span>
        <span class="match-duration">${dur}${dur&&setsStr?' • ':''}${setsStr}</span>
      </div>
      ${!historySelectMode ? `<button class="btn-delete-match" title="Supprimer" onclick="confirmDeleteSingle(${m.id})">🗑</button>` : ''}
    </div>`;
  }).join('');
}

// ═════════════════════════════════════════════════════════════
//  RANKING
// ═════════════════════════════════════════════════════════════
function renderRanking() {
  const wrap = document.getElementById('ranking-table-wrap');
  const sorted = [...state.players]
    .filter(p => p.played > 0)
    .sort((a,b) => {
      const wra = a.played ? a.wins/a.played : 0;
      const wrb = b.played ? b.wins/b.played : 0;
      return wrb !== wra ? wrb - wra : b.wins - a.wins;
    });

  if (!sorted.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-text">Pas encore de données</div></div>`;
    return;
  }

  const rankClass = i => i===0?'top1':i===1?'top2':i===2?'top3':'';
  const rankIcon = i => i===0?'🥇':i===1?'🥈':i===2?'🥉':'';

  wrap.innerHTML = `<table class="rank-table">
    <thead><tr>
      <th>#</th><th>Joueur</th><th>Matchs</th><th>V</th><th>D</th><th>Taux victoire</th>
    </tr></thead>
    <tbody>
    ${sorted.map((p,i) => {
      const wr = p.played ? p.wins/p.played : 0;
      const wrPct = Math.round(wr*100);
      return `<tr>
        <td><span class="rank-num ${rankClass(i)}">${rankIcon(i)||'#'+(i+1)}</span></td>
        <td style="font-weight:600">${p.name}</td>
        <td style="font-family:'DM Mono',monospace;color:var(--text-muted)">${p.played}</td>
        <td style="color:var(--win);font-weight:600">${p.wins}</td>
        <td style="color:var(--lose)">${p.losses}</td>
        <td><div class="winrate-bar">
          <div class="bar-track"><div class="bar-fill" style="width:${wrPct}%"></div></div>
          <span class="bar-label">${wrPct}%</span>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

// ═════════════════════════════════════════════════════════════
//  PLANNING
// ═════════════════════════════════════════════════════════════
function addPlannedMatch() {
  const ta = document.getElementById('plan-team-a').value.trim();
  const tb = document.getElementById('plan-team-b').value.trim();
  const dt = document.getElementById('plan-date').value;
  const loc = document.getElementById('plan-location').value.trim();

  if (!ta || !tb || !dt) { toast('Remplissez les champs obligatoires', 'error'); return; }

  state.planned.push({ id: Date.now(), teamA: ta, teamB: tb, date: dt, location: loc });
  saveState();
  document.getElementById('plan-team-a').value = '';
  document.getElementById('plan-team-b').value = '';
  document.getElementById('plan-date').value = '';
  document.getElementById('plan-location').value = '';
  renderPlanned();
  toast('Match planifié !');
}

function deletePlanned(id) {
  state.planned = state.planned.filter(p=>p.id!==id);
  saveState();
  renderPlanned();
  toast('Match annulé', 'info');
}

function renderPlanned() {
  const list = document.getElementById('planned-list');
  const now = Date.now();
  const sorted = [...state.planned].sort((a,b) => new Date(a.date)-new Date(b.date));
  const upcoming = sorted.filter(p => new Date(p.date) > now);
  const past = sorted.filter(p => new Date(p.date) <= now);

  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">Aucun match planifié</div></div>`;
    return;
  }

  const renderGroup = (items, label) => {
    if (!items.length) return '';
    return `<div style="font-family:'DM Mono',monospace;font-size:.7rem;letter-spacing:.1em;color:var(--text-muted);text-transform:uppercase;margin:1rem 0 .6rem;">${label}</div>` +
      items.map(p => {
        const d = new Date(p.date);
        const dateStr = d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});
        const timeStr = d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
        return `<div class="planned-card">
          <div class="planned-info">
            <div class="planned-teams">${p.teamA} <span style="color:var(--text-dim)">vs</span> ${p.teamB}</div>
            <div class="planned-date">📅 ${dateStr} à ${timeStr}${p.location?` · 📍 ${p.location}`:''}</div>
          </div>
          <div class="planned-actions">
            <button class="btn btn-danger" style="padding:.5rem .8rem;font-size:.8rem;" onclick="deletePlanned(${p.id})">✕</button>
          </div>
        </div>`;
      }).join('');
  };

  list.innerHTML = renderGroup(upcoming, 'À venir') + renderGroup(past, 'Passés');
}

// ═════════════════════════════════════════════════════════════
//  INIT
// ═════════════════════════════════════════════════════════════
loadState();
populateSelects();
document.getElementById('history-count').textContent = state.matches.length;
document.getElementById('players-count').textContent = state.players.length;

// Default datetime for planning
const now = new Date();
now.setMinutes(0,0,0);
now.setHours(now.getHours()+1);
document.getElementById('plan-date').value = now.toISOString().slice(0,16);

// Resume match if was in progress (page reload)
// (not implemented for simplicity — matches are atomic)
