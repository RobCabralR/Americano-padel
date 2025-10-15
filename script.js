/* Padel-Americano Zacatecas – v1.6 */
/* Persistencia local (GitHub Pages) – sin Firebase */

const LSK = 'americanoZac_v16';

const state = {
  started: false,
  pointsToWin: 3,
  courts: 1,
  round: 0,
  players: [],
  // partidos de la ronda actual
  matches: [],       // [{court, pairs:[[a,b],[c,d]], status:'open'|'done', result:{s1,s2}}]
  results: [],

  // standings por jugador
  standings: {},     // name -> {PJ,PG,PP,JF,JC,Dif,Pts}

  // historia para no repetir parejas/rivales y rotar justo
  partnerHistory: {},      // "a|b" => true
  opponentHistory: {},     // "a&b|c&d" ordenadas => true
  lastPlayedRound: {},     // jugador -> última ronda que jugó
};

function persist(){ localStorage.setItem(LSK, JSON.stringify(state)); }
function load(){
  const raw = localStorage.getItem(LSK);
  if(!raw) return;
  try{
    const s = JSON.parse(raw);
    Object.assign(state, s);
  }catch(e){}
}

// ---------- helpers UI ----------
const $ = sel => document.querySelector(sel);
const landing = $('#landing');
const app = $('#app');

const enterBtn = $('#enterBtn');
const pointsSel = $('#pointsSel');
const courtsSel = $('#courtsSel');
const playerInput = $('#playerInput');
const addPlayerBtn = $('#addPlayerBtn');
const startBtn = $('#startBtn');
const clearBtn = $('#clearBtn');
const exitBtn = $('#exitBtn');
const matchesArea = $('#matchesArea');
const playersArea = $('#playersArea');
const standingsArea = $('#standingsArea');
const roundBadge = $('#roundBadge');
const genAvailBtn = $('#genAvailBtn');
const nextRoundBtn = $('#nextRoundBtn');
const restLine = $('#restLine');

enterBtn.addEventListener('click', ()=>{
  landing.classList.add('hidden');
  app.classList.remove('hidden');
  renderAll();
});

pointsSel.addEventListener('change', ()=>{
  state.pointsToWin = parseInt(pointsSel.value,10);
  persist(); renderMatches();
});
courtsSel.addEventListener('change', ()=>{
  state.courts = parseInt(courtsSel.value,10);
  // al cambiar canchas en medio de ronda: sólo afecta a cuántos partidos abrimos
  persist(); renderMatches();
});

addPlayerBtn.addEventListener('click', ()=>{
  const name = playerInput.value.trim();
  if(!name) return;
  const maxAllowed = state.courts * 8;
  if(state.players.length >= maxAllowed){
    alert(`Máximo ${maxAllowed} jugadores (8 por cancha).`);
    return;
  }
  if(state.players.includes(name)){
    alert('Ese nombre ya existe.'); return;
  }
  state.players.push(name);
  ensureStatsFor(name);
  playerInput.value = '';
  persist(); renderPlayers(); renderStandings();
});

startBtn.addEventListener('click', startTournament);
clearBtn.addEventListener('click', clearTournament);
exitBtn.addEventListener('click', ()=>{
  app.classList.add('hidden'); landing.classList.remove('hidden');
});
genAvailBtn.addEventListener('click', generateFromAvailable);
nextRoundBtn.addEventListener('click', nextRoundGlobal);

// ---------- standings ----------
function ensureStatsFor(name){
  if(!state.standings[name]){
    state.standings[name] = { PJ:0, PG:0, PP:0, JF:0, JC:0, Dif:0, Pts:0 };
  }
}
function applyMatchToStandings(pA, pB, s1, s2){
  const winA = s1 > s2;
  const A = pA, B = pB;
  // pareja 1
  A.forEach(n=>{
    ensureStatsFor(n);
    state.standings[n].PJ += 1;
    if(winA) state.standings[n].PG += 1; else state.standings[n].PP += 1;
    state.standings[n].JF += s1; state.standings[n].JC += s2;
    state.standings[n].Dif = state.standings[n].JF - state.standings[n].JC;
    state.standings[n].Pts += (winA ? 2 : 0);
  });
  // pareja 2
  B.forEach(n=>{
    ensureStatsFor(n);
    state.standings[n].PJ += 1;
    if(!winA) state.standings[n].PG += 1; else state.standings[n].PP += 1;
    state.standings[n].JF += s2; state.standings[n].JC += s1;
    state.standings[n].Dif = state.standings[n].JF - state.standings[n].JC;
    state.standings[n].Pts += (!winA ? 2 : 0);
  });
}

function renderStandings(){
  standingsArea.innerHTML = '';
  const entries = Object.entries(state.standings);
  if(!entries.length){
    standingsArea.innerHTML = '<div class="text-sm text-slate-500">Sin datos aún.</div>';
    return;
  }
  const rows = entries
    .map(([name,st])=>({name,...st}))
    .sort((a,b)=> b.Pts - a.Pts || b.Dif - a.Dif || b.JF - a.JF || a.name.localeCompare(b.name));

  const table = document.createElement('table');
  table.className = 'min-w-[680px] w-full text-sm';
  table.innerHTML = `
    <thead>
      <tr class="bg-slate-100 text-slate-700">
        <th class="text-left px-2 py-2">#</th>
        <th class="text-left px-2 py-2">Jugador</th>
        <th class="px-2 py-2">PJ</th>
        <th class="px-2 py-2">PG</th>
        <th class="px-2 py-2">PP</th>
        <th class="px-2 py-2">JF</th>
        <th class="px-2 py-2">JC</th>
        <th class="px-2 py-2">Dif</th>
        <th class="px-2 py-2">Pts</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  rows.forEach((r,i)=>{
    const tr = document.createElement('tr');
    tr.className = i%2 ? 'bg-white' : 'bg-slate-50';
    tr.innerHTML = `
      <td class="px-2 py-1">${i+1}</td>
      <td class="px-2 py-1">${r.name}</td>
      <td class="text-center px-2 py-1">${r.PJ}</td>
      <td class="text-center px-2 py-1">${r.PG}</td>
      <td class="text-center px-2 py-1">${r.PP}</td>
      <td class="text-center px-2 py-1">${r.JF}</td>
      <td class="text-center px-2 py-1">${r.JC}</td>
      <td class="text-center px-2 py-1">${r.Dif}</td>
      <td class="text-center px-2 py-1 font-semibold">${r.Pts}</td>
    `;
    table.querySelector('tbody').appendChild(tr);
  });
  standingsArea.appendChild(table);

  const legend = document.createElement('div');
  legend.className = 'text-xs text-slate-500 mt-2';
  legend.textContent = 'PJ: Partidos jugados · PG: Ganados · PP: Perdidos · JF: Juegos a favor · JC: Juegos en contra · Dif: Diferencia (JF−JC) · Pts: 2 por victoria';
  standingsArea.appendChild(legend);
}

// ---------- players ----------
function renderPlayers(){
  playersArea.innerHTML = '';
  if(!state.players.length){
    playersArea.innerHTML = '<div class="text-sm text-slate-500">Sin jugadores.</div>';
    return;
  }
  const half = Math.ceil(state.players.length/2);
  const cols = [state.players.slice(0,half), state.players.slice(half)];

  cols.forEach(col=>{
    const cdiv = document.createElement('div');
    cdiv.className = 'space-y-2';
    col.forEach((name, idx)=>{
      const ix = state.players.indexOf(name)+1;
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2';
      row.innerHTML = `
        <div class="w-6 text-slate-500">${ix}.</div>
        <input class="flex-1 border rounded px-3 py-2" value="${name}" disabled />
        <button class="text-rose-600 text-sm underline">quitar</button>
      `;
      row.querySelector('button').addEventListener('click', ()=>removePlayer(name));
      cdiv.appendChild(row);
    });
    playersArea.appendChild(cdiv);
  });
}

function removePlayer(name){
  if(state.started) return alert('No puedes eliminar jugadores con el Americano en curso.');
  state.players = state.players.filter(p=>p!==name);
  delete state.standings[name];
  delete state.lastPlayedRound[name];
  persist(); renderPlayers(); renderStandings();
}

// ---------- matches ----------
function renderMatches(){
  matchesArea.innerHTML = '';
  roundBadge.textContent = `Ronda ${state.round || 0}`;

  const open = state.matches.filter(m=>m.status==='open');
  if(!open.length){
    matchesArea.innerHTML = '<div class="text-sm text-slate-500">No hay partidos abiertos.</div>';
  }else{
    open.forEach(m=>{
      const [a1,a2] = m.pairs[0];
      const [b1,b2] = m.pairs[1];
      const card = document.createElement('div');
      card.className = 'border rounded p-3 flex flex-wrap items-center gap-2';
      card.innerHTML = `
        <div class="w-full sm:w-auto font-medium">Cancha ${m.court}:</div>
        <div class="flex-1">${a1} & ${a2} <span class="px-2 text-amber-600">vs</span> ${b1} & ${b2}</div>
        <label class="text-sm">Juegos pareja 1: <input type="number" min="0" class="w-16 border rounded px-2 py-1 ml-1" /></label>
        <label class="text-sm">Juegos pareja 2: <input type="number" min="0" class="w-16 border rounded px-2 py-1 ml-1" /></label>
        <button class="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">Registrar</button>
        <span class="text-sm hidden text-emerald-600">✔ Registrado</span>
      `;
      const [i1,i2,btn,ok] = card.querySelectorAll('input,button,span');
      btn.addEventListener('click', ()=>{
        const s1 = parseInt(i1.value,10);
        const s2 = parseInt(i2.value,10);
        if(Number.isNaN(s1)||Number.isNaN(s2)){ alert('Ingresa marcadores.'); return; }
        const W = state.pointsToWin;
        const valid = (
          (s1===W && s2>=0 && s2<W) ||
          (s2===W && s1>=0 && s1<W)
        );
        if(!valid){ alert(`Marcador inválido. Se juega a ${W}. Ej: ${W}-${W-1} ó ${W-1}-${W}`); return; }
        if(m.status==='done'){ alert('Este partido ya fue registrado.'); return; }

        // aplicar
        applyMatchToStandings([a1,a2],[b1,b2],s1,s2);
        [a1,a2,b1,b2].forEach(p=>{ state.lastPlayedRound[p] = state.round; });
        m.status='done'; m.result={s1,s2};
        persist(); renderStandings();

        btn.classList.add('hidden'); ok.classList.remove('hidden');

        // ¿ya terminó la ronda?
        const allDone = state.matches.every(x=>x.status==='done');
        if(allDone){
          nextRoundBtn.classList.remove('hidden');
          genAvailBtn.classList.add('hidden');
        }else{
          // aún hay huecos abiertos -> mantener botones
          nextRoundBtn.classList.add('hidden');
          genAvailBtn.classList.remove('hidden');
        }
      });
      matchesArea.appendChild(card);
    });
  }

  // descansan
  const busy = currentBusyPlayers();
  const rest = state.players.filter(p=>!busy.has(p));
  restLine.textContent = rest.length ? ('Descansan: ' + rest.join(', ')) : '';
}

function currentBusyPlayers(){
  const set = new Set();
  state.matches.filter(m=>m.status==='open').forEach(m=>{
    m.pairs.flat().forEach(p=>set.add(p));
  });
  return set;
}

// ---------- generator ----------
function pairKey(a,b){ return [a,b].sort().join('|'); }
function matchKey(a1,a2,b1,b2){
  const A=[a1,a2].sort().join('&');
  const B=[b1,b2].sort().join('&');
  return [A,B].sort().join('|');
}
function getPJ(name){ return (state.standings[name]?.PJ)||0; }

// generador justo por ronda: llena hasta “capacity” partidos sin repetir parejas/rivales
function generateRoundFair(availablePlayers, capacity) {
  if (capacity <= 0) return { matches: [], rest: availablePlayers.slice() };

  const round = state.round || 1;
  const scored = availablePlayers.map(p=>{
    const pj = getPJ(p);
    const last = state.lastPlayedRound[p] ?? 0;
    const idle = round - last; // mayor = más tiempo sin jugar
    return { p, pj, idle };
  }).sort((a,b)=> a.pj - b.pj || b.idle - a.idle);

  const pool = scored.map(x=>x.p);
  const used = new Set();
  const matches = [];

  function canPair(x,y){ return !state.partnerHistory[pairKey(x,y)]; }
  function canOppose(a1,a2,b1,b2){ return !state.opponentHistory[matchKey(a1,a2,b1,b2)]; }

  for(let m=0; m<capacity; m++){
    const cand = pool.filter(p=>!used.has(p));
    if (cand.length < 4) break;

    let chosen = null;
    outer:
    for (let i=0;i<cand.length;i++){
      for (let j=i+1;j<cand.length;j++){
        if(!canPair(cand[i], cand[j])) continue;
        for (let k=0;k<cand.length;k++){
          if(k===i||k===j) continue;
          for (let l=k+1;l<cand.length;l++){
            if(l===i||l===j) continue;
            if(!canPair(cand[k], cand[l])) continue;
            if(!canOppose(cand[i],cand[j],cand[k],cand[l])) continue;
            chosen = [cand[i],cand[j],cand[k],cand[l]];
            break outer;
          }
        }
      }
    }
    if(!chosen){
      outer2:
      for (let i=0;i<cand.length;i++){
        for (let j=i+1;j<cand.length;j++){
          if(!canPair(cand[i], cand[j])) continue;
          for (let k=0;k<cand.length;k++){
            if(k===i||k===j) continue;
            for (let l=k+1;l<cand.length;l++){
              if(l===i||l===j) continue;
              if(!canPair(cand[k], cand[l])) continue;
              chosen = [cand[i],cand[j],cand[k],cand[l]];
              break outer2;
            }
          }
        }
      }
    }
    if(!chosen) break;

    chosen.forEach(u=>used.add(u));
    matches.push({ pairs:[[chosen[0],chosen[1]],[chosen[2],chosen[3]]], status:'open' });
  }

  const rest = pool.filter(p=>!used.has(p));
  return { matches, rest };
}

// abre partidos hasta llenar la capacidad de canchas de la ronda
function openMatchesToCapacity(){
  const already = state.matches.length;
  const canOpen = Math.max(0, state.courts - already);
  if (canOpen <= 0) return;

  const busy = currentBusyPlayers();
  const free = state.players.filter(p=>!busy.has(p));

  const {matches} = generateRoundFair(free, canOpen);
  let nextCourt = already + 1;
  matches.forEach(m=>{
    const [a1,a2]=m.pairs[0], [b1,b2]=m.pairs[1];
    state.matches.push({
      court: nextCourt++,
      pairs:[[a1,a2],[b1,b2]],
      status:'open',
      result:null
    });
    state.partnerHistory[pairKey(a1,a2)] = true;
    state.partnerHistory[pairKey(b1,b2)] = true;
    state.opponentHistory[matchKey(a1,a2,b1,b2)] = true;
  });
  persist();
}

// permitir abrir partidos “libres” dentro de la ronda (hasta completar canchas)
function generateFromAvailable(){
  if(!state.started){ alert('Primero inicia el Americano.'); return; }
  const open = state.matches.filter(m=>m.status==='open').length;
  if(open >= state.courts){
    alert('La ronda ya tiene el máximo de partidos abiertos.'); return;
  }
  openMatchesToCapacity();
  renderMatches();
}

// ---------- ciclo ----------
function startTournament(){
  if(state.started){
    alert('El Americano ya está iniciado. Usa “Borrar jornada” para reiniciar.');
    return;
  }
  if(state.players.length<4){ alert('Necesitas al menos 4 jugadores.'); return; }
  // standings sólo con jugadores actuales
  state.standings = {};
  state.players.forEach(ensureStatsFor);

  state.partnerHistory = {};
  state.opponentHistory = {};
  state.lastPlayedRound = {};

  state.pointsToWin = parseInt(pointsSel.value,10);
  state.courts = parseInt(courtsSel.value,10);

  state.started = true;
  state.round = 1;
  state.matches = []; state.results = [];

  startBtn.disabled = true;
  startBtn.classList.add('opacity-50','cursor-not-allowed');

  openMatchesToCapacity();
  persist(); renderAll();
}

function nextRoundGlobal(){
  if(!state.matches.length || !state.matches.every(m=>m.status==='done')){
    alert('Aún hay partidos abiertos en esta ronda.'); return;
  }
  state.round += 1;
  state.matches = []; state.results = [];
  openMatchesToCapacity();
  nextRoundBtn.classList.add('hidden');
  genAvailBtn.classList.remove('hidden');
  persist(); renderAll();
}

function clearTournament(){
  if(!confirm('¿Deseas borrar la jornada anterior y comenzar un nuevo Americano Zacatecas?')) return;
  Object.assign(state, {
    started:false,
    pointsToWin: parseInt(pointsSel.value,10) || 3,
    courts: parseInt(courtsSel.value,10) || 1,
    round:0,
    players: [],
    matches: [],
    results: [],
    standings: {},
    partnerHistory:{},
    opponentHistory:{},
    lastPlayedRound:{}
  });
  startBtn.disabled = false;
  startBtn.classList.remove('opacity-50','cursor-not-allowed');
  persist(); renderAll();
}

// ---------- render root ----------
function renderAll(){
  // controles
  pointsSel.value = String(state.pointsToWin || 3);
  courtsSel.value = String(state.courts || 1);
  roundBadge.textContent = `Ronda ${state.round || 0}`;

  // botones
  if(state.started){
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50','cursor-not-allowed');
  }else{
    startBtn.disabled = false;
    startBtn.classList.remove('opacity-50','cursor-not-allowed');
  }
  // next vs gen
  const allDone = state.matches.length && state.matches.every(x=>x.status==='done');
  if(allDone){ nextRoundBtn.classList.remove('hidden'); genAvailBtn.classList.add('hidden'); }
  else { nextRoundBtn.classList.add('hidden'); genAvailBtn.classList.remove('hidden'); }

  renderPlayers();
  renderMatches();
  renderStandings();
}

// init
load();
renderAll();
