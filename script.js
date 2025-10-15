// ====== Config ======
const PASSWORD = "Padel2025";
const STORAGE_KEY = "padel.americano.state.v2";
const SESSION_KEY = "padel.session.ok";

// ====== Estado ======
const state = {
  players: [],                 // ["Ana", "Luis", ...]
  playerCourts: {},            // { "Ana": 1, "Luis": 2, ... } (solo si courts>1)
  courts: 1,
  target: 6,                   // meta de juegos para ganar
  round: 1,
  matches: [],                 // [{id, round, court, pairs:[[a,b],[c,d]], status:'open'|'done', scoreA, scoreB}]
  standings: {},               // { jugador: {pts,wins,losses,played,lastRound} }
  playedWith: {},              // { jugador: Set(otros) }
  playedAgainst: {},           // { jugador: Set(otros) }
  pairHistory: {},             // por cancha: { "1": Set(["A|B", ...]) } para no repetir parejas
  lastPlayedRound: {},         // { jugador: ronda }
};

// ====== DOM ======
const $  = (s)=>document.querySelector(s);
const app = $("#app"), landing=$("#landing");
const enterBtn = $("#enterBtn");
const courtsSelect = $("#courtsSelect");
const targetSelect = $("#targetSelect");
const roundLabel = $("#roundLabel"), roundLabel2=$("#roundLabel2");
const playerName = $("#playerName"), addPlayerBtn=$("#addPlayerBtn");
const playersList=$("#playersList"), assignHint=$("#assignHint");
const matchesList=$("#matchesList"), generateBtn=$("#generateBtn");
const tbody=$("#tbody"), resetBtn=$("#resetBtn");

// ====== Persistencia ======
function serializeDictOfSets(obj){ const out={}; for(const k in obj){ out[k]=Array.from(obj[k]||[]);} return out; }
function reviveDictOfSets(obj){ const out={}; for(const k in obj||{}){ const v=obj[k]; out[k]=new Set(Array.isArray(v)?v:Object.keys(v||{})); } return out; }

function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...state,
    playedWith: serializeDictOfSets(state.playedWith),
    playedAgainst: serializeDictOfSets(state.playedAgainst),
    pairHistory: Object.fromEntries(Object.entries(state.pairHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
  }));
}
function load(){
  const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return;
  try{
    const s = JSON.parse(raw);
    state.players = s.players||[];
    state.playerCourts = s.playerCourts||{};
    state.courts = s.courts||1;
    state.target = s.target||6;
    state.round = s.round||1;
    state.matches = s.matches||[];
    state.standings = s.standings||{};
    state.playedWith = reviveDictOfSets(s.playedWith);
    state.playedAgainst = reviveDictOfSets(s.playedAgainst);
    state.pairHistory = Object.fromEntries(Object.entries(s.pairHistory||{}).map(([c,arr])=>[c, new Set(arr||[])]));
    state.lastPlayedRound = s.lastPlayedRound||{};
  }catch(e){ console.warn("No se pudo cargar estado:", e); }
}

// ====== Gate / seguridad ======
function hasSession(){ return sessionStorage.getItem(SESSION_KEY)==="1"; }
function requireSession(){ if(!hasSession()){ alert("Primero ingresa la contraseña."); return false; } return true; }
function openApp(){
  document.body.classList.remove("locked");
  landing.classList.add("hidden");
  app.classList.remove("hidden");
  app.setAttribute("aria-hidden","false");
}
function closeApp(){
  document.body.classList.add("locked");
  landing.classList.remove("hidden");
  app.classList.add("hidden");
  app.setAttribute("aria-hidden","true");
}

// ====== Helpers ======
function ensurePlayerInit(name){
  if(!state.standings[name]) state.standings[name]={pts:0,wins:0,losses:0,played:0,lastRound:0};
  if(!state.playedWith[name]) state.playedWith[name]=new Set();
  if(!state.playedAgainst[name]) state.playedAgainst[name]=new Set();
  if(state.lastPlayedRound[name]==null) state.lastPlayedRound[name]=0;
  if(state.playerCourts[name]==null) state.playerCourts[name]=1;
}
function pairKey(a,b){ return [a,b].sort().join("|"); }

function addPlayer(name){
  if(!requireSession()) return;
  const n=(name||"").trim();
  if(!n) return alert("Escribe un nombre.");
  if(state.players.includes(n)) return alert("Ese nombre ya existe.");
  state.players.push(n);
  ensurePlayerInit(n);
  persist(); renderAll();
}
function removePlayer(name){
  if(!requireSession()) return;
  state.players = state.players.filter(p=>p!==name);
  delete state.standings[name];
  delete state.playedWith[name]; delete state.playedAgainst[name];
  delete state.playerCourts[name]; delete state.lastPlayedRound[name];
  // borrar partidos abiertos donde participa
  state.matches = state.matches.filter(m=>{
    if(m.status==="done") return true;
    return !m.pairs.flat().includes(name);
  });
  persist(); renderAll();
}

function availablePlayers(){
  // Ocupados en "open" de la ronda actual
  const busy=new Set();
  for(const m of state.matches){
    if(m.round===state.round && m.status==="open"){ m.pairs.flat().forEach(p=>busy.add(p)); }
  }
  return state.players.filter(p=>!busy.has(p));
}

function buildCourtBuckets(){
  // Si hay 2+ canchas, usa asignación manual; si no, todos a 1
  const buckets={}; for(let c=1;c<=state.courts;c++) buckets[c]=[];
  for(const p of state.players){
    const c = Math.min(Math.max(1, state.playerCourts[p]||1), state.courts);
    buckets[c].push(p);
  }
  return buckets;
}

function choosePairs(players4, court){
  // Minimiza repeticiones de pareja y enfrentamientos, y evita parejas ya usadas (pairHistory por cancha)
  const [p1,p2,p3,p4] = players4;
  const options = [
    [[p1,p2],[p3,p4]],
    [[p1,p3],[p2,p4]],
    [[p1,p4],[p2,p3]],
  ];
  let best=null, bestScore=Infinity;
  const usedPairs = state.pairHistory[court]||new Set();
  for(const [[a,b],[c,d]] of options){
    let score = 0;
    score += (state.playedWith[a]?.has(b)?10:0) + (state.playedWith[c]?.has(d)?10:0);
    score += (state.playedAgainst[a]?.
