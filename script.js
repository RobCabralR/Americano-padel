// ====== CONFIG ======
const PASSWORD = "Padel2025";
const SESSION_KEY = () => `americano:${new Date().toISOString().slice(0,10)}`;

// ====== UI REFS ======
const enterBtn = document.getElementById('enterBtn');
const loginBtn = document.getElementById('loginBtn');
const passwordInput = document.getElementById('passwordInput');
const loginScreen = document.getElementById('login-screen');
const passwordScreen = document.getElementById('password-screen');
const mainScreen = document.getElementById('main-screen');
const errorMsg = document.getElementById('errorMsg');

const pointsSelect = document.getElementById('pointsSelect');
const courtsSelect = document.getElementById('courtsSelect');

const playerNameInput = document.getElementById('playerNameInput');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const playersList = document.getElementById('playersList');

const startBtn = document.getElementById('startBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const resetBtn = document.getElementById('resetBtn');

const matchesSection = document.getElementById('matchesSection');
const matchesList = document.getElementById('matchesList');
const restSection = document.getElementById('restSection');
const restPlayersSpan = document.getElementById('restPlayers');
const roundCounter = document.getElementById('roundCounter');
const logoutBtn = document.getElementById('logoutBtn');

const standingsSection = document.getElementById('standingsSection');
const standingsBody = document.getElementById('standingsBody');

// ====== STATE ======
let state = {
  players: [],
  pointsToWin: 3,
  courts: 1,
  currentRound: 0,
  totalRounds: 0,
  lastRested: [],
  matches: [],   // partidos de la ronda actual: [p1,p2,p3,p4]
  results: {},   // resultados registrados en la ronda actual
  finished: false,
  standings: {}  // { jugador: {PJ,PG,PP,JF,JC,Dif,Pts} }
};

let firebaseReady = false;
let db = null;

// ====== NAV ======
enterBtn.addEventListener('click', () => {
  loginScreen.classList.add('hidden');
  passwordScreen.classList.remove('hidden');
});

loginBtn.addEventListener('click', () => {
  if (passwordInput.value === PASSWORD) {
    passwordScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    tryResume();
  } else {
    errorMsg.classList.remove('hidden');
  }
});

logoutBtn.addEventListener('click', () => {
  mainScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

// ====== PLAYERS ======
addPlayerBtn.addEventListener('click', () => {
  const name = (playerNameInput.value || '').trim();
  if (!name) return playerNameInput.focus();
  const max = parseInt(courtsSelect.value,10) * 8;
  if (state.players.length >= max) return alert(`Máximo ${max} jugadores para ${state.courts} cancha(s).`);
  if (state.players.includes(name)) return alert('Ese nombre ya está registrado.');
  state.players.push(name);
  playerNameInput.value = '';
  renderPlayers();
  ensureStandings();
  persist();
});

function renderPlayers() {
  playersList.innerHTML = '';
  state.players.forEach((p,i) => {
    const row = document.createElement('div');
    row.className = 'border p-2 rounded flex items-center justify-between';
    row.innerHTML = `<span>${i+1}. ${p}</span>
      <button class="text-xs text-red-600 underline" data-i="${i}">quitar</button>`;
    playersList.appendChild(row);
  });
  playersList.querySelectorAll('button[data-i]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const i = +btn.dataset.i;
      state.players.splice(i,1);
      delete state.standings[Object.keys(state.standings)[i]];
      renderPlayers();
      renderStandings();
      persist();
    });
  });
}

// ====== CONFIG SELECTS ======
pointsSelect.addEventListener('change', ()=>{
  state.pointsToWin = parseInt(pointsSelect.value,10);
  persist();
});
courtsSelect.addEventListener('change', ()=>{
  state.courts = parseInt(courtsSelect.value,10);
  persist();
});

// ====== RESET / BORRAR JORNADA ======
resetBtn.addEventListener('click', async ()=>{
  if (!confirm('¿Deseas borrar la jornada anterior y comenzar un nuevo Americano Zacatecas?')) return;
  state = {
    players: [],
    pointsToWin: parseInt(pointsSelect.value,10) || 3,
    courts: parseInt(courtsSelect.value,10) || 1,
    currentRound: 0,
    totalRounds: 0,
    lastRested: [],
    matches: [],
    results: {},
    finished: false,
    standings: {}
  };
  playersList.innerHTML = '';
  matchesList.innerHTML = '';
  matchesSection.classList.add('hidden');
  restSection.classList.add('hidden');
  roundCounter.textContent = 'Ronda 0 de 0';
  startBtn.classList.remove('hidden');
  nextRoundBtn.classList.add('hidden');
  standingsBody.innerHTML = '';
  standingsSection.classList.add('hidden');
  localStorage.removeItem(SESSION_KEY());
  if (firebaseReady) await wipeOnline();
});

// ====== EMPAREJAMIENTO ======
function shuffle(arr){
  return arr.map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}

function generateRound(players, numCourts, lastRested){
  const actives = [...players];
  const matches = [];
  const rest = [];
  const needed = numCourts * 4;

  // asignar descansos evitando consecutivos
  while (actives.length > needed) {
    let i = actives.findIndex(p => !lastRested.includes(p));
    if (i === -1) i = actives.length - 1;
    rest.push(actives.splice(i,1)[0]);
  }

  const mixed = shuffle(actives);
  for (let c=0;c<numCourts;c++){
    const b = c*4;
    if (mixed[b+3] == null) break;
    matches.push([mixed[b], mixed[b+1], mixed[b+2], mixed[b+3]]);
  }

  return { matches, rest };
}

// ====== INICIO & RONDAS ======
startBtn.addEventListener('click', async ()=>{
  if (state.players.length < 4) return alert('Se requieren al menos 4 jugadores.');
  const need = state.courts * 4;
  if (state.players.length < need) return alert(`Con ${state.courts} cancha(s) necesitas mínimo ${need} jugadores.`);

  state.currentRound = 0;
  state.totalRounds = Math.max(1, state.players.length - 1);
  state.finished = false;

  ensureStandings();
  renderStandings();

  matchesSection.classList.remove('hidden');
  restSection.classList.remove('hidden');
  startBtn.classList.add('hidden');
  nextRoundBtn.classList.add('hidden');

  await initOnlineState();
  nextRound();
});

nextRoundBtn.addEventListener('click', ()=>{
  if (Object.keys(state.results).length < state.matches.length){
    return alert('Registra todos los resultados antes de pasar de ronda.');
  }
  nextRound();
});

function nextRound(){
  if (state.currentRound >= state.totalRounds){
    alert('¡Fin del Americano!');
    state.finished = true;
    persist(); saveRoundOnline();
    return;
  }

  state.currentRound++;
  state.results = {};

  const { matches, rest } = generateRound(state.players, state.courts, state.lastRested);
  state.matches = matches;
  state.lastRested = rest;

  renderRound();
  roundCounter.textContent = `Ronda ${state.currentRound} de ${state.totalRounds}`;
  persist(); saveRoundOnline();
}

function renderRound(){
  matchesList.innerHTML = '';
  const maxPts = state.pointsToWin;

  state.matches.forEach((m,i)=>{
    const card = document.createElement('div');
    card.className = 'border p-3 rounded bg-gray-50';
    card.innerHTML = `
      <div class="font-semibold mb-2">Cancha ${i+1}:</div>
      <div class="mb-2">${m[0]} &amp; ${m[1]} <span class="mx-2">🆚</span> ${m[2]} &amp; ${m[3]}</div>

      <div class="flex items-center gap-2 mb-2">
        <label class="text-sm">Juegos pareja 1:</label>
        <input type="number" min="0" max="${maxPts}" class="border rounded px-2 py-1 w-20" id="sA-${i}">
        <label class="text-sm ml-4">Juegos pareja 2:</label>
        <input type="number" min="0" max="${maxPts}" class="border rounded px-2 py-1 w-20" id="sB-${i}">
        <button class="ml-4 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-3 rounded" id="reg-${i}">
          Registrar
        </button>
        <span class="text-sm text-gray-600 ml-2" id="ok-${i}"></span>
      </div>
    `;
    matchesList.appendChild(card);

    document.getElementById(`reg-${i}`).addEventListener('click', ()=>{
      const a = parseInt(document.getElementById(`sA-${i}`).value,10);
      const b = parseInt(document.getElementById(`sB-${i}`).value,10);
      if (Number.isNaN(a) || Number.isNaN(b)) return alert('Completa ambos marcadores.');
      if (a<0 || b<0 || a>maxPts || b>maxPts) return alert(`Marcadores 0..${maxPts}.`);
      if (a===b) return alert('Debe haber un ganador (no empates).');

      state.results[i] = { a, b }; // registramos
      document.getElementById(`ok-${i}`).textContent = '✔ Registrado';

      // actualizar standings (una sola vez por partido)
      const pairA = [ state.matches[i][0], state.matches[i][1] ];
      const pairB = [ state.matches[i][2], state.matches[i][3] ];
      applyMatchToStandings(pairA, pairB, a, b);
      renderStandings();

      // habilitar siguiente cuando todos estén
      if (Object.keys(state.results).length === state.matches.length) {
        nextRoundBtn.classList.remove('hidden');
      }

      persist(); saveRoundOnline();
    });
  });

  restPlayersSpan.textContent = state.lastRested.length ? state.lastRested.join(', ') : '—';
  nextRoundBtn.classList.add('hidden');
}

// ====== STANDINGS (Puntos 2/0) ======
function ensureStandings() {
  state.players.forEach(p => {
    if (!state.standings[p]) {
      state.standings[p] = { PJ:0, PG:0, PP:0, JF:0, JC:0, Dif:0, Pts:0 };
    }
  });
}

function applyMatchToStandings(pairA, pairB, scoreA, scoreB) {
  const winners = scoreA > scoreB ? pairA : pairB;
  const losers  = scoreA > scoreB ? pairB : pairA;

  // suma PJ, PG/PP, JF, JC, Pts
  winners.forEach(p => {
    const s = state.standings[p];
    s.PJ++; s.PG++; s.Pts += 2;
    s.JF += (pairA.includes(p) ? scoreA : scoreB);
    s.JC += (pairA.includes(p) ? scoreB : scoreA);
  });
  losers.forEach(p => {
    const s = state.standings[p];
    s.PJ++; s.PP++;
    s.JF += (pairA.includes(p) ? scoreA : scoreB);
    s.JC += (pairA.includes(p) ? scoreB : scoreA);
  });

  // recalcula Dif
  Object.values(state.standings).forEach(s => s.Dif = s.JF - s.JC);
}

function sortStandings(entries) {
  return entries.sort((a,b)=>{
    if (b[1].Pts !== a[1].Pts) return b[1].Pts - a[1].Pts;
    if (b[1].Dif !== a[1].Dif) return b[1].Dif - a[1].Dif;
    if (a[1].JC !== b[1].JC) return a[1].JC - b[1].JC;
    return a[0].localeCompare(b[0]);
  });
}

function renderStandings() {
  if (!state.standings || Object.keys(state.standings).length === 0) {
    standingsSection.classList.add('hidden');
    return;
  }
  standingsSection.classList.remove('hidden');
  const rows = sortStandings(Object.entries(state.standings));
  standingsBody.innerHTML = rows.map(([name,s],idx)=>`
    <tr class="border-t">
      <td class="px-3 py-2">${idx+1}</td>
      <td class="px-3 py-2">${name}</td>
      <td class="px-3 py-2 text-center">${s.PJ}</td>
      <td class="px-3 py-2 text-center">${s.PG}</td>
      <td class="px-3 py-2 text-center">${s.PP}</td>
      <td class="px-3 py-2 text-center">${s.JF}</td>
      <td class="px-3 py-2 text-center">${s.JC}</td>
      <td class="px-3 py-2 text-center">${s.Dif}</td>
      <td class="px-3 py-2 text-center font-semibold">${s.Pts}</td>
    </tr>
  `).join('');
}

// ====== PERSISTENCIA LOCAL ======
function persist(){
  localStorage.setItem(SESSION_KEY(), JSON.stringify(state));
}

function tryResume(){
  const raw = localStorage.getItem(SESSION_KEY());
  if (!raw) return;

  const s = JSON.parse(raw);
  if (s) state = s;

  pointsSelect.value = String(state.pointsToWin || 3);
  courtsSelect.value = String(state.courts || 1);

  if (state.players?.length) renderPlayers();
  ensureStandings(); renderStandings();

  if (!state.finished && (state.currentRound>0 || state.players.length>=4)) {
    const ok = confirm('Hay una jornada activa de hoy. ¿Deseas reanudarla?');
    if (ok){
      matchesSection.classList.remove('hidden');
      restSection.classList.remove('hidden');
      roundCounter.textContent = `Ronda ${state.currentRound} de ${state.totalRounds}`;
      renderRound();
      startBtn.classList.add('hidden');
      if (Object.keys(state.results).length === state.matches.length && !state.finished) {
        nextRoundBtn.classList.remove('hidden');
      }
    } else {
      localStorage.removeItem(SESSION_KEY());
    }
  }
}

// ====== FIREBASE ======
async function initFirebase(){
  try{
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js');
    const { getDatabase, ref, set, onValue, remove } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');

    const firebaseConfig = {
      apiKey: "AIzaSyDm0J5dnEavIi0ow8o9q86Zl515E1zqIY0",
      authDomain: "padel-zac.firebaseapp.com",
      databaseURL: "https://padel-zac-default-rtdb.firebaseio.com",
      projectId: "padel-zac",
      storageBucket: "padel-zac.firebasestorage.app",
      messagingSenderId: "873811901531",
      appId: "1:873811901531:web:3175ad146974213728d37e"
    };

    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    firebaseReady = true;

    // Suscripción opcional (si quieres live-sync entre teléfonos)
    const baseRef = ref(db, `sesiones/${SESSION_KEY()}`);
    onValue(baseRef, (snap)=> {
      // console.log('Remoto:', snap.val());
    });

    window._fb = { ref, set, onValue, remove };
    console.log('Firebase OK', new Date().toISOString());
  }catch(err){
    console.warn('Firebase no disponible. Modo local activo.', err);
  }
}

async function initOnlineState(){
  persist();
  if (!firebaseReady) return;
  const { ref, set } = window._fb;
  await set(ref(db, `sesiones/${SESSION_KEY()}`), { state, at: new Date().toISOString() });
}

async function saveRoundOnline(){
  if (!firebaseReady) return;
  const { ref, set } = window._fb;
  await set(ref(db, `sesiones/${SESSION_KEY()}`), { state, at: new Date().toISOString() });
}

async function wipeOnline(){
  if (!firebaseReady) return;
  const { ref, remove } = window._fb;
  await remove(ref(db, `sesiones/${SESSION_KEY()}`));
}

// ====== ARRANQUE ======
state.pointsToWin = parseInt(pointsSelect.value,10);
state.courts = parseInt(courtsSelect.value,10);
initFirebase();
