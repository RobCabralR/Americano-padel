// script.js
const PASSWORD = "Padel2025";
const enterBtn = document.getElementById('enterBtn');
const loginBtn = document.getElementById('loginBtn');
const passwordInput = document.getElementById('passwordInput');
const loginScreen = document.getElementById('login-screen');
const passwordScreen = document.getElementById('password-screen');
const mainScreen = document.getElementById('main-screen');
const errorMsg = document.getElementById('errorMsg');
const logoutBtn = document.getElementById('logoutBtn');

// Navegación entre pantallas
enterBtn.addEventListener('click', () => {
  loginScreen.classList.add('hidden');
  passwordScreen.classList.remove('hidden');
});

loginBtn.addEventListener('click', () => {
  if (passwordInput.value === PASSWORD) {
    passwordScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
  } else {
    errorMsg.classList.remove('hidden');
  }
});

logoutBtn.addEventListener('click', () => {
  mainScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

// ✅ Firebase Configuración
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

// 🔍 Prueba de conexión
const pingRef = ref(db, 'ping');
set(pingRef, { ok: true, at: new Date().toISOString() });
onValue(pingRef, (snap) => {
  console.log('Firebase OK →', snap.val());
});
