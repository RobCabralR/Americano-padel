// ====== Estado y persistencia ======
const STORAGE_KEY = 'padelZac_v15';

const state = {
  pointsToWin: 3,
  courts: 1,
  players: [],            // string[]
  round: 0,               // ronda actual
  matches: [],            // {id, round, court, pairs:[[a,b],[c,d]], status:'open'|'done', result?:{s1,s2}}
  standings: {},          // nombre -> {PJ,PG,PP,JF,JC,Diff,Pts}
  lastPlayedRound: {},    // nombre -> última ronda en que jugó (para repartir descansos)
  playedWith: {},         // nombre -> Set de compañeros con los que ya jugó
  playedAgainst: {},      // nombre -> Set de oponentes (para evitar repeticiones)
  busy: new Set(),        // jugadores ocupados en esta generación
};

// ====== DOM ======
const landing = document.getElementById('landing');
const app = document.getElementById('app');
const enterBtn = document.getElementById('enterBtn');

const roundBadge = document.getElementById('roundBadge');
const pointsSelect = document.getElementById('pointsSelect');
const courtsSelect = document.getElementById('courtsSelect');
const newPlayer = document.getElementById('newPlayer');
const addPlayerBtn = document.getElementById('addPlayer');
const startBtn = document.getElementById('startBtn');
const genAvailBtn = document.getElementById('genAvailBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const clearBtn = document.getElementById('clearBtn');
const exitBtn = document.getElementById('exitBtn');

const playerList = document.getElementById('playerList');
const matchesArea = document.getElementById('matchesArea');
const restLine = document.getElementById('restLine');
const standingsBody = document.getElementById('standingsBody');

// ====== Password simple ======
const PASSWORD = 'Padel2025';
enterBtn.addEventListener('click', () => {
  const p = prompt('Ingresa la contraseña:');
  if (p === PASSWORD) {
    landing.classList.add('hidden');
    app.classList.remove('hidden');
    load();        // carga estado si existía
    renderAll();
  } else {
    alert('Contraseña incorrecta.');
  }
});

// ====== Util ======
function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return;
  try{
    const s = JSON.parse(raw);
    Object.assign(state, s);
    // Set a objeto Set
    state.busy = new Set();
  }catch(e){}
}

// limpia todo
function resetAll(){
  state.pointsToWin = Number(pointsSelect.value) || 3;
  state.courts = Number(courtsSelect.value) || 1;
  state.players = [];
  state.round = 0;
  state.matches = [];
  state.standings = {};
  state.lastPlayedRound = {};
  state.playedWith = {};
  state.playedAgainst = {};
  state.busy = new Set();
  persist();
  renderAll();
}

function ensureStanding(p){
  if(!state.standings[p]){
    state.standings[p] = {PJ:0,PG:0,PP:0,JF:0,JC:0,Diff:0,Pts:0};
  }
}
function touchPlayer(p){
  ensureStanding(p);
  if(!state.playedWith[p]) state.playedWith[p] = new Set();
  if(!state.playedAgainst[p]) state.playedAgainst[p] = new Set();
  if(state.lastPlayedRound[p]===undefined) state.lastPlayedRound[p] = -1;
}

function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// jugadores disponibles ordenados por “menos han jugado recientemente”
function availablePlayers(){
  const busy = currentBusyPlayers();
  return state.players
    .filter(p=>!busy.has(p))
    .sort((a,b)=>(state.lastPlayedRound[a]??-1)-(state.lastPlayedRound[b]??-1));
}
function currentBusyPlayers(){
  const busy = new Set();
  state.matches.filter(m=>m.round===state.round && m.status==='open').forEach(m=>{
    m.pairs.flat().forEach(p=>busy.add(p));
  });
  return busy;
}

// ====== Render ======
function renderAll(){
  // selects
  pointsSelect.value = state.pointsToWin;
  courtsSelect.value = state.courts;

  roundBadge.textContent = `Ronda ${state.round}`;

  renderPlayers();
  renderMatches();
  renderStandings();
}

// Jugadores (con eliminar)
function renderPlayers(){
  playerList.innerHTML = '';
  const twoCols = state.players.map((name,idx)=>{
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML = `
      <span class="text-slate-500 w-6">${idx+1}.</span>
      <input class="border rounded px-2 py-1 flex-1" value="${name}" disabled />
      <button data-del="${name}" class="text-rose-600 text-sm hover:underline">quitar</button>
    `;
    playerList.appendChild(row);
  });

  playerList.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const name = btn.getAttribute('data-del');
      state.players = state.players.filter(p=>p!==name);
      delete state.standings[name];
      delete state.playedWith[name];
      delete state.playedAgainst[name];
      delete state.lastPlayedRound[name];
      persist();
      renderAll();
    });
  });
}

function renderStandings(){
  const rows = Object.entries(state.standings)
    .map(([name,s])=>({name,...s}))
    .sort((a,b)=> b.Pts - a.Pts || b.Diff - a.Diff || a.name.localeCompare(b.name));

  standingsBody.innerHTML = rows.map((r,i)=>`
    <tr class="border-b">
      <td class="py-1 px-2">${i+1}</td>
      <td class="py-1 px-2">${r.name}</td>
      <td class="py-1 px-2">${r.PJ}</td>
      <td class="py-1 px-2">${r.PG}</td>
      <td class="py-1 px-2">${r.PP}</td>
      <td class="py-1 px-2">${r.JF}</td>
      <td class="py-1 px-2">${r.JC}</td>
      <td class="py-1 px-2">${r.Diff}</td>
      <td class="py-1 px-2">${r.Pts}</td>
    </tr>
  `).join('');
}

// Partidos
function renderMatches(){
  matchesArea.innerHTML = '';
  roundBadge.textContent = `Ronda ${state.round}`;

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

        <label class="text-sm">
          Juegos pareja 1:
          <input data-s1 type="number" min="0" class="w-16 border rounded px-2 py-1 ml-1" />
        </label>

        <label class="text-sm">
          Juegos pareja 2:
          <input data-s2 type="number" min="0" class="w-16 border rounded px-2 py-1 ml-1" />
        </label>

        <button data-reg class="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">
          Registrar
        </button>

        <span data-ok class="text-sm hidden text-emerald-600">✔ Registrado</span>
      `;

      const i1 = card.querySelector('[data-s1]');
      const i2 = card.querySelector('[data-s2]');
      const btn = card.querySelector('[data-reg]');
      const ok  = card.querySelector('[data-ok]');

      btn.addEventListener('click', ()=>{
        const s1 = Number(i1.value);
        const s2 = Number(i2.value);

        if (!Number.isFinite(s1) || !Number.isFinite(s2)) {
          alert('Ingresa marcadores.'); return;
        }

        const W = state.pointsToWin;
        const valid =
          (s1 === W && s2 >= 0 && s2 < W) ||
          (s2 === W && s1 >= 0 && s1 < W);

        if(!valid){
          alert(`Marcador inválido. Se juega a ${W}. Ej: ${W}-${W-1} ó ${W-1}-${W}`);
          return;
        }
        if(m.status==='done'){ alert('Este partido ya fue registrado.'); return; }

        // aplicar resultado
        applyMatchToStandings([a1,a2],[b1,b2],s1,s2);
        [a1,a2,b1,b2].forEach(p=>{ state.lastPlayedRound[p] = state.round; });
        m.status='done'; m.result={s1,s2};
        persist(); renderStandings();

        btn.classList.add('hidden'); ok.classList.remove('hidden');

        const allDone = state.matches.every(x=>x.status==='done');
        if(allDone){
          nextRoundBtn.classList.remove('hidden');
          genAvailBtn.classList.add('hidden');
        }else{
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

// ====== Lógica de torneo ======
function applyMatchToStandings(pair1, pair2, s1, s2){
  const all = [...pair1, ...pair2];
  all.forEach(ensureStanding);

  const win1 = s1 > s2;
  pair1.forEach(p=>{
    state.standings[p].PJ += 1;
    state.standings[p].JF += s1;
    state.standings[p].JC += s2;
    state.standings[p].Diff = state.standings[p].JF - state.standings[p].JC;
    if(win1){ state.standings[p].PG += 1; state.standings[p].Pts += 2; }
    else    { state.standings[p].PP += 1; }
  });
  pair2.forEach(p=>{
    state.standings[p].PJ += 1;
    state.standings[p].JF += s2;
    state.standings[p].JC += s1;
    state.standings[p].Diff = state.standings[p].JF - state.standings[p].JC;
    if(!win1){ state.standings[p].PG += 1; state.standings[p].Pts += 2; }
    else     { state.standings[p].PP += 1; }
  });
}

// Generar emparejamientos para la ronda actual (hasta canchas disponibles)
function generateMatchesForCurrentRound(){
  const open = state.matches.filter(m=>m.round===state.round && m.status==='open');
  const freeCourts = Math.max(0, state.courts - open.length);
  if(freeCourts===0) return;

  const avail = availablePlayers(); // no ocupados
  const capacity = Math.floor(avail.length / 4);
  const setsToMake = Math.min(freeCourts, capacity);

  const made = [];
  const used = new Set();

  const candidates = [...avail];

  for(let c=0;c<setsToMake;c++){
    // elegir 4 jugadores que no se repitan mucho
    let chosen = pickFour(candidates, used);
    if(!chosen) break;
    chosen.forEach(p=>used.add(p));
    // parejas intentando no repetir compañero y rivales
    const pairs = makePairs(chosen);

    // asignar cancha libre
    const courtsInUse = new Set(open.map(m=>m.court).concat(made.map(m=>m.court)));
    let court=1; while(courtsInUse.has(court)) court++;

    made.push({
      id: crypto.randomUUID(),
      round: state.round,
      court,
      pairs,
      status:'open'
    });

    // marcar “ya jugaron juntos / contra” para evitar repetir
    const [a1,a2] = pairs[0], [b1,b2]=pairs[1];
    // compañeros
    state.playedWith[a1].add(a2); state.playedWith[a2].add(a1);
    state.playedWith[b1].add(b2); state.playedWith[b2].add(b1);
    // rivales
    [a1,a2].forEach(p=>{
      state.playedAgainst[p].add(b1); state.playedAgainst[p].add(b2);
    });
    [b1,b2].forEach(p=>{
      state.playedAgainst[p].add(a1); state.playedAgainst[p].add(a2);
    });
  }

  state.matches.push(...made);
  persist();
  renderMatches();
}

// elige 4 no usados priorizando los de menor “lastPlayedRound”
function pickFour(candidates, used){
  const pool = candidates.filter(p=>!used.has(p));
  if(pool.length<4) return null;
  pool.sort((a,b)=>(state.lastPlayedRound[a]??-1)-(state.lastPlayedRound[b]??-1));
  const four = [];
  for(let p of pool){
    if(four.length<4){ four.push(p); }
    if(four.length===4) break;
  }
  return four.length===4 ? four : null;
}

// crea parejas tratando de no repetir compañero ni rivales
function makePairs(four){
  const [A,B,C,D] = four;
  const prefer = (x,y)=> (state.playedWith[x]?.has(y) ? 1 : 0);
  // probamos dos combinaciones: (A,B)-(C,D) y (A,C)-(B,D); elegimos la que menos repite
  const score1 = prefer(A,B)+prefer(C,D);
  const score2 = prefer(A,C)+prefer(B,D);

  if(score1<score2) return [[A,B],[C,D]];
  if(score2<score1) return [[A,C],[B,D]];

  // empate: elegir la que menos rivales repetidos
  const rScore1 =
    (state.playedAgainst[A]?.has(C)?1:0)+(state.playedAgainst[A]?.has(D)?1:0)+
    (state.playedAgainst[B]?.has(C)?1:0)+(state.playedAgainst[B]?.has(D)?1:0);

  const rScore2 =
    (state.playedAgainst[A]?.has(B)?1:0)+(state.playedAgainst[A]?.has(D)?1:0)+
    (state.playedAgainst[C]?.has(B)?1:0)+(state.playedAgainst[C]?.has(D)?1:0);

  if(rScore1<rScore2) return [[A,B],[C,D]];
  if(rScore2<rScore1) return [[A,C],[B,D]];

  // igual: al azar
  return Math.random()<0.5 ? [[A,B],[C,D]] : [[A,C],[B,D]];
}

// ====== Eventos UI ======
pointsSelect.addEventListener('change', ()=>{
  state.pointsToWin = Number(pointsSelect.value)||3;
  persist();
});
courtsSelect.addEventListener('change', ()=>{
  state.courts = Number(courtsSelect.value)||1;
  persist(); renderMatches();
});

addPlayerBtn.addEventListener('click', ()=>{
  const name = newPlayer.value.trim();
  if(!name) return;
  if(state.players.includes(name)) return alert('Ese jugador ya está registrado.');
  // tope: 8 por cancha
  const max = state.courts*8;
  if(state.players.length>=max) return alert(`Límite de ${max} jugadores para ${state.courts} cancha(s).`);
  state.players.push(name);
  touchPlayer(name);
  newPlayer.value='';
  persist(); renderPlayers(); renderStandings();
});

startBtn.addEventListener('click', ()=>{
  if(state.players.length<4) return alert('Agrega al menos 4 jugadores.');
  if(state.round>0){
    // ya empezó: no permitir reiniciar sin borrar
    return alert('El Americano ya inició. Usa "Borrar jornada" para reiniciar.');
  }
  state.round = 1;
  // inicializar estructuras
  state.players.forEach(touchPlayer);
  // primera generación completa (canchas disponibles)
  generateMatchesForCurrentRound();
  // UI
  startBtn.classList.add('opacity-50','cursor-not-allowed');
  startBtn.disabled = true;
  persist(); renderAll();
});

genAvailBtn.addEventListener('click', ()=>{
  // genera más partidos para esta misma ronda si hay canchas libres
  const open = state.matches.filter(m=>m.round===state.round && m.status==='open');
  if(open.length>=state.courts) return alert('No hay canchas libres.');
  generateMatchesForCurrentRound();
});

nextRoundBtn.addEventListener('click', ()=>{
  // sólo si no hay abiertos
  const open = state.matches.filter(m=>m.round===state.round && m.status==='open');
  if(open.length) return alert('Aún hay partidos sin registrar en esta ronda.');
  state.round += 1;
  // crear los primeros partidos de la ronda nueva
  generateMatchesForCurrentRound();
  nextRoundBtn.classList.add('hidden');
  persist(); renderAll();
});

clearBtn.addEventListener('click', ()=>{
  if(!confirm('¿Deseas borrar la jornada anterior y comenzar un nuevo Americano Zacatecas?')) return;
  resetAll();
  // reactivar botón iniciar
  startBtn.classList.remove('opacity-50','cursor-not-allowed');
  startBtn.disabled = false;
});

exitBtn.addEventListener('click', ()=>{
  app.classList.add('hidden'); landing.classList.remove('hidden');
});

// ====== Inicio rápido si ya había sesión guardada (opcional)
// (si no quieres autoinicio, elimina este bloque)
(() => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    // mostramos landing, pero si ingresas contraseña, cargará esa sesión
  }
})();
