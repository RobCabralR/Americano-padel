// --- Configuración ---
const PASSWORD = "Padel2025";

// --- Referencias ---
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

// --- Estado ---
let players = [];
let currentRound = 0;
let totalRounds = 0;
let lastRested = [];

// --- Firebase ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

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
const db = getDatabase(app);

// --- Pantallas ---
enterBtn.addEventListener("click", () => {
  loginScreen.classList.add("hidden");
  passwordScreen.classList.remove("hidden");
});

loginBtn.addEventListener("click", () => {
  if (passwordInput.value === PASSWORD) {
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

// --- Agregar jugador ---
addPlayerBtn.addEventListener("click", () => {
  if (players.length >= 8) return alert("Máximo 8 jugadores por cancha");
  const name = prompt("Nombre del jugador:");
  if (name) {
    players.push(name);
    renderPlayers();
  }
});

function renderPlayers() {
  playersList.innerHTML = "";
  players.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "border p-2 rounded text-center";
    div.textContent = `${i + 1}. ${p}`;
    playersList.appendChild(div);
  });
}

// --- Borrar jornada ---
resetBtn.addEventListener("click", () => {
  if (confirm("¿Deseas borrar la jornada anterior y comenzar un nuevo Americano Zacatecas?")) {
    players = [];
    currentRound = 0;
    matchesList.innerHTML = "";
    matchesSection.classList.add("hidden");
    restSection.classList.add("hidden");
    renderPlayers();
    roundCounter.textContent = "Ronda 0 de 0";
  }
});

// --- Emparejamientos automáticos ---
function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function generateMatches(players) {
  const activePlayers = [...players];
  const roundMatches = [];
  let rest = [];

  // Si hay más de 4 jugadores, alguien descansa
  if (activePlayers.length > 4) {
    rest = [activePlayers.pop()];
    while (lastRested.includes(rest[0]) && activePlayers.length > 4) {
      activePlayers.unshift(rest.pop());
      rest = [activePlayers.pop()];
    }
    lastRested = rest;
  }

  shuffle(activePlayers);
  const match = [activePlayers[0], activePlayers[1], activePlayers[2], activePlayers[3]];
  roundMatches.push(match);

  return { roundMatches, rest };
}

// --- Iniciar Americano ---
startBtn.addEventListener("click", () => {
  if (players.length < 4) return alert("Se requieren al menos 4 jugadores");
  matchesSection.classList.remove("hidden");
  restSection.classList.remove("hidden");
  totalRounds = players.length - 1;
  nextRound();
  nextRoundBtn.classList.remove("hidden");
  startBtn.classList.add("hidden");
});

nextRoundBtn.addEventListener("click", nextRound);

function nextRound() {
  if (currentRound >= totalRounds) {
    alert("¡Fin del Americano!");
    return;
  }
  currentRound++;
  const { roundMatches, rest } = generateMatches(players);
  renderRound(roundMatches, rest);
  roundCounter.textContent = `Ronda ${currentRound} de ${totalRounds}`;
}

function renderRound(matches, rest) {
  matchesList.innerHTML = "";
  matches.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = "border p-3 rounded text-center bg-gray-50";
    div.textContent = `Cancha ${i + 1}: ${m[0]} & ${m[1]} 🆚 ${m[2]} & ${m[3]}`;
    matchesList.appendChild(div);
  });
  restPlayersSpan.textContent = rest.join(", ");
}
