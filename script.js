/************** CONFIG **************/
const PASSWORD     = "Padel2025";
const STORAGE_KEY  = "padel.americano.state.v2";
const SESSION_KEY  = "padel.session.ok";

/************** ESTADO **************/
const state = {
  players: [],
  playerCourts: {},      // { nombre: cancha }
  courts: 1,
  target: 6,
  round: 1,
  matches: [],           // {id, round, court, pairs, status, scoreA, scoreB}
  standings: {},         // { jugador: {pts,wins,losses,played,lastRound} }
  playedWith: {},        // { jugador: Set() }
  playedAgainst: {},     // { jugador: Set() }
  pairHistory: {},       // { "1": Set("A|B",...) }
  lastPlayedRound: {},   // { jugador: ronda }
};

/************** DOM **************/
const $ = (s)=>document.querySelector(s);
const app = $("#app"), landing=$("#landing");
const pwd = $("#pwd"), loginBtn=$("#loginBtn"), loginError=$("#loginError");
const courtsSelect = $("#courtsSelect");
const targetSelect = $("#targetSelect");
const roundLabel = $("#roundLabel"), roundLabel2=$("#roundLabel2");
const playerName = $("#playerName"), addPlayerBtn=$("#addPlayerBtn");
const playersList=$("#playersList"), assignHint=$("#assignHint");
const matchesList=$("#matchesList"), generateBtn=$("#generateBtn");
const tbody=$("#tbody"), resetBtn=$("#resetBtn");

/************** PERSISTENCIA **************/
const serSets = (obj)=>Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[k, Array.from(v||[])]));
const revSets = (obj)=>Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[k, new Set(Array.isArray(v)?v:Object.keys(v||{}))]));

function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...state,
    playedWith: serSets(state.playedWith),
    playedAgainst: serSets(state.playedAgainst),
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
    state.playedWith = revSets(s.playedWith);
    state.playedAgainst = revSets(s.playedAgainst);
    state.pairHistory = Object.fromEntries(Object.entries(s.pairHistory||{}).map(([c,arr])=>[c, new Set(arr||[])]));
    state.lastPlayedRound = s.lastPlayedRound||{};
  }catch(e){ console.warn("No se pudo cargar estado:", e); }
}

/************** SESIÓN / GATE **************/
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
function hasSession(){ return sessionStorage.getItem(SESSION_KEY)==="1"; }

/************** HELPERS **************/
function ensurePlayerInit(name){
  if(!state.standings[name]) state.standings[name]={pts:0,wins:0,losses:0,played:0,lastRound:0};
  if(!state.playedWith[name]) state.playedWith[name]=new Set();
  if(!state.playedAgainst[name]) state.playedAgainst[name]=new Set();
  if(state.lastPlayedRound[name]==null) state.lastPlayedRound[name]=0;
  if(state.playerCourts[name]==null) state.playerCourts[name]=1;
}
const pairKey=(a,b)=>[a,b].sort().join("|");

function addPlayer(name){
  if(!hasSession()) return showLoginError("Primero ingresa la contraseña.");
  const n=(name||"").trim();
  if(!n) return alert("Escribe un nombre.");
  if(state.players.includes(n)) return alert("Ese nombre ya existe.");
  state.players.push(n);
  ensurePlayerInit(n);
  persist(); renderAll();
}
function removePlayer(name){
  if(!hasSession()) return showLoginError("Primero ingresa la contraseña.");
  state.players = state.players.filter(p=>p!==name);
  delete state.standings[name];
  delete state.playedWith[name]; delete state.playedAgainst[name];
  delete state.playerCourts[name]; delete state.lastPlayedRound[name];
  state.matches = state.matches.filter(m=> m.status==="done" || !m.pairs.flat().includes(name));
  persist(); renderAll();
}

function availablePlayers(){
  const busy=new Set();
  for(const m of state.matches){
    if(m.round===state.round && m.status==="open"){ m.pairs.flat().forEach(p=>busy.add(p)); }
  }
  return state.players.filter(p=>!busy.has(p));
}
function buildCourtBuckets(){
  const buckets={}; for(let c=1;c<=state.courts;c++) buckets[c]=[];
  for(const p of state.players){
    const c = Math.min(Math.max(1, state.playerCourts[p]||1), state.courts);
    buckets[c].push(p);
  }
  return buckets;
}
function choosePairs(players4, court){
  const [p1,p2,p3,p4] = players4;
  const options = [
    [[p1,p2],[p3,p4]], [[p1,p3],[p2,p4]], [[p1,p4],[p2,p3]],
  ];
  let best=null, bestScore=Infinity;
  const usedPairs = state.pairHistory[court]||new Set();
  for(const [[a,b],[c,d]] of options){
    let score = 0;
    score += (state.playedWith[a]?.has(b)?10:0) + (state.playedWith[c]?.has(d)?10:0);
    score += (state.playedAgainst[a]?.has(c)?2:0) + (state.playedAgainst[a]?.has(d)?2:0);
    score += (state.playedAgainst[b]?.has(c)?2:0) + (state.playedAgainst[b]?.has(d)?2:0);
    const k1=pairKey(a,b), k2=pairKey(c,d);
    if(usedPairs.has(k1)) score+=50;
    if(usedPairs.has(k2)) score+=50;
    if(score<bestScore){ bestScore=score; best=[[a,b],[c,d]]; }
  }
  const k1=pairKey(best[0][0],best[0][1]), k2=pairKey(best[1][0],best[1][1]);
  if(!state.pairHistory[court]) state.pairHistory[court]=new Set();
  state.pairHistory[court].add(k1); state.pairHistory[court].add(k2);
  return best;
}
function generateMatchesForCurrentRound(){
  if(!hasSession()) return showLoginError("Primero ingresa la contraseña.");
  const open = state.matches.filter(m=>m.round===state.round && m.status==='open');
  const freeCourts = Math.max(0, state.courts - open.length);
  if(freeCourts===0) return;

  const available = availablePlayers();
  const byCourt = buildCourtBuckets();

  const made=[];
  const used=new Set();
  for(let court=1; court<=state.courts; court++){
    if(open.some(m=>m.court===court) || made.some(m=>m.court===court)) continue;
    const candidates = byCourt[court].filter(p=>available.includes(p) && !used.has(p));
    if(candidates.length<4) continue;
    candidates.sort((a,b)=>(state.lastPlayedRound[a]??-1)-(state.lastPlayedRound[b]??-1));
    const chosen = candidates.slice(0,4);
    chosen.forEach(p=>{ used.add(p); ensurePlayerInit(p); });
    const pairs = choosePairs(chosen, String(court));
    const [a1,a2]=pairs[0], [b1,b2]=pairs[1];
    state.playedWith[a1].add(a2); state.playedWith[a2].add(a1);
    state.playedWith[b1].add(b2); state.playedWith[b2].add(b1);
    [a1,a2].forEach(p=>{ state.playedAgainst[p].add(b1); state.playedAgainst[p].add(b2); });
    [b1,b2].forEach(p=>{ state.playedAgainst[p].add(a1); state.playedAgainst[p].add(a2); });
    made.push({ id:crypto.randomUUID(), round:state.round, court, pairs, status:"open", scoreA:0, scoreB:0 });
  }
  state.matches.push(...made);
  persist(); renderMatches();
}

function validateScore(a,b){
  const T = Number(state.target||6);
  if(!Number.isInteger(a) || !Number.isInteger(b)) return "Marcador inválido.";
  if(a<0 || b<0) return "No se aceptan negativos.";
  if(a===b) return "No puede haber empate.";
  if(a!==T && b!==T) return `Uno de los equipos debe llegar a ${T}.`;
  if(a===T && b>=T) return "El perdedor no puede alcanzar la meta.";
  if(b===T && a>=T) return "El perdedor no puede alcanzar la meta.";
  return null;
}
function saveResult(matchId, sA, sB){
  if(!hasSession()) return showLoginError("Primero ingresa la contraseña.");
  const m = state.matches.find(x=>x.id===matchId);
  if(!m || m.status!=="open") return;
  const a = Number(sA), b = Number(sB);
  const err = validateScore(a,b);
  if(err) return alert(err);

  m.status="done"; m.scoreA=a; m.scoreB=b;

  const [t1,t2] = m.pairs;
  const winner = (a>b)? t1 : t2;
  const loser  = (a>b)? t2 : t1;

  function applyTeam(team, gamesWon, gamesLost){
    for(const p of team){
      ensurePlayerInit(p);
      state.standings[p].pts += gamesWon;
      state.standings[p].played += 1;
      state.standings[p].lastRound = state.round;
      state.lastPlayedRound[p] = state.round;
    }
  }
  applyTeam(t1, a, b);
  applyTeam(t2, b, a);
  winner.forEach(p=>state.standings[p].wins+=1);
  loser.forEach(p=>state.standings[p].losses+=1);

  persist(); renderAll();

  // Avanza ronda y genera siguientes
  state.round += 1;
  persist(); renderAll();
  generateMatchesForCurrentRound();
}

/************** RENDER **************/
function renderPlayers(){
  playersList.innerHTML="";
  assignHint.style.display = state.courts>1 ? "block":"none";
  for(const p of state.players){
    const li=document.createElement("li");
    li.className="badge";
    const courtSel = state.courts>1 ? `
      <select class="pcourt" data-name="${p}" title="Cancha">
        ${Array.from({length:state.courts},(_,i)=>`<option value="${i+1}" ${ (state.playerCourts[p]||1)===(i+1)?'selected':''}>${i+1}</option>`).join("")}
      </select>` : "";
    li.innerHTML = `<div style="display:flex;gap:8px;align-items:center;">
        <strong>${p}</strong>${courtSel}
      </div>
      <span class="x" title="Eliminar">✕</span>`;
    li.querySelector(".x").addEventListener("click",()=>removePlayer(p));
    if(state.courts>1){
      li.querySelector(".pcourt").addEventListener("change",(e)=>{
        state.playerCourts[p]=Number(e.target.value); persist();
      });
    }
    playersList.appendChild(li);
  }
}
function renderMatches(){
  matchesList.innerHTML="";
  const matches = state.matches.filter(m=>m.round===state.round).sort((a,b)=>a.court-b.court);
  if(matches.length===0){
    const hint=document.createElement("div");
    hint.className="muted"; hint.textContent="No hay partidos generados para esta ronda.";
    matchesList.appendChild(hint); return;
  }
  for(const m of matches){
    const el=document.createElement("div");
    el.className="match";
    const [t1,t2]=m.pairs;
    el.innerHTML=`
      <div class="meta">Cancha ${m.court} · ${m.status==="open"?"En juego":"Terminado"}</div>
      <div class="teams">
        <div class="team">${t1.map(n=>`<span class="badge">${n}</span>`).join(" ")}</div>
        <div class="vs">VS</div>
        <div class="team">${t2.map(n=>`<span class="badge">${n}</span>`).join(" ")}</div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="score">
          <label>Marcador (a ${state.target}):</label>
          <input type="number" min="0" value="${m.scoreA}" ${m.status==="done"?"disabled":""} class="sA"/>
          <span>-</span>
          <input type="number" min="0" value="${m.scoreB}" ${m.status==="done"?"disabled":""} class="sB"/>
        </div>
        <div style="flex:1"></div>
        ${m.status==="open"
          ? `<button class="primary save">Guardar resultado y pasar a la siguiente ronda</button>`
          : `<span class="badge" style="border-color:#345">Final: ${m.scoreA} - ${m.scoreB}</span>`
        }
      </div>`;
    if(m.status==="open"){
      el.querySelector(".save").addEventListener("click",()=>{
        const sA=el.querySelector(".sA").value; const sB=el.querySelector(".sB").value;
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
  tbody.innerHTML="";
  rows.forEach((r,idx)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td class="rank">${idx+1}</td>
      <td>${r.name}</td><td>${r.pts}</td><td>${r.wins}</td>
      <td>${r.losses}</td><td>${r.played}</td><td>${r.lastRound||0}</td>`;
    tbody.appendChild(tr);
  });
}
function renderAll(){
  roundLabel.textContent=String(state.round);
  roundLabel2.textContent=String(state.round);
  courtsSelect.value=String(state.courts);
  targetSelect.value=String(state.target);
  renderPlayers(); renderMatches(); renderTable();
}

/************** LOGIN + EVENTOS **************/
function showLoginError(msg){ if(loginError){ loginError.textContent = msg; } }
function doLogin(){
  const val = (pwd?.value ?? "").trim();
  if(val === PASSWORD){
    sessionStorage.setItem(SESSION_KEY,"1");
    showLoginError("");
    openApp();
    boot();
  }else{
    showLoginError("Contraseña incorrecta.");
    pwd && pwd.select && pwd.select();
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  // si ya hay sesión previa:
  if(sessionStorage.getItem(SESSION_KEY)==="1"){ openApp(); boot(); }

  // listeners (si existen en DOM)
  loginBtn && loginBtn.addEventListener("click", doLogin);
  pwd && pwd.addEventListener("keydown", (e)=>{ if(e.key==="Enter") doLogin(); });

  courtsSelect && courtsSelect.addEventListener("change", ()=>{
    if(!hasSession()) return showLoginError("Primero ingresa la contraseña.");
    state.courts = Number(courtsSelect.value);
    state.pairHistory = {};
    for(const p of state.players){ state.playerCourts[p]=Math.min(Math.max(1,state.playerCourts[p]||1), state.courts); }
    persist(); renderAll();
  });

  targetSelect && targetSelect.addEventListener("change", ()=>{
    if(!hasSession()) return showLoginError("Primero ingresa la contraseña.");
    state.target = Number(targetSelect.value);
    persist(); renderAll();
  });

  addPlayerBtn && addPlayerBtn.addEventListener("click", ()=>{ addPlayer(playerName.value); playerName.value=""; playerName.focus(); });
  playerName && playerName.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ addPlayer(playerName.value); playerName.value=""; } });

  generateBtn && generateBtn.addEventListener("click", ()=>{ generateMatchesForCurrentRound(); });

  resetBtn && resetBtn.addEventListener("click", ()=>{
    if(!hasSession()) return showLoginError("Primero ingresa la contraseña.");
    if(!confirm("¿Seguro que deseas reiniciar todo?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, {
      players:[], playerCourts:{}, courts:1, target:6, round:1, matches:[],
      standings:{}, playedWith:{}, playedAgainst:{}, pairHistory:{}, lastPlayedRound:{}
    });
    persist(); renderAll();
  });
});

/************** INICIO APP **************/
function boot(){
  load();
  state.players.forEach(ensurePlayerInit);
  renderAll();
}
