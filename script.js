/************** CONFIG **************/
const STORAGE_KEY  = "padel.americano.state.v4";

/************** ESTADO **************/
const state = {
  // básico
  players: [],
  playerCourts: {},      // { nombre: cancha } (si courts>1)
  courts: 1,
  target: 6,             // meta de juegos para ganar

  // fases
  phase: "groups",       // "groups" | "bracket"
  locked: false,         // true desde que se genera el primer partido

  // rondas
  round: 1,              // etiqueta global (mayor de las canchas)
  courtRound: {},        // { "1": 1, "2": 1, ... } ronda por cancha
  courtComplete: {},     // { "1": bool, ... }

  // partidos y tablas
  matches: [],           // {id, round, court, pairs, status:'open'|'done', scoreA, scoreB}
  standings: {},         // { jugador: {pts,wins,losses,played,lastRound} }

  // historial (sólo lo YA JUGADO para “no repetir” real)
  playedWith: {},        // { jugador: Set() }
  playedAgainst: {},     // { jugador: Set() }

  // evitar repetir parejas y fixtures en la misma cancha
  pairHistory: {},       // { "1": Set("A|B",...) }  // parejas jugadas en esa cancha
  fixtureHistory: {},    // { "1": Set("A|B_vs_C|D",...) } partidos jugados en esa cancha

  // métricas por equilibrio
  lastPlayedRound: {},   // { jugador: ronda global última vez que jugó }
  playedOnCourt: {},     // { jugador: { "1": n, "2": n } } recuento por cancha
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

/************** PERSISTENCIA **************/
const serSets = (obj)=>Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[k, Array.from(v||[])]));
const revSets = (obj)=>Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[k, new Set(Array.isArray(v)?v:Object.keys(v||{}))]));

function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...state,
    playedWith: serSets(state.playedWith),
    playedAgainst: serSets(state.playedAgainst),
    pairHistory: Object.fromEntries(Object.entries(state.pairHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
    fixtureHistory: Object.fromEntries(Object.entries(state.fixtureHistory||{}).map(([c,set])=>[c, Array.from(set||[])])),
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

    state.phase = s.phase||"groups";
    state.locked = !!s.locked;

    state.round = s.round||1;
    state.courtRound = s.courtRound||{};
    state.courtComplete = s.courtComplete||{};

    state.matches = s.matches||[];
    state.standings = s.standings||{};

    state.playedWith = revSets(s.playedWith);
    state.playedAgainst = revSets(s.playedAgainst);
    state.pairHistory = Object.fromEntries(Object.entries(s.pairHistory||{}).map(([c,arr])=>[c, new Set(arr||[])]));
    state.fixtureHistory = Object.fromEntries(Object.entries(s.fixtureHistory||{}).map(([c,arr])=>[c, new Set(arr||[])]));
    state.lastPlayedRound = s.lastPlayedRound||{};
    state.playedOnCourt = s.playedOnCourt||{};
  }catch(e){ console.warn("No se pudo cargar estado:", e); }
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

function canEditSetup(){ return !state.locked && state.phase==="groups"; }

function addPlayer(name){
  if(!canEditSetup()) return alert("No se puede agregar: el americano ya inició.");
  const n=(name||"").trim();
  if(!n) return alert("Escribe un nombre.");
  if(state.players.includes(n)) return alert("Ese nombre ya existe.");
  state.players.push(n);
  ensurePlayerInit(n);
  persist(); renderAll();
}
function removePlayer(name){
  if(!canEditSetup()) return alert("No se puede eliminar: el americano ya inició.");
  state.players = state.players.filter(p=>p!==name);
  delete state.standings[name];
  delete state.playedWith[name]; delete state.playedAgainst[name];
  delete state.playerCourts[name]; delete state.lastPlayedRound[name];
  delete state.playedOnCourt[name];
  state.matches = state.matches.filter(m=> m.status==="done" || !m.pairs.flat().includes(name));
  persist(); renderAll();
}

function buildCourtBuckets(){
  const buckets={}; for(let c=1;c<=state.courts;c++) buckets[c]=[];
  for(const p of state.players){
    const c = Math.min(Math.max(1, state.playerCourts[p]||1), state.courts);
    buckets[c].push(p);
  }
  return buckets;
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
  // Elegimos 4 priorizando quienes menos han jugado en ESTA cancha y quienes descansaron más
  const avail = availablePlayersByCourt(court);
  if(avail.length < 4) return null;

  const scored = avail.map(p=>{
    const playedHere = (state.playedOnCourt[p]?.[court]||0);
    const last = state.lastPlayedRound[p] ?? -1;
    return {p, score: playedHere*10 + (last)}; // menos es mejor
  }).sort((a,b)=>a.score-b.score).map(x=>x.p);

  return scored.slice(0,4);
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

    // no repetir partido ya jugado
    if(usedFixture.has(fk)) score += 1000;
    // no repetir pareja ya jugada
    if(usedPairs.has(pk1)) score += 200;
    if(usedPairs.has(pk2)) score += 200;

    // evitar repetir compañero y rivales
    score += (state.playedWith[a]?.has(b)?20:0) + (state.playedWith[c]?.has(d)?20:0);
    [ [a,c],[a,d],[b,c],[b,d] ].forEach(([x,y])=>{
      if(state.playedAgainst[x]?.has(y)) score += 5;
    });

    if(score<bestScore){ bestScore=score; best=[[a,b],[c,d]]; }
  }
  if(!best) return null;
  // si igualmente todo está repetido (puntuación muy alta), indicamos que no hay fixture nuevo
  const pkCheck = fixtureKey(best[0][0],best[0][1],best[1][0],best[1][1]);
  const already = (state.fixtureHistory[court]||new Set()).has(pkCheck);
  return already ? null : best;
}

function markCourtCompleteIfStuck(court){
  // Si no hay suficientes disponibles o todas las combinaciones ya existen, marcamos completa
  const avail = availablePlayersByCourt(court);
  if(avail.length < 4){ state.courtComplete[court]=true; return true; }

  // Prueba rápida: intenta formar un conjunto; si no hay, completa
  const pick = chooseFourForCourt(court);
  if(!pick){ state.courtComplete[court]=true; return true; }
  const pairs = choosePairsForCourt(pick, String(court));
  if(!pairs){ state.courtComplete[court]=true; return true; }

  return false;
}

function generateMatchesForGroups(){
  state.locked = true; // bloquear setup desde el primer intento
  // crea 1 partido por cancha si es posible
  for(let c=1;c<=state.courts;c++){
    const court = String(c);
    if(state.courtComplete[court]) continue;
    const alreadyOpen = state.matches.some(m=>m.court===c && m.round===state.courtRound[court] && m.status==="open");
    if(alreadyOpen) continue;

    if(markCourtCompleteIfStuck(court)) continue;

    const four = chooseFourForCourt(court);
    const pairs = choosePairsForCourt(four, court);
    if(!pairs){ state.courtComplete[court]=true; continue; }

    // abrir partido
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

  // ronda global = max de rondas por cancha
  const maxRound = Math.max(1, ...Object.values(state.courtRound).map(x=>x||1));
  state.round = maxRound;
  persist(); renderAll();

  // si TODAS las canchas completas => ofrecer pasar a eliminatoria
  const allDone = Array.from({length:state.courts},(_,i)=>String(i+1)).every(k=>state.courtComplete[k]);
  if(allDone && state.phase==="groups"){
    renderAdvanceToBracketButton();
  }
}

/************** GUARDADO RESULTADOS **************/
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

  function applyTeam(team, gamesWon, gamesLost){
    for(const p of team){
      ensurePlayerInit(p);
      state.standings[p].pts += gamesWon;
      state.standings[p].played += 1;
      state.standings[p].lastRound = state.round;
      state.lastPlayedRound[p] = state.round;
      state.playedOnCourt[p][courtKey] = (state.playedOnCourt[p][courtKey]||0) + 1;
    }
  }
  applyTeam(t1, a, b);
  applyTeam(t2, b, a);
  winner.forEach(p=>state.standings[p].wins+=1);
  loser.forEach(p=>state.standings[p].losses+=1);

  // registrar parejas y fixture JUGADOS
  const addPair = (x,y)=>{ if(!state.pairHistory[courtKey]) state.pairHistory[courtKey]=new Set(); state.pairHistory[courtKey].add(pairKey(x,y)); };
  addPair(t1[0], t1[1]); addPair(t2[0], t2[1]);
  if(!state.fixtureHistory[courtKey]) state.fixtureHistory[courtKey]=new Set();
  state.fixtureHistory[courtKey].add(fixtureKey(t1[0],t1[1],t2[0],t2[1]));
  [t1[0],t1[1]].forEach(p=>{ state.playedAgainst[p].add(t2[0]); state.playedAgainst[p].add(t2[1]); state.playedWith[p].add(t1[0]===p?t1[1]:t1[0]); });
  [t2[0],t2[1]].forEach(p=>{ state.playedAgainst[p].add(t1[0]); state.playedAgainst[p].add(t1[1]); state.playedWith[p].add(t2[0]===p?t2[1]:t2[0]); });

  // avanza ronda de esa cancha
  state.courtRound[courtKey] = (state.courtRound[courtKey]||1) + 1;
  state.round = Math.max(state.round, state.courtRound[courtKey]);

  persist();
  renderAll();

  // intenta generar siguiente en esa cancha; si ya no hay fixture nuevo, se marca completa
  if(!markCourtCompleteIfStuck(courtKey)){
    generateMatchesForGroups();
  }else{
    // si todas completas => botón para eliminatoria
    const allDone = Array.from({length:state.courts},(_,i)=>String(i+1)).every(k=>state.courtComplete[k]);
    if(allDone && state.phase==="groups"){
      renderAdvanceToBracketButton();
    }
  }
}

/************** BRACKET **************/
function pickBracketPlayers(){
  // Toma el top equilibrado por cancha:
  // - tomamos top K por cancha donde K = 2 (cuartos) * #canchas → produce 4,8,12...
  const perCourt = 2; // puedes subirlo si quieres semifinal directa con 1 cancha
  const K = perCourt * state.courts;

  // ranking por cancha
  const buckets = buildCourtBuckets();
  const byCourtSorted = {};
  for(let c=1;c<=state.courts;c++){
    const court = String(c);
    const players = (buckets[c]||[]);
    const rows = players.map(name=>({name, ...state.standings[name], court:c}))
      .sort((a,b)=> b.pts - a.pts || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
    byCourtSorted[court] = rows;
  }

  // toma los primeros perCourt de cada cancha (si hay menos, toma los que haya)
  const picked = [];
  for(let c=1;c<=state.courts;c++){
    const court = String(c);
    picked.push(...(byCourtSorted[court]||[]).slice(0, perCourt).map(r=>r.name));
  }

  // si sobra/ falta para potencia de 2, ajustamos a mayor potencia de 2 <= length
  const pow2 = [2,4,8,16,32].filter(x=>x<=picked.length).pop() || 2;
  return picked.slice(0, pow2);
}

function createBracket(){ // simple: 1 vs último, 2 vs penúltimo, etc.
  const players = pickBracketPlayers();
  if(players.length < 4){ alert("No hay suficientes jugadores para eliminatoria."); return; }

  state.phase = "bracket";
  // limpiar abiertos
  state.matches = state.matches.filter(m=>m.status==="done");
  // bracket ronda 1
  const pairs = [];
  for(let i=0;i<players.length/2;i++){
    const a = players[i];
    const b = players[players.length-1-i];
    pairs.push([a,b]);
  }
  // cada partido del bracket es singles *representado* como dobles 1v1 con huecos
  // o si quieres, emparejamos en dobles de 2 en 2 (rápido):
  const matches = [];
  for(let i=0;i<pairs.length;i+=2){
    const t1 = [pairs[i][0], pairs[i][1]];
    const t2 = [pairs[i+1][0], pairs[i+1][1]];
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
  state.courtRound = {}; state.courtComplete = {};
  state.matches.push(...matches);
  persist(); renderAll();
}

/************** RENDER **************/
function renderPlayers(){
  playersList.innerHTML="";
  assignHint.style.display = state.courts>1 ? "block":"none";

  // bloquear inputs si ya inició
  playerName.disabled = !canEditSetup();
  addPlayerBtn.disabled = !canEditSetup();
  courtsSelect.disabled = !canEditSetup();
  targetSelect.disabled = !canEditSetup();

  for(const p of state.players){
    const li=document.createElement("li");
    li.className="badge";
    const courtSel = state.courts>1 ? `
      <select class="pcourt" data-name="${p}" title="Cancha" ${!canEditSetup()?'disabled':''}>
        ${Array.from({length:state.courts},(_,i)=>`<option value="${i+1}" ${ (state.playerCourts[p]||1)===(i+1)?'selected':''}>${i+1}</option>`).join("")}
      </select>` : "";
    li.innerHTML = `<div style="display:flex;gap:8px;align-items:center;">
        <strong>${p}</strong>${courtSel}
      </div>
      <span class="x" title="Eliminar" ${!canEditSetup()?'style="opacity:.4;pointer-events:none"':''}>✕</span>`;
    li.querySelector(".x").addEventListener("click",()=>removePlayer(p));
    if(state.courts>1 && canEditSetup()){
      li.querySelector(".pcourt").addEventListener("change",(e)=>{
        state.playerCourts[p]=Number(e.target.value); persist();
      });
    }
    playersList.appendChild(li);
  }
}

function renderAdvanceToBracketButton(){
  // pinta botón grande cuando todas las canchas completaron grupos
  const existing = $("#advanceBracketBtn");
  if(existing) return;
  const btn = document.createElement("button");
  btn.id = "advanceBracketBtn";
  btn.className = "primary";
  btn.style = "margin:10px 0";
  btn.textContent = "Crear eliminatoria";
  btn.addEventListener("click", createBracket);
  matchesList.prepend(btn);
}

function renderMatches(){
  matchesList.innerHTML="";
  // botón generar (grupos) o texto según fase
  const headerRow = document.createElement("div");
  if(state.phase==="groups"){
    const gbtn = document.createElement("button");
    gbtn.className="primary";
    gbtn.textContent="Generar partidos";
    gbtn.addEventListener("click", generateMatchesForGroups);
    headerRow.appendChild(gbtn);
    matchesList.appendChild(headerRow);
  }else{
    const tag = document.createElement("div");
    tag.className="muted";
    tag.textContent="Fase: Eliminatoria";
    matchesList.appendChild(tag);
  }

  // etiqueta de canchas completas
  for(let c=1;c<=state.courts;c++){
    const court = String(c);
    if(state.phase==="groups" && state.courtComplete[court]){
      const note = document.createElement("div");
      note.className = "muted";
      note.textContent = `Cancha ${c}: americano completado`;
      matchesList.appendChild(note);
    }
  }

  const currentRound = state.phase==="groups" ? Math.max(1, ...Object.values(state.courtRound).map(x=>x||1)) : state.round;
  const matches = state.matches
    .filter(m=> state.phase==="groups" ? (m.round=== (state.courtRound[String(m.court)]||1)) : (m.round===state.round))
    .sort((a,b)=>a.court-b.court);

  if(matches.length===0){
    const hint=document.createElement("div");
    hint.className="muted";
    hint.textContent= state.phase==="groups"
      ? "No hay partidos abiertos en esta ronda. Pulsa “Generar partidos”."
      : "Partidos de eliminatoria listos.";
    matchesList.appendChild(hint);
    return;
  }

  for(const m of matches){
    const el=document.createElement("div");
    el.className="match";
    const [t1,t2]=m.pairs;
    el.innerHTML=`
      <div class="meta">${state.phase==="groups" ? `Cancha ${m.court}` : `Eliminatoria`} · ${m.status==="open"?"En juego":"Terminado"}</div>
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
  // ronda global = max rondas canchas en grupos; en bracket usa state.round
  const maxRound = Math.max(1, ...Object.values(state.courtRound).map(x=>x||1));
  roundLabel.textContent= String(state.phase==="groups" ? maxRound : state.round);
  roundLabel2.textContent=roundLabel.textContent;

  courtsSelect.value=String(state.courts);
  targetSelect.value=String(state.target);

  // deshabilitar UI según lock
  courtsSelect.disabled = !canEditSetup();
  targetSelect.disabled = !canEditSetup();
  addPlayerBtn.disabled = !canEditSetup();
  playerName.disabled = !canEditSetup();

  renderPlayers();
  renderMatches();
  renderTable();
}

/************** EVENTOS **************/
document.addEventListener("DOMContentLoaded", ()=>{
  load();
  // valores iniciales por cancha
  for(let c=1;c<=state.courts;c++){
    const k=String(c);
    if(state.courtRound[k]==null) state.courtRound[k]=1;
    if(state.courtComplete[k]==null) state.courtComplete[k]=false;
  }
  state.players.forEach(ensurePlayerInit);
  persist(); renderAll();

  courtsSelect.addEventListener("change", ()=>{
    if(!canEditSetup()) return alert("No puedes cambiar canchas: el americano ya inició.");
    state.courts = Number(courtsSelect.value);
    state.pairHistory = {}; state.fixtureHistory = {};
    state.courtRound = {}; state.courtComplete = {};
    for(let c=1;c<=state.courts;c++){ state.courtRound[String(c)]=1; state.courtComplete[String(c)]=false; }
    for(const p of state.players){ state.playerCourts[p]=Math.min(Math.max(1,state.playerCourts[p]||1), state.courts); }
    persist(); renderAll();
  });

  targetSelect.addEventListener("change", ()=>{
    if(!canEditSetup()) return alert("No puedes cambiar la meta: el americano ya inició.");
    state.target = Number(targetSelect.value);
    persist(); renderAll();
  });

  addPlayerBtn.addEventListener("click", ()=>{ addPlayer(playerName.value); playerName.value=""; playerName.focus(); });
  playerName.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ addPlayer(playerName.value); playerName.value=""; } });

  generateBtn.addEventListener("click", ()=>{ state.phase==="groups" ? generateMatchesForGroups() : null; });

  resetBtn.addEventListener("click", ()=>{
    if(!confirm("¿Seguro que deseas reiniciar todo?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, {
      players:[], playerCourts:{}, courts:1, target:6,
      phase:"groups", locked:false,
      round:1, courtRound:{ "1":1 }, courtComplete:{ "1":false },
      matches:[],
      standings:{}, playedWith:{}, playedAgainst:{},
      pairHistory:{}, fixtureHistory:{},
      lastPlayedRound:{}, playedOnCourt:{}
    });
    persist(); renderAll();
  });
});
