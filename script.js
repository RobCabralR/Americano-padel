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

// ====== STATE ======
let state = {
  players: [],
  pointsToWin: 3,
  courts: 1,
  currentRound: 0,
  totalRounds: 0,
  lastRested: [],
  matches: [], // partidos de la ronda actual (array de [a,b,c,d])
  results: {}, // { indexDeCancha: {a:pts,b:pts} } (registrado)
  finished: false
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
      renderPlayers();
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
    finished: false
  };
  playersList.innerHTML = '';
  matchesList.innerHTML = '';
  matchesSection.classList.add('hidden');
  restSection.classList.add('hidden');
  roundCounter.textContent = 'Ronda 0 de 0';
  startBtn.classList.remove('hidden');
  nextRoundBtn.classList.add('hidden');
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

  matchesSection.classList.remove('hidden');
  restSection.classList.remove('hidden');
  startBtn.classList.add('hidden');
  nextRoundBtn.classList.add('hidden'); // se habilita cuando registren todos

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
    persist(); saveRoundOnline(); // última persistencia
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
      // si se registraron todos, habilita siguiente
      if (Object.keys(state.results).length === state.matches.length) {
        nextRoundBtn.classList.remove('hidden');
      }
      persist(); saveRoundOnline();
    });
  });

  restPlayersSpan.textContent = state.lastRested.length ? state.lastRested.join(', ') : '—';
  nextRoundBtn.classList.add('hidden'); // se mostrará cuando registren todos
}

// ====== PERSISTENCIA LOCAL ======
function persist(){
  const toSave = { ...state };
  localStorage.setItem(SESSION_KEY(), JSON.stringify(toSave));
}

function tryResume(){
  const raw = localStorage.getItem(SESSION_KEY());
  if (!raw) return;
  const s = JSON.parse(raw);
  if (s && !s.finished && (s.currentRound>0 || s.players.length>=4)) {
    const ok = confirm('Hay una jornada activa de hoy. ¿Deseas reanudarla?');
    if (ok){
      state = s;
      // reflejar selects y UI
      pointsSelect.value = String(state.pointsToWin);
      courtsSelect.value = String(state.courts);
      renderPlayers();
      matchesSection.classList.remove('hidden');
      restSection.classList.remove('hidden');
      roundCounter.textContent = `Ronda ${state.currentRound} de ${state.totalRounds}`;
      renderRound();
      startBtn.classList.add('hidden');
      // si ya estaban todos registrados, muestra siguiente
      if (Object.keys(state.results).length === state.matches.length && !state.finished) {
        nextRoundBtn.classList.remove('hidden');
      }
    } else {
      localStorage.removeItem(SESSION_KEY());
    }
  } else {
    // no hay ronda activa; solo restauramos lista de jugadores si existiera
    if (s?.players?.length) {
      state.players = s.players;
      renderPlayers();
    }
  }
}

// ====== FIREBASE (dinámico, no bloquea UI) ======
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

    // Suscripción opcional (si quieres mostrar cambios de otros usuarios)
    const baseRef = ref(db, `sesiones/${SESSION_KEY()}`);
    onValue(baseRef, (snap)=> {
      // aquí podrías sincronizar en vivo; por ahora persistimos local solo si hace sentido
      // console.log('Remoto:', snap.val());
    });

    // Helpers globales
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
