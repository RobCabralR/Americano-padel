// ===== Estado =====
const state = {
  room: location.hash.slice(1) || randomCode(),
  courts: 1,
  goal: 3,
  playoff: 'auto', // 'auto' | 'semis' | 'quarters' | 'final'
  round: 1,
  players: [],       // { id, name, court:1|2, pts, won, lost, games, lastRound }
  matches: [],       // partidos abiertos de la ronda
  history: [],       // partidos cerrados para ranking
};

function randomCode(){ return Math.random().toString(36).slice(2,7); }

// ===== DOM =====
const roomCodeEl   = document.getElementById('roomCode');
const copyRoomBtn  = document.getElementById('copyRoom');

const courtsSel    = document.getElementById('courtsSelect');
const goalSel      = document.getElementById('goalSelect');
const playoffSel   = document.getElementById('playoffSelect');

const roundNoEl    = document.getElementById('roundNo');
const roundHdrEl   = document.getElementById('roundHdr');

const playerInput  = document.getElementById('playerInput');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const playersList  = document.getElementById('playersList');

const genBtn       = document.getElementById('genBtn');
const statusStrip  = document.getElementById('statusStrip');
const matchesBox   = document.getElementById('matches');

const rankWrap     = document.getElementById('rankWrap');
const resetBtn     = document.getElementById('resetBtn');

// ===== Inicialización =====
init();
function init(){
  if(!location.hash) location.hash = '#'+state.room;
  roomCodeEl.textContent = state.room;

  courtsSel.value  = String(state.courts);
  goalSel.value    = String(state.goal);
  playoffSel.value = state.playoff;

  bindUI();
  renderAll();
}

function bindUI(){
  copyRoomBtn.onclick = () => {
    navigator.clipboard.writeText(location.href);
    copyRoomBtn.textContent = 'Copiado';
    setTimeout(()=>copyRoomBtn.textContent='Copiar',900);
  };

  courtsSel.onchange  = () => { state.courts = +courtsSel.value; state.round = 1; state.matches=[]; renderAll(); };
  goalSel.onchange    = () => { state.goal   = +goalSel.value;   renderAll(); };
  playoffSel.onchange = () => { state.playoff= playoffSel.value; renderAll(); };

  addPlayerBtn.onclick = addPlayer;
  playerInput.onkeydown = (e)=>{ if(e.key==='Enter') addPlayer(); };

  genBtn.onclick = generateMatches;

  resetBtn.onclick = () => {
    if(!confirm('¿Reiniciar todo?')) return;
    state.players.length = 0;
    state.matches.length = 0;
    state.history.length = 0;
    state.round = 1;
    renderAll();
  };
}

// ===== Jugadores =====
function addPlayer(){
  const name = playerInput.value.trim();
  if(!name) return;
  if(state.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return alert('Ya existe ese nombre');
  state.players.push({ id: crypto.randomUUID(), name, court:1, pts:0, won:0, lost:0, games:0, lastRound:0 });
  playerInput.value='';
  renderPlayers();
  renderRanks();
}

function renderPlayers(){
  playersList.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.players.forEach(p=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="left">
        <span class="tag">${p.name}</span>
        <label class="select small">
          <span class="muted"> ${state.courts>1?'Cancha':''} </span>
          <select data-id="${p.id}">
            <option value="1" ${p.court===1?'selected':''}>1</option>
            <option value="2" ${p.court===2?'selected':''} ${state.courts===1?'disabled':''}>2</option>
          </select>
        </label>
      </div>
      <button class="danger" data-del="${p.id}">x</button>
    `;
    frag.appendChild(li);
  });
  playersList.appendChild(frag);

  // eventos
  playersList.querySelectorAll('select').forEach(sel=>{
    sel.onchange = (e)=>{
      const id = e.target.dataset.id;
      const pj = state.players.find(x=>x.id===id);
      pj.court = +e.target.value;
      renderRanks();
    };
  });
  playersList.querySelectorAll('button[data-del]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.del;
      state.players = state.players.filter(p=>p.id!==id);
      renderAll();
    };
  });
}

// ===== Utilidades de ranking =====
function getPlayersByCourt(c){ return state.players.filter(p=>p.court===c); }

function statsFromHistory(court){
  // devuelve mapa id -> { pts, won, lost, games, lastRound }
  const map = new Map();
  state.players.forEach(p=>{
    if(court && p.court!==court) return;
    map.set(p.id,{ pts:0, won:0, lost:0, games:0, lastRound:0, name:p.name, id:p.id, court:p.court });
  });

  state.history.forEach(h=>{
    if(court && h.court!==court) return;
    const g = h.goal; // meta
    const [a1,a2,b1,b2] = h.teams; // ids
    const as = h.scoreA, bs = h.scoreB;

    const ids = [a1,a2,b1,b2];
    ids.forEach(id=>{
      const m = map.get(id);
      if(!m) return;
      m.games += 1;
      m.lastRound = Math.max(m.lastRound, h.round);
      // puntos = as o bs según equipo
      const sum = (id===a1 || id===a2) ? as : bs;
      m.pts += sum;
    });

    // victoria/derrota por partido
    const aWin = as>bs;
    [a1,a2].forEach(id=>{ const m=map.get(id); if(m){ aWin?m.won++:m.lost++; }});
    [b1,b2].forEach(id=>{ const m=map.get(id); if(m){ aWin?m.lost++:m.won++; }});
  });

  return map;
}

function buildRank(court){
  const map = statsFromHistory(court);
  const arr = Array.from(map.values());
  // orden: pts desc, won desc, games desc (menor), lastRound desc
  arr.sort((x,y)=>{
    if(y.pts!==x.pts) return y.pts-x.pts;
    if(y.won!==x.won) return y.won-x.won;
    if(x.games!==y.games) return x.games-y.games;
    return y.lastRound-x.lastRound;
  });
  return arr;
}

function renderRanks(){
  rankWrap.innerHTML = '';
  const makeTable = (title, rows) => {
    const card = document.createElement('div');
    card.className = 'rank-card';
    card.innerHTML = `
      <div class="rank-title"><h3>${title}</h3></div>
      <table class="table">
        <thead><tr><th>#</th><th>Jugador</th><th>Pts (games)</th><th>JG</th><th>JP</th><th>Partidos</th><th>Últ. ronda</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
    const tb = card.querySelector('tbody');
    rows.forEach((r,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${r.pts}</td>
        <td>${r.won}</td>
        <td>${r.lost}</td>
        <td>${r.games}</td>
        <td>${r.lastRound}</td>
      `;
      tb.appendChild(tr);
    });
    rankWrap.appendChild(card);
  };

  if(state.courts===1){
    makeTable('General', buildRank(0)); // 0 => todas
  }else{
    makeTable('Cancha 1', buildRank(1));
    makeTable('Cancha 2', buildRank(2));
  }
}

// ===== Partidos (Americano) =====
// Nota: esta parte asume que ya tienes tu generador de partidos por cancha.
// Aquí dejo una versión simple de “siguiente partido” por cancha,
// tal cual la venías usando: abre 1 partido por cancha simultáneo.

function generateMatches(){
  // si ya no hay partidos abiertos y completaste el americano por cancha,
  // ofrece crear eliminatoria según configuración
  if(state.matches.some(m=>!m.closed)) return alert('Termina los partidos abiertos antes de generar nuevos.');

  const report = [];
  for(let c=1;c<=state.courts;c++){
    const p = getPlayersByCourt(c);
    if(p.length<4){ report.push(`Cancha ${c}: mínimo 4 jugadores`); continue; }

    // ¿quedan enfrentamientos pendientes? si no, marca completado
    if(isCourtDone(c,p)){ report.push(`Cancha ${c}: americano completado`); continue; }

    const next = nextPairForCourt(c,p);
    if(!next){ report.push(`Cancha ${c}: sin próximos partidos`); continue; }

    // crea partido
    state.matches.push({
      id: crypto.randomUUID(),
      court: c,
      round: state.round,
      goal: state.goal,
      teams: next,  // [a1,a2,b1,b2] IDs
      scoreA: 0,
      scoreB: 0,
      closed: false,
      playoff: null, // reservado para eliminatoria
    });
  }

  // si ninguna cancha generó partido y ambas están completas => botón de eliminatoria
  renderAll(report.join(' · '));
}

function isCourtDone(c,p){
  // criterio: todos jugaron con todos (parejas completas)
  // total parejas = C(n,2). En americano por parejas con rotación
  // usamos un límite práctico de partidos teóricos = n*(n-1)/2
  const n = p.length;
  const theoretical = n*(n-1)/2;
  const played = state.history.filter(h=>h.court===c).length;
  return played >= theoretical;
}

function nextPairForCourt(c,p){
  // toma los 4 que menos han jugado entre sí recientemente
  // (heurística simple para no repetir demasiado)
  const ids = p.map(x=>x.id);

  // si hay histórico, evita repetir el último emparejamiento
  const last = state.history.filter(h=>h.court===c).slice(-1)[0];
  function notRecent(pair){
    if(!last) return true;
    const set = new Set([last.teams[0],last.teams[1],last.teams[2],last.teams[3]]);
    return !(set.has(pair[0]) && set.has(pair[1]));
  }

  // genera todas las parejas posibles
  const pairs = [];
  for(let i=0;i<ids.length;i++){
    for(let j=i+1;j<ids.length;j++){
      const pr = [ids[i],ids[j]];
      if(notRecent(pr)) pairs.push(pr);
    }
  }
  if(pairs.length<2) return null;

  // arma 2 parejas disjuntas
  pairs.sort(()=>Math.random()-.5);
  for(let a=0;a<pairs.length;a++){
    for(let b=a+1;b<pairs.length;b++){
      const pa = new Set(pairs[a]);
      const pb = new Set(pairs[b]);
      if([...pa].every(x=>!pb.has(x))){
        return [pairs[a][0],pairs[a][1], pairs[b][0],pairs[b][1]];
      }
    }
  }
  return null;
}

// Renderiza tarjetas de partidos abiertos
function renderMatches(){
  matchesBox.innerHTML = '';
  const open = state.matches.filter(m=>!m.closed);
  if(open.length===0){
    const c1done = state.courts>=1 && isCourtDone(1,getPlayersByCourt(1));
    const c2done = state.courts>=2 && isCourtDone(2,getPlayersByCourt(2));
    if(state.courts===1 && c1done){
      statusStrip.textContent = 'Americano completado. Usa “Crear eliminatoria” cuando estés listo.';
      statusStrip.onclick = ()=> createEliminatoriaAuto();
    }else if(state.courts===2 && c1done && c2done){
      statusStrip.textContent = 'Cancha 1 y Cancha 2 completadas. “Crear eliminatoria (por canchas)”.';
      statusStrip.onclick = ()=> createEliminatoriaAuto();
    }else{
      statusStrip.textContent = 'No hay partidos abiertos en esta ronda. Pulsa “Generar partidos”.';
      statusStrip.onclick = null;
    }
    return;
  }
  statusStrip.textContent = '';
  statusStrip.onclick = null;

  open.forEach(m=>{
    const el = document.createElement('div');
    el.className = 'card';
    const [a1,a2,b1,b2] = m.teams.map(id=>state.players.find(p=>p.id===id)?.name||'?');
    el.innerHTML = `
      <div class="meta">Cancha ${m.court} · En juego</div>
      <div class="vs">
        <span class="tag">${a1}</span><span class="tag">${a2}</span>
        <span>vs</span>
        <span class="tag">${b1}</span><span class="tag">${b2}</span>

        <div class="mark">
          <span class="muted">Marcador (a ${m.goal}):</span>
          <input class="score" value="${m.scoreA}" data-id="${m.id}" data-k="A" />
          <span> - </span>
          <input class="score" value="${m.scoreB}" data-id="${m.id}" data-k="B" />
          <button class="primary" data-save="${m.id}">Guardar resultado</button>
        </div>
      </div>
    `;
    matchesBox.appendChild(el);
  });

  matchesBox.querySelectorAll('input.score').forEach(inp=>{
    inp.oninput = ()=> {
      const m = state.matches.find(x=>x.id===inp.dataset.id);
      const v = Math.max(0, Math.min(99, +inp.value||0));
      if(inp.dataset.k==='A') m.scoreA = v; else m.scoreB = v;
    };
  });

  matchesBox.querySelectorAll('button[data-save]').forEach(btn=>{
    btn.onclick = ()=> {
      const m = state.matches.find(x=>x.id===btn.dataset.save);
      if(m.scoreA===m.scoreB) return alert('Debe haber un ganador');
      if(m.scoreA>state.goal || m.scoreB>state.goal) return alert('Marcador inválido');
      // cierra partido
      m.closed = true;
      state.history.push({
        court: m.court,
        round: state.round,
        goal: m.goal,
        teams: m.teams.slice(),
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        playoff: m.playoff || null,
      });
      // si ya no quedan abiertos, avanza ronda
      if(!state.matches.some(x=>!x.closed)){
        state.round++;
        roundNoEl.textContent = state.round;
        roundHdrEl.textContent = state.round;
      }
      renderAll();
    };
  });
}

// ===== Eliminatorias por cancha (sembrado cruzado) =====
function createEliminatoriaAuto(){
  if(state.courts===1){
    // modo 1 cancha: sigue tu lógica actual (Top-8 / Top-4 según estado.playoff)
    return createElimsOneCourt();
  }

  // 2 canchas: tomar Top-N por cancha y sembrar cruzado
  const A = buildRank(1); // cancha 1
  const B = buildRank(2); // cancha 2

  // decide tamaño del cuadro automáticamente si está en 'auto'
  let mode = state.playoff;
  const total = A.length + B.length;
  if(mode==='auto'){
    if(total >= 12) mode = 'quarters';
    else if(total >= 8) mode = 'semis';
    else mode = 'final';
  }

  let ties = [];
  if(mode==='quarters'){
    // ideal: 8 jugadores => 4 por cancha (si falta, completa del otro lado)
    const a4 = A.slice(0,4), b4 = B.slice(0,4);
    const pool = balanceToEight(a4,b4);
    ties = quartersSeed(pool.A, pool.B);
  }else if(mode==='semis'){
    // ideal: top2 por cancha
    const a2 = A.slice(0,2), b2 = B.slice(0,2);
    const pool = balanceToFour(a2,b2, A,B);
    ties = semisSeed(pool.A, pool.B);
  }else{
    // final: top1 por cancha (si falta, toma el mejor siguiente global)
    const a1 = A[0]? [A[0]] : [];
    const b1 = B[0]? [B[0]] : [];
    if(a1.length+b1.length<2){
      const rest = buildRank(0); // global fallback
      while(a1.length+b1.length<2 && rest.length){
        const x = rest.shift();
        if(!a1[0] && x.court!== (b1[0]?.court||0)) a1.push(x);
        else if(!b1[0] && x.court!== (a1[0]?.court||0)) b1.push(x);
      }
    }
    ties = finalSeed(a1,b1);
  }

  if(ties.length===0) return alert('No hay suficientes jugadores para eliminatoria.');

  // crea partidos de eliminatoria en la ronda actual
  ties.forEach(t=>{
    state.matches.push({
      id: crypto.randomUUID(),
      court: 1, // puedes dejarlos sin “cancha” real: se juegan en orden
      round: state.round,
      goal: state.goal,
      teams: t, // [a1,a2,b1,b2]
      scoreA: 0, scoreB: 0,
      closed: false,
      playoff: mode,
    });
  });
  renderAll('Eliminatoria creada');
}

function balanceToEight(a4,b4){
  let A = a4.slice(), B = b4.slice();
  while(A.length+B.length<8){
    // rellena desde la cancha con más jugadores disponibles
    const pickA = (buildRank(1)[A.length]);
    const pickB = (buildRank(2)[B.length]);
    if((pickA?.pts||0)> (pickB?.pts||0)){ if(pickA) A.push(pickA); else if(pickB) B.push(pickB); }
    else{ if(pickB) B.push(pickB); else if(pickA) A.push(pickA); }
    if(!pickA && !pickB) break;
  }
  return {A,B};
}

function balanceToFour(a2,b2, A,B){
  let Aout = a2.slice(), Bout = b2.slice();
  while(Aout.length+Bout.length<4){
    const pickA = A[Aout.length];
    const pickB = B[Bout.length];
    if((pickA?.pts||0)> (pickB?.pts||0)){ if(pickA) Aout.push(pickA); else if(pickB) Bout.push(pickB); }
    else{ if(pickB) Bout.push(pickB); else if(pickA) Aout.push(pickA); }
    if(!pickA && !pickB) break;
  }
  return {A:Aout, B:Bout};
}

// Semillas cruzadas
function quartersSeed(A,B){
  if(A.length+B.length<8) return [];
  // A1 vs B4, A2 vs B3, B1 vs A4, B2 vs A3
  const need = (arr,i)=> arr[i] ?? arr[arr.length-1];
  return [
    toTeams( need(A,0), need(B,3) ),
    toTeams( need(A,1), need(B,2) ),
    toTeams( need(B,0), need(A,3) ),
    toTeams( need(B,1), need(A,2) ),
  ];
}

function semisSeed(A,B){
  if(A.length+B.length<4) return [];
  // A1–B2 y B1–A2 (cada equipo es pareja interna top x – top y)
  return [
    toTeams(A[0], B[1] ?? B[0]),
    toTeams(B[0], A[1] ?? A[0]),
  ];
}

function finalSeed(a1,b1){
  if(a1.length+b1.length<2) return [];
  return [ toTeams(a1[0], b1[0]) ];
}

// Convierte “jugador rank” en pareja: (topX con topX+2) si existe, o con siguiente
function toTeams(pTop, pOther){
  // cada “rank item” trae id y name. Usamos pareja artificial:
  // Emparejamos pTop con su “vecino de ranking” en la misma cancha si existe,
  // y lo mismo para pOther. Si no existe par, arma pareja con mejores disponibles.
  function pairOf(r, pool){
    const sameCourt = pool.filter(x=>x.court===r.court && x.id!==r.id);
    const mate = sameCourt[0] || pool.find(x=>x.id!==r.id) || r; // fallback consigo mismo (no debería pasar)
    return [r.id, mate.id];
  }
  const poolAll = buildRank(0);
  const a = pairOf(pTop, poolAll);
  const b = pairOf(pOther, poolAll);
  return [a[0],a[1], b[0],b[1]];
}

// 1 cancha: conserva tu lógica de top-8/top-4, usando el mismo sembrado que ya acordamos
function createElimsOneCourt(){
  const R = buildRank(0);
  let mode = state.playoff;
  if(mode==='auto'){
    if(R.length>=8) mode = 'semis';
    else if(R.length>=4) mode = 'final';
    else return alert('No hay suficientes jugadores para eliminatoria');
  }

  let ties=[];
  if(mode==='semis'){
    // Top-8 -> cuatro equipos: (1–3) vs (2–4) y (5–7) vs (6–8)
    if(R.length<8) return alert('Se requieren al menos 8 jugadores');
    const t = [
      [R[0],R[2]], [R[1],R[3]], [R[4],R[6]], [R[5],R[7]]
    ].map(([x,y],i,arr)=> i%2===0 ? toTeams(x,y) : null).filter(Boolean);
    ties = t;
  }else if(mode==='final'){
    if(R.length<4) return alert('Se requieren al menos 4 jugadores');
    const t = [
      [R[0],R[2]], [R[1],R[3]]
    ].map(([x,y])=> toTeams(x,y));
    ties = t;
  }

  ties.forEach(t=>{
    state.matches.push({
      id: crypto.randomUUID(),
      court: 1,
      round: state.round,
      goal: state.goal,
      teams: t, scoreA:0, scoreB:0, closed:false, playoff: mode
    });
  });
  renderAll('Eliminatoria creada');
}

// ===== Render principal =====
function renderAll(msg){
  roundNoEl.textContent = state.round;
  roundHdrEl.textContent = state.round;
  renderPlayers();
  renderMatches();
  renderRanks();
  if(typeof msg==='string' && msg) statusStrip.textContent = msg;
}
