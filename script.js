// ===== CONFIG =====
const PASSWORD = "Padel2025";

// ===== REFS UI =====
const enterBtn = document.getElementById('enterBtn');
const loginBtn = document.getElementById('loginBtn');
const passwordInput = document.getElementById('passwordInput');
const loginScreen = document.getElementById('login-screen');
const passwordScreen = document.getElementById('password-screen');
const mainScreen = document.getElementById('main-screen');
const errorMsg = document.getElementById('errorMsg');

const startBtn = document.getElementById('startBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const resetBtn = document.getElementById('resetBtn');
const playersList = document.getElementById('playersList');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const matchesSection = document.getElementById('matchesSection');
const matchesList = document.getElementById('matchesList');
const restSection = document.getElementById('restSection');
const restPlayersSpan = document.getElementById('restPlayers');
const roundCounter = document.getElementById('roundCounter');
const logoutBtn = document.getElementById('logoutBtn');

const pointsSelect = document.getElementById('pointsSelect');
const courtsSelect = document.getElementById('courtsSelect');

// ===== ESTADO LOCAL =====
let players = [];
let currentRound = 0;
let totalRounds = 0;
let lastRested = []; // quién descansó en la ronda previa
let firebaseReady = false;

// ===== EVENTOS DE UI (siempre se registran) =====
enterBtn.addEventListener("click", () => {
  loginScreen.classList.add("hidden");
  passwordScreen.classList.remove("hidden");
});

loginBtn.addEventListener("click", () => {
  if ((passwordInput.value || "") === PASSWORD) {
    passwordScreen.classList.add("hidden");
    mainScreen.classList.remove("hidden");
  } else {
    errorMsg.classList.remove("hidden");
  }
});

logoutBtn.addEventListener("click", () => {
  mainScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

// Agregar jugador
addPlayerBtn.addEventListener("click", () => {
  const max = parseInt(courtsSelect.value, 10) * 8;  // máx. 8 por cancha
  if (players.length >= max) return alert(`Máximo ${max} jugadores para ${courtsSelect.value} cancha(s).`);
  const name = prompt("Nombre del jugador:");
  if (name) {
    if (players.includes(name)) return alert("Ese nombre ya está registrado.");
    players.push(name);
    renderPlayers();
  }
});

function renderPlayers() {
  playersList.innerHTML = "";
  players.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "border p-2 rounded flex items-center justify-between";
    div.innerHTML = `<span>${i + 1}. ${p}</span>
      <button class="text-xs text-red-600 underline" data-i="${i}">quitar</button>`;
    playersList.appendChild(div);
  });
  playersList.querySelectorAll("button[data-i]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-i"), 10);
      players.splice(idx, 1);
      renderPlayers();
    });
  });
}

// Borrar jornada
resetBtn.addEventListener("click", () => {
  if (!confirm("¿Deseas borrar la jornada anterior y comenzar un nuevo Americano Zacatecas?")) return;
  players = [];
  currentRound = 0;
  totalRounds = 0;
  lastRested = [];
  matchesList.innerHTML = "";
  matchesSection.classList.add("hidden");
  restSection.classList.add("hidden");
  roundCounter.textContent = "Ronda 0 de 0";
  renderPlayers();

  // Limpieza online (si Firebase está listo)
  if (firebaseReady) wipeOnline();
});

// ===== EMPAREJAMIENTOS =====
function shuffle(arr) {
  return arr
    .map(v => [Math.random(), v])
    .sort((a, b) => a[0] - b[0])
    .map(x => x[1]);
}

/**
 * Genera partidos para la ronda con N canchas.
 * - No deja que quien descansó vuelva a descansar.
 * - Intenta evitar descansos consecutivos.
 */
function generateRound(playersArr, numCourts) {
  const actives = [...playersArr];
  const matches = [];
  const rest = [];

  // Cantidad ideal por ronda (4 por cancha)
  const needed = numCourts * 4;
  // Si sobran, descansan, pero evitando repetir los de la ronda anterior
  while (actives.length > needed) {
    // candidato a descanso = alguien que NO descansó en la ronda pasada
    let idx = actives.findIndex(p => !lastRested.includes(p));
    if (idx === -1) idx = actives.length - 1; // si no hay alternativa
    rest.push(actives.splice(idx, 1)[0]);
  }

  // mezclar y armar parejas por cancha
  const mixed = shuffle(actives);
  for (let c = 0; c < numCourts; c++) {
    const base = c * 4;
    if (mixed[base + 3] === undefined) break;
    matches.push([mixed[base], mixed[base + 1], mixed[base + 2], mixed[base + 3]]);
  }

  lastRested = rest;
  return { matches, rest };
}

// ===== CONTROL DE RONDAS =====
startBtn.addEventListener("click", () => {
  const numCourts = parseInt(courtsSelect.value, 10);
  if (players.length < 4) return alert("Se requieren al menos 4 jugadores.");
  if (players.length < numCourts * 4) return alert(`Con ${numCourts} cancha(s) necesitas mínimo ${numCourts * 4} jugadores.`);

  matchesSection.classList.remove("hidden");
  restSection.classList.remove("hidden");

  // número de rondas estimado (cada jugador debería jugar con rotaciones);
  // simple heurística: todos juegan ~ (jugadores - 1) en 1 cancha; con más canchas reducimos
  const factor = Math.max(1, Math.ceil(players.length / (numCourts * 4)));
  totalRounds = Math.max(1, players.length - 1) * factor;

  currentRound = 0;
  nextRoundBtn.classList.remove("hidden");
  startBtn.classList.add("hidden");

  // si hay Firebase, limpia y sube estado inicial
  if (firebaseReady) initOnlineState();

  nextRound();
});

nextRoundBtn.addEventListener("click", nextRound);

function nextRound() {
  if (currentRound >= totalRounds) {
    alert("¡Fin del Americano!");
    return;
  }
  currentRound++;
  const numCourts = parseInt(courtsSelect.value, 10);
  const { matches, rest } = generateRound(players, numCourts);
  renderRound(matches, rest);
  roundCounter.textContent = `Ronda ${currentRound} de ${totalRounds}`;

  if (firebaseReady) saveRoundOnline(currentRound, matches, rest);
}

function renderRound(matches, rest) {
  matchesList.innerHTML = "";
  matches.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = "border p-3 rounded text-center bg-gray-50";
    div.textContent = `Cancha ${i + 1}: ${m[0]} & ${m[1]} 🆚 ${m[2]} & ${m[3]}`;
    matchesList.appendChild(div);
  });
  restPlayersSpan.textContent = rest.length ? rest.join(", ") : "—";
}

// ===== FIREBASE (dinámico, no bloquea la UI) =====
let db = null;
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function initFirebase() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js");
    const { getDatabase, ref, set, onValue, remove } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js");

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

    // Escucha opcional: podrías sincronizar jugadores, rondas, etc. Aquí dejo hooks mínimos:
    firebaseReady = true;
    console.log("Firebase OK →", { ok: true, at: new Date().toISOString() });

    // listeners para traer estado (si alguien más ya inició)
    const baseRef = ref(db, `sesiones/${todayKey()}`);
    onValue(baseRef, (snap) => {
      // Puedes extender este bloque si quieres sincronización total en vivo
      // (p.ej. players, currentRound, etc.). Por ahora lo dejamos light.
      // console.log("Estado remoto:", snap.val());
    });

    // helpers online
    window._fb = { ref, set, onValue, remove }; // por si quieres inspeccionar en consola
  } catch (err) {
    console.warn("Firebase no disponible (pero la app funciona en local):", err);
    firebaseReady = false;
  }
}

async function initOnlineState() {
  if (!firebaseReady) return;
  const { ref, set } = window._fb;
  const base = ref(db, `sesiones/${todayKey()}`);
  await set(base, {
    config: {
      puntos: parseInt(pointsSelect.value, 10),
      canchas: parseInt(courtsSelect.value, 10)
    },
    jugadores: players,
    rondaActual: currentRound,
    totalRondas: totalRounds
  });
}

async function saveRoundOnline(ronda, matches, rest) {
  if (!firebaseReady) return;
  const { ref, set } = window._fb;
  const rRef = ref(db, `sesiones/${todayKey()}/rondas/${ronda}`);
  await set(rRef, { matches, rest, at: new Date().toISOString() });
  const metaRef = ref(db, `sesiones/${todayKey()}`);
  await set(metaRef, {
    config: {
      puntos: parseInt(pointsSelect.value, 10),
      canchas: parseInt(courtsSelect.value, 10)
    },
    jugadores: players,
    rondaActual: currentRound,
    totalRondas: totalRounds
  });
}

async function wipeOnline() {
  if (!firebaseReady) return;
  const { ref, remove } = window._fb;
  await remove(ref(db, `sesiones/${todayKey()}`));
}

// Inicia Firebase sin bloquear la UI
initFirebase();
