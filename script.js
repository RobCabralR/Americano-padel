/* =============================
   Padel-Americano Zacatecas v1.6 (rolling)
   ============================= */

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // ------- Estado -------
  const state = {
    players: [],           // array de nombres (únicos)
    courts: 1,
    pointsToWin: 3,
    round: 0,              // 0 antes de iniciar
    matches: [],           // [{court, pairs:[[a,b],[c,d]], status:'open'|'done', result:{a,b}|null}]
    results: [],           // espejo simple por índice
    standings: {},         // nombre -> stats
    lastRested: [],        // descansaron la generación anterior
  };

  // ------- Elementos DOM -------
  let cover, app;
  let enterBtn, exitBtn;

  let pointsSelect, courtsSelect;
  let playerInput, addPlayerBtn;
  let startBtn, nextRoundBtn, nextAvailBtn, resetBtn;

  let playersList, matchesArea, standingsArea, roundLabel;

  // ------- Inicialización UI -------
  function initUI() {
    cover = document.getElementById('cover');
    app = document.getElementById('app');

    enterBtn = document.getElementById('enterBtn');
    exitBtn = document.getElementById('exitBtn');

    pointsSelect = document.getElementById('pointsSelect');
    courtsSelect = document.getElementById('courtsSelect');
    playerInput = document.getElementById('playerInput');
    addPlayerBtn = document.getElementById('addPlayerBtn');

    startBtn = document.getElementById('startBtn');
    nextRoundBtn = document.getElementById('nextRoundBtn');
    nextAvailBtn = document.getElementById('nextAvailBtn');
    resetBtn = document.getElementById('resetBtn');

    playersList = document.getElementById('playersList');
    matchesArea = document.getElementById('matchesArea');
    standingsArea = document.getElementById('standingsArea');
    roundLabel = document.getElementById('roundLabel');

    // listeners
    if (enterBtn) enterBtn.addEventListener('click', () => {
      cover.classList.add('hidden');
      app.classList.remove('hidden');
      loadFromStorage();
      renderAll();
    });

    if (exitBtn) exitBtn.addEventListener('click', () => {
      app.classList.add('hidden');
      cover.classList.remove('hidden');
    });

    pointsSelect.addEventListener('change', () => {
      state.pointsToWin = parseInt(pointsSelect.value, 10);
      persist();
    });

    courtsSelect.addEventListener('change', () => {
      state.courts = parseInt(courtsSelect.value, 10);
      persist();
    });

    addPlayerBtn.addEventListener('click', addPlayer);
    playerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addPlayer();
    });

    startBtn.addEventListener('click', startTournament);
    nextRoundBtn.addEventListener('click', nextRoundGlobal);
    nextAvailBtn.addEventListener('click', generateFromAvailable);
    resetBtn.addEventListener('click', confirmReset);

    // Defaults
    state.pointsToWin = parseInt(pointsSelect.value, 10);
    state.courts = parseInt(courtsSelect.value, 10);

    // Si entras directo a / (sin pulsar entrar), intenta cargar
    loadFromStorage();
    renderAll();
  }

  // ------- Helpers -------
  function persist() {
    localStorage.setItem('pa_state_v16', JSON.stringify(state));
  }

  function loadFromStorage() {
    const raw = localStorage.getItem('pa_state_v16');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      // merge básico
      Object.assign(state, saved);
      if (!Array.isArray(state.players)) state.players = [];
      if (!Array.isArray(state.matches)) state.matches = [];
      if (!Array.isArray(state.lastRested)) state.lastRested = [];
      if (typeof state.standings !== 'object' || !state.standings) state.standings = {};
      // Sincroniza selects y ronda
      pointsSelect.value = String(state.pointsToWin || 3);
      courtsSelect.value = String(state.courts || 1);
    } catch {}
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function ensureStatsFor(name) {
    if (!state.standings[name]) {
      state.standings[name] = { PJ:0, PG:0, PP:0, JF:0, JC:0, Dif:0, Pts:0 };
    }
  }

  function addPlayer() {
    const name = (playerInput.value || '').trim();
    if (!name) return;
    if (state.players.includes(name)) {
      alert('Ese nombre ya está en la lista.');
      return;
    }
    state.players.push(name);
    ensureStatsFor(name);
    playerInput.value = '';
    persist();
    renderPlayers();
  }

  function removePlayer(name) {
    // si ya hay ronda, no permitas borrar (para evitar inconsistencias)
    if (state.round > 0) {
      alert('No puedes eliminar jugadores con el Americano en curso.');
      return;
    }
    state.players = state.players.filter(p => p !== name);
    persist();
    renderPlayers();
  }

  // ------- Emparejamientos -------
  // genera hasta maxMatches con players[] (múltiplos de 4), devuelve {matches:[[a,b,c,d]...], rest:[...]}
  function generateRound(poolPlayers, maxMatches, lastRested = []) {
    const shuffled = shuffle(poolPlayers);
    // empuja al final a quienes descansaron antes (para darles prioridad a jugar ahora)
    const prio = shuffled.filter(p => !lastRested.includes(p))
      .concat(shuffled.filter(p => lastRested.includes(p)));

    const matches = [];
    const used = new Set();

    for (let i = 0; i < prio.length; ) {
      if (matches.length >= maxMatches) break;
      const block = [];
      while (i < prio.length && block.length < 4) {
        const cand = prio[i++];
        if (!used.has(cand)) {
          used.add(cand);
          block.push(cand);
        }
      }
      if (block.length === 4) {
        matches.push(block); // [p0,p1,p2,p3] -> (p0,p1) vs (p2,p3)
      }
    }

    // resto = los no usados
    const rest = prio.filter(p => !used.has(p));
    return { matches, rest };
  }

  function currentBusyPlayers() {
    const busy = new Set();
    state.matches.forEach(m => {
      if (m.status === 'open') {
        m.pairs.flat().forEach(p => busy.add(p));
      }
    });
    return busy;
  }

  // ------- Lógica principal -------
  function startTournament() {
    if (state.players.length < 4) {
      alert('Necesitas al menos 4 jugadores.');
      return;
    }
    if (state.round > 0 && state.matches.some(m => m.status === 'open')) {
      alert('Hay partidos abiertos. Termina o regístralos antes.');
      return;
    }
    state.round = 1;
    roundLabel.textContent = `${state.round}`;
    // reset de matches/resultados de la ronda
    state.matches = [];
    state.results = [];
    // generar primera tanda
    const { matches, rest } = generateRound(state.players, state.courts, state.lastRested);
    state.matches = matches.map((block, idx) => ({
      court: idx + 1,
      pairs: [[block[0], block[1]], [block[2], block[3]]],
      status: 'open',
      result: null
    }));
    state.lastRested = rest;
    nextAvailBtn.classList.remove('hidden'); // rolling disponible
    nextRoundBtn.classList.add('hidden');
    persist();
    renderAll();
  }

  // Generar más partidos usando jugadores disponibles (rolling)
  function generateFromAvailable() {
    const busy = currentBusyPlayers();
    const available = state.players.filter(p => !busy.has(p));
    const remain = available.filter(p => !state.lastRested.includes(p));

    const openCourts = state.courts - state.matches.filter(m => m.status === 'open').length;
    if (openCourts <= 0) return alert('No hay canchas libres por ahora.');
    const maxNew = Math.min(openCourts, Math.floor(remain.length / 4));
    if (maxNew <= 0) return alert('No hay suficientes jugadores disponibles.');

    const { matches, rest } = generateRound(remain, maxNew, state.lastRested);

    let nextCourt = state.matches.length + 1;
    matches.forEach(block => {
      state.matches.push({
        court: nextCourt++,
        pairs: [[block[0], block[1]], [block[2], block[3]]],
        status: 'open',
        result: null
      });
    });
    // descansan los que no entraron en este batch
    state.lastRested = rest;
    persist();
    renderMatches();
  }

  function nextRoundGlobal() {
    // Solo si todos cerrados
    if (!state.matches.every(m => m.status === 'done')) {
      alert('Aún hay partidos abiertos.');
      return;
    }
    state.round += 1;
    roundLabel.textContent = `${state.round}`;

    // nueva ronda: vacía la lista de partidos y genera desde cero
    state.matches = [];
    state.results = [];

    const { matches, rest } = generateRound(state.players, state.courts, state.lastRested);
    state.matches = matches.map((block, idx) => ({
      court: idx + 1,
      pairs: [[block[0], block[1]], [block[2], block[3]]],
      status: 'open',
      result: null
    }));
    state.lastRested = rest;

    nextRoundBtn.classList.add('hidden');
    nextAvailBtn.classList.remove('hidden');
    persist();
    renderAll();
  }

  function confirmReset() {
    if (!state.round && state.players.length === 0) return;
    const ok = confirm('¿Deseas borrar la jornada y reiniciar todo?');
    if (!ok) return;
    Object.assign(state, {
      players: [],
      courts: parseInt(courtsSelect.value, 10) || 1,
      pointsToWin: parseInt(pointsSelect.value, 10) || 3,
      round: 0,
      matches: [],
      results: [],
      standings: {},
      lastRested: []
    });
    persist();
    renderAll();
  }

  // ------- Standings -------
  function applyMatchToStandings(pairA, pairB, a, b) {
    const A = pairA, B = pairB;
    const winA = a > b;

    A.forEach(p => ensureStatsFor(p));
    B.forEach(p => ensureStatsFor(p));

    // por jugador
    A.forEach(p => {
      state.standings[p].PJ += 1;
      state.standings[p].JF += a;
      state.standings[p].JC += b;
      state.standings[p].Dif += (a - b);
      if (winA) {
        state.standings[p].PG += 1;
        state.standings[p].Pts += 2;
      } else {
        state.standings[p].PP += 1;
      }
    });

    B.forEach(p => {
      state.standings[p].PJ += 1;
      state.standings[p].JF += b;
      state.standings[p].JC += a;
      state.standings[p].Dif += (b - a);
      if (!winA) {
        state.standings[p].PG += 1;
        state.standings[p].Pts += 2;
      } else {
        state.standings[p].PP += 1;
      }
    });
  }

  // ------- Render -------
  function renderAll() {
    renderPlayers();
    renderMatches();
    renderStandings();
    roundLabel.textContent = `${state.round || 0}`;
  }

  function renderPlayers() {
    playersList.innerHTML = '';
    const col = document.createElement('div');
    col.className = 'bg-white rounded-xl shadow p-4 md:col-span-2';

    const title = document.createElement('div');
    title.className = 'text-gray-700 font-semibold mb-3';
    title.textContent = `Jugadores (máx. 8 por cancha):`;
    col.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'grid grid-cols-1 md:grid-cols-2 gap-3';

    state.players.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2';
      row.innerHTML = `
        <span class="inline-block w-8 text-gray-500">${idx + 1}.</span>
        <input type="text" value="${p}" class="flex-1 border rounded px-3 py-2" disabled />
        <button class="text-red-500 text-sm underline">quitar</button>
      `;
      const btn = row.querySelector('button');
      btn.addEventListener('click', () => removePlayer(p));
      wrap.appendChild(row);
    });

    col.appendChild(wrap);
    playersList.appendChild(col);
  }

  function renderMatches() {
    matchesArea.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'bg-white rounded-xl shadow p-4';

    const head = document.createElement('div');
    head.className = 'text-gray-700 font-semibold mb-3';
    head.textContent = 'Partidos actuales:';
    box.appendChild(head);

    // tarjetas por partido
    state.matches.forEach((m, i) => {
      const [a1, a2] = m.pairs[0];
      const [b1, b2] = m.pairs[1];

      const card = document.createElement('div');
      card.className = 'border rounded p-3 mb-3';

      const statusBadge =
        m.status === 'done'
          ? '<span class="ml-2 inline-block text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Registrado</span>'
          : '';

      card.innerHTML = `
        <div class="font-semibold mb-2">Cancha ${m.court}:${statusBadge}</div>
        <div class="mb-2">${a1} &amp; ${a2} <span class="mx-2">🆚</span> ${b1} &amp; ${b2}</div>
        <div class="flex items-center gap-3">
          <div class="text-sm text-gray-600">Juegos pareja 1:</div>
          <input id="sA-${i}" type="number" min="0" class="border rounded px-2 py-1 w-16" />
          <div class="text-sm text-gray-600">Juegos pareja 2:</div>
          <input id="sB-${i}" type="number" min="0" class="border rounded px-2 py-1 w-16" />
          <button id="reg-${i}" class="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-1 rounded">
            Registrar
          </button>
          <span id="ok-${i}" class="text-sm text-green-600"></span>
        </div>
      `;

      box.appendChild(card);

      // preparar estado visual si ya estaba registrado
      const inpA = card.querySelector(`#sA-${i}`);
      const inpB = card.querySelector(`#sB-${i}`);
      const btnR = card.querySelector(`#reg-${i}`);
      const okSp = card.querySelector(`#ok-${i}`);

      if (m.status === 'done') {
        inpA.value = m.result.a;
        inpB.value = m.result.b;
        inpA.disabled = true;
        inpB.disabled = true;
        btnR.disabled = true;
        okSp.textContent = '✔ Registrado';
      }

      btnR.addEventListener('click', () => {
        const a = parseInt(inpA.value, 10);
        const b = parseInt(inpB.value, 10);
        const maxPts = state.pointsToWin;

        if (state.matches[i].status === 'done') {
          alert('Este partido ya fue registrado.');
          return;
        }
        if (Number.isNaN(a) || Number.isNaN(b)) {
          alert('Completa ambos marcadores.');
          return;
        }
        if (a < 0 || b < 0) {
          alert('Marcadores no pueden ser negativos.');
          return;
        }
        if (a === b) {
          alert('Debe haber ganador (no empates).');
          return;
        }
        const winner = a > b ? a : b;
        const loser = a > b ? b : a;
        if (winner !== maxPts) {
          alert(`El ganador debe llegar a ${maxPts}.`);
          return;
        }
        if (loser > maxPts - 1) {
          alert(`El perdedor debe estar entre 0 y ${maxPts - 1}.`);
          return;
        }

        // aplica standings
        applyMatchToStandings(m.pairs[0], m.pairs[1], a, b);
        renderStandings();

        // marca como done y bloquea
        state.matches[i].status = 'done';
        state.matches[i].result = { a, b };
        okSp.textContent = '✔ Registrado';
        inpA.disabled = true;
        inpB.disabled = true;
        btnR.disabled = true;

        // si todos cerrados => permite "Siguiente ronda (global)"
        const allDone = state.matches.every(mm => mm.status === 'done');
        if (allDone) nextRoundBtn.classList.remove('hidden');

        // rolling: mantener visible
        nextAvailBtn.classList.remove('hidden');

        persist();
      });
    });

    // Descansan
    const rest = document.createElement('div');
    rest.className = 'text-sm text-gray-600 mt-2';
    const busy = currentBusyPlayers();
    const resting = state.players.filter(p => !busy.has(p));
    rest.textContent = `Descansan: ${resting.join(', ') || '—'}`;
    box.appendChild(rest);

    matchesArea.appendChild(box);
  }

  function renderStandings() {
    standingsArea.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'bg-white rounded-xl shadow p-4';

    const head = document.createElement('div');
    head.className = 'text-gray-700 font-semibold mb-3';
    head.textContent = 'Tabla de posiciones';
    box.appendChild(head);

    // clona y ordena
    const rows = Object.entries(state.standings).map(([name, s]) => ({ name, ...s }));
    rows.sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.Dif !== a.Dif) return b.Dif - a.Dif;
      if (b.JF !== a.JF) return b.JF - a.JF;
      return a.JC - b.JC;
    });

    const table = document.createElement('div');
    table.className = 'overflow-x-auto';
    table.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left text-gray-600">
            <th class="py-2 px-2">#</th>
            <th class="py-2 px-2">Jugador</th>
            <th class="py-2 px-2">PJ</th>
            <th class="py-2 px-2">PG</th>
            <th class="py-2 px-2">PP</th>
            <th class="py-2 px-2">JF</th>
            <th class="py-2 px-2">JC</th>
            <th class="py-2 px-2">Dif</th>
            <th class="py-2 px-2">Pts</th>
          </tr>
        </thead>
        <tbody id="standRows"></tbody>
      </table>
    `;
    box.appendChild(table);
    standingsArea.appendChild(box);

    const tbody = table.querySelector('#standRows');
    tbody.innerHTML = rows.map((r, idx) => `
      <tr class="border-t">
        <td class="py-1 px-2">${idx + 1}</td>
        <td class="py-1 px-2">${r.name}</td>
        <td class="py-1 px-2">${r.PJ}</td>
        <td class="py-1 px-2">${r.PG}</td>
        <td class="py-1 px-2">${r.PP}</td>
        <td class="py-1 px-2">${r.JF}</td>
        <td class="py-1 px-2">${r.JC}</td>
        <td class="py-1 px-2">${r.Dif}</td>
        <td class="py-1 px-2">${r.Pts}</td>
      </tr>
    `).join('');
  }
})();
