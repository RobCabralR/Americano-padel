/************** CONFIG **************/
const STORAGE_KEY  = "padel.americano.state.v9";

/* ===== Firebase =====
 * Pega aquí TU firebaseConfig (instrucciones abajo, sección “Cómo pegar firebaseConfig”).
 */
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
const state = {
  players: [],
  playerCourts: {},
  courts: 2,
  target: 3,

  roomId: "",
  isHost: false,

  phase: "groups",           // "groups" | "bracket"
  locked: false,

  round: 1,
  courtRound: {},
  courtComplete: {},

  matches: [],               // {id, round, court, pairs[[a,b],[c,d]], status, scoreA, scoreB}
  standings: {},

  playedWith: {},
  playedAgainst: {},
  pairHistory: {},
  fixtureHistory: {},

  lastPlayedRound: {},
  playedOnCourt: {},

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

/************** LOCAL PERSIST **************/
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

/************** FIREBASE SYNC **************/
function initFirebase(){
  if(!firebaseConfig || !firebaseConfig.apiKey){ roomIdTxt.textContent="—"; return; }
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();

  let rid = (location.hash || "").replace("#","").trim();
  if(!rid){
    rid = Math.random().toString(36).slice(2,8);
    location.hash = rid;
    state.isHost = true;
  }
  state.roomId = rid;
  roomIdTxt.textContent = rid;
  subscribeCloud();
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
  }, 120);
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
    renderAll();
    persistLocal(state);
  });
}

/************** HELPERS **************/
function ensurePlayerInit(name){
  if(!state.standings[name]) state.standings[name]={pts:0,wins:0,losses:0,played:0,lastRound:0};
  if(!state.playedWith[name]) state.playedWith[name]=new Set();
  if(!state.playedAgainst[name]) state.playedAgainst[name]=new Set();
  if(state.lastPlayedRound[name]==null) state.lastPlayedRound[name]=0;
  if(state.playerCourts[name]==null) state.playerCourts[name]=1;
  if(!state.playedOnCourt[name]) state.playedOnCourt[name]={};
}
const pairKey=(a,b)=>[a,b].sort().join("|");
const fixtureKey=(a,b,c,d)=>[pairKey(a,b), pairKey(c,d)].sort().join("_vs_");
const canEditSetup = ()=> !state.locked && state.phase==="groups";

/************** JUGADORES **************/
function addPlayer(name){
  if(!canEditSetup()) return alert("No se puede agregar: el americano ya inició.");
  const n=(name||"").trim();
  if(!n) return alert("Escribe un nombre.");
  if(state.players.includes(n)) return alert("Ese nombre ya existe.");
  state.players.push(n);
  ensurePlayerInit(n);
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
function buildCourtBuckets(){
  const buckets={}; for(let c=1;c<=state.courts;c++) buckets[c]=[];
  for(const p of state.players){
    const c = Math.min(Math.max(1, state.playerCourts[p]||1), state.courts);
    buckets[c].push(p);
  }
  return buckets;
}

/* === Comodín visible y con puntos ===
   IMPAR y ≥5 en la cancha → crea 'comodin-<cancha>' (si no existe).
*/
function ensureGhostsVisible(){
  const buckets = buildCourtBuckets();
  for(let c=1;c<=state.courts;c++){
    const court = String(c);
    const ghost = `comodin-${court}`;
    const total = (buckets[c]||[]).length;
    const hasGhost = state.players.includes(ghost);
    if(total>=5 && total%2===1 && !hasGhost){
      state.players.push(ghost);
      ensurePlayerInit(ghost);
      state.playerCourts[ghost]=c;
    }
  }
}
function availablePlayersByCourt(court){
  const busy=new Set();
  for(const m of state.matches){
    if(m.court===court && m.status==="open"){ m.pairs.flat().forEach(p=>busy.add(p)); }
  }
  return buildCourtBuckets()[court].filter(p=>!busy.has(p));
}

/************** GENERACIÓN (GRUPOS) **************/
function chooseFourForCourt(court){
  ensureGhostsVisible();
  const assigned = buildCourtBuckets()[court];
  const avail = availablePlayersByCourt(court);
  if(assigned.length < 4) return null;

  const scored = assigned.map(p=>{
    const playedHere = (state.playedOnCourt[p]?.[court]||0);
    const last = state.lastPlayedRound[p] ?? -1;
    return {p, score: playedHere*10 + (last)};
  }).sort((a,b)=>a.score-b.score).map(x=>x.p);

  const four = [];
  for(const p of scored){
    if(four.length===4) break;
    if(avail.includes(p)) four.push(p);
  }
  for(const p of scored){
    if(four.length===4) break;
    if(!four.includes(p)) four.push(p);
  }
  return four.length===4 ? four : null;
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

  let best=null, bestScore=Infinity;
  for(const [[a,b],[c,d]] of options){
    let score = 0;
    const pk1=pairKey(a,b), pk2=pairKey(c,d);
    const fk = fixtureKey(a,b,c,d);

    if(usedFixture.has(fk)) score += 1000;
    if(usedPairs.has(pk1)) score += 200;
    if(usedPairs.has(pk2)) score += 200;

    if(state.playedWith[a]?.has(b)) score += 20;
    if(state.playedWith[c]?.has(d)) score += 20;
    [ [a,c],[a,d],[b,c],[b,d] ].forEach(([x,y])=>{
      if(state.playedAgainst[x]?.has(y)) score += 5;
    });

    if(score<bestScore){ bestScore=score; best=[[a,b],[c,d]]; }
  }
  if(!best) return null;
  const fk = fixtureKey(best[0][0],best[0][1],best[1][0],best[1][1]);
  if((state.fixtureHistory[court]||new Set()).has(fk)) return null;
  return best;
}

/* Completar por parejas posibles: C(n,2) */
function updateCourtCompletionByPairs(court){
  const players = buildCourtBuckets()[court] || [];
  const n = players.length;
  const totalPairs = n*(n-1)/2;
  const seen = state.pairHistory[String(court)] ? state.pairHistory[String(court)].size : 0;
  if(seen >= totalPairs){
    state.courtComplete[String(court)] = true;
    return true;
  }
  return false;
}
function markCourtCompleteIfStuck(court){
  if(updateCourtCompletionByPairs(court)) return true;
  const can4 = chooseFourForCourt(court);
  if(!can4){ state.courtComplete[String(court)]=true; return true; }
  const pairs = choosePairsForCourt(can4, String(court));
  if(!pairs){ state.courtComplete[String(court)]=true; return true; }
  return false;
}
function generateMatchesForGroups(){
  state.locked = true;
  ensureGhostsVisible();

  for(let c=1;c<=state.courts;c++){
    const court = String(c);
    if(state.courtComplete[court]) continue;
    if(updateCourtCompletionByPairs(court)) continue;

    const alreadyOpen = state.matches.some(m=>m.court===c && m.round===(state.courtRound[court]||1) && m.status==="open");
    if(alreadyOpen) continue;

    if(markCourtCompleteIfStuck(court)) continue;

    const four = chooseFourForCourt(court);
    const pairs = choosePairsForCourt(four, court);
    if(!pairs){ state.courtComplete[court]=true; continue; }

    const rnd = state.courtRound[court] || 1;
    state.matches.push({
      id: crypto.randomUUID(),
      round: rnd,
      court: c,
      pairs,
      status: "open",
      scoreA: 0,
      scoreB: 0
    });
  }

  const maxRound = Math.max(1, ...Object.values(state.courtRound).map(x=>x||1));
  state.round = maxRound;

  pushCloud(); renderAll();

  const allDone = Array.from({length:state.courts},(_,i)=>String(i+1)).every(k=>state.courtComplete[k]);
  if(allDone && state.phase==="groups"){ renderAdvanceToBracketButton(); }
}

/************** GUARDADO RESULTADOS **************/
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
  const winner = (a>b)? t1 : t2;
  const loser  = (a>b)? t2 : t1;
  const courtKey = String(m.court);

  applyTeam(t1, a, b, courtKey);
  applyTeam(t2, b, a, courtKey);

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
  }else{
    // BRACKET: si termina la ronda actual, generamos la siguiente
    advanceBracketIfReady();
  }

  pushCloud(); renderAll();
}

/************** BRACKET **************/
const nearestPow2 = (n)=>{ const p=[2,4,8,16,32]; for(let i=p.length-1;i>=0;i--){ if(p[i]<=n) return p[i]; } return 2; };
function globalRanking(){
  return Object.keys(state.standings)
    .map(name=>({name, ...state.standings[name]}))
    .sort((a,b)=> b.pts - a.pts || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name))
    .map(r=>r.name);
}

/* Selección para bracket:
   - Tomamos TOP global (nearest power of 2).
   - Si hay 2 canchas, sembramos cruzado A vs B (por court asignado).
*/
function pickBracketPlayers(){
  const top = globalRanking();
  const K = nearestPow2(top.length);
  return top.slice(0, Math.max(4, K)); // al menos 4
}

/* Construye partidos round 1:
   - courts==2 → A1 vs B4, A2 vs B3, B1 vs A4, B2 vs A3 (si falta de un lado, se rellena ordenando normal).
   - otros → 1 vs último, 2 vs penúltimo...
*/
function buildInitialBracketMatches(players){
  const matches = [];
  const courts = state.courts;

  const asPairs = (arr)=>arr.map((_,i)=>[arr[i], arr[i+1]]).filter((_,i)=>i%2===0);

  if(courts===2){
    const A = players.filter(p=> (state.playerCourts[p]||1)===1);
    const B = players.filter(p=> (state.playerCourts[p]||1)===2);
    // si alguno no tiene suficientes, rellenamos con los siguientes del top
    while(A.length < players.length/2){ A.push(...players.filter(p=>!A.includes(p) && !B.includes(p)).slice(0,1)); }
    while(B.length < players.length/2){ B.push(...players.filter(p=>!A.includes(p) && !B.includes(p)).slice(0,1)); }
    const Aseed = A.slice(0, players.length/2);
    const Bseed = B.slice(0, players.length/2);

    // ordenar por su posición en top global
    const rank = new Map(players.map((p,i)=>[p,i]));
    Aseed.sort((x,y)=>rank.get(x)-rank.get(y));
    Bseed.sort((x,y)=>rank.get(x)-rank.get(y));

    const makeTeam = (x)=>[x[0], x[1]];

    const A1=Aseed[0], A2=Aseed[1], A3=Aseed[2], A4=Aseed[3];
    const B1=Bseed[0], B2=Bseed[1], B3=Bseed[2], B4=Bseed[3];

    let seedsTeams = [];
    if(players.length>=8 && A4 && B4){
      // A1 vs B4, A2 vs B3, B1 vs A4, B2 vs A3
      seedsTeams = [
        [[A1, A2],[B4, undefined]], // temporal: formamos equipos con 2 jugadores
        [[B1, B2],[A4, undefined]],
        [[A3, undefined],[B2, undefined]],
        [[B3, undefined],[A2, undefined]],
      ];
      // En realidad queremos dobles con pares (1v1 sembrado en dobles):
      // Mejor: emparejar consecutivos dentro del lado:
      const Apairs = asPairs(Aseed);
      const Bpairs = asPairs(Bseed);
      // Cruzar: A1-A2 vs B3-B4, B1-B2 vs A3-A4 (si no hay suficientes, fallback)
      const t1 = (Apairs[0]||[Aseed[0],Aseed[1]]);
      const t2 = (Bpairs[1]||[Bseed[Bseed.length-2],Bseed[Bseed.length-1]]);
      const t3 = (Bpairs[0]||[Bseed[0],Bseed[1]]);
      const t4 = (Apairs[1]||[Aseed[Aseed.length-2],Aseed[Aseed.length-1]]);

      if(t1[0]&&t1[1]&&t2[0]&&t2[1]) matches.push({id:crypto.randomUUID(),round:1,court:1,pairs:[t1,t2],status:"open",scoreA:0,scoreB:0});
      if(t3[0]&&t3[1]&&t4[0]&&t4[1]) matches.push({id:crypto.randomUUID(),round:1,court:2,pairs:[t3,t4],status:"open",scoreA:0,scoreB:0});
      return matches;
    }
    // Si no hay 8, caída a seeding normal
  }

  // Seeding normal (1 vs último, 2 vs penúltimo...) → doblamos de 2 en 2
  const pairs1v1 = [];
  for(let i=0;i<players.length/2;i++){
    pairs1v1.push([players[i], players[players.length-1-i]]);
  }
  for(let i=0;i<pairs1v1.length;i+=2){
    const t1 = [pairs1v1[i][0], pairs1v1[i][1]];
    const t2 = [pairs1v1[i+1][0], pairs1v1[i+1][1]];
    matches.push({
      id: crypto.randomUUID(),
      round: 1,
      court: (i%state.courts)+1,
      pairs: [t1, t2],
      status: "open",
      scoreA: 0,
      scoreB: 0
    });
  }
  return matches;
}

function pickBracketPlayers(){
  const top = globalRanking();
  const K = nearestPow2(top.length);
  return top.slice(0, Math.max(4, K));
}

function createBracket(){
  if(state.phase!=="groups") return;
  const players = pickBracketPlayers();
  if(players.length < 4){ alert("No hay suficientes jugadores para eliminatoria."); return; }

  // limpiar partidos de grupos
  state.matches = [];
  state.phase = "bracket";
  state.locked = true;

  const btn = document.getElementById("advanceBracketBtn");
  if(btn) btn.remove();

  const matches = buildInitialBracketMatches(players);
  state.courtRound = {};
  state.courtComplete = {};
  state.round = 1;

  state.matches.push(...matches);
  pushCloud(); renderAll();
}

/* Avanza el bracket si todos los partidos de la ronda actual están terminados */
function advanceBracketIfReady(){
  if(state.phase!=="bracket") return;
  const current = state.matches.filter(m=>m.round===state.round);
  if(current.length===0) return;
  if(current.some(m=>m.status!=="done")) return;

  // equipos ganadores de esta ronda
  const winners = current.map(m => (m.scoreA>m.scoreB) ? m.pairs[0] : m.pairs[1]);

  if(winners.length===1){
    // Ya hay campeón; no generamos más
    return;
  }

  // Emparejar ganadores en orden
  const nextMatches = [];
  for(let i=0;i<winners.length;i+=2){
    const t1 = winners[i], t2 = winners[i+1];
    if(!t1 || !t2) continue;
    nextMatches.push({
      id: crypto.randomUUID(),
      round: state.round+1,
      court: (i%state.courts)+1,
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
  courtsSelect.disabled = !canEdit; targetSelect.disabled = !canEdit;

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
        state.playerCourts[p]=Number(e.target.value); pushCloud();
      });
    }
    playersList.appendChild(li);
  }
}
function renderAdvanceToBracketButton(){
  if(state.phase!=="groups") return;
  const existing = $("#advanceBracketBtn");
  if(existing) return;
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

  if(state.phase==="groups"){
    for(let c=1;c<=state.courts;c++){
      const court = String(c);
      if(state.courtComplete[court]){
        const note = document.createElement("div");
        note.className = "muted";
        note.textContent = `Cancha ${c}: americano completado`;
        matchesList.appendChild(note);
      }
    }
  }

  const list = state.phase==="groups"
    ? state.matches.filter(m=> m.status==="open").sort((a,b)=>a.court-b.court)
    : state.matches.filter(m=> m.round===state.round).sort((a,b)=>a.court-b.court);

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
          <label>Marcador (a ${state.target}):</label>
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
function renderAll(){
  const maxRound = Math.max(1, ...Object.values(state.courtRound).map(x=>x||1));
  const lbl = state.phase==="groups" ? maxRound : state.round;
  roundLabel.textContent= String(lbl);
  roundLabel2.textContent= String(lbl);

  courtsSelect.value=String(state.courts);
  targetSelect.value=String(state.target);
  roomIdTxt.textContent = state.roomId || "—";

  generateBtn.style.display = (state.phase === "bracket") ? "none" : "inline-block";

  renderPlayers();
  renderMatches();
  renderTable();
}

/************** EVENTOS **************/
document.addEventListener("DOMContentLoaded", ()=>{
  loadLocal();

  for(let c=1;c<=state.courts;c++){
    const k=String(c);
    if(state.courtRound[k]==null) state.courtRound[k]=1;
    if(state.courtComplete[k]==null) state.courtComplete[k]=false;
  }
  state.players.forEach(ensurePlayerInit);
  persistLocal(state);
  renderAll();

  initFirebase();

  copyRoomBtn.addEventListener("click", ()=>{
    const url = location.href.split("#")[0] + (state.roomId?("#"+state.roomId):"");
    navigator.clipboard.writeText(url);
    copyRoomBtn.textContent="Copiado";
    setTimeout(()=>copyRoomBtn.textContent="Copiar",1200);
  });

  courtsSelect.addEventListener("change", ()=>{
    if(!canEditSetup()) return alert("No puedes cambiar canchas: el americano ya inició.");
    state.courts = Number(courtsSelect.value);
    state.pairHistory = {}; state.fixtureHistory = {};
    state.courtRound = {}; state.courtComplete = {};
    for(let c=1;c<=state.courts;c++){ state.courtRound[String(c)]=1; state.courtComplete[String(c)]=false; }
    for(const p of state.players){ state.playerCourts[p]=Math.min(Math.max(1,state.playerCourts[p]||1), state.courts); }
    ensureGhostsVisible();
    pushCloud(); renderAll();
  });

  targetSelect.addEventListener("change", ()=>{
    if(!canEditSetup()) return alert("No puedes cambiar la meta: el americano ya inició.");
    state.target = Number(targetSelect.value);
    pushCloud(); renderAll();
  });

  addPlayerBtn.addEventListener("click", ()=>{ addPlayer(playerName.value); playerName.value=""; playerName.focus(); });
  playerName.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ addPlayer(playerName.value); playerName.value=""; } });

  generateBtn.addEventListener("click", ()=>{ if(state.phase==="groups") generateMatchesForGroups(); });

  resetBtn.addEventListener("click", ()=>{
    if(!confirm("¿Seguro que deseas reiniciar todo?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, {
      players:[], playerCourts:{}, courts:1, target:3,
      roomId: state.roomId, isHost: state.isHost,
      phase:"groups", locked:false,
      round:1, courtRound:{ "1":1 }, courtComplete:{ "1":false },
      matches:[],
      standings:{}, playedWith:{}, playedAgainst:{},
      pairHistory:{}, fixtureHistory:{},
      lastPlayedRound:{}, playedOnCourt:{},
      updatedAt: Date.now()
    });
    pushCloud(); renderAll();
  });
});

/************** BRACKET UI helper **************/
function renderAdvanceToBracketButton(){
  if(state.phase!=="groups") return;
  const existing = $("#advanceBracketBtn");
  if(existing) return;
  const btn = document.createElement("button");
  btn.id = "advanceBracketBtn";
  btn.className = "primary";
  btn.style = "margin:10px 0; width:100%";
  btn.textContent = "Crear eliminatoria";
  btn.addEventListener("click", createBracket);
  matchesList.prepend(btn);
}
