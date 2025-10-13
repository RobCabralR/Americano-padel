// script.js (v1.2)
/* Tema dual */
const themeToggle = document.getElementById('themeToggle');
const rootHtml = document.documentElement;
const THEME_KEY = 'padel_theme';
function applyStoredTheme() {
  const t = localStorage.getItem(THEME_KEY) || 'light';
  if (t === 'dark') rootHtml.classList.add('dark'); else rootHtml.classList.remove('dark');
}
applyStoredTheme();
themeToggle?.addEventListener('click', () => {
  rootHtml.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, rootHtml.classList.contains('dark') ? 'dark' : 'light');
});

/* UI */
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const inputPassword = document.getElementById('inputPassword');
const loginMsg = document.getElementById('loginMsg');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const hoyTag = document.getElementById('hoyTag');
const adminOpen = document.getElementById('adminOpen');
const adminModal = document.getElementById('adminModal');
const adminClose = document.getElementById('adminClose');
const adminGate = document.getElementById('adminGate');
const adminPanel = document.getElementById('adminPanel');
const adminInput = document.getElementById('adminInput');
const adminCheck = document.getElementById('adminCheck');
const adminMsg = document.getElementById('adminMsg');
const adminSavePass = document.getElementById('adminSavePass');
const nuevaPassword = document.getElementById('nuevaPassword');
const adminSaveMsg = document.getElementById('adminSaveMsg');
const adminFinalizar = document.getElementById('adminFinalizar');
const jugadorNombre = document.getElementById('jugadorNombre');
const jugadorCancha = document.getElementById('jugadorCancha');
const btnAgregarJugador = document.getElementById('btnAgregarJugador');
const listaJugadores = document.getElementById('listaJugadores');
const contadorJugadores = document.getElementById('contadorJugadores');

/* Helpers */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
hoyTag.textContent = todayKey();

/* Firebase */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, update, onValue, get, push, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

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

/* Configuración (contraseña general / admin) */
const cfgRef = ref(db, 'configuracion');
async function ensureDefaults() {
  const s = await get(cfgRef);
  if (!s.exists()) {
    await set(cfgRef, { contraseña: "Padel2025", admin: "p4d3l" });
  } else {
    const v = s.val();
    if (!v.contraseña || !v.admin) {
      await update(cfgRef, { contraseña: v.contraseña || "Padel2025", admin: v.admin || "p4d3l" });
    }
  }
}
let CONTRASENA_ACTUAL = "Padel2025";
let ADMIN_PASS = "p4d3l";
onValue(cfgRef, (snap) => {
  const v = snap.val();
  if (v) {
    CONTRASENA_ACTUAL = v.contraseña || CONTRASENA_ACTUAL;
    ADMIN_PASS = v.admin || ADMIN_PASS;
  }
});

/* Sesión del día */
const sesionRef = ref(db, `sesiones/${todayKey()}`);
const jugadoresRef = ref(db, `sesiones/${todayKey()}/jugadores`);
async function ensureSesion() {
  const s = await get(sesionRef);
  if (!s.exists()) await set(sesionRef, { ronda: 1 });
}

/* Login */
btnLogin.addEventListener('click', async () => {
  await ensureDefaults();
  await ensureSesion();
  const pass = (inputPassword.value || "").trim();
  if (pass === CONTRASENA_ACTUAL) {
    loginMsg.classList.add('hidden');
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
  } else {
    loginMsg.classList.remove('hidden');
  }
});
btnLogout.addEventListener('click', () => {
  inputPassword.value = "";
  appSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
});

/* Admin */
adminOpen.addEventListener('click', () => {
  adminModal.classList.remove('hidden');
  adminModal.classList.add('flex');
  adminGate.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  adminInput.value = "";
  adminMsg.classList.add('hidden');
});
adminClose.addEventListener('click', () => {
  adminModal.classList.add('hidden');
  adminModal.classList.remove('flex');
});
adminCheck.addEventListener('click', () => {
  if ((adminInput.value || "").trim() === ADMIN_PASS) {
    adminMsg.classList.add('hidden');
    adminGate.classList.add('hidden');
    adminPanel.classList.remove('hidden');
  } else {
    adminMsg.classList.remove('hidden');
  }
});
adminSavePass.addEventListener('click', async () => {
  const nueva = (nuevaPassword.value || "").trim();
  if (!nueva) return;
  await update(cfgRef, { contraseña: nueva });
  adminSaveMsg.classList.remove('hidden');
  setTimeout(()=> adminSaveMsg.classList.add('hidden'), 2000);
  nuevaPassword.value = "";
});

/* Jugadores */
btnAgregarJugador.addEventListener('click', async () => {
  const nombre = (jugadorNombre.value || "").trim();
  const cancha = jugadorCancha.value;
  if (!nombre) return;
  await push(jugadoresRef, { nombre, cancha });
  jugadorNombre.value = "";
});
onValue(jugadoresRef, (snap) => {
  const data = snap.val() || {};
  const entries = Object.entries(data);
  contadorJugadores.textContent = `${entries.length} jugador(es)`;
  listaJugadores.innerHTML = "";
  entries.forEach(([id, j]) => {
    const el = document.createElement('div');
    el.className = "flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2";
    el.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="inline-flex w-8 h-8 rounded-full bg-emerald-600 text-white items-center justify-center font-bold">${(j.nombre||'?').slice(0,1).toUpperCase()}</span>
        <div>
          <div class="font-semibold">${j.nombre}</div>
          <div class="text-xs text-slate-500">Cancha ${j.cancha}</div>
        </div>
      </div>
      <button data-id="${id}" class="btn-del rounded-lg px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Eliminar</button>
    `;
    listaJugadores.appendChild(el);
  });
  listaJugadores.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await remove(ref(db, `sesiones/${todayKey()}/jugadores/${id}`));
    });
  });
});

/* Finalizar jornada */
async function finalizarJornada() {
  const day = todayKey();
  const srcRef = ref(db, `sesiones/${day}`);
  const dstRef = ref(db, `archivadas/${day}`);
  const src = await get(srcRef);
  if (src.exists()) {
    await set(dstRef, src.val());
  }
  await set(srcRef, null);
  alert("🏁 Jornada finalizada. ¡Buen juego equipo!\\nLos datos de hoy fueron archivados y la sesión se reinició.");
  contadorJugadores.textContent = "0 jugador(es)";
  listaJugadores.innerHTML = "";
  await ensureSesion();
}
adminFinalizar.addEventListener('click', finalizarJornada);
