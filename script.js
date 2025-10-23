/* =========================
   Estado de la aplicación
   ========================= */

const state = {
  meta: 3,                  // meta de juegos
  courts: 1,                // 1 ó 2
  room: '',                 // solo visual
  roundC1: 1,               // ronda visual (por cancha)
  roundC2: 1,

  // jugadores por cancha (array de strings)
  players: {
    1: [],  // cancha 1
    2: []   // cancha 2
  },

  // Tabla por cancha: { id: {name, pts, jg, jp, pj, lastRound} }
  table: {
    1: {},
    2: {}
  },

  // Partidos teóricos de cada cancha (pre-generados)
  schedule: {
    1: [],  // cada item: {a,b,c,d, played:false, scoreA:0, scoreB:0}
    2: []
  },

  // índice del partido actual abierto en cada cancha
  cursor: {
    1: -1,
    2: -1
  }
};

/* =========================
   Utilidades
   ========================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function byId(id){ return document.getElementById(id); }

// combinatoria nC2
function comb2(n){ return (n*(n-1))/2; }

// genera todas las duplas (parejas) de un set de jugadores
function allPairs(list){
  const res = [];
  for(let i=0;i<list.length;i++){
    for(let j=i+1;j<list.length;j++){
      res.push([list[i], list[j]]);
    }
  }
  return res;
}

// intenta emparejar dos duplas disjuntas
function disjoint(p1, p2){
  return p1[0]!==p2[0] && p1[0]!==p2[1] && p1[1]!==p2[0] && p1[1]!==p2[1];
}

// algoritmo simple para construir todos los partidos sin repetir jugadores
// objetivo: que cada pareja se forme una sola vez; total de partidos = C(n,2)/2
function buildFullSchedule(players){
  const pairs = allPairs(players);                 // todas las parejas posibles
  const used = new Set();                          // marca pareja usada: "a|b" (ordenado)
  const matches = [];                              // [{a,b,c,d}]

  // ordenamos para más estabilidad
  pairs.sort((p,q)=> (p[0]+p[1]).localeCompare(q[0]+q[1]));

  for(let i=0;i<pairs.length;i++){
    const p1 = pairs[i];
    const key1 = p1.slice().sort().join('|');
    if(used.has(key1)) continue;

    // buscar otra pareja disjunta no usada
    let chosenIdx = -1;
    for(let j=i+1;j<pairs.length;j++){
      const p2 = pairs[j];
      const key2 = p2.slice().sort().join('|');
      if(used.has(key2)) continue;
      if(disjoint(p1,p2)){
        chosenIdx = j; break;
      }
    }
    if(chosenIdx === -1) continue; // (con 8 y 6 normalmente siempre hay)

    const p2 = pairs[chosenIdx];
    const key2 = p2.slice().sort().join('|');

    used.add(key1); used.add(key2);
    matches.push({ a:p1[0], b:p1[1], c:p2[0], d:p2[1], played:false, sA:0, sB:0 });
  }
  return matches;
}

function ensureTableEntry(court, name){
  if(!state.table[court][name]){
    state.table[court][name] = { name, pts:0, jg:0, jp:0, pj:0, lastRound:0 };
  }
}

/* =========================
   Render UI
   ========================= */

function renderPlayers(court){
  const ul = byId(court===1?'listC1':'listC2');
  ul.innerHTML = '';
  state.players[court].forEach((name, idx)=>{
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.className = 'left';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = name;
    const badge = document.createElement('span');
    badge.className='badge';
    badge.textContent = `C${court}`;
    left.appendChild(tag); left.appendChild(badge);

    const del = document.createElement('button');
    del.textContent = 'x';
    del.onclick = ()=>{
      state.players[court].splice(idx,1);
      // limpiar todo lo asociado si quitamos jugadores antes de arrancar
      state.schedule[court] = [];
      state.cursor[court] = -1;
      state.table[court] = {};
      renderPlayers(court); renderTable(court);
      renderOpenMatch(court);
      renderPendingMeta(court);
    };

    li.appendChild(left);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function renderPendingMeta(court){
  const p = state.players[court];
  const totalMatches = Math.floor(comb2(p.length)/2);   // C(n,2)/2
  const played = state.schedule[court].filter(m=>m.played).length;
  const pend = Math.max(totalMatches - played, 0);
  byId(court===1?'c1Meta':'c2Meta').textContent = `Pendientes: ${pend} partido${pend!==1?'s':''}`;
}

function renderOpenMatch(court){
  const wrap = byId(court===1?'openMatchC1':'openMatchC2');
  wrap.innerHTML = '';

  const idx = state.cursor[court];
  if(idx<0 || !state.schedule[court][idx]){
    // no hay abierto
    return;
  }
  const m = state.schedule[court][idx];
  const card = document.createElement('div');
  card.className = 'card';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const round = court===1?state.roundC1:state.roundC2;
  meta.textContent = `Cancha ${court} · Ronda ${round}`;
  card.appendChild(meta);

  const row = document.createElement('div');
  row.className='vs';
  [m.a,m.b,'vs',m.c,m.d].forEach(x=>{
    const el = document.createElement('span');
    if(x==='vs'){ el.className='muted'; el.textContent='vs'; }
    else{ el.className='tag'; el.textContent=x; }
    row.appendChild(el);
  });

  const mark = document.createElement('div');
  mark.className='mark';
  const sA = document.createElement('input'); sA.type='number'; sA.min=0; sA.value=m.sA; sA.className='score';
  const sB = document.createElement('input'); sB.type='number'; sB.min=0; sB.value=m.sB; sB.className='score';

  const btn = document.createElement('button');
  btn.textContent='Guardar resultado';
  btn.onclick = ()=> saveResult(court, parseInt(sA.value||0,10), parseInt(sB.value||0,10));

  mark.appendChild(sA); mark.appendChild(document.createTextNode(' - ')); mark.appendChild(sB);
  mark.appendChild(btn);
  row.appendChild(mark);

  card.appendChild(row);
  wrap.appendChild(card);
}

function renderTable(court){
  const tbody = (court===1?byId('tableC1'):byId('tableC2')).querySelector('tbody');
  tbody.innerHTML = '';

  // ordenar por pts desc, luego JG desc, JP asc
  const rows = Object.values(state.table[court])
    .sort((a,b)=> (b.pts-a.pts) || (b.jg-a.jg) || (a.jp-b.jp) || (a.name>b.name?1:-1));

  rows.forEach((r,idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${r.name}</td>
      <td>${r.pts}</td>
      <td>${r.jg}</td>
      <td>${r.jp}</td>
      <td>${r.pj}</td>
      <td>${r.lastRound}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================
   Lógica core
   ========================= */

function addPlayer(court, name){
  name = (name||'').trim().toLowerCase();
  if(!name) return;
  if(state.players[court].includes(name)) return;

  // límite 8 por cancha
  if(state.players[court].length >= 8){
    alert('Máximo 8 jugadores por cancha.');
    return;
  }

  state.players[court].push(name);
  ensureTableEntry(court,name);
  renderPlayers(court); renderTable(court); renderPendingMeta(court);
}

function generateScheduleIfNeeded(court){
  if(state.schedule[court].length>0) return;

  const p = state.players[court];
  if(p.length<4 || p.length%2!==0){
    alert(`Cancha ${court}: se requieren al menos 4 y número par de jugadores.`);
    return;
  }
  // C(n,2)/2 partidos
  state.schedule[court] = buildFullSchedule(p);
  state.cursor[court] = -1;
  nextMatch(court);
}

function nextMatch(court){
  const sched = state.schedule[court];
  const nextIdx = sched.findIndex(m=>!m.played);
  if(nextIdx===-1){
    // terminado
    byId(court===1?'openMatchC1':'openMatchC2').innerHTML = '';
    showEliminationButton(court);
    return;
  }
  state.cursor[court] = nextIdx;
  if(court===1) state.roundC1++; else state.roundC2++;
  renderOpenMatch(court);
  renderPendingMeta(court);
}

// guarda resultado y avanza
function saveResult(court, sA, sB){
  const idx = state.cursor[court];
  if(idx<0) return;
  const m = state.schedule[court][idx];

  // normalizar a meta
  const max = state.meta;
  sA = Math.min(max, Math.max(0,sA));
  sB = Math.min(max, Math.max(0,sB));

  m.sA=sA; m.sB=sB; m.played=true;

  // actualizar tabla (suma "games" como pts)
  const upd = (name, won, lost)=>{
    ensureTableEntry(court,name);
    state.table[court][name].pts += (won-lost>0 ? won : won); // sumo games ganados siempre
    state.table[court][name].jg  += won;
    state.table[court][name].jp  += lost;
    state.table[court][name].pj  += 1;
    state.table[court][name].lastRound = (court===1?state.roundC1:state.roundC2)-1;
  };

  upd(m.a, sA, sB); upd(m.b, sA, sB);
  upd(m.c, sB, sA); upd(m.d, sB, sA);

  renderTable(court);
  renderPendingMeta(court);
  nextMatch(court);
}

/* =========================
   Eliminatorias por cancha
   ========================= */

function showEliminationButton(court){
  const host = byId(court===1?'elimsC1':'elimsC2');
  host.innerHTML = '';
  const btn = document.createElement('button');
  btn.textContent = `Crear eliminatoria (Cancha ${court})`;
  btn.className='primary';
  btn.onclick = ()=> createElimsForCourt(court);
  host.appendChild(btn);
}

function createElimsForCourt(court){
  // Top-4 (semifinales) si hay 8 jugadores o menos
  const ordered = Object.values(state.table[court])
    .sort((a,b)=> (b.pts-a.pts) || (b.jg-a.jg) || (a.jp-b.jp) || (a.name>b.name?1:-1));

  if(ordered.length<4){
    alert(`Cancha ${court}: se requieren 4 o más para eliminatoria.`);
    return;
  }

  // Semis por cancha: 1&3 vs 2&4 (lo acordado)
  const top4 = ordered.slice(0,4).map(r=>r.name);
  const [p1,p2,p3,p4] = top4;

  const wrap = byId(court===1?'openMatchC1':'openMatchC2');
  wrap.innerHTML = '';

  // dos tarjetas (semis)
  const semis = [
    {a:p1,b:p3,c:p2,d:p4},
    {a:p2,b:p4,c:p1,d:p3} // espejo para tener 2 partidos listos; puedes cambiarlo si prefieres 1 por vez
  ];

  semis.forEach((m,i)=>{
    const card = document.createElement('div'); card.className='card';
    const meta = document.createElement('div'); meta.className='meta';
    meta.textContent = `Eliminatoria — Cancha ${court} · Semi ${i+1}`;
    card.appendChild(meta);

    const row = document.createElement('div'); row.className='vs';
    [m.a,m.b,'vs',m.c,m.d].forEach(x=>{
      const el = document.createElement('span');
      el.className = (x==='vs'?'muted':'tag'); el.textContent = (x==='vs'?'vs':x);
      row.appendChild(el);
    });

    const sA=document.createElement('input'); sA.type='number'; sA.min=0; sA.value=0; sA.className='score';
    const sB=document.createElement('input'); sB.type='number'; sB.min=0; sB.value=0; sB.className='score';
    const btn=document.createElement('button'); btn.textContent='Guardar resultado';
    btn.onclick = ()=>{
      const a=parseInt(sA.value||0,10), b=parseInt(sB.value||0,10);
      alert(`Resultado guardado (Semi ${i+1} C${court}): ${a}-${b}. (Aquí ya puedes encadenar Final por cancha si quieres)`);
    };
    const mark=document.createElement('div'); mark.className='mark';
    mark.appendChild(sA); mark.appendChild(document.createTextNode(' - ')); mark.appendChild(sB); mark.appendChild(btn);

    row.appendChild(mark); card.appendChild(row);
    wrap.appendChild(card);
  });
}

/* =========================
   Wiring UI
   ========================= */

function wire(){
  byId('roomCode').textContent = (state.room = Math.random().toString(36).slice(2,7));

  // selects
  byId('courtsSelect').onchange = e=>{
    state.courts = parseInt(e.target.value,10);
    // mostar/ocultar bloques de C2
    const showC2 = state.courts===2;
    byId('playersC2').style.display = showC2?'block':'none';
    byId('matchesC2').style.display = showC2?'block':'none';
  };
  byId('targetSelect').onchange = e=> state.meta = parseInt(e.target.value,10);

  // add buttons
  byId('addBtnC1').onclick = ()=>{ addPlayer(1, byId('nameInputC1').value); byId('nameInputC1').value=''; };
  byId('addBtnC2').onclick = ()=>{ addPlayer(2, byId('nameInputC2').value); byId('nameInputC2').value=''; };

  // reset
  byId('resetC1').onclick = ()=>{
    state.players[1]=[]; state.table[1]={}; state.schedule[1]=[]; state.cursor[1]=-1; state.roundC1=1;
    renderPlayers(1); renderTable(1); renderOpenMatch(1); renderPendingMeta(1); byId('elimsC1').innerHTML='';
  };
  byId('resetC2').onclick = ()=>{
    state.players[2]=[]; state.table[2]={}; state.schedule[2]=[]; state.cursor[2]=-1; state.roundC2=1;
    renderPlayers(2); renderTable(2); renderOpenMatch(2); renderPendingMeta(2); byId('elimsC2').innerHTML='';
  };

  // generar por cancha
  byId('genBtnC1').onclick = ()=> generateScheduleIfNeeded(1);
  byId('genBtnC2').onclick = ()=> generateScheduleIfNeeded(2);

  // arranque
  renderPlayers(1); renderPlayers(2);
  renderTable(1); renderTable(2);
  renderPendingMeta(1); renderPendingMeta(2);

  // esconder C2 si está en 1 cancha
  byId('courtsSelect').dispatchEvent(new Event('change'));
}

document.addEventListener('DOMContentLoaded', wire);
