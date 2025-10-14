/* Padel-Americano Zacatecas v1.7 – rondas consistentes + botón iniciar bloqueado */

(function () {
  window.PAZ = window.PAZ || {};

  // ----- Estado -----
  const state = {
    players: [],
    courts: 1,
    pointsToWin: 3,
    round: 0,
    matches: [],        // partidos de la ronda ACTUAL (máx = courts)
    results: [],
    standings: {},
    lastRested: [],
    started: false       // <- para bloquear “Iniciar Americano” una vez arrancado
  };

  // ----- Nodos -----
  let cover, app, enterBtn, exitBtn;
  let pointsSelect, courtsSelect, playerInput, addPlayerBtn;
  let startBtn, nextRoundBtn, nextAvailBtn, resetBtn;
  let playersList, matchesArea, standingsArea, roundLabel;

  // ----- Init robusto -----
  function initUI() {
    cover       = document.getElementById('cover');
    app         = document.getElementById('app');
    enterBtn    = document.getElementById('enterBtn');
    exitBtn     = document.getElementById('exitBtn');
    pointsSelect= document.getElementById('pointsSelect');
    courtsSelect= document.getElementById('courtsSelect');
    playerInput = document.getElementById('playerInput');
    addPlayerBtn= document.getElementById('addPlayerBtn');
    startBtn    = document.getElementById('startBtn');
    nextRoundBtn= document.getElementById('nextRoundBtn');
    nextAvailBtn= document.getElementById('nextAvailBtn');
    resetBtn    = document.getElementById('resetBtn');
    playersList = document.getElementById('playersList');
    matchesArea = document.getElementById('matchesArea');
    standingsArea=document.getElementById('standingsArea');
    roundLabel  = document.getElementById('roundLabel');

    if (!cover || !app || !enterBtn) { setTimeout(initUI, 50); return; }

    if (enterBtn) enterBtn.addEventListener('click', onEnter);
    if (exitBtn)  exitBtn.addEventListener('click', onExit);
    document.addEventListener('click', (e)=>{ if(e.target?.id==='enterBtn') onEnter(); });
    window.PAZ.enter = onEnter;

    pointsSelect.addEventListener('change', () => {
      state.pointsToWin = parseInt(pointsSelect.value, 10);
      persist();
    });
    courtsSelect.addEventListener('change', () => {
      state.courts = parseInt(courtsSelect.value, 10);
      // Nota: si cambias canchas con torneo activo, la ronda actual
      // solo podrá abrir hasta ‘courts’ partidos. Persistimos.
      persist();
    });

    addPlayerBtn.addEventListener('click', addPlayer);
    playerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addPlayer(); });

    startBtn.addEventListener('click', startTournament);
    nextRoundBtn.addEventListener('click', nextRoundGlobal);
    nextAvailBtn.addEventListener('click', generateFromAvailable);
    resetBtn.addEventListener('click', confirmReset);

    // Defaults + cargar
    state.pointsToWin = parseInt(pointsSelect.value || '3', 10);
    state.courts = parseInt(courtsSelect.value || '1', 10);

    loadFromStorage();
    renderAll();
  }

  function onEnter(){ cover.classList.add('hidden'); app.classList.remove('hidden'); }
  function onExit(){ app.classList.add('hidden'); cover.classList.remove('hidden'); }

  // ----- Storage -----
  function persist(){ localStorage.setItem('pa_state_v17', JSON.stringify(state)); }
  function loadFromStorage(){
    const raw = localStorage.getItem('pa_state_v17'); if(!raw) return;
    try{
      const saved = JSON.parse(raw); Object.assign(state, saved);
      if(!Array.isArray(state.players)) state.players=[];
      if(!Array.isArray(state.matches)) state.matches=[];
      if(!Array.isArray(state.lastRested)) state.lastRested=[];
      if(!state.standings) state.standings={};
      pointsSelect.value = String(state.pointsToWin||3);
      courtsSelect.value = String(state.courts||1);
    }catch{}
  }

  // ----- Utils -----
  function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
  function ensureStatsFor(n){ if(!state.standings[n]) state.standings[n]={PJ:0,PG:0,PP:0,JF:0,JC:0,Dif:0,Pts:0}; }

  // ----- Jugadores -----
  function addPlayer(){
    const name=(playerInput.value||'').trim(); if(!name) return;
    if(state.players.includes(name)) return alert('Ese nombre ya está en la lista.');
    if(state.started) return alert('No puedes agregar jugadores con el Americano en curso.');
    state.players.push(name); ensureStatsFor(name);
    playerInput.value=''; persist(); renderPlayers();
  }
  function removePlayer(name){
    if(state.started) return alert('No puedes eliminar jugadores con el Americano en curso.');
    state.players = state.players.filter(p=>p!==name);
    persist(); renderPlayers();
  }

  // ----- Emparejar -----
  function generateRound(poolPlayers, maxMatches, lastRested=[]){
    const shuffled=shuffle(poolPlayers);
    const prio=shuffled.filter(p=>!lastRested.includes(p)).concat(shuffled.filter(p=>lastRested.includes(p)));
    const matches=[], used=new Set();
    for(let i=0;i<prio.length;){
      if(matches.length>=maxMatches) break;
      const block=[];
      while(i<prio.length && block.length<4){
        const c=prio[i++]; if(!used.has(c)){used.add(c); block.push(c);}
      }
      if(block.length===4) matches.push(block);
    }
    const rest=prio.filter(p=>!used.has(p));
    return {matches, rest};
  }
  function currentBusyPlayers(){
    const busy=new Set();
    state.matches.forEach(m=>{ if(m.status==='open') m.pairs.flat().forEach(p=>busy.add(p)); });
    return busy;
  }

  // ----- Torneo -----
  function startTournament(){
    if(state.started){
      alert('El Americano ya está iniciado. Usa “Borrar jornada” para reiniciar.');
      return;
    }
    if(state.players.length<4){ alert('Necesitas al menos 4 jugadores.'); return; }

    state.started=true;
    startBtn.disabled=true; startBtn.classList.add('opacity-50','cursor-not-allowed');

    state.round=1; roundLabel.textContent=`${state.round}`;
    state.matches=[]; state.results=[];
    const {matches, rest} = generateRound(state.players, state.courts, state.lastRested);
    state.matches = matches.map((b,i)=>({court:i+1,pairs:[[b[0],b[1]],[b[2],b[3]]],status:'open',result:null}));
    state.lastRested=rest;

    nextAvailBtn.classList.remove('hidden');
    nextRoundBtn.classList.add('hidden');

    persist(); renderAll();
  }

  // **Sólo rellena canchas libres DENTRO de la ronda actual.**
  function generateFromAvailable(){
    if(!state.started){ alert('Primero inicia el Americano.'); return; }

    // Si ya hay tantos partidos como canchas en esta ronda, no permitimos más.
    const totalThisRound = state.matches.length;
    if (totalThisRound >= state.courts) {
      alert('La ronda actual ya tiene todos sus partidos. Registra resultados o avanza de ronda.');
      return;
    }

    const open = state.matches.filter(m=>m.status==='open').length;
    const openCourts = state.courts - open;        // canchas libres EN ESTA RONDA
    const remainingSlots = state.courts - state.matches.length; // partidos que aún puede aceptar la ronda
    const capacity = Math.min(openCourts, remainingSlots);
    if (capacity <= 0) {
      alert('No hay canchas libres en esta ronda.');
      return;
    }

    const busy = currentBusyPlayers();
    const available = state.players.filter(p=>!busy.has(p));
    const remainNoRest = available.filter(p=>!state.lastRested.includes(p));
    const maxNew = Math.min(capacity, Math.floor(remainNoRest.length/4));
    if (maxNew <= 0) {
      alert('No hay suficientes jugadores disponibles para abrir un nuevo partido en esta ronda.');
      return;
    }

    const {matches, rest} = generateRound(remainNoRest, maxNew, state.lastRested);
    let nextCourt = state.matches.length + 1;
    matches.forEach(b=>{
      state.matches.push({court:nextCourt++,pairs:[[b[0],b[1]],[b[2],b[3]]],status:'open',result:null});
    });
    state.lastRested=rest;

    // Si ya completamos todos los partidos de la ronda, ocultamos el botón.
    if (state.matches.length >= state.courts) nextAvailBtn.classList.add('hidden');

    persist(); renderMatches();
  }

  function nextRoundGlobal(){
    // Solo si todos los partidos de la ronda están registrados
    if(!state.matches.length || !state.matches.every(m=>m.status==='done')){
      alert('Aún hay partidos abiertos en esta ronda.'); return;
    }
    state.round+=1; roundLabel.textContent=`${state.round}`;
    state.matches=[]; state.results=[];

    const {matches, rest}=generateRound(state.players, state.courts, state.lastRested);
    state.matches=matches.map((b,i)=>({court:i+1,pairs:[[b[0],b[1]],[b[2],b[3]]],status:'open',result:null}));
    state.lastRested=rest;

    // Nueva ronda: puedes intentar rellenar canchas libres si no se llenaron
    nextAvailBtn.classList.remove('hidden');
    nextRoundBtn.classList.add('hidden');

    persist(); renderAll();
  }

  function confirmReset(){
    const ok=confirm('¿Deseas borrar la jornada y reiniciar todo?'); if(!ok) return;
    Object.assign(state,{
      players: [],
      courts: parseInt(courtsSelect.value||'1',10),
      pointsToWin: parseInt(pointsSelect.value||'3',10),
      round: 0, matches: [], results: [], standings: {}, lastRested: [],
      started: false
    });
    // Reactivar botón iniciar
    startBtn.disabled=false; startBtn.classList.remove('opacity-50','cursor-not-allowed');

    persist(); renderAll();
  }

  // ----- Standings -----
  function applyMatchToStandings(pairA, pairB, a, b){
    const winA=a>b; pairA.forEach(p=>ensureStatsFor(p)); pairB.forEach(p=>ensureStatsFor(p));
    pairA.forEach(p=>{ const s=state.standings[p]; s.PJ++; s.JF+=a; s.JC+=b; s.Dif+=a-b; if(winA){s.PG++; s.Pts+=2;} else s.PP++; });
    pairB.forEach(p=>{ const s=state.standings[p]; s.PJ++; s.JF+=b; s.JC+=a; s.Dif+=b-a; if(!winA){s.PG++; s.Pts+=2;} else s.PP++; });
  }

  // ----- Render -----
  function renderAll(){ renderPlayers(); renderMatches(); renderStandings(); roundLabel.textContent=`${state.round||0}`; }
  function renderPlayers(){
    playersList.innerHTML='';
    const col=document.createElement('div'); col.className='bg-white rounded-xl shadow p-4 md:col-span-2';
    col.innerHTML=`<div class="text-gray-700 font-semibold mb-3">Jugadores (máx. 8 por cancha):</div>`;
    const wrap=document.createElement('div'); wrap.className='grid grid-cols-1 md:grid-cols-2 gap-3';
    state.players.forEach((p,i)=>{
      const row=document.createElement('div'); row.className='flex items-center gap-2';
      row.innerHTML=`
        <span class="inline-block w-8 text-gray-500">${i+1}.</span>
        <input type="text" value="${p}" class="flex-1 border rounded px-3 py-2" disabled />
        <button class="text-red-500 text-sm underline">quitar</button>`;
      const btn=row.querySelector('button'); btn.disabled=state.started;
      btn.addEventListener('click',()=>removePlayer(p));
      wrap.appendChild(row);
    });
    col.appendChild(wrap); playersList.appendChild(col);

    // Botón iniciar (bloqueado si started)
    if(state.started){ startBtn.disabled=true; startBtn.classList.add('opacity-50','cursor-not-allowed'); }
    else { startBtn.disabled=false; startBtn.classList.remove('opacity-50','cursor-not-allowed'); }
  }

  function renderMatches(){
    matchesArea.innerHTML='';
    const box=document.createElement('div'); box.className='bg-white rounded-xl shadow p-4';
    box.innerHTML='<div class="text-gray-700 font-semibold mb-3">Partidos actuales:</div>';

    state.matches.forEach((m,i)=>{
      const [a1,a2]=m.pairs[0]; const [b1,b2]=m.pairs[1];
      const card=document.createElement('div'); card.className='border rounded p-3 mb-3';
      const badge=(m.status==='done')?'<span class="ml-2 inline-block text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Registrado</span>':'';
      card.innerHTML=`
        <div class="font-semibold mb-2">Cancha ${m.court}:${badge}</div>
        <div class="mb-2">${a1} &amp; ${a2} <span class="mx-2">🆚</span> ${b1} &amp; ${b2}</div>
        <div class="flex items-center gap-3">
          <div class="text-sm text-gray-600">Juegos pareja 1:</div>
          <input id="sA-${i}" type="number" min="0" class="border rounded px-2 py-1 w-16" />
          <div class="text-sm text-gray-600">Juegos pareja 2:</div>
          <input id="sB-${i}" type="number" min="0" class="border rounded px-2 py-1 w-16" />
          <button id="reg-${i}" class="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-1 rounded">Registrar</button>
          <span id="ok-${i}" class="text-sm text-green-600"></span>
        </div>`;
      box.appendChild(card);

      const inpA=card.querySelector(`#sA-${i}`), inpB=card.querySelector(`#sB-${i}`);
      const btnR=card.querySelector(`#reg-${i}`), okSp=card.querySelector(`#ok-${i}`);

      if(m.status==='done'){ inpA.value=m.result.a; inpB.value=m.result.b; inpA.disabled=inpB.disabled=btnR.disabled=true; okSp.textContent='✔ Registrado'; }

      btnR.addEventListener('click',()=>{
        if(state.matches[i].status==='done'){ alert('Este partido ya fue registrado.'); return; }
        const a=parseInt(inpA.value,10), b=parseInt(inpB.value,10), maxPts=state.pointsToWin;
        if(Number.isNaN(a)||Number.isNaN(b)) return alert('Completa ambos marcadores.');
        if(a<0||b<0) return alert('Marcadores no pueden ser negativos.');
        if(a===b) return alert('Debe haber ganador.');
        const winner=Math.max(a,b), loser=Math.min(a,b);
        if(winner!==maxPts) return alert(`El ganador debe llegar a ${maxPts}.`);
        if(loser>maxPts-1) return alert(`El perdedor debe estar entre 0 y ${maxPts-1}.`);

        applyMatchToStandings(m.pairs[0], m.pairs[1], a, b);
        renderStandings();
        state.matches[i].status='done'; state.matches[i].result={a,b};
        okSp.textContent='✔ Registrado'; inpA.disabled=inpB.disabled=btnR.disabled=true;

        // ¿Se completó la ronda?
        const doneAll = state.matches.length>0 && state.matches.every(mm=>mm.status==='done');
        if(doneAll){ nextRoundBtn.classList.remove('hidden'); nextAvailBtn.classList.add('hidden'); }
        else{ nextAvailBtn.classList.remove('hidden'); }

        persist();
      });
    });

    const rest=document.createElement('div'); rest.className='text-sm text-gray-600 mt-2';
    const busy=currentBusyPlayers(); const resting=state.players.filter(p=>!busy.has(p));
    rest.textContent=`Descansan: ${resting.join(', ')||'—'}`;
    box.appendChild(rest);
    matchesArea.appendChild(box);

    // Si ya hay tantos partidos como canchas en esta ronda, oculta “generar disponibles”
    if(state.matches.length>=state.courts) nextAvailBtn.classList.add('hidden');
    else nextAvailBtn.classList.remove('hidden');
  }

  function renderStandings(){
    standingsArea.innerHTML='';
    const box=document.createElement('div'); box.className='bg-white rounded-xl shadow p-4';
    box.innerHTML='<div class="text-gray-700 font-semibold mb-3">Tabla de posiciones</div>';
    const rows=Object.entries(state.standings).map(([name,s])=>({name,...s}))
      .sort((a,b)=> b.Pts-a.Pts || b.Dif-a.Dif || b.JF-a.JF || a.JC-b.JC);
    const tbl=document.createElement('div'); tbl.className='overflow-x-auto';
    tbl.innerHTML=`
      <table class="min-w-full text-sm">
        <thead><tr class="text-left text-gray-600">
          <th class="py-2 px-2">#</th><th class="py-2 px-2">Jugador</th>
          <th class="py-2 px-2">PJ</th><th class="py-2 px-2">PG</th><th class="py-2 px-2">PP</th>
          <th class="py-2 px-2">JF</th><th class="py-2 px-2">JC</th><th class="py-2 px-2">Dif</th><th class="py-2 px-2">Pts</th>
        </tr></thead><tbody>${rows.map((r,i)=>`
          <tr class="border-t">
            <td class="py-1 px-2">${i+1}</td><td class="py-1 px-2">${r.name}</td>
            <td class="py-1 px-2">${r.PJ}</td><td class="py-1 px-2">${r.PG}</td>
            <td class="py-1 px-2">${r.PP}</td><td class="py-1 px-2">${r.JF}</td>
            <td class="py-1 px-2">${r.JC}</td><td class="py-1 px-2">${r.Dif}</td><td class="py-1 px-2">${r.Pts}</td>
          </tr>`).join('')}</tbody>
      </table>`;
    box.appendChild(tbl); standingsArea.appendChild(box);
  }

  initUI();
})();
