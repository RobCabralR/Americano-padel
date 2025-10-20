/* ============================
   Config Firebase (tu proyecto)
   ============================ */
const firebaseConfig = {
  apiKey: "AIzaSyDm0J5dnEavIi0ow8o9q86Zl515E1zqIY0",
  authDomain: "padel-zac.firebaseapp.com",
  databaseURL: "https://padel-zac-default-rtdb.firebaseio.com",
  projectId: "padel-zac",
  storageBucket: "padel-zac.firebasestorage.app",
  messagingSenderId: "873811901531",
  appId: "1:873811901531:web:3175ad146974213728d37e"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* =============== util =============== */
const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 8);
const by = f => (a,b) => f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0;

/* ============ estado base ============ */
let state = {
  roomId: "",
  settings: { courts: 1, target: 3, round: 1, stage: "americano" }, // stage: americano|ko
  players: [],     // [{id,name,court:1|2}]
  standings: {},   // {playerId: {pts,jg,jp,partidos,lr}}
  schedule: [],    // [{round, court, a:[id,id], b:[id,id], status:'open|done', score:{a:0,b:0}}]
};

/* ================== DOM refs ================== */
const roomIdTxt = $("#roomIdTxt");
const copyRoomBtn = $("#copyRoomBtn");
const courtsSelect = $("#courtsSelect");
const targetSelect = $("#targetSelect");
const playoffSelect = $("#playoffSelect");
const roundLabel = $("#roundLabel");
const roundLabel2 = $("#roundLabel2");
const addPlayerBtn = $("#addPlayerBtn");
const playerNameIn = $("#playerName");
const playersList = $("#playersList");
const matchesList = $("#matchesList");
const tbody = $("#tbody");
const resetBtn = $("#resetBtn");
const generateBtn = $("#generateBtn");
const progressInline = $("#progressInline");
const assignHint = $("#assignHint");
const createKO = $("#createKO");

/* ================== sala ================== */
function ensureRoom() {
  let rid = location.hash.replace("#", "").trim();
  if (!rid) {
    rid = uid();
    location.hash = rid;
  }
  state.roomId = rid;
  roomIdTxt.textContent = rid;
}
ensureRoom();

/* paths en DB */
const RPATH = () => `sesiones/${state.roomId}`;
const PPLAYERS = () => `${RPATH()}/players`;
const PSETT = () => `${RPATH()}/settings`;
const PSTAND = () => `${RPATH()}/standings`;
const PSCHED = () => `${RPATH()}/schedule`;

/* sync listeners */
db.ref(PSETT()).on("value", snap => {
  const v = snap.val();
  if (!v) return;
  state.settings = v;
  courtsSelect.value = v.courts || "";
  targetSelect.value = v.target || "";
  roundLabel.textContent = v.round || 1;
  roundLabel2.textContent = v.round || 1;
  assignHint.style.display = (Number(v.courts) >= 2) ? "block" : "none";
});

db.ref(PPLAYERS()).on("value", snap => {
  const obj = snap.val() || {};
  state.players = Object.values(obj);
  renderPlayers();
});

db.ref(PSTAND()).on("value", snap => {
  state.standings = snap.val() || {};
  renderTable();
});

db.ref(PSCHED()).on("value", snap => {
  state.schedule = Object.values(snap.val() || {}).sort(by(x=>x.idx||0));
  renderMatches();
  updateProgress();
});

/* init settings por única vez */
db.ref(PSETT()).transaction(s => s || {courts: 1, target: 3, round: 1, stage: "americano"});

/* ================== UI handlers ================== */
copyRoomBtn.onclick = () => {
  navigator.clipboard.writeText(location.href);
};

courtsSelect.onchange = () => {
  const courts = Number(courtsSelect.value || 0);
  db.ref(PSETT()).update({courts});
  // Pista: máximo 8 por cancha
  if (courts >= 2) assignHint.style.display = "block";
  else assignHint.style.display = "none";
};
targetSelect.onchange = () => {
  const target = Number(targetSelect.value || 0);
  db.ref(PSETT()).update({target});
};
playoffSelect.onchange = () => {
  // guardo preferencia (no lanzo KO automático aquí)
  db.ref(PSETT()).update({playoff: playoffSelect.value});
};

addPlayerBtn.onclick = () => {
  const name = (playerNameIn.value || "").trim();
  if (!name) return;
  if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    alert("Ese nombre ya existe.");
    return;
  }
  const id = uid();
  const court = Number(courtsSelect.value || 1);
  db.ref(`${PPLAYERS()}/${id}`).set({id, name, court});
  playerNameIn.value = "";
};

resetBtn.onclick = async () => {
  if (!confirm("¿Reiniciar todo?")) return;
  await db.ref(RPATH()).remove();
  location.reload();
};

generateBtn.onclick = () => {
  const { courts, target } = state.settings;
  if (!courts || !target) {
    alert("Primero finaliza el setup (canchas y meta).");
    return;
  }
  generarAmericano();
};

createKO.onclick = () => {
  alert("Placeholder: aquí disparamos la creación de eliminatoria cuando el Americano termina.");
};

/* ================== Render ================== */
function renderPlayers() {
  playersList.innerHTML = "";
  const courts = Number(state.settings.courts || 1);

  state.players
    .sort(by(p=>p.name))
    .forEach(p => {
      const li = document.createElement("li");
      li.className = "badge";
      li.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <strong>${p.name}</strong>
          ${courts>=2 ? `
            <span class="muted small">C</span>
            <select data-id="${p.id}" class="courtSel">
              <option value="1" ${p.court==1?"selected":""}>1</option>
              <option value="2" ${p.court==2?"selected":""}>2</option>
            </select>
          ` : ""}
        </div>
        <span class="x" data-del="${p.id}">✕</span>
      `;
      playersList.appendChild(li);
    });

  // cambiar cancha
  $$(".courtSel", playersList).forEach(sel=>{
    sel.onchange = (e)=>{
      const id = sel.dataset.id;
      const court = Number(sel.value);
      db.ref(`${PPLAYERS()}/${id}`).update({court});
    };
  });

  // borrar
  $$("[data-del]", playersList).forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.del;
      db.ref(`${PPLAYERS()}/${id}`).remove();
      // limpiar schedule/standings si ya había algo
    };
  });
}

function renderMatches() {
  matchesList.innerHTML = "";
  const round = Number(state.settings.round || 1);
  const openMatches = state.schedule.filter(m => m.round === round && m.status === "open");
  if (openMatches.length === 0) return;

  // ordenar por cancha y mostrar apilado: Cancha 1, luego Cancha 2
  openMatches
    .sort(by(m=>m.court))
    .forEach((m, i) => {
      const card = document.createElement("div");
      card.className = "match";
      card.innerHTML = `
        <div class="meta">
          <span class="tag pcourt">Cancha ${m.court} · En juego</span>
          <span class="muted">Marcador (a ${state.settings.target})</span>
        </div>
        <div class="teams">
          <div class="team">
            ${m.a.map(id => `<span class="tag">${playerName(id)}</span>`).join("")}
          </div>
          <div class="vs">VS</div>
          <div class="team">
            ${m.b.map(id => `<span class="tag">${playerName(id)}</span>`).join("")}
          </div>
        </div>
        <div class="score">
          <input type="number" min="0" value="${m.score?.a ?? 0}" class="sa">
          <span class="muted">–</span>
          <input type="number" min="0" value="${m.score?.b ?? 0}" class="sb">
          <button class="primary saveBtn">Guardar resultado</button>
        </div>
      `;
      matchesList.appendChild(card);

      const sa = $(".sa", card);
      const sb = $(".sb", card);
      $(".saveBtn", card).onclick = () => {
        const A = Number(sa.value||0), B = Number(sb.value||0);
        guardarResultado(m, A, B);
      };
    });
}

function renderTable() {
  const rows = Object.values(state.standings)
    .sort((a,b)=> b.pts - a.pts || (a.jp - b.jp))
    .map((s, i) => `
      <tr>
        <td class="rank">${i+1}</td>
        <td>${playerName(s.id)}</td>
        <td>${s.pts}</td>
        <td>${s.jg}</td>
        <td>${s.jp}</td>
        <td>${s.partidos}</td>
        <td>${s.lr||"-"}</td>
      </tr>
    `).join("");
  tbody.innerHTML = rows;
}

function updateProgress() {
  const round = Number(state.settings.round || 1);
  const totalOpen = state.schedule.filter(m => m.round === round && m.status === "open").length;
  const totalThisRound = state.schedule.filter(m => m.round === round).length;
  progressInline.textContent = totalThisRound
    ? `Cancha 1: parejas ${pairsDone(1, round)}/${pairsTotal(1)}${state.settings.courts>=2 ? ` · Cancha 2: parejas ${pairsDone(2, round)}/${pairsTotal(2)}` : ""}`
    : "";

  // si ya no quedan partidos abiertos, avanzar de ronda o terminar americano
  if (totalThisRound>0 && totalOpen === 0) {
    avanzar();
  }
}
function pairsTotal(court) {
  const ps = playersByCourt(court);
  return (ps.length * (ps.length - 1)) / 2; // parejas teóricas
}
function pairsDone(court, round) {
  const upToRound = state.schedule.filter(m => m.court===court && m.round<=round && m.status==="done").length * 2;
  return upToRound; // dos parejas por partido
}

/* ================ helpers ================ */
function playerName(id){ return state.players.find(p=>p.id===id)?.name || "?" }
function ensureStanding(id){
  state.standings[id] = state.standings[id] || {id, pts:0, jg:0, jp:0, partidos:0, lr:0};
}

/* ================ motor ================ */
function playersByCourt(court){
  const list = state.players.filter(p => (Number(state.settings.courts||1)===1 ? true : p.court === court));
  return list.map(p=>p.id);
}

function generarAmericano(){
  // sólo genera la siguiente ronda de partidos abiertos si no hay ya partidos abiertos
  const round = Number(state.settings.round || 1);
  const stillOpen = state.schedule.some(m => m.round === round && m.status === "open");
  if (stillOpen) return;

  // si es la primera vez, crear el schedule completo (todas las parejas)
  if (state.schedule.length === 0) {
    const allRounds = [];

    const courts = Number(state.settings.courts || 1);
    for (let c=1;c<=courts;c++){
      // jugadores por cancha
      let ids = playersByCourt(c);

      // si impar -> comodín (sólo ahora, al generar)
      if (ids.length % 2 === 1) {
        const cid = `comodin-${c}`;
        if (!state.players.find(p=>p.id===cid)){
          db.ref(`${PPLAYERS()}/${cid}`).set({id: cid, name: `comodín-${c}`, court: c});
        }
        ids = playersByCourt(c); // refrescar con comodín
      }

      // máxima 8 por cancha
      if (ids.length > 8) {
        alert("Máximo 8 por cancha.");
        return;
      }

      const scheduleCourt = buildScheduleFor(ids, c);
      allRounds.push(...scheduleCourt);
    }

    // indexar y subir schedule completo
    const schedIndexed = {};
    allRounds.forEach((m, i) => { m.idx = i; schedIndexed[i]=m; });
    db.ref(PSCHED()).set(schedIndexed);
  }

  // abrir la ronda actual si no tiene partidos
  const exist = state.schedule.some(m => m.round === round);
  if (!exist) {
    alert("No hay más partidos. El Americano ha finalizado. Usa 'Crear eliminatoria'.");
  }
  renderMatches();
  updateProgress();
}

// crea partidos para TODAS las rondas de esa cancha, apilados por ronda y cancha
function buildScheduleFor(ids, court){
  // genera todas las parejas (combinaciones de 2)
  const pairs = [];
  for (let i=0;i<ids.length;i++){
    for (let j=i+1;j<ids.length;j++){
      pairs.push([ids[i], ids[j]]);
    }
  }
  // greedy: toma 2 parejas sin jugadores repetidos para formar partido
  const used = new Set();
  const matches = [];
  let round = 1;
  while (used.size < pairs.length) {
    const takenThisRound = new Set();
    let madeOne = false;

    for (let i=0;i<pairs.length;i++){
      if (used.has(i)) continue;
      const p1 = pairs[i];
      if (p1.some(x => takenThisRound.has(x))) continue;

      // buscar otra pareja disjunta
      let jfound = -1;
      for (let j=i+1;j<pairs.length;j++){
        if (used.has(j)) continue;
        const p2 = pairs[j];
        const disjoint = p2.every(x => !p1.includes(x)) && p2.every(x => !takenThisRound.has(x));
        if (disjoint){ jfound = j; break; }
      }
      if (jfound>=0){
        const p2 = pairs[jfound];
        matches.push({round, court, a: p1, b: p2, status:"open", score:{a:0,b:0}});
        // marcar usados
        used.add(i); used.add(jfound);
        p1.forEach(x=>takenThisRound.add(x));
        p2.forEach(x=>takenThisRound.add(x));
        madeOne = true;
      }
    }
    if (!madeOne){
      // si no pudimos armar más partidos en esta iteración, pasamos de ronda
      round++;
    } else {
      // si sí armamos al menos un partido, también avanzamos de ronda (para apilar por cancha)
      round++;
    }
  }
  return matches;
}

function guardarResultado(match, A, B){
  const target = Number(state.settings.target||3);
  if (A<0 || B<0) { alert("Marcador inválido."); return; }
  if (A===B) { alert("Debe haber un ganador."); return; }
  if (A>target && A-B<2) { alert("Gana por 2 (o igual a meta si así lo manejan)."); /* opcional */ }
  if (B>target && B-A<2) { /* idem */ }

  // actualizar standings
  [...match.a, ...match.b].forEach(id => ensureStanding(id));
  // sumo games
  match.a.forEach(id => state.standings[id].pts += A);
  match.b.forEach(id => state.standings[id].pts += B);

  if (A>B){
    match.a.forEach(id => state.standings[id].jg++);
    match.b.forEach(id => state.standings[id].jp++);
  } else {
    match.b.forEach(id => state.standings[id].jg++);
    match.a.forEach(id => state.standings[id].jp++);
  }
  [...match.a, ...match.b].forEach(id => {
    state.standings[id].partidos++;
    state.standings[id].lr = state.settings.round;
  });

  // persistir
  const idx = match.idx ?? state.schedule.findIndex(m => m === match);
  match.status = "done";
  match.score = {a:A, b:B};
  db.ref(`${PSCHED()}/${idx}`).update({status:"done", score:match.score});
  db.ref(PSTAND()).set(state.standings);

  updateProgress();
  renderMatches();
}

function avanzar(){
  // si ya no hay abiertos en la ronda -> o hay otra ronda con partidos o terminó
  const round = Number(state.settings.round||1);
  const nextExists = state.schedule.some(m => m.round === round+1);
  if (nextExists){
    db.ref(PSETT()).update({round: round+1});
  } else {
    // terminó el Americano
    alert("Americano completado. Usa 'Crear eliminatoria'.");
  }
}
