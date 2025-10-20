/******************************
 *  Estado base (en memoria)
 ******************************/
const state = {
  room: (location.hash.replace('#','') || randomRoom()),
  players: [],              // nombres únicos
  playerCourts: {},         // {nombre: 1|2}
  courts: 1,                // 1 o 2
  target: 3,                // a cuántos juegos
  round: 1,
  phase: "groups",          // groups | playoff
  playoffMode: "auto",      // auto | semis | final | quarters
  standings: {},            // {nombre:{pts,w,l,pj,lastRound}}
  matches: []               // partidos visibles de la ronda actual
};

// Si usas Firebase, pega tu config aquí y descomenta scripts en index.html
const useFirebase = (typeof firebase !== 'undefined');
const firebaseConfig = {
  // PÉGALO AQUÍ SI QUIERES TIEMPO REAL:
  // apiKey: "AIzaSyDm0J5dnEavIi0ow8o9q86Zl515E1zqIY0",
  // authDomain: "padel-zac.firebaseapp.com",
  // databaseURL: "https://padel-zac-default-rtdb.firebaseio.com",
  // projectId: "padel-zac",
  // storageBucket: "padel-zac.firebasestorage.app",
  // messagingSenderId: "873811901531",
  // appId: "1:873811901531:web:3175ad146974213728d37e"
};
let db = null;
if (useFirebase) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
}

/******************************
 *  Util
 ******************************/
function randomRoom(){
  return Math.random().toString(36).slice(2,8);
}
function el(id){ return document.getElementById(id); }
function canEditSetup(){ return state.phase === "groups"; }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function byNameAsc(a,b){ return a.localeCompare(b); }
function copy(txt){
  try{ navigator.clipboard.writeText(txt); }catch(e){}
}

/******************************
 *  DOM refs
 ******************************/
const roomCode       = el('roomCode');
const copyRoom       = el('copyRoom');
const courtsSelect   = el('courtsSelect');
const targetSelect   = el('targetSelect');
const playoffSelect  = el('playoffSelect');
const roundNo        = el('roundNo');
const roundTitle     = el('roundTitle');
const roundMeta      = el('roundMeta');

const playerName     = el('playerName');
const addPlayerBtn   = el('addPlayerBtn');
const resetAllBtn    = el('resetAll');
const playersList    = el('playersList');
const assignHint     = el('assignHint');

const genMatchesBtn  = el('genMatchesBtn');
const createBracketBtn = el('createBracketBtn');
const matchesWrap    = el('matches');

const tableBody      = el('tableBody');

/******************************
 *  Inicial
 ******************************/
function init(){
  roomCode.textContent = state.room;

  // selects
  courtsSelect.value = state.courts;
  targetSelect.value = state.target;
  playoffSelect.value = state.playoffMode;

  // events
  copyRoom.onclick = () => copy(location.href.split('#')[0] + '#' + state.room);

  courtsSelect.onchange = () => {
    const val = Number(courtsSelect.value || 1);
    state.courts = clamp(val,1,2);
    renderPlayers();
  };
  targetSelect.onchange = () => {
    state.target = Number(targetSelect.value || 3);
    renderMeta();
  };
  playoffSelect.onchange = () => {
    state.playoffMode = playoffSelect.value || "auto";
  };

  addPlayerBtn.onclick = onAddPlayer;
  playerName.onkeydown = (e)=>{ if(e.key==='Enter') onAddPlayer(); };
  resetAllBtn.onclick = resetAll;

  genMatchesBtn.onclick = generateMatches;
  createBracketBtn.onclick = createBracket;

  renderAll();
}
init();

/******************************
 *  Render
 ******************************/
function renderAll(){
  roundNo.textContent = state.round;
  roundTitle.textContent = `(ronda ${state.round})`;
  renderPlayers();
  renderMeta();
  renderTable();
  renderMatches();
}

function buildCourtBuckets(){
  const b = {1:[],2:[]};
  state.players.slice().sort(byNameAsc).forEach(n=>{
    const c = state.playerCourts[n] || 1;
    (b[c] || b[1]).push(n);
  });
  return b;
}

function renderPlayers(){
  const canEdit = canEditSetup();

  // controles
  assignHint.style.display = state.courts > 1 ? "block" : "none";
  playerName.disabled = !canEdit;
  addPlayerBtn.disabled = !canEdit;

  courtsSelect.value = String(state.courts);
  targetSelect.value = String(state.target);
  playoffSelect.value = state.playoffMode;

  courtsSelect.disabled  = state.phase !== "groups";
  targetSelect.disabled  = state.phase !== "groups";
  playoffSelect.disabled = state.phase !== "groups";

  // salida
  const buckets = buildCourtBuckets();
  const pill = (p) => `
    <li>
      <div class="row gap">
        <strong>${p}</strong>
        ${state.courts>1 ? `<span class="pill">C${state.playerCourts[p]||1}</span>`:``}
      </div>
      ${canEdit ? `<span class="x" data-del="${p}" title="Quitar">✕</span>`:``}
    </li>`;

  if (state.courts === 1) {
    playersList.innerHTML = `
      <ul class="players">${state.players.slice().sort(byNameAsc).map(pill).join('')}</ul>
    `;
  } else {
    playersList.innerHTML = `
      <div class="muted" style="margin:.2rem 0 .4rem">Con 2+ canchas: asigna cada jugador a una cancha (máximo 8 por cancha).</div>
      <div>
        <div style="font-weight:600;margin:6px 0">Cancha 1</div>
        <ul class="players">${(buckets[1]||[]).map(pill).join('')}</ul>
      </div>
      <div style="margin-top:8px">
        <div style="font-weight:600;margin:6px 0">Cancha 2</div>
        <ul class="players">${(buckets[2]||[]).map(pill).join('')}</ul>
      </div>
    `;
  }

  if (canEdit) {
    playersList.querySelectorAll('[data-del]').forEach(btn=>{
      btn.onclick = ()=> removePlayer(btn.getAttribute('data-del'));
    });
  }
}

function renderMeta(){
  const total = state.players.length;
  const perCourt = (state.courts === 1) ? total : `${(buildCourtBuckets()[1]||[]).length}/${(buildCourtBuckets()[2]||[]).length}`;
  roundMeta.textContent = (state.courts===1)
    ? `Jugadores: ${total} · Meta: a ${state.target}`
    : `Jugadores: C1=${(buildCourtBuckets()[1]||[]).length} · C2=${(buildCourtBuckets()[2]||[]).length} · Meta: a ${state.target}`;
}

function renderTable(){
  const rows = Object.keys(state.standings).map(name=>{
    const s = state.standings[name];
    return {
      name,
      pts: s?.pts || 0,
      w: s?.w || 0,
      l: s?.l || 0,
      pj: s?.pj || 0,
      last: s?.lastRound || 0
    };
  });
  rows.sort((a,b)=> b.pts - a.pts || a.name.localeCompare(b.name));

  tableBody.innerHTML = rows.map((r,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td>${r.pts}</td>
      <td>${r.w}</td>
      <td>${r.l}</td>
      <td>${r.pj}</td>
      <td>${r.last}</td>
    </tr>
  `).join('');
}

function renderMatches(){
  const out = [];
  state.matches.forEach((m,idx)=>{
    out.push(matchCard(m, idx));
  });
  matchesWrap.innerHTML = out.join('') || `<div class="muted">No hay partidos abiertos en esta ronda. Pulsa “Generar partidos”.</div>`;

  // listeners botón guardar
  document.querySelectorAll('[data-save]').forEach(btn=>{
    btn.onclick = () => {
      const i = Number(btn.getAttribute('data-save'));
      saveResult(i);
    }
  });
}

function matchCard(m, i){
  const [a,b] = m.left;
  const [c,d] = m.right;
  const sL = m.score?.left ?? 0;
  const sR = m.score?.right ?? 0;
  const t  = state.target;

  return `
    <div class="card">
      <div class="meta">${m.kind || (state.phase==='playoff'?'Eliminatoria':'En juego')}</div>
      <div class="vs">
        <span class="tag">${a}</span><span class="tag">${b}</span>
        <span class="muted">VS</span>
        <span class="tag">${c}</span><span class="tag">${d}</span>

        <div class="mark">
          <span class="muted">Marcador (a ${t}):</span>
          <input class="score" type="number" min="0" value="${sL}" id="sL${i}"/>
          <span class="muted">-</span>
          <input class="score" type="number" min="0" value="${sR}" id="sR${i}"/>
          <button class="ghost" data-save="${i}">Guardar resultado</button>
        </div>
      </div>
    </div>
  `;
}

/******************************
 *  Jugadores
 ******************************/
function onAddPlayer(){
  const name = (playerName.value || '').trim();
  if (!name) return;
  if (state.players.includes(name)) { playerName.value=''; return; }

  if (state.courts===2){
    // por defecto llenar cancha más corta
    const b = buildCourtBuckets();
    const c1 = (b[1]||[]).length;
    const c2 = (b[2]||[]).length;
    const court = (c1<=c2) ? 1 : 2;
    if ((b[court]||[]).length >= 8) {
      alert(`La cancha ${court} ya tiene 8 jugadores (máximo por cancha).`);
      return;
    }
    state.playerCourts[name] = court;
  }

  state.players.push(name);
  state.standings[name] = state.standings[name] || {pts:0,w:0,l:0,pj:0,lastRound:0};
  playerName.value='';
  renderPlayers();
  renderMeta();
  renderTable();
}

function removePlayer(name){
  state.players = state.players.filter(n=>n!==name);
  delete state.playerCourts[name];
  delete state.standings[name];
  renderAll();
}

/******************************
 *  Partidos: grupos / playoff
 ******************************/
function generateMatches(){
  if (state.players.length < 4) {
    alert('Agrega al menos 4 jugadores.');
    return;
  }
  if (state.courts===2){
    const b = buildCourtBuckets();
    if ((b[1]||[]).length===0 || (b[2]||[]).length===0){
      alert('Con 2 canchas, asigna jugadores a ambas (1–8 por cancha).');
      return;
    }
  }

  // Aquí puedes conservar tu generador de americano.
  // Para mantener estable, genero 1 partido por cancha por ronda.
  const t = state.target;
  const matches = [];

  const groups = (state.courts===1)
    ? [state.players.slice().sort(byNameAsc)]
    : [ (buildCourtBuckets()[1]||[]).slice().sort(byNameAsc),
        (buildCourtBuckets()[2]||[]).slice().sort(byNameAsc) ];

  groups.forEach((g,idx)=>{
    if (g.length < 4) return; // se necesitan 4 por cancha para dobles
    const pairings = nextPairsForGroup(g);
    if (pairings){
      matches.push({
        kind: `Cancha ${idx+1} · En juego`,
        left: pairings[0],
        right: pairings[1],
        target: t
      });
    }
  });

  state.matches = matches;
  renderMatches();
}

// generador trivial (no repite inmediatamente)
const lastUsed = {};
function nextPairsForGroup(group){
  const g = group.slice();
  if (g.length < 4) return null;
  // baraja simple
  for (let i=g.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [g[i],g[j]]=[g[j],g[i]];
  }
  // evita repetir exacto el último
  const key = g.join('|');
  if (lastUsed[key]) g.reverse();
  lastUsed[key] = true;

  return [ [g[0],g[1]], [g[2],g[3]] ];
}

/******************************
 *  Guardar resultado
 ******************************/
function saveResult(i){
  const m = state.matches[i];
  if (!m) return;

  const sL = Number(el('sL'+i).value || 0);
  const sR = Number(el('sR'+i).value || 0);
  const t  = state.target;

  // validación simple
  if ((sL!==t && sR!==t) || (sL<0 || sR<0)){
    alert(`El resultado debe cerrar con ${t} para un equipo.`);
    return;
  }

  // actualizar standings
  const winners = (sL > sR) ? m.left : m.right;
  const losers  = (sL > sR) ? m.right : m.left;
  applyWinLoss(winners, losers);

  // cerrar partido
  state.matches.splice(i,1);
  if (state.matches.length===0){
    state.round++;
    roundNo.textContent = state.round;
    roundTitle.textContent = `(ronda ${state.round})`;
  }
  renderTable();
  renderMatches();
}

function applyWinLoss(winPair, losePair){
  const add = (name, won) => {
    state.standings[name] ||= {pts:0,w:0,l:0,pj:0,lastRound:0};
    const s = state.standings[name];
    s.pj += 1;
    s.lastRound = state.round;
    if (won){ s.w += 1; s.pts += 2; } else { s.l += 1; s.pts += 1; }
  };
  winPair.forEach(n=>add(n,true));
  losePair.forEach(n=>add(n,false));
}

/******************************
 *  Eliminatoria (siembra justa)
 ******************************/
function createBracket(){
  // ranking global por puntos
  const ranked = Object.keys(state.standings)
    .sort((a,b)=> (state.standings[b]?.pts||0) - (state.standings[a]?.pts||0)
      || a.localeCompare(b));

  // excluir comodines de conteo real si no quieres que cuenten:
  // aquí los consideramos "reales", como pediste.
  const realCount = ranked.length;

  let chosen = state.playoffMode;
  if (chosen==="auto"){
    if (realCount >= 12) chosen = "quarters";
    else if (realCount >= 8) chosen = "semis";
    else chosen = "final"; // 4–7 (si hay 6/7 puedes jugar final o semis cortas)
  }

  let firstRoundTeams = [];
  if (chosen === "final"){
    if (realCount < 4) return alert("Se requieren al menos 4 jugadores reales para final.");
    firstRoundTeams = makeSeededTeamsFromGroup(ranked.slice(0,4));    // (1,3) y (2,4) → 2 partidos => una “semi” que actúa como final a 2 rondas
  }
  if (chosen === "semis"){
    if (realCount < 8) return alert("Se requieren al menos 8 jugadores reales para semifinales.");
    firstRoundTeams = makeSeededTeamsFromGroup(ranked.slice(0,8));    // (1,3),(2,4),(5,7),(6,8)
  }
  if (chosen === "quarters"){
    if (realCount < 12) return alert("Se requieren al menos 12 jugadores reales para cuartos.");
    const sliceTo = Math.min(16, realCount);
    firstRoundTeams = makeSeededTeamsFromGroup(ranked.slice(0,sliceTo));
  }

  // convertir equipos en partidos (teams[0] vs teams[1], teams[2] vs teams[3], …)
  const t = state.target;
  const matches = [];
  for (let i=0;i<firstRoundTeams.length;i+=2){
    const A = firstRoundTeams[i];
    const B = firstRoundTeams[i+1];
    if (!A || !B) break;
    matches.push({
      kind: 'Eliminatoria · En juego',
      left: A, right: B, target: t
    });
  }

  if (matches.length===0){
    alert('No se pudieron generar partidos de eliminatoria.');
    return;
  }

  state.phase = "playoff";
  state.matches = matches;
  renderMatches();
}

// siembra por bloques de 4: [1,2,3,4] -> [1,3] y [2,4]; [5,6,7,8] -> [5,7] y [6,8], etc.
function makeSeededTeamsFromGroup(group){
  const teams = [];
  const g = group.slice(); // ya ordenado por ranking global

  for (let i=0;i<g.length;i+=4){
    const chunk = g.slice(i, i+4);
    if (chunk.length >= 4){
      teams.push([chunk[0], chunk[2]]);
      teams.push([chunk[1], chunk[3]]);
    } else if (chunk.length === 2){
      teams.push([chunk[0], chunk[1]]);
    }
    // si quedan 3, ignoramos el último (byes) o puedes promover mejor perdedor
  }
  return teams;
}

/******************************
 *  Reset
 ******************************/
function resetAll(){
  if (!confirm('¿Reiniciar toda la jornada?')) return;
  state.players = [];
  state.playerCourts = {};
  state.round = 1;
  state.phase = "groups";
  state.standings = {};
  state.matches = [];
  renderAll();
}
