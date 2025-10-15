// ====== Config ======
const PASSWORD = "Padel2025";
const STORAGE_KEY = "padel.americano.state.v1";
const SESSION_KEY = "padel.session.ok";

// ====== Estado ======
const state = {
  players: [],             // ["Ana","Luis",...]
  courts: 1,               // número de canchas
  round: 1,                // ronda actual
  matches: [],             // [{id, round, court, pairs:[[a,b],[c,d]], status:'open'|'done', scoreA, scoreB}]
  standings: {},           // { jugador: {pts,wins,losses,played,lastRound} }
  playedWith: {},          // { jugador: Set(otros) }
  playedAgainst: {},       // { jugador: Set(otros) }
  lastPlayedRound: {},     // { jugador: ronda }
};

// ====== Helpers de DOM ======
const $ = (sel) => document.querySelector(sel);
const landing = $("#landing");
const app = $("#app");
const enterBtn = $("#enterBtn");
const courtsSelect = $("#courtsSelect");
const roundLabel = $("#roundLabel");
const roundLabel2 = $("#roundLabel2");
const nextRoundBtn = $("#nextRoundBtn");
const playerName = $("#playerName");
const addPlayerBtn = $("#addPlayerBtn");
const playersList = $("#playersList");
const matchesList = $("#matchesList");
const generateBtn = $("#generateBtn");
const tbody = $("#tbody");
const resetBtn = $("#resetBtn");

// ====== Persistencia ======
function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...state,
    // Sets no se serializan: convertir a arrays
    playedWith: serializeDictOfSets(state.playedWith),
    playedAgainst: serializeDictOfSets(state.playedAgainst),
  }));
}

function serializeDictOfSets(obj){
  const out = {};
  for(const k in obj){
    out[k] = Array.from(obj[k] || []);
  }
  return out;
}

function reviveDictOfSets(obj){
  const out = {};
  for(const k in obj || {}){
    const v = obj[k];
    out[k] = new Set(Array.isArray(v) ? v : Object.keys(v || {}));
  }
  return out;
}

function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return;
  try{
    const s = JSON.parse(raw);
    state.players = s.players || [];
    state.courts = s.courts || 1;
    state.round = s.round || 1;
    state.matches = s.matches || [];
    state.standings = s.standings || {};
    state.lastPlayedRound = s.lastPlayedRound || {};
    state.playedWith = reviveDictOfSets(s.playedWith);
    state.playedAgainst = reviveDictOfSets(s.playedAgainst);
  }catch(e){
    console.warn("No se pudo cargar estado:", e);
  }
}

// ====== Seguridad simple por sesión ======
function gate(){
  if(sessionStorage.getItem(SESSION_KEY)==="1"){
    landing.classList.add("hidden");
    app.classList.remove("hidden");
    boot();
    return;
  }
  landing.classList.remove("hidden");
  app.classList.add("hidden");
}

// ====== Lógica de torneo ======
function ensurePlayerInit(name){
  if(!state.standings[name]){
    state.standings[name] = { pts:0, wins:0, losses:0, played:0, lastRound:0 };
  }
  if(!state.playedWith[name]) state.playedWith[name] = new Set();
  if(!state.playedAgainst[name]) state.playedAgainst[name] = new Set();
  if(state.lastPlayedRound[name]==null) state.lastPlayedRound[name] = 0;
}

function addPlayer(name){
  const n = (name||"").trim();
  if(!n) return alert("Escribe un nombre.");
  if(state.players.includes(n)) return alert("Ese nombre ya existe.");
  state.players.push(n);
  ensurePlayerInit(n);
  persist();
  renderAll();
}

function removePlayer(name){
  state.players = state.players.filter(p=>p!==name);
  // Limpieza ligera (no borramos de standings para histórico)
  delete state.playedWith[name];
  delete state.playedAgainst[name];
  delete state.lastPlayedRound[name];

  // Eliminarlo de partidos abiertos
  state.matches = state.matches.filter(m=>{
    if(m.status==="done") return true;
    const all = m.pairs.flat();
    return !all.includes(name);
  });

  persist();
  renderAll();
}

function availablePlayers(){
  // Ocupados en partidos abiertos de esta ronda
  const busy = new Set();
  for(const m of state.matches){
    if(m.round===state.round && m.status==="open"){
      m.pairs.flat().forEach(p=>busy.add(p));
    }
  }
  return state.players.filter(p=>!busy.has(p));
}

function buildCourtGroups(){
  // Asigna bloques de 8 por cancha (1..N)
  const groups = {};
  state.players.forEach((p, idx)=>{
    const court = Math.floor(idx / 8) + 1;
    groups[p] = Math.min(court, state.courts); // en caso de menos canchas que bloques
  });
  return groups;
}

function pairScorePreference(a,b){
  // Menor es mejor: favorece quienes han jugado menos juntos y menos enfrentados
  const withCount = (state.playedWith[a]?.has(b) ? 1 : 0);
  const againstCount = (state.playedAgainst[a]?.has(b) ? 1 : 0);
  return withCount*3 + againstCount; // penaliza más repetir pareja
}

function choosePairs(players4){
  // Intenta todas las formas de partir 4 jugadores en 2 parejas
  // Devuelve [[a,b],[c,d]] con menor "costo"
  const [p1,p2,p3,p4] = players4;
  const candidates = [
    [[p1,p2],[p3,p4]],
    [[p1,p3],[p2,p4]],
    [[p1,p4],[p2,p3]],
  ];
  let best = null, bestScore = Infinity;
  for(const [[a,b],[c,d]] of candidates){
    const s = pairScorePreference(a,b) + pairScorePreference(c,d);
    if(s<bestScore){ bestScore = s; best = [[a,b],[c,d]]; }
  }
  return best;
}

function generateMatchesForCurrentRound(){
  // No generes si ya están llenas todas las canchas con "open"
  const open = state.matches.filter(m=>m.round===state.round && m.status==='open');
  const freeCourts = Math.max(0, state.courts - open.length);
  if(freeCourts===0) return;

  const groups = buildCourtGroups();
  const avail = availablePlayers();

  // por cancha
  const byCourt = {};
  for(let c=1;c<=state.courts;c++) byCourt[c]=[];
  for(const p of avail){
    const c = Math.min(groups[p]||1, state.courts);
    byCourt[c].push(p);
  }

  const made = [];
  const used = new Set();

  for(let court=1; court<=state.courts; court++){
    const alreadyOpen = open.some(m=>m.court===court) || made.some(m=>m.court===court);
    if(alreadyOpen) continue;

    const candidates = byCourt[court].filter(p=>!used.has(p));
    if(candidates.length<4) continue;

    // Prioriza quienes han descansado más tiempo
    candidates.sort((a,b)=>(state.lastPlayedRound[a]??-1)-(state.lastPlayedRound[b]??-1));
    const chosen = candidates.slice(0,4);
    chosen.forEach(p=>used.add(p));

    const pairs = choosePairs(chosen);

    // Marca relaciones jugadas (evita repeticiones futuras en la misma jornada)
    const [a1,a2] = pairs[0], [b1,b2] = pairs[1];
    ensurePlayerInit(a1); ensurePlayerInit(a2); ensurePlayerInit(b1); ensurePlayerInit(b2);
    state.playedWith[a1].add(a2); state.playedWith[a2].add(a1);
    state.playedWith[b1].add(b2); state.playedWith[b2].add(b1);
    [a1,a2].forEach(p=>{ state.playedAgainst[p].add(b1); state.playedAgainst[p].add(b2); });
    [b1,b2].forEach(p=>{ state.playedAgainst[p].add(a1); state.playedAgainst[p].add(a2); });

    made.push({
      id: crypto.randomUUID(),
      round: state.round,
      court,
      pairs,
      status: "open",
      scoreA: 0,
      scoreB: 0,
    });
  }

  state.matches.push(...made);
  persist();
  renderMatches();
}

function saveResult(matchId, sA, sB){
  const m = state.matches.find(x=>x.id===matchId);
  if(!m || m.status!=="open") return;
  const a = Number(sA), b = Number(sB);
  if(Number.isNaN(a)||Number.isNaN(b) || a<0 || b<0 || a>7 || b>7) return alert("Marcador inválido (0-7).");

  m.status = "done";
  m.scoreA = a; m.scoreB = b;

  const [t1, t2] = m.pairs;
  const team1 = t1, team2 = t2;

  // Actualiza standings
  function applyTeam(team, gamesWon, gamesLost){
    for(const p of team){
      ensurePlayerInit(p);
      state.standings[p].pts += gamesWon;
      state.standings[p].played += 1;
      state.standings[p].lastRound = state.round;
      state.lastPlayedRound[p] = state.round;
    }
  }
  applyTeam(team1, a, b);
  applyTeam(team2, b, a);

  if(a>b){
    for(const p of team1) state.standings[p].wins += 1;
    for(const p of team2) state.standings[p].losses += 1;
  }else if(b>a){
    for(const p of team2) state.standings[p].wins += 1;
    for(const p of team1) state.standings[p].losses += 1;
  }

  persist();
  renderAll();

  // Intentar abrir otro partido si hay canchas libres
  generateMatchesForCurrentRound();
}

function nextRound(){
  // No permitas avanzar si hay abiertos
  const open = state.matches.some(m=>m.round===state.round && m.status==="open");
  if(open) return alert("Aún hay partidos abiertos en esta ronda.");
  state.round += 1;
  roundLabel.textContent = String(state.round);
  roundLabel2.textContent = String(state.round);
  persist();
  renderAll();
}

// ====== Render ======
function renderPlayers(){
  playersList.innerHTML = "";
  for(const p of state.players){
    const li = document.createElement("li");
    li.className="badge";
    li.innerHTML = `<span>${p}</span> <span class="x" title="Eliminar">✕</span>`;
    li.querySelector(".x").addEventListener("click", ()=>removePlayer(p));
    playersList.appendChild(li);
  }
}

function renderMatches(){
  matchesList.innerHTML = "";
  const matches = state.matches.filter(m=>m.round===state.round);
  if(matches.length===0){
    const hint = document.createElement("div");
    hint.className="muted";
    hint.textContent = "No hay partidos generados para esta ronda.";
    matchesList.appendChild(hint);
    return;
  }
  for(const m of matches.sort((a,b)=>a.court-b.court)){
    const el = document.createElement("div");
    el.className = "match";
    const [t1,t2] = m.pairs;
    el.innerHTML = `
      <div class="meta">Cancha ${m.court} · ${m.status==="open"?"En juego":"Terminado"}</div>
      <div class="teams">
        <div class="team">${t1.map(n=>`<span class="badge">${n}</span>`).join(" ")}</div>
        <div class="vs">VS</div>
        <div class="team">${t2.map(n=>`<span class="badge">${n}</span>`).join(" ")}</div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="score">
          <label>Marcador:</label>
          <input type="number" min="0" max="7" value="${m.scoreA}" ${m.status==="done"?"disabled":""} class="sA" />
          <span>-</span>
          <input type="number" min="0" max="7" value="${m.scoreB}" ${m.status==="done"?"disabled":""} class="sB" />
        </div>
        <div style="flex:1"></div>
        ${m.status==="open"
          ? `<button class="primary save">Guardar resultado</button>`
          : `<span class="badge" style="border-color:#345">Final: ${m.scoreA} - ${m.scoreB}</span>`
        }
      </div>
    `;
    if(m.status==="open"){
      el.querySelector(".save").addEventListener("click", ()=>{
        const sA = el.querySelector(".sA").value;
        const sB = el.querySelector(".sB").value;
        saveResult(m.id, sA, sB);
      });
    }
    matchesList.appendChild(el);
  }
}

function renderTable(){
  const rows = Object.entries(state.standings)
    .map(([name,data])=>({name,...data}))
    .sort((a,b)=> b.pts - a.pts || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));

  tbody.innerHTML = "";
  rows.forEach((r, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="rank">${idx+1}</td>
      <td>${r.name}</td>
      <td>${r.pts}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.played}</td>
      <td>${r.lastRound||0}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAll(){
  roundLabel.textContent = String(state.round);
  roundLabel2.textContent = String(state.round);
  courtsSelect.value = String(state.courts);
  renderPlayers();
  renderMatches();
  renderTable();
}

// ====== Eventos UI ======
enterBtn.addEventListener("click", ()=>{
  const p = prompt("Ingresa la contraseña:");
  if(p===PASSWORD){
    sessionStorage.setItem(SESSION_KEY,"1");
    landing.classList.add("hidden");
    app.classList.remove("hidden");
    boot();
  }else{
    alert("Contraseña incorrecta.");
  }
});

courtsSelect.addEventListener("change", ()=>{
  state.courts = Number(courtsSelect.value);
  persist();
  renderAll();
});

nextRoundBtn.addEventListener("click", nextRound);

addPlayerBtn.addEventListener("click", ()=>{
  addPlayer(playerName.value);
  playerName.value="";
  playerName.focus();
});

playerName.addEventListener("keydown", (e)=>{
  if(e.key==="Enter"){ addPlayer(playerName.value); playerName.value=""; }
});

generateBtn.addEventListener("click", ()=>{
  generateMatchesForCurrentRound();
});

resetBtn.addEventListener("click", ()=>{
  if(!confirm("¿Seguro que deseas reiniciar todo? Esto borrará la jornada y tabla.")) return;
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(state, {
    players: [], courts:1, round:1, matches:[], standings:{}, playedWith:{}, playedAgainst:{}, lastPlayedRound:{}
  });
  renderAll();
});

// ====== Inicio ======
function boot(){
  load();
  // Asegura estructuras por si venimos de estado vacío
  state.players.forEach(ensurePlayerInit);
  renderAll();
}

gate();
