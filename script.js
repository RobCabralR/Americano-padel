/*********************************************************
 *  Americano Padel – módulo UI + Eliminatorias
 *  NOTAS:
 *  - Conecta los stubs a tus funciones existentes.
 *  - Mantiene 1 partido abierto por cancha.
 *  - Valida marcador con la "meta".
 **********************************************************/

/* =========================
   ESTADO BÁSICO (puedes reutilizar el tuyo)
   ========================= */

const state = {
  // ejemplo de listas de jugadores por cancha (reemplaza por tu fuente real)
  players: {
    1: [], // ['a','b',...]
    2: []
  },
  // si tienes standings en memoria, puedes guardarlos aquí
  // standings: { 1: [...], 2: [...] }
};

/* =========================
   HOOKS CON TU LÓGICA EXISTENTE
   ========================= */

/** Genera siguiente partido de Americano para una cancha (tu lógica). */
function generateAmericanoForCourt(court) {
  // TODO: conecta con tu generador actual de Americano.
  //   Debe renderizar exactamente 1 partido en #matchesCourt{court}
  //   con inputs de score y botón "Guardar resultado".
  //   Cuando llames a "saveAmericanoResult" desde ese botón,
  //   tu lógica debe actualizar standings, jugadores, etc.
  alert(`(stub) Generar partidos Americano — Cancha ${court}. Conecta tu función real.`);
}

/** Guarda el resultado de Americano (tu lógica). */
function saveAmericanoResult(court, teamA, teamB, sA, sB) {
  // TODO: integra tu lógica de guardado/suma de puntos.
  console.log('(stub) saveAmericanoResult', { court, teamA, teamB, sA, sB });
  // Al terminar, puedes volver a llamar generateAmericanoForCourt(court)
}

/** Render de standings (si los traes de otro lado). */
function renderStandings(court, rows /* [{name,pts,...}] */) {
  const table = document.getElementById(court === 1 ? 'standingsCourt1' : 'standingsCourt2');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${r.name}</td>
      <td>${r.pts ?? 0}</td>
      <td>${r.jg ?? 0}</td>
      <td>${r.jp ?? 0}</td>
      <td>${r.partidos ?? 0}</td>
      <td>${r.last ?? 0}</td>`;
    tbody.appendChild(tr);
  });
}

/** Render pills de jugadores (tu UI actual). */
function renderPlayers(court) {
  const ul = document.getElementById(court === 1 ? 'playersCourt1' : 'playersCourt2');
  if (!ul) return;
  ul.innerHTML = '';
  state.players[court].forEach(name => {
    const li = document.createElement('li');
    li.className = 'pill';
    li.innerHTML = `
      <div class="left">
        <span class="tag">${name}</span>
        <span class="badge">C${court}</span>
      </div>
      <button class="danger small">x</button>`;
    li.querySelector('button').addEventListener('click', () => {
      state.players[court] = state.players[court].filter(n => n !== name);
      renderPlayers(court);
    });
    ul.appendChild(li);
  });
}

/* =========================
   SELECTORES / CONTROLES
   ========================= */

function getCourtsCount() {
  const el = document.getElementById('courtsSelect');
  return el ? parseInt(el.value, 10) : 1;
}
function getMeta() {
  const el = document.getElementById('metaSelect');
  return el ? parseInt(el.value, 10) : 3;
}

/* Visibilidad de Cancha 2 */
function updateCourtsLayout() {
  const count = getCourtsCount();
  const w2 = document.getElementById('court2Wrap');
  if (w2) w2.style.display = (count >= 2) ? '' : 'none';
}
document.getElementById('courtsSelect')?.addEventListener('change', updateCourtsLayout);
updateCourtsLayout();

/* Límite 8 por cancha */
function canAddToCourt(court) {
  return state.players[court].length < 8;
}

/* Inputs agregar jugadores */
document.getElementById('addC1')?.addEventListener('click', () => {
  const name = (document.getElementById('playerNameC1').value || '').trim();
  if (!name) return;
  if (!canAddToCourt(1)) { alert('Máximo 8 jugadores en Cancha 1'); return; }
  if (!state.players[1].includes(name)) state.players[1].push(name);
  document.getElementById('playerNameC1').value = '';
  renderPlayers(1);
});
document.getElementById('addC2')?.addEventListener('click', () => {
  const name = (document.getElementById('playerNameC2').value || '').trim();
  if (!name) return;
  if (!canAddToCourt(2)) { alert('Máximo 8 jugadores en Cancha 2'); return; }
  if (!state.players[2].includes(name)) state.players[2].push(name);
  document.getElementById('playerNameC2').value = '';
  renderPlayers(2);
});

/* Reinicios por cancha */
document.getElementById('resetC1')?.addEventListener('click', () => {
  state.players[1] = [];
  renderPlayers(1);
  document.getElementById('matchesCourt1').innerHTML = '';
  renderStandings(1, []);
});
document.getElementById('resetC2')?.addEventListener('click', () => {
  state.players[2] = [];
  renderPlayers(2);
  document.getElementById('matchesCourt2').innerHTML = '';
  renderStandings(2, []);
});

/* Generar partidos de Americano (usa tu generador real) */
document.getElementById('genMatchesC1')?.addEventListener('click', () => generateAmericanoForCourt(1));
document.getElementById('genMatchesC2')?.addEventListener('click', () => generateAmericanoForCourt(2));

/* =========================
   STANDINGS LECTURA (desde DOM)
   ========================= */

/** Lee standings de la tabla y devuelve lista ordenada [{name,pts}, ...] */
function getStandingsForCourt(court) {
  const tableEl = document.getElementById(court === 1 ? 'standingsCourt1' : 'standingsCourt2');
  const rows = [...(tableEl?.querySelectorAll('tbody tr') || [])];
  const list = rows.map(tr => {
    const tds = tr.querySelectorAll('td');
    return {
      name: (tds[1]?.textContent || '').trim(),
      pts : parseInt(tds[2]?.textContent || '0', 10) || 0
    };
  });
  list.sort((a, b) => b.pts - a.pts);
  return list;
}

/* =========================
   RENDER PARTIDOS "1 ABIERTO"
   ========================= */

function renderSingleMatchCard(court, title, pairA, pairB, onSave) {
  const container = document.getElementById(court === 1 ? 'matchesCourt1' : 'matchesCourt2');
  if (!container) return;

  // "solo 1 abierto"
  container.innerHTML = '';

  const meta = getMeta();
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="meta">${title}</div>
    <div class="vs">
      ${pairA.map(p => `<span class="tag">${p}</span>`).join(' ')}
      <span class="muted">vs</span>
      ${pairB.map(p => `<span class="tag">${p}</span>`).join(' ')}
      <div class="mark">
        <label class="muted">Marcador (a ${meta}):</label>
        <input type="number" min="0" class="score" id="sA" value="0">
        <span class="muted">-</span>
        <input type="number" min="0" class="score" id="sB" value="0">
      </div>
      <button class="primary" id="btnSave">Guardar resultado</button>
    </div>
  `;
  container.appendChild(card);

  card.querySelector('#btnSave')?.addEventListener('click', () => {
    const sA = parseInt(card.querySelector('#sA').value || '0', 10);
    const sB = parseInt(card.querySelector('#sB').value || '0', 10);
    if (!validateScore(sA, sB)) return;
    onSave({ sA, sB, pairA: [...pairA], pairB: [...pairB], court });
  });
}

/* =========================
   VALIDACIÓN META
   ========================= */

function validateScore(sA, sB) {
  const meta = getMeta();
  const aWin = (sA === meta) && (sB >= 0 && sB < meta);
  const bWin = (sB === meta) && (sA >= 0 && sA < meta);
  if (!aWin && !bWin) {
    alert(`Marcador inválido. El ganador debe llegar a ${meta} y el rival quedar por debajo.`);
    return false;
  }
  return true;
}

/* =========================
   ELIMINATORIAS
   ========================= */

const nextSemiByCourt = { 1: null, 2: null };
let pendingLowCrossSecond = null;

/** Semifinales POR CANCHA (1,3 vs 2,4 y opcional 5,7 vs 6,8) */
function createSemisByCourt(court) {
  const list = getStandingsForCourt(court).map(x => x.name);
  if (list.length < 4) {
    alert('Se necesitan al menos 4 jugadores en la cancha para semifinales.');
    return;
  }

  // TOP 4: 1,3 vs 2,4
  const t1 = list[0], t2 = list[1], t3 = list[2], t4 = list[3];
  const topSemi1A = [t1, t3], topSemi1B = [t2, t4];
  renderSingleMatchCard(court, `Eliminatoria — Cancha ${court} · Semi 1`, topSemi1A, topSemi1B, saveElimResult);

  // Bloque bajo si hay >=8
  if (list.length >= 8) {
    const b5 = list[4], b6 = list[5], b7 = list[6], b8 = list[7];
    nextSemiByCourt[court] = {
      title: `Eliminatoria — Cancha ${court} · Semi 2 (bajo)`,
      pairA: [b5, b7],
      pairB: [b6, b8]
    };
  } else {
    nextSemiByCourt[court] = null;
  }
}

/** Semifinales CRUZADAS entre 2 canchas */
function createSemisCrossTwoCourts() {
  if (getCourtsCount() < 2) {
    alert('Selecciona 2 canchas para generar semifinales cruzadas.');
    return;
  }
  const a = getStandingsForCourt(1).map(x => x.name);
  const b = getStandingsForCourt(2).map(x => x.name);
  if (a.length < 4 || b.length < 4) {
    alert('Se requieren al menos 4 jugadores en cada cancha para cruzar semifinales.');
    return;
  }

  // C1(1,3) vs C2(2,4)
  renderSingleMatchCard(1, `Eliminatoria — Cruzada · Semi 1`, [a[0], a[2]], [b[1], b[3]], saveElimResult);
  // C1(2,4) vs C2(1,3) (queda pendiente en C1)
  nextSemiByCourt[1] = {
    title: `Eliminatoria — Cruzada · Semi 2`,
    pairA: [a[1], a[3]],
    pairB: [b[0], b[2]]
  };

  // Bajo si ambas tienen 8
  if (a.length >= 8 && b.length >= 8) {
    // Primero en C2:
    nextSemiByCourt[2] = {
      title: `Eliminatoria — Cruzada · Bajo 1`,
      pairA: [a[4], a[6]], // C1(5,7)
      pairB: [b[5], b[7]]  // C2(6,8)
    };
    // Después en C2:
    pendingLowCrossSecond = {
      title: `Eliminatoria — Cruzada · Bajo 2`,
      pairA: [a[5], a[7]], // C1(6,8)
      pairB: [b[4], b[6]]  // C2(5,7)
    };
  } else {
    nextSemiByCourt[2] = null;
    pendingLowCrossSecond = null;
  }
}

/** Guardar resultado de eliminatoria y encadenar la siguiente si aplica */
function saveElimResult({ sA, sB, pairA, pairB, court }) {
  // TODO: si quieres sumar algo a un historial de playoffs, hazlo aquí.
  console.log('elim result', { court, pairA, sA, pairB, sB });

  const nxt = nextSemiByCourt[court];
  const container = document.getElementById(court === 1 ? 'matchesCourt1' : 'matchesCourt2');

  if (nxt) {
    renderSingleMatchCard(court, nxt.title, nxt.pairA, nxt.pairB, saveElimResult);
    nextSemiByCourt[court] = null;
  } else if (pendingLowCrossSecond && court === 2) {
    renderSingleMatchCard(2, pendingLowCrossSecond.title, pendingLowCrossSecond.pairA, pendingLowCrossSecond.pairB, saveElimResult);
    pendingLowCrossSecond = null;
  } else {
    if (container) container.innerHTML = '';
  }
}

/* =========================
   BOTONES ELIMINATORIA
   ========================= */

document.getElementById('btnElimsCourt1')?.addEventListener('click', () => {
  if (getCourtsCount() === 1) {
    createSemisByCourt(1);
  } else {
    // con 2 canchas, también permitimos semis solo de cancha 1 si quieres
    if (confirm('¿Crear eliminatoria solo para Cancha 1? (Aceptar = Solo C1, Cancelar = Cruzadas entre 2 canchas)')) {
      createSemisByCourt(1);
    } else {
      createSemisCrossTwoCourts();
    }
  }
});

document.getElementById('btnElimsGlobal')?.addEventListener('click', () => {
  if (getCourtsCount() === 1) createSemisByCourt(1);
  else createSemisCrossTwoCourts();
});

/* =========================
   INICIAL (render vacío)
   ========================= */

renderPlayers(1);
renderPlayers(2);
renderStandings(1, []); // si tienes standings en memoria, colócalos aquí
renderStandings(2, []);
