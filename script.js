/************** CONFIG **************/
const STORAGE_KEY  = "padel.americano.state.v14";

/* ===== Firebase ===== */
const firebaseConfig = {
  apiKey: "AIzaSyDm0J5dnEavIi0ow8o9q86Zl515E1zqIY0",
  authDomain: "padel-zac.firebaseapp.com",
  databaseURL: "https://padel-zac-default-rtdb.firebaseio.com",
  projectId: "padel-zac",
  storageBucket: "padel-zac.firebasestorage.app",
  messagingSenderId: "873811901531",
  appId: "1:873811901531:web:3175ad146974213728d37e"
};
let db = null;

/************** ESTADO **************/
const MAX_PER_COURT = 8;

const state = {
  courts: 0,
  target: null,
  players: [],
  playerCourts: {},
  roomId: "",
  isHost: false,
  phase: "groups",     // "groups" | "bracket"
  locked: false,
  round: 1,
  courtRound: {},
  courtComplete: {},
  matches: [],
  standings: {},
  playedWith: {},
  playedAgainst: {},
  pairHistory: {},     // { "1": Set(pairKey) }
  fixtureHistory: {},  // { "1": Set(fixtureKey) }
  lastPlayedRound: {},
  playedOnCourt: {},
  ghostCreatedCourts: {},
  updatedAt: 0
};

/************** DOM **************/
const $ = (s)=>document.querySelector(s);
const courtsSelect = $("#courtsSelect");
const targetSelect = $("#targetSelect");
const roundLabel = $("#roundLabel"), roundLabel2=$("#roundLabel2");
const playerName = $("#playerName"), addPlayerBtn=$("#addPlayerBtn");
const playersList=$("#playersList"), assignHint=$("#assignHint");
const matchesList=$("#matchesList"), generateBtn=$("#generateBtn");
const tbody=$("#tbody"), resetBtn=$("#resetBtn");
const roomIdTxt=$("#roomIdTxt"), copyRoomBtn=$("#copyRoomBtn");

/************** UTIL **************/
const serSets = (obj)=>Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[k, Array.from(v||[])]));
const revSets = (obj)=>Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[k, new Set(Array.isArray(v)?v:Object.keys(v||{}))]));
function persistLocal(s=state){
  const safe = {
    ...s,
    playedWith: serSets(s.playedWith),
    playedAgainst: serSets(s.playedAgainst),
    pairHistory: Object.fromEntries(Object.entries(s.pairHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
    fixtureHistory: Object.fromEntries(Object.entries(s.fixtureHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}
function loadLocal(){
  const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return;
  try{
    const s = JSON.parse(raw);
    Object.assign(state, s, {
      playedWith: revSets(s.playedWith),
      playedAgainst: revSets(s.playedAgainst),
      pairHistory: Object.fromEntries(Object.entries(s.pairHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
      fixtureHistory: Object.fromEntries(Object.entries(s.fixtureHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
    });
  }catch(e){ console.warn("No se pudo cargar estado local:", e); }
}

/************** FIREBASE **************/
function initFirebase(){
  if(!firebaseConfig || !firebaseConfig.apiKey){ roomIdTxt.textContent="—"; return; }
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  let rid = (location.hash || "").replace("#","").trim();
  if(!rid){ rid = Math.random().toString(36).slice(2,8); location.hash=rid; state.isHost=true; }
  state.roomId = rid; roomIdTxt.textContent = rid; subscribeCloud();
}
let pushTimer=null;
function pushCloud(){
  if(!db) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(()=>{
    const payload = {
      ...state,
      playedWith: serSets(state.playedWith),
      playedAgainst: serSets(state.playedAgainst),
      pairHistory: Object.fromEntries(Object.entries(state.pairHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
      fixtureHistory: Object.fromEntries(Object.entries(state.fixtureHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
      updatedAt: Date.now()
    };
    state.updatedAt = payload.updatedAt;
    db.ref(`/sesiones/${state.roomId}/state`).set(payload);
    persistLocal(state);
  }, 100);
}
function subscribeCloud(){
  const ref = db.ref(`/sesiones/${state.roomId}/state`);
  ref.on("value", snap=>{
    const cloud = snap.val();
    if(!cloud){ if(state.isHost) pushCloud(); return; }
    if(cloud.updatedAt && cloud.updatedAt <= state.updatedAt) return;
    const incoming = {
      ...cloud,
      playedWith: revSets(cloud.playedWith),
      playedAgainst: revSets(cloud.playedAgainst),
      pairHistory: Object.fromEntries(Object.entries(cloud.pairHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
      fixtureHistory: Object.fromEntries(Object.entries(cloud.fixtureHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
    };
    Object.assign(state, incoming);
    renderAll(); persistLocal(state);
  });
}

/************** LÓGICA **************/
const pairKey=(a,b)=>[a,b].sort().join("|");
const fixtureKey=(a,b,c,d)=>[pairKey(a,b), pairKey(c,d)].sort().join("_vs_");
const setupOk = ()=> state.courts>0 && Number.isInteger(state.target);
const canEditSetup = ()=> setupOk() && !state.locked && state.phase==="groups";

function ensurePlayerInit(name){
  if(!state.standings[name]) state.standings[name]={pts:0,wins:0,losses:0,played:0,lastRound:0};
  if(!state.playedWith[name]) state.playedWith[name]=new Set();
  if(!state.playedAgainst[name]) state.playedAgainst[name]=new Set();
  if(state.lastPlayedRound[name]==null) state.lastPlayedRound[name]=0;
  if(!state.playedOnCourt[name]) state.playedOnCourt[name]={};
}

function buildCourtBuckets(){
  const buckets={}; for(let c=1;c<=Math.max(1,state.courts);c++) buckets[c]=[];
  for(const p of state.players){
    const c = Math.min(Math.max(1, state.playerCourts[p]||1), Math.max(1,state.courts||1));
    buckets[c].push(p);
  }
  return buckets;
}
function countOnCourt(c){ return (buildCourtBuckets()[c]||[]).length; }

function canAddToCourt(court){
  const buckets = buildCourtBuckets();
  return ((buckets[court]||[]).length) < MAX_PER_COURT;
}
function addPlayer(name){
  if(!canEditSetup()) return alert("Primero elige canchas y meta (juegos).");
  const n=(name||"").trim();
  if(!n) return alert("Escribe un nombre.");
  if(state.players.includes(n)) return alert("Ese nombre ya existe.");
  if(!canAddToCourt(1)) return alert("Cancha 1 llegó al máximo de 8 jugadores.");
  state.players.push(n);
  ensurePlayerInit(n);
  state.playerCourts[n]=1;
  pushCloud(); renderAll();
}
function removePlayer(name){
  if(!canEditSetup()) return alert("No se puede eliminar: el americano ya inició.");
  state.players = state.players.filter(p=>p!==name);
  delete state.standings[name];
  delete state.playedWith[name]; delete state.playedAgainst[name];
  delete state.playerCourts[name]; delete state.lastPlayedRound[name];
  delete state.playedOnCourt[name];
  state.matches = state.matches.filter(m=> m.status==="done" || !m.pairs.flat().includes(name));
  pushCloud(); renderAll();
}

/* ——— Generación ——— */
function sortedCandidatesForCourt(court){
  const assigned = (buildCourtBuckets()[court]||[]);
  return assigned
    .map(p=>({
      p,
      score: (state.playedOnCourt[p]?.[court]||0)*10 + (state.lastPlayedRound[p] ?? -1)
    }))
    .sort((a,b)=>a.score-b.score)
    .map(x=>x.p);
}
function* combinations4(arr){
  const n=arr.length;
  for(let i=0;i<n-3;i++)
    for(let j=i+1;j<n-2;j++)
      for(let k=j+1;k<n-1;k++)
        for(let l=k+1;l<n;l++)
          yield [arr[i],arr[j],arr[k],arr[l]];
}

function choosePairsForCourt(players4, court){
  const [p1,p2,p3,p4] = players4;
  const options = [
    [[p1,p2],[p3,p4]],
    [[p1,p3],[p2,p4]],
    [[p1,p4],[p2,p3]],
  ];
  const usedPairs   = state.pairHistory[court]   || new Set();
  const usedFixture = state.fixtureHistory[court]|| new Set();

  for (const [[a,b],[c,d]] of options){
    const pk1 = pairKey(a,b), pk2 = pairKey(c,d);
    const fk  = fixtureKey(a,b,c,d);
    if (!usedPairs.has(pk1) && !usedPairs.has(pk2) && !usedFixture.has(fk)) return [[a,b],[c,d]];
  }
  for (const [[a,b],[c,d]] of options){
    const pk1 = pairKey(a,b), pk2 = pairKey(c,d);
    const fk  = fixtureKey(a,b,c,d);
    if ((!usedPairs.has(pk1) || !usedPairs.has(pk2)) && !usedFixture.has(fk)) return [[a,b],[c,d]];
  }
  return null;
}

const totalPairsOnCourt = (court)=>{
  const n = (buildCourtBuckets()[court]||[]).length;
  return n*(n-1)/2;
};
const theoreticalMatchesOnCourt = (court)=>{
  const pairs = totalPairsOnCourt(court);
  return Math.ceil(pairs/2);
};

function updateCourtCompletionByPairs(court){
  const seen = state.pairHistory[court] ? state.pairHistory[court].size : 0;
  if(seen >= totalPairsOnCourt(Number(court))){
    state.courtComplete[court] = true;
    return true;
  }
  return false;
}

/* Comodín SOLO al generar partidos */
function maybeAddGhostOnGenerate(court){
  const list = (buildCourtBuckets()[court]||[]);
  const ghostName = `comodin-${court}`;
  const hasGhost = state.players.includes(ghostName);
  if(list.length>=5 && list.length%2===1){
    if(!hasGhost && list.length + 1 <= MAX_PER_COURT){
      state.players.push(ghostName);
      ensurePlayerInit(ghostName);
      state.playerCourts[ghostName]=court;
      state.ghostCreatedCourts[String(court)] = true;
    }
  }
}

function findNextMatchForCourt(courtNum){
  const court = String(courtNum);
  const assigned = sortedCandidatesForCourt(courtNum);
  if(assigned.length < 4) return null;
  // si ya completó parejas, NO crear más
  if(updateCourtCompletionByPairs(court)) return null;

  const pool = assigned.slice(0, Math.min(8, assigned.length));
  for(const four of combinations4(pool)){
    const pairs = choosePairsForCourt(four, court);
    if(pairs){
      const rnd = state.courtRound[court] || 1;
      return {
        id: crypto.randomUUID(),
        round: rnd,
        court: courtNum,
        pairs,
        status: "open",
        scoreA: 0, scoreB: 0
      };
    }
  }
  return null;
}

function generateMatchesForGroups(){
  if(!setupOk()) return alert("Primero finaliza el setup (canchas y meta).");
  state.locked = true;

  for(let c=1;c<=state.courts;c++) maybeAddGhostOnGenerate(c);

  for(let c=1;c<=state.courts;c++){
    const court = String(c);
    if(updateCourtCompletionByPairs(court)) continue;

    const alreadyOpen = state.matches.some(m=>m.court===c && m.round===(state.courtRound[court]||1) && m.status==="open");
    if(alreadyOpen) continue;

    if(!state.courtRound[court]) state.courtRound[court]=1;
    const next = findNextMatchForCourt(c);
    if(next) state.matches.push(next);
    else state.courtComplete[court]=true;
  }

  // actualizar ronda mostrada
  const maxRound = Math.max(1, ...Object.values(state.courtRound).map(x=>x||1));
  state.round = maxRound;

  pushCloud(); renderAll();

  const allDone = Array.from({length:state.courts},(_,i)=>String(i+1)).every(k=>state.courtComplete[k]);
  if(allDone && state.phase==="groups") renderAdvanceToBracketButton();
}

/* Resultados */
function validateScore(a,b){
  const T = Number(state.target||3);
  if(!Number.isInteger(a) || !Number.isInteger(b)) return "Marcador inválido.";
  if(a<0 || b<0) return "No se aceptan negativos.";
  if(a===b) return "No puede haber empate.";
  if(a!==T && b!==T) return `Uno de los equipos debe llegar a ${T}.`;
  if(a===T && b>=T) return "El perdedor no puede alcanzar la meta.";
  if(b===T && a>=T) return "El perdedor no puede alcanzar la meta.";
  return null;
}
function applyTeam(team, gamesWon, gamesLost, courtKey){
  for(const p of team){
    ensurePlayerInit(p);
    state.standings[p].pts += gamesWon;
    state.standings[p].played += 1;
    state.standings[p].lastRound = state.round;
    state.lastPlayedRound[p] = state.round;
    state.playedOnCourt[p][courtKey] = (state.playedOnCourt[p][courtKey]||0) + 1;
  }
}
function saveResult(matchId, sA, sB){
  const m = state.matches.find(x=>x.id===matchId);
  if(!m || m.status!=="open") return;

  const a = Number(sA), b = Number(sB);
  const err = validateScore(a,b);
  if(err) return alert(err);

  m.status="done"; m.scoreA=a; m.scoreB=b;
  const [t1,t2] = m.pairs;
  const courtKey = String(m.court);
  applyTeam(t1, a, b, courtKey);
  applyTeam(t2, b, a, courtKey);

  const winner = (a>b)? t1 : t2;
  const loser  = (a>b)? t2 : t1;
  winner.forEach(p=>state.standings[p].wins+=1);
  loser.forEach(p=>state.standings[p].losses+=1);

  const addPair = (x,y)=>{ if(!state.pairHistory[courtKey]) state.pairHistory[courtKey]=new Set(); state.pairHistory[courtKey].add(pairKey(x,y)); };
  addPair(t1[0], t1[1]); addPair(t2[0], t2[1]);
  if(!state.fixtureHistory[courtKey]) state.fixtureHistory[courtKey]=new Set();
  state.fixtureHistory[courtKey].add(fixtureKey(t1[0],t1[1],t2[0],t2[1]));
  [t1[0],t1[1]].forEach(p=>{ state.playedAgainst[p].add(t2[0]); state.playedAgainst[p].add(t2[1]); state.playedWith[p].add(p===t1[0]?t1[1]:t1[0]); });
  [t2[0],t2[1]].forEach(p=>{ state.playedAgainst[p].add(t1[0]); state.playedAgainst[p].add(t1[1]); state.playedWith[p].add(p===t2[0]?t2[1]:t2[0]); });

  if(state.phase==="groups"){
    state.courtRound[courtKey] = (state.courtRound[courtKey]||1) + 1;
    state.round = Math.max(state.round, state.courtRound[courtKey]);
    updateCourtCompletionByPairs(courtKey);

    if(!state.courtComplete[courtKey]){
      const next = findNextMatchForCourt(Number(courtKey));
      if(next) state.matches.push(next);
      else state.courtComplete[courtKey]=true;
    }

    const allDone = Array.from({length:state.courts},(_,i)=>String(i+1)).every(k=>state.courtComplete[k]);
    if(allDone){ renderAdvanceToBracketButton(); }
  }else{
    advanceBracketIfReady();
  }

  pushCloud(); renderAll();
}

/************** ELIMINATORIA **************/
const nearestPow2 = (n)=>{ const p=[2,4,8,16,32]; for(let i=p.length-1;i>=0;i--){ if(p[i]<=n) return p[i]; } return 2; };
function globalRanking(){
  return Object.keys(state.standings)
    .map(name=>({name, ...state.standings[name]}))
    .sort((a,b)=> b.pts - a.pts || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name))
    .map(r=>r.name);
}

/* NUEVO: formar equipos balanceados Top4 vs Bottom4 y emparejar semis */
function buildBracketRound1Matches(){
  const ranked = globalRanking();
  const maxTeams = nearestPow2(Math.floor(ranked.length / 2));
  if(maxTeams < 2) return [];

  const takePlayers = maxTeams * 2;
  const selected    = ranked.slice(0, takePlayers);

  // dividir mitad superior e inferior
  const half = takePlayers/2;
  const top = selected.slice(0, half);          // Top N
  const bot = selected.slice(half);             // Bottom N
  bot.reverse();                                // [peor … menos peor]

  // equipos balanceados: (top[i], bot[i])
  const teams = [];
  for(let i=0;i<half;i++) teams.push([ top[i], bot[i] ]);

  // Semis/cuadros balanceados:
  // si hay 4 equipos → semis: t0 vs t3  y  t1 vs t2
  // si hay 8 → cuartos: (t0 vs t7), (t1 vs t6), (t2 vs t5), (t3 vs t4)
  const mkPairsIndex = (N)=>{
    const idx=[];
    for(let i=0;i<N/2;i++) idx.push([i, N-1-i]);
    return idx;
  };
  const firstRoundIndex = mkPairsIndex(teams.length);

  const matches = [];
  for(let i=0;i<firstRoundIndex.length;i++){
    const [a,b] = firstRoundIndex[i];
    const t1 = teams[a], t2 = teams[b];
    matches.push({
      id: crypto.randomUUID(),
      round: 1,
      court: (i%Math.max(1,state.courts||1))+1,
      pairs: [t1, t2],
      status: "open",
      scoreA: 0,
      scoreB: 0
    });
  }
  return matches;
}

function createBracket(){
  if(state.phase!=="groups") return;
  const firstRound = buildBracketRound1Matches();
  if(firstRound.length===0){ alert("No hay suficientes jugadores para eliminatoria."); return; }

  state.matches = [];
  state.phase = "bracket";
  state.locked = true;

  const btn = document.getElementById("advanceBracketBtn");
  if(btn) btn.remove();

  state.courtRound = {};
  state.courtComplete = {};
  state.round = 1;

  state.matches.push(...firstRound);
  pushCloud(); renderAll();
}

function advanceBracketIfReady(){
  if(state.phase!=="bracket") return;
  const current = state.matches.filter(m=>m.round===state.round);
  if(current.length===0) return;
  if(current.some(m=>m.status!=="done")) return;

  const winners = current.map(m => (m.scoreA>m.scoreB) ? m.pairs[0] : m.pairs[1]);
  if(winners.length===1){ return; } // campeón

  const nextMatches = [];
  for(let i=0;i<winners.length;i+=2){
    const t1 = winners[i], t2 = winners[i+1];
    if(!t1 || !t2) continue;
    nextMatches.push({
      id: crypto.randomUUID(),
      round: state.round+1,
      court: (i%Math.max(1,state.courts||1))+1,
      pairs: [t1, t2],
      status: "open",
      scoreA: 0,
      scoreB: 0
    });
  }
  state.round += 1;
  state.matches.push(...nextMatches);
}

/************** RENDER **************/
function renderPlayers(){
  playersList.innerHTML="";
  assignHint.style.display = state.courts>1 ? "block":"none";

  const canEdit = canEditSetup();
  playerName.disabled = !canEdit; addPlayerBtn.disabled = !canEdit;
  courtsSelect.value = state.courts ? String(state.courts) : "";
  targetSelect.value = Number.isInteger(state.target) ? String(state.target) : "";
  courtsSelect.disabled = state.locked || state.phase!=="groups";
  targetSelect.disabled = state.locked || state.phase!=="groups";

  for(const p of state.players){
    const li=document.createElement("li");
    li.className="badge";
    const courtSel = state.courts>1 ? `
      <select class="pcourt" data-name="${p}" title="Cancha" ${!canEdit?'disabled':''}>
        ${Array.from({length:state.courts},(_,i)=>`<option value="${i+1}" ${ (state.playerCourts[p]||1)===(i+1)?'selected':''}>${i+1}</option>`).join("")}
      </select>` : "";
    li.innerHTML = `<div style="display:flex;gap:8px;align-items:center;">
        <strong>${p}</strong>${courtSel}
      </div>
      <span class="x" title="Eliminar" ${!canEdit?'style="opacity:.4;pointer-events:none"':''}>✕</span>`;
    li.querySelector(".x").addEventListener("click",()=>removePlayer(p));
    if(state.courts>1 && canEdit){
      li.querySelector(".pcourt").addEventListener("change",(e)=>{
        const c = Number(e.target.value);
        if(!canAddToCourt(c)) { e.target.value = String(state.playerCourts[p]||1); return alert(`La cancha ${c} ya tiene 8 jugadores.`); }
        state.playerCourts[p]=c; pushCloud();
      });
    }
    playersList.appendChild(li);
  }
}

function renderProgressSummary(){
  const box = document.createElement("div");
  box.className = "muted";
  let lines = [];
  for(let c=1;c<=Math.max(1,state.courts||1);c++){
    const totalPairs = totalPairsOnCourt(c);
    const seen = state.pairHistory[String(c)] ? state.pairHistory[String(c)].size : 0;
    const theo = theoreticalMatchesOnCourt(c);
    lines.push(`Cancha ${c}: parejas ${seen}/${totalPairs} · partidos teóricos ${theo}`);
  }
  box.textContent = lines.join("  |  ");
  return box;
}
function renderAdvanceToBracketButton(){
  if(state.phase!=="groups") return;
  const existing = $("#advanceBracketBtn"); if(existing) return;
  const btn = document.createElement("button");
  btn.id = "advanceBracketBtn";
  btn.className = "primary";
  btn.style = "margin:10px 0; width:100%";
  btn.textContent = "Crear eliminatoria";
  btn.addEventListener("click", createBracket);
  matchesList.prepend(btn);
}

function renderMatches(){
  matchesList.innerHTML="";
  matchesList.appendChild(renderProgressSummary());

  if(state.phase==="groups"){
    for(let c=1;c<=Math.max(1,state.courts||1);c++){
      const court = String(c);
      if(state.courtComplete[court]){
        const note = document.createElement("div");
        note.className = "muted";
        note.textContent = `Cancha ${c}: americano completado`;
        matchesList.appendChild(note);
      }
    }
  }

  const openList = state.matches.filter(m=> m.status==="open").sort((a,b)=>a.court-b.court);
  const list = state.phase==="groups"
    ? openList
    : state.matches.filter(m=> m.round===state.round).sort((a,b)=>a.court-b.court);

  if(state.phase==="groups"){
    const allDone = Array.from({length:state.courts},(_,i)=>String(i+1)).every(k=>state.courtComplete[k]);
    if(allDone || openList.length===0){ renderAdvanceToBracketButton(); }
  }

  if(list.length===0){
    const hint=document.createElement("div");
    hint.className="muted";
    hint.textContent = state.phase==="groups"
      ? "No hay partidos abiertos en esta ronda. Pulsa “Generar partidos”."
      : "Partidos de eliminatoria listos.";
    matchesList.appendChild(hint);
    return;
  }

  for(const m of list){
    const el=document.createElement("div");
    el.className="match";
    const [t1,t2]=m.pairs;
    const teamHtml = (team)=>team.map(n=>`<span class="badge">${n}</span>`).join(" ");
    el.innerHTML=`
      <div class="meta">${state.phase==="groups" ? `Cancha ${m.court}` : `Eliminatoria`} · ${m.status==="open"?"En juego":"Terminado"}</div>
      <div class="teams">
        <div class="team">${teamHtml(t1)}</div>
        <div class="vs">VS</div>
        <div class="team">${teamHtml(t2)}</div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="score">
          <label>Marcador (a ${state.target ?? "?"}):</label>
          <input type="number" min="0" value="${m.scoreA}" ${m.status==="done"?"disabled":""} class="sA"/>
          <span>-</span>
          <input type="number" min="0" value="${m.scoreB}" ${m.status==="done"?"disabled":""} class="sB"/>
        </div>
        <div style="flex:1"></div>
        ${m.status==="open"
          ? `<button class="primary save">Guardar resultado</button>`
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

function cappedRoundForDisplay(){
  if(state.phase!=="groups") return state.round;
  // ronda mostrada = min(ronda real, partidos teóricos más altos entre canchas)
  let cap = 1;
  for(let c=1;c<=Math.max(1,state.courts||1);c++){
    cap = Math.max(cap, theoreticalMatchesOnCourt(c));
  }
  return Math.min(state.round || 1, cap);
}

function renderAll(){
  const lbl = cappedRoundForDisplay();
  roundLabel.textContent= String(lbl);
  roundLabel2.textContent= String(lbl);
  roomIdTxt.textContent = state.roomId || "—";

  generateBtn.style.display = (state.phase === "bracket") ? "none" : "inline-block";
  renderPlayers(); renderMatches(); renderTable();
}

/************** EVENTOS **************/
document.addEventListener("DOMContentLoaded", ()=>{
  loadLocal(); persistLocal(state); renderAll(); initFirebase();

  copyRoomBtn.addEventListener("click", ()=>{
    const url = location.href.split("#")[0] + (state.roomId?("#"+state.roomId):"");
    navigator.clipboard.writeText(url);
    copyRoomBtn.textContent="Copiado";
    setTimeout(()=>copyRoomBtn.textContent="Copiar",1200);
  });

  courtsSelect.addEventListener("change", ()=>{
    if(state.phase!=="groups") return;
    const v = Number(courtsSelect.value);
    state.courts = Number.isFinite(v) ? v : 0;

    state.pairHistory = {}; state.fixtureHistory = {};
    state.courtRound = {}; state.courtComplete = {};
    state.ghostCreatedCourts = {};
    for(let c=1;c<=Math.max(1,state.courts||1);c++){ state.courtRound[String(c)]=1; state.courtComplete[String(c)]=false; }
    for(const p of state.players){
      state.playerCourts[p]=Math.min(Math.max(1,state.playerCourts[p]||1), Math.max(1,state.courts||1));
    }
    pushCloud(); renderAll();
  });

  targetSelect.addEventListener("change", ()=>{
    if(state.phase!=="groups") return;
    const v = Number(targetSelect.value);
    state.target = Number.isFinite(v) ? v : null;
    pushCloud(); renderAll();
  });

  addPlayerBtn.addEventListener("click", ()=>{ addPlayer(playerName.value); playerName.value=""; playerName.focus(); });
  playerName.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ addPlayer(playerName.value); playerName.value=""; } });

  generateBtn.addEventListener("click", ()=>{ if(state.phase==="groups") generateMatchesForGroups(); });

  resetBtn.addEventListener("click", ()=>{
    if(!confirm("¿Seguro que deseas reiniciar todo?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, {
      courts: 0, target: null,
      players:[], playerCourts:{},
      roomId: state.roomId, isHost: state.isHost,
      phase:"groups", locked:false,
      round:1, courtRound:{}, courtComplete:{},
      matches:[],
      standings:{}, playedWith:{}, playedAgainst:{},
      pairHistory:{}, fixtureHistory:{},
      lastPlayedRound:{}, playedOnCourt:{},
      ghostCreatedCourts:{},
      updatedAt: Date.now()
    });
    pushCloud(); renderAll();
  });
});
