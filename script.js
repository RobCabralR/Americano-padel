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

// Configuración Firebase (pendiente de tus claves)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  databaseURL: "https://americano_padel_zacatecas.firebaseio.com",
  projectId: "americano_padel_zacatecas",
  storageBucket: "americano_padel_zacatecas.appspot.com",
  messagingSenderId: "TU_MESSAGING_ID",
  appId: "TU_APP_ID"
};

// Ejemplo de inicialización (se activará al agregar tus claves)
// import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
// import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
// const app = initializeApp(firebaseConfig);
// const db = getDatabase(app);
