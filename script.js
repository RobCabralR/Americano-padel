/************** CONFIG **************/
const STORAGE_KEY  = "padel.americano.state.v18";
const MAX_PER_COURT = 8;

/* ===== Firebase (tus credenciales) ===== */
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
  courts: 0,
  target: null,
  playoffMode: "auto", // none|final|semis|quarters|auto
  players: [],
  playerCourts: {},
  roomId: "",
  isHost: false,
  phase: "groups",     // "groups" | "bracket"
  locked: false,
  round: 1,
  matches: [],
  standings: {},
  lastPlayedRound: {},
  playedOnCourt: {},
  pairHistory: {},     // { "1": Set("a|b") }
  fixtureHistory: {},  // { "1": Set("a|b_vs_c|d") }
  ghostCreatedCourts: {},
  updatedAt: 0
};

/************** DOM **************/
const $ = (s)=>document.querySelector(s);
const courtsSelect = $("#courtsSelect");
const targetSelect = $("#targetSelect");
const playoffSelect = $("#playoffSelect");
const roundLabel = $("#roundLabel"), roundLabel2=$("#roundLabel2");
const playerName = $("#playerName"), addPlayerBtn=$("#addPlayerBtn");
const playersList=$("#playersList"), assignHint=$("#assignHint");
const matchesList=$("#matchesList"), generateBtn=$("#generateBtn");
const progressInline=$("#progressInline");
const tbody=$("#tbody"), resetBtn=$("#resetBtn");
const roomIdTxt=$("#roomIdTxt"), copyRoomBtn=$("#copyRoomBtn");

/************** UTIL **************/
function persistLocal(s=state){
  const safe = {
    ...s,
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
      pairHistory: Object.fromEntries(Object.entries(s.pairHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
      fixtureHistory: Object.fromEntries(Object.entries(s.fixtureHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
    });
  }catch(e){ console.warn("No se pudo cargar estado local:", e); }
}
const pairKey=(a,b)=>[a,b].sort().join("|");
const fixtureKey=(a,b,c,d)=>[pairKey(a,b), pairKey(c,d)].sort().join("_vs_");
const rnd = (arr)=>arr.sort(()=>Math.random()-0.5);
const isGhost = (name)=>/^comodin-\d+$/.test(name);

/************** FIREBASE **************/
function initFirebase(){
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
      pairHistory: Object.fromEntries(Object.entries(state.pairHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
      fixtureHistory: Object.fromEntries(Object.entries(state.fixtureHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
      updatedAt: Date.now()
    };
    state.updatedAt = payload.updatedAt;
    db.ref(`/sesiones/${state.roomId}/state`).set(payload);
    persistLocal(state);
  }, 80);
}
function subscribeCloud(){
  const ref = db.ref(`/sesiones/${state.roomId}/state`);
  ref.on("value", snap=>{
    const cloud = snap.val();
    if(!cloud){ if(state.isHost) pushCloud(); return; }
    if(cloud.updatedAt && cloud.updatedAt <= state.updatedAt) return;
    const incoming = {
      ...cloud,
      pairHistory: Object.fromEntries(Object.entries(cloud.pairHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
      fixtureHistory: Object.fromEntries(Object.entries(cloud.fixtureHistory||{}).map(([c,arr])=>[c, new Set(arr||[])])),
    };
    Object.assign(state, incoming);
    renderAll(); persistLocal(state);
  });
}

/************** LÓGICA DE GRUPOS **************/
const setupOk = ()=> state.courts>0 && Number.isInteger(Number(state.target));
const canEditSetup = ()=> setupOk() && !state.locked && state.phase==="groups";

function ensurePlayerInit(name){
  if(!state.standings[name]) state.standings[name]={pts:0,wins:0,losses:0,played:0,lastRound:0};
  if(!state.lastPlayedRound[name]) state.lastPlayedRound[name]=0;
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
function canAddToCourt(court){
  const buckets = buildCourtBuckets();
  return ((buckets[court]||[]).length) < MAX_PER_COURT;
}
function* combinations4(arr){
  const n=arr.length;
  for(let i=0;i<n-3;i++)
    for(let j=i+1;j<n-2;j++)
      for(let k=j+1;k<n-1;k++)
        for(let l=k+1;l<n;l++)
          yield [arr[i],arr[j],arr[k],arr[l]];
}
const totalPairsOnCourt = (court)=>{
  const n = (buildCourtBuckets()[court]||[]).length;
  return n*(n-1)/2;
};
const theoreticalMatchesOnCourt = (court)=>{
  const pairs = totalPairsOnCourt(court);
  return Math.ceil(pairs/2);
};
const doneMatchesOnCourt = (court)=>{
  return state.matches.filter(m=>m.court===court && m.status==="done" && m._group===true).length;
};
function courtIsComplete(court){
  return doneMatchesOnCourt(court) >= theoreticalMatchesOnCourt(court);
}
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
function choosePairsAvoidingRepeats(players4, courtStr){
  const [p1,p2,p3,p4] = players4;
  const options = [
    [[p1,p2],[p3,p4]],
    [[p1,p3],[p2,p4]],
    [[p1,p4],[p2,p3]],
  ];
  const usedPairs   = state.pairHistory[courtStr]   || new Set();
  const usedFixture = state.fixtureHistory[courtStr]|| new Set();
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
  return options[0];
}
function maybeAddGhostOnGenerate(court){
  const list = (buildCourtBuckets()[court]||[]);
  const ghost = `comodin-${court}`;
  const hasGhost = state.players.includes(ghost);
  if(list.length>=5 && list.length%2===1){
    if(!hasGhost && list.length + 1 <= MAX_PER_COURT){
      state.players.push(ghost);
      ensurePlayerInit(ghost);
      state.playerCourts[ghost]=court;
      state.ghostCreatedCourts[String(court)] = true;
    }
  }
}
function findNextMatchForCourt(court){
  const courtStr = String(court);
  if(courtIsComplete(court)) return null;
  const poolBase = sortedCandidatesForCourt(court);
  if(poolBase.length < 4) return null;
  const pool = poolBase.slice(0, Math.min(8, poolBase.length));
  for(const four of combinations4(pool)){
    const pairs = choosePairsAvoidingRepeats(four, courtStr);
    if(pairs){
      const nextRound = doneMatchesOnCourt(court) + 1;
      return {
        id: crypto.randomUUID(),
        round: nextRound,
        court,
        pairs,
        status: "open",
        scoreA: 0, scoreB: 0,
        _group: true
      };
    }
  }
  return null;
}
function pruneOpenIfCompleted(court){
  if(!courtIsComplete(court)) return;
  state.matches = state.matches.filter(m=> !(m.court===court && m._group && m.status==="open"));
}
function generateMatchesForGroups(){
  if(!setupOk()) return alert("Primero elige canchas y meta (juegos).");
  state.locked = true;
  for(let c=1;c<=state.courts;c++) maybeAddGhostOnGenerate(c);
  for(let c=1;c<=state.courts;c++){
    if(courtIsComplete(c)){ pruneOpenIfCompleted(c); continue; }
    const alreadyOpen = state.matches.some(m=>m.court===c && m._group && m.status==="open");
    if(alreadyOpen) continue;
    const next = findNextMatchForCourt(c);
    if(next) state.matches.push(next);
    if(courtIsComplete(c)) pruneOpenIfCompleted(c);
  }
  let maxR = 1;
  for(let c=1;c<=state.courts;c++){
    const theo = theoreticalMatchesOnCourt(c);
    const done = doneMatchesOnCourt(c);
    const open = state.matches.some(m=>m.court===c && m._group && m.status==="open") ? 1 : 0;
    maxR = Math.max(maxR, Math.min(theo, done + open));
  }
  state.round = maxR;
  pushCloud(); renderAll();
  const allDone = Array.from({length:state.courts},(_,i)=>i+1).every(c=>courtIsComplete(c));
  if(allDone && state.phase==="groups") renderAdvanceToBracketButton();
}

/************** RESULTADOS **************/
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
  const winner = (a>b)? t1 : t2; const loser  = (a>b)? t2 : t1;
  winner.forEach(p=>state.standings[p].wins+=1);
  loser.forEach(p=>state.standings[p].losses+=1);

  if(state.phase==="groups"){
    pruneOpenIfCompleted(m.court);
    if(!courtIsComplete(m.court)){
      const next = findNextMatchForCourt(m.court);
      if(next) state.matches.push(next);
    }
    let maxR = 1;
    for(let c=1;c<=state.courts;c++){
      const theo = theoreticalMatchesOnCourt(c);
      const done = doneMatchesOnCourt(c);
      const open = state.matches.some(mm=>mm.court===c && mm._group && mm.status==="open") ? 1 : 0;
      maxR = Math.max(maxR, Math.min(theo, done + open));
    }
    state.round = maxR;
    const allDone = Array.from({length:state.courts},(_,i)=>i+1).every(c=>courtIsComplete(c));
    if(allDone){ renderAdvanceToBracketButton(); }
  }else{
    advanceBracketIfReady();
  }
  pushCloud(); renderAll();
}

/************** ELIMINATORIA **************/
function globalRanking(){
  // EXCLUIMOS COMODINES del ranking para seeds/bracket
  const names = Object.keys(state.standings).filter(n=>!isGhost(n));
  return names
    .map(name=>({name, ...state.standings[name]}))
    .sort((a,b)=> b.pts - a.pts || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name))
    .map(r=>r.name);
}
function nonGhostPlayers(){
  return state.players.filter(p=>!isGhost(p));
}
function addGhostForBracketIfNeeded(){
  // Si hay exactamente 7 reales y NO hay comodín, ofrecer crear uno.
  const realCount = nonGhostPlayers().length;
  const hasGhost = state.players.some(p=>isGhost(p));
  if(realCount===7 && !hasGhost){
    const ok = confirm("Hay 7 jugadores. ¿Agregar comodín automáticamente?");
    if(ok){
      const ghost = "comodin-1";
      if(!state.players.includes(ghost)){
        state.players.push(ghost);
        ensurePlayerInit(ghost);
        state.playerCourts[ghost] = 1;
      }
    }
  }
}
function makeTeamsFromGroup(group){
  const g = rnd(group.slice());
  const teams=[];
  for(let i=0;i<g.length;i+=2){ if(g[i+1]) teams.push([g[i],g[i+1]]); }
  return teams;
}

/* ==== NUEVO: sembrado “justo” ==== */
// Final (Top-4): 1–3 y 2–4  → un partido
function seedTeamsTop4(rank){
  if(rank.length < 4) return [];
  return [ [rank[0], rank[2]], [rank[1], rank[3]] ];
}
// Semifinales (Top-8):
// Equipos: [1–3], [5–7], [2–4], [6–8]
// Partidos (en orden): (1–3) vs (5–7)  y  (2–4) vs (6–8)
function seedTeamsTop8(rank){
  if(rank.length < 8) return [];
  const top4 = rank.slice(0,4), low4 = rank.slice(4,8);
  return [
    [top4[0], top4[2]],
    [low4[0], low4[2]],
    [top4[1], top4[3]],
    [low4[1], low4[3]],
  ];
}

function createRoundFromTeams(teams, startRound){
  const courts = Math.max(1,state.courts||1);
  const matches=[];
  for(let i=0;i<teams.length;i+=2){
    const t1 = teams[i], t2 = teams[i+1];
    if(!t1 || !t2) continue;
    matches.push({
      id: crypto.randomUUID(),
      round: startRound,
      court: (i % courts) + 1,
      pairs: [t1,t2],
      status: "open",
      scoreA:0, scoreB:0,
      _group:false
    });
  }
  return matches;
}

/* ======= REGLA AUTO (según tu tabla) =======
   - Usa SOLO jugadores reales (excluye comodines)
   - 0–3  => none (bloquea)
   - 4–7  => final (Top-4)
   - 8–11 => semis (Top-8)  [si >=9, fuerzo 2 canchas]
   - 12+  => cuartos (Top-16)
*/
function figurePlayoffModeAuto(realCount){
  if(realCount >= 12) return "quarters";
  if(realCount >= 8)  return "semis";
  if(realCount >= 4)  return "final";
  return "none";
}

function createBracket(){
  if(state.phase!=="groups") return;
  for(let c=1;c<=state.courts;c++){
    if(!courtIsComplete(c)) return alert("Primero termina el americano en todas las canchas.");
  }

  addGhostForBracketIfNeeded(); // 7 jugadores → ofrecer comodín

  const ranked = globalRanking();                 // SOLO reales
  const realCount = ranked.length;
  const autoChoice = figurePlayoffModeAuto(realCount);
  const chosen = state.playoffMode==="auto" ? autoChoice : state.playoffMode;

  if(chosen==="none") return alert("Playoff desactivado o faltan jugadores (mínimo 4 reales).");

  state.matches = [];
  state.phase = "bracket";
  state.locked = true;
  state.round = 1;

  // Si son ≥9 reales, fuerza al menos 2 canchas para que fluya mejor
  if(chosen==="semis" && realCount>=9 && state.courts<2) state.courts = 2;

  let firstRoundTeams=[];
  if(chosen==="final"){
    if(realCount<4) return alert("Se requieren al menos 4 jugadores reales para final.");
    // 1–3 y 2–4
    firstRoundTeams = seedTeamsTop4(ranked);
    // Final directa: dos equipos → 1 partido
  }
  if(chosen==="semis"){
    if(realCount<8) return alert("Se requieren al menos 8 jugadores reales para semifinales.");
    // 4 equipos con sembrado cruzado y justo
    firstRoundTeams = seedTeamsTop8(ranked);
  }
  if(chosen==="quarters"){
    if(realCount<12) return alert("Se requieren al menos 12 jugadores reales para cuartos.");
    // Mantengo la lógica previa (8 equipos); luego el flujo avanza a semis y final
    const sliceTo = Math.min(16, realCount);
    firstRoundTeams = makeTeamsFromGroup(ranked.slice(0, sliceTo));
  }
  if(firstRoundTeams.length<2) return alert("No hay suficientes equipos para iniciar el playoff.");

  const firstMatches = createRoundFromTeams(firstRoundTeams, 1);
  state.matches.push(...firstMatches);
  pushCloud(); renderAll();
}
function advanceBracketIfReady(){
  if(state.phase!=="bracket") return;
  const current = state.matches.filter(m=>m.round===state.round && !m._group);
  if(current.length===0) return;
  if(current.some(m=>m.status!=="done")) return;
  const winners = current.map(m => (m.scoreA>m.scoreB) ? m.pairs[0] : m.pairs[1]);
  if(winners.length===1){ return; } // campeón
  state.round += 1;
  state.matches.push(...createRoundFromTeams(winners, state.round));
}

/************** RENDER **************/
function renderPlayers(){
  playersList.innerHTML="";
  assignHint.style.display = state.courts>1 ? "block":"none";
  const canEdit = canEditSetup();
  playerName.disabled = !canEdit; addPlayerBtn.disabled = !canEdit;

  courtsSelect.value = state.courts ? String(state.courts) : "";
  targetSelect.value = Number.isInteger(Number(state.target)) ? String(state.target) : "";
  playoffSelect.value = state.playoffMode || "auto";
  courtsSelect.disabled = state.locked || state.phase!=="groups";
  targetSelect.disabled = state.locked || state.phase!=="groups";
  playoffSelect.disabled = state.phase!=="groups";

  for(const p of state.players){
    const li=document.createElement("li");
    li.className="badge";
    const courtSel = state.courts>1 ? `
      <select class="pcourt" data-name="${p}" title="Cancha" ${!canEdit?'disabled':''}>
        ${Array.from({length:state.courts},(_,i)=>`<option value="${i+1}" ${ (state.playerCourts[p]||1)===(i+1)?'selected':''}>${i+1}</option>`).join("")}
      </select>` : "";
    li.innerHTML = `<strong>${p}</strong>${courtSel}<span class="x">✕</span>`;
    li.querySelector(".x").addEventListener("click",()=>{ if(!canEdit) return; removePlayer(p); });
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
function removePlayer(name){
  if(state.phase!=="groups") return;
  state.players = state.players.filter(x=>x!==name);
  delete state.playerCourts[name]; delete state.standings[name];
  pushCloud(); renderAll();
}
function renderProgressInline(){
  const parts=[];
  for(let c=1;c<=Math.max(1,state.courts||1);c++){
    const theo = theoreticalMatchesOnCourt(c);
    const done = doneMatchesOnCourt(c);
    parts.push(`Cancha ${c}: ${done}/${theo}`);
  }
  progressInline.textContent = parts.join(" · ");
}
function renderAdvanceToBracketButton(){
  if(state.phase!=="groups") return;
  const existing = $("#advanceBracketBtn"); if(existing) return;
  const btn = document.createElement("button");
  btn.id = "advanceBracketBtn";
  btn.className = "primary";
  btn.style = "margin:8px 0;width:100%";
  const realCount = nonGhostPlayers().length;
  const autoMode = figurePlayoffModeAuto(realCount);
  const modeText = state.playoffMode==="auto"
    ? (autoMode==="final"?"Final":"semis"===autoMode?"Semifinales":"quarters"===autoMode?"Cuartos":"—")
    : (state.playoffMode==="final"?"Final":state.playoffMode==="semis"?"Semifinales":state.playoffMode==="quarters"?"Cuartos":"—");
  btn.textContent = `Crear eliminatoria (${modeText})`;
  btn.addEventListener("click", createBracket);
  matchesList.prepend(btn);
}
function renderMatches(){
  matchesList.innerHTML="";
  renderProgressInline();

  if(state.phase==="groups"){
    for(let c=1;c<=Math.max(1,state.courts||1);c++){
      if(courtIsComplete(c)){
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
    : state.matches.filter(m=> m.round===state.round && !m._group).sort((a,b)=>a.court-b.court);

  if(state.phase==="groups"){
    const allDone = Array.from({length:state.courts},(_,i)=>i+1).every(c=>courtIsComplete(c));
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
      <div class="muted">${state.phase==="groups" ? `Cancha ${m.court}` : `Eliminatoria`} · ${m.status==="open"?"En juego":"Terminado"}</div>
      <div class="teams">
        <div>${teamHtml(t1)}</div>
        <div class="vs">VS</div>
        <div>${teamHtml(t2)}</div>
      </div>
      <div class="row">
        <span class="muted">Marcador (a ${state.target ?? "?"}):</span>
        <input type="number" min="0" value="${m.scoreA}" ${m.status==="done"?"disabled":""} class="sA" style="width:60px"/>
        <span>-</span>
        <input type="number" min="0" value="${m.scoreB}" ${m.status==="done"?"disabled":""} class="sB" style="width:60px"/>
        <button class="primary save" ${m.status==="done"?"disabled":""} style="margin-left:8px;">Guardar resultado</button>
        ${m.status==="done"?`<span class="badge" style="margin-left:8px;border-color:#345">Final: ${m.scoreA} - ${m.scoreB}</span>`:""}
      </div>`;
    el.querySelector(".save").addEventListener("click",()=>{
      const sA=el.querySelector(".sA").value; const sB=el.querySelector(".sB").value;
      saveResult(m.id, sA, sB);
    });
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
    tr.innerHTML=`<td>${idx+1}</td><td>${r.name}</td><td>${r.pts}</td>
      <td>${r.wins}</td><td>${r.losses}</td><td>${r.played}</td><td>${r.lastRound||0}</td>`;
    tbody.appendChild(tr);
  });
}
function renderAll(){
  roundLabel.textContent= String(state.round||1);
  roundLabel2.textContent= String(state.round||1);
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
    state.ghostCreatedCourts = {};
    pushCloud(); renderAll();
  });

  targetSelect.addEventListener("change", ()=>{
    if(state.phase!=="groups") return;
    const v = Number(targetSelect.value);
    state.target = Number.isFinite(v) ? v : null;
    pushCloud(); renderAll();
  });

  playoffSelect.addEventListener("change", ()=>{
    if(state.phase!=="groups") return;
    state.playoffMode = playoffSelect.value || "auto";
    pushCloud();
  });

  addPlayerBtn.addEventListener("click", ()=>{
    if(!setupOk()) return alert("Primero elige canchas y meta (juegos).");
    const n=(playerName.value||"").trim();
    if(!n) return;
    if(state.players.includes(n)) return alert("Ese nombre ya existe.");
    if(!canAddToCourt(1)) return alert("Cancha 1 llegó al máximo de 8 jugadores.");
    state.players.push(n);
    ensurePlayerInit(n);
    state.playerCourts[n]=1;
    playerName.value="";
    pushCloud(); renderAll();
  });
  playerName.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ addPlayerBtn.click(); } });

  generateBtn.addEventListener("click", ()=>{ if(state.phase==="groups") generateMatchesForGroups(); });

  resetBtn.addEventListener("click", ()=>{
    if(!confirm("¿Seguro que deseas reiniciar todo?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, {
      courts: 0, target: null, playoffMode:"auto",
      players:[], playerCourts:{},
      roomId: state.roomId, isHost: state.isHost,
      phase:"groups", locked:false, round:1,
      matches:[], standings:{},
      lastPlayedRound:{}, playedOnCourt:{},
      pairHistory:{}, fixtureHistory:{},
      ghostCreatedCourts:{},
      updatedAt: Date.now()
    });
    pushCloud(); renderAll();
  });
});
