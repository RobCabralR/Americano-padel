/***** Estado *****/
const state = {
  room: (location.hash.slice(1) || Math.random().toString(36).slice(2,7)),
  round: 1,
  target: 3,
  courts: 1,
  stage: "group",         // "group" | "playoff"
  playoffMode: "auto",    // auto | semis8 | quarters8
  players: [],            // {id,name,court:1|2, g:gamesFor, ga:gamesAgainst, w, l, matches, lastRound}
  matches: [],            // [{id,court,round,teamA:[id,id],teamB:[id,id],scoreA,scoreB,done}]
};

const el = sel => document.querySelector(sel);
const els = sel => [...document.querySelectorAll(sel)];

/***** Utils *****/
function uid(){ return Math.random().toString(36).slice(2,9); }
function byCourt(c){ return p => p.court === c; }
function playersOf(court){ return state.players.filter(byCourt(court)); }

function safeParseInt(v){ const n = parseInt(v,10); return Number.isFinite(n)?n:0; }

/***** Render Top *****/
function initTop(){
  el('#roomCode').textContent = state.room;
  if(!location.hash) location.hash = state.room;

  el('#copyRoom').onclick = () => {
    navigator.clipboard.writeText(location.href);
    el('#copyRoom').textContent = 'Copiado';
    setTimeout(()=>el('#copyRoom').textContent='Copiar',900);
  };

  const cs = el('#courtsSelect');
  cs.value = String(state.courts);
  cs.onchange = () => {
    state.courts = safeParseInt(cs.value);
    el('#c2Head').style.display = state.courts===2 ? '' : 'none';
    el('#tableC2').style.display = state.courts===2 ? '' : 'none';
    renderAll();
  };

  const ts = el('#targetSelect');
  ts.value = String(state.target);
  ts.onchange = () => { state.target = safeParseInt(ts.value); renderAll(); };

  const pm = el('#playoffMode');
  pm.value = state.playoffMode;
  pm.onchange = () => { state.playoffMode = pm.value; };
}

function renderAll(){
  renderPlayers();
  renderStandings(1);
  if(state.courts===2) renderStandings(2);
  renderRoundHeader();
  renderMatches();
}

/***** Jugadores *****/
function renderPlayers(){
  const list = el('#playersList');
  list.innerHTML = '';
  state.players.forEach(p=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="left">
        <span class="badge">${p.name}</span>
        <select data-id="${p.id}" class="courtSel">
          <option value="1" ${p.court===1?'selected':''}>1</option>
          <option value="2" ${p.court===2?'selected':''}>2</option>
        </select>
      </div>
      <button data-id="${p.id}" class="ghost">x</button>
    `;
    list.appendChild(li);
  });

  els('.courtSel').forEach(s=>{
    s.onchange = (e)=>{
      const id = e.target.dataset.id;
      const pl = state.players.find(x=>x.id===id);
      pl.court = safeParseInt(e.target.value);
      renderAll();
    };
  });

  els('#playersList .ghost').forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.id;
      state.players = state.players.filter(p=>p.id!==id);
      renderAll();
    };
  });
}

function attachPlayerUI(){
  el('#addPlayerBtn').onclick = ()=>{
    const name = el('#playerInput').value.trim();
    if(!name) return;
    const court = state.courts===1 ? 1 : (playersOf(1).length<=playersOf(2).length?1:2);
    state.players.push({id:uid(), name, court, g:0, ga:0, w:0, l:0, matches:0, lastRound:0});
    el('#playerInput').value = '';
    renderAll();
  };
  el('#resetBtn').onclick = ()=>{
    if(!confirm('¿Seguro? Se borrará la sesión.')) return;
    state.players = [];
    state.matches = [];
    state.round = 1;
    state.stage = 'group';
    renderAll();
  };
}

/***** Standings por cancha *****/
function standings(court){
  const rows = playersOf(court).map(p=>({
    id:p.id, name:p.name,
    pts:p.g, jg:p.w, jp:p.l, pj:p.matches, last:p.lastRound
  }));
  rows.sort((a,b)=> b.pts - a.pts || b.jg - a.jg || a.jp - b.jp || a.last - b.last || a.name.localeCompare(b.name));
  return rows;
}

function renderStandings(court){
  const tb = el(court===1 ? '#tableC1 tbody' : '#tableC2 tbody');
  const rows = standings(court);
  tb.innerHTML = rows.map((r,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td>${r.pts}</td>
      <td>${r.jg}</td>
      <td>${r.jp}</td>
      <td>${r.pj}</td>
      <td>${r.last}</td>
    </tr>
  `).join('');
}

/***** Partidos (render) *****/
function renderRoundHeader(){
  el('#roundBadge').textContent = state.round;
  if(state.stage==='group'){
    el('#roundTitle').textContent = `Partidos (ronda ${state.round})`;
  }else{
    el('#roundTitle').textContent = `Eliminatoria (ronda ${state.round})`;
  }
}

function renderMatches(){
  const box = el('#matches');
  const list = state.matches.filter(m=>m.round===state.round);
  box.innerHTML = '';
  if(!list.length){
    // mostrar CTA de playoff si terminó grupo
    if(state.stage==='group'){
      const allClosed = groupFinished();
      el('#playoffBtn').style.display = allClosed ? '' : 'none';
      el('#playoffBtn').textContent = suggestPlayoffLabel();
    }else{
      el('#playoffBtn').style.display = 'none';
    }
    return;
  }
  el('#playoffBtn').style.display = 'none';

  list.forEach(m=>{
    const card = document.createElement('div');
    card.className='card';
    const a = m.teamA.map(id=>nameOf(id)).join(' ');
    const b = m.teamB.map(id=>nameOf(id)).join(' ');
    card.innerHTML = `
      <div class="meta">Cancha ${m.court} • ${state.stage==='group'?'Americano':'Eliminatoria'}</div>
      <div class="vs">
        <span class="tag">${a}</span>
        <span>VS</span>
        <span class="tag">${b}</span>
        <div class="mark">
          <span class="muted">Marcador (a ${state.target}):</span>
          <input class="score" type="number" min="0" value="${m.scoreA??0}" data-mid="${m.id}" data-side="A"/>
          <span>–</span>
          <input class="score" type="number" min="0" value="${m.scoreB??0}" data-mid="${m.id}" data-side="B"/>
          <button class="primary" data-save="${m.id}">Guardar resultado</button>
        </div>
      </div>
    `;
    box.appendChild(card);
  });

  els('input.score').forEach(inp=>{
    inp.oninput = ()=>{
      const id = inp.dataset.mid; const side = inp.dataset.side;
      const m = state.matches.find(x=>x.id===id);
      const val = safeParseInt(inp.value);
      if(side==='A') m.scoreA = val; else m.scoreB = val;
    };
  });

  els('[data-save]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.save;
      const m = state.matches.find(x=>x.id===id);
      saveMatch(m);
    };
  });
}

function nameOf(id){
  const p = state.players.find(x=>x.id===id);
  return p? p.name : '?';
}

/***** Lógica de Americano *****/

/* Sencillo: intentamos crear dos equipos por cancha sin repetir emparejamientos
   clave por partido: teamA(team of 2) vs teamB(team of 2) sin importar el orden */
function groupFinished(){
  if(state.courts===1){
    const P = playersOf(1).length;
    const theoreticalPairs = P*(P-1)/2; // pares 2
    const closed = state.matches.filter(m=>m.court===1 && m.done).length;
    // no forzamos exacto; dejamos botón de playoff cuando ya no haya “abiertos”
    const opens = state.matches.some(m=>m.court===1 && m.round===state.round && !m.done);
    return !opens;
  }else{
    const opens = state.matches.some(m=>m.round===state.round && !m.done);
    return !opens;
  }
}

function genNextRound(){
  if(state.stage!=='group') return;
  const newMatches = [];

  for(let c=1;c<=state.courts;c++){
    const plist = playersOf(c);
    if(plist.length < 4) continue;

    // Genera una ronda de 2 partidos (o 1 si hay 4-5 jugadores)
    const combos = nextDoublesCombos(c, plist);
    combos.forEach(teams=>{
      newMatches.push({
        id: uid(),
        court: c,
        round: state.round,
        teamA: teams[0],
        teamB: teams[1],
        scoreA: 0, scoreB: 0,
        done: false
      });
    });
  }

  if(!newMatches.length){
    alert('No hay partidos abiertos en esta ronda. Pulsa “Crear eliminatoria”.');
    return;
  }
  state.matches.push(...newMatches);
  renderAll();
}

// memoria de partidos jugados (key sin orden)
function pairKey(court,a,b){
  const key = [...a,...b].map(id=>state.players.find(p=>p.id===id).name).sort().join('-');
  return `${court}|${key}`;
}
function hasPlayed(court,a,b){
  const k = pairKey(court,a,b);
  return state.matches.some(m=>m.court===court && m.done && pairKey(court,m.teamA,m.teamB)===k);
}

function nextDoublesCombos(court, plist){
  const ids = plist.map(p=>p.id);
  // intenta formar equipos simples: (0,1) vs (2,3), (4,5) vs (6,7)...
  const teams = [];
  for(let i=0;i+3<ids.length;i+=4){
    const a=[ids[i],ids[i+1]], b=[ids[i+2],ids[i+3]];
    if(!hasPlayed(court,a,b)) teams.push([a,b]);
  }
  if(!teams.length && ids.length>=4){
    // fallback: barajar
    const shuffled = ids.slice().sort(()=>Math.random()-0.5);
    const a=[shuffled[0],shuffled[1]], b=[shuffled[2],shuffled[3]];
    if(!hasPlayed(court,a,b)) teams.push([a,b]);
  }
  return teams;
}

/***** Guardar resultados *****/
function saveMatch(m){
  const tgt = state.target;
  const a = safeParseInt(m.scoreA);
  const b = safeParseInt(m.scoreB);
  if(a===b || (a<tgt && b<tgt)){
    alert(`Marcador inválido. La meta es a ${tgt} y debe haber ganador.`);
    return;
  }
  m.done = true;

  const pa = m.teamA.map(id=> state.players.find(p=>p.id===id));
  const pb = m.teamB.map(id=> state.players.find(p=>p.id===id));

  pa.forEach(p=>{ p.g += a; p.ga += b; p.w += (a>b?1:0); p.l += (b>a?1:0); p.matches++; p.lastRound = state.round; });
  pb.forEach(p=>{ p.g += b; p.ga += a; p.w += (b>a?1:0); p.l += (a>b?1:0); p.matches++; p.lastRound = state.round; });

  // ¿se cerró toda la ronda?
  const stillOpen = state.matches.some(x=>x.round===state.round && !x.done);
  if(!stillOpen){
    state.round++;
  }
  renderAll();
}

/***** Playoff *****/
function suggestPlayoffLabel(){
  if(state.courts===2){
    return 'Crear eliminatoria (Cuartos / Semis por cancha)';
  }
  return 'Crear eliminatoria';
}

function createPlayoff(){
  // decidir si cuartos o semis
  const n1 = playersOf(1).length;
  const n2 = playersOf(2).length;
  const canSemisByCourt = (n1>=2 && n2>=2);
  const canQuartersByCourt = (n1>=4 && n2>=4);

  let mode = state.playoffMode;
  if(mode==='auto'){
    if(state.courts===2){
      mode = canQuartersByCourt ? 'quartersCross' : (canSemisByCourt ? 'semisCross' : 'semis8');
    }else{
      // single court auto: si >=8 => cuartos, si >=4 => semis
      const n = playersOf(1).length;
      mode = (n>=8 ? 'quarters8' : 'semis8');
    }
  }

  state.stage='playoff';
  state.round=1;
  state.matches = [];

  if(state.courts===2 && (mode==='quartersCross' || mode==='semisCross')){
    genCrossCourtPlayoff(mode);
  }else{
    genSingleCourtPlayoff(mode);
  }
  renderAll();
}

function genSingleCourtPlayoff(mode){
  const rank = standings(1).map(r=>r.id);
  let pairs=[];
  if(mode==='quarters8' && rank.length>=8){
    // 1-8,2-7,3-6,4-5 (como clásico) o tu seed 1–3 vs 5–7…
    pairs = [
      [[rank[0],rank[7]],[rank[3],rank[4]]],
      [[rank[1],rank[6]],[rank[2],rank[5]]],
    ];
  }else{
    // Semifinales (Top-8) corregidas a (1–3 vs 2–4) y (5–7 vs 6–8)
    const seeded = seedTeamsTop8(rank);
    if(seeded.length){
      pairs = [ [seeded[0],seeded[1]], [seeded[2],seeded[3]] ];
    }else{
      // si no hay 8, intenta con 4 (1–3 vs 2–4)
      if(rank.length>=4){
        const a=[rank[0],rank[2]], b=[rank[1],rank[3]];
        pairs = [ [a,b] ];
      }
    }
  }
  state.matches = pairs.map((pp,i)=>({
    id:uid(), court:1, round:1,
    teamA:pp[0], teamB:pp[1],
    scoreA:0, scoreB:0, done:false
  }));
}

function genCrossCourtPlayoff(mode){
  // standings por cancha
  const A = standings(1).map(r=>r.id);
  const B = standings(2).map(r=>r.id);

  const games = [];
  if(mode==='quartersCross'){
    // requiere 4 por cancha mínimo
    if(A.length<4 || B.length<4){
      alert('No hay suficientes jugadores por cancha para cuartos. Se intentará semifinales por cancha.');
      return genCrossCourtPlayoff('semisCross');
    }
    // 1A-4B, 2A-3B, 1B-4A, 2B-3A
    const pairs = [
      [[A[0],A[3]],[B[1],B[2]]], // (1A,4A) vs (2B,3B) — OJO: jugamos con parejas de 2 jugadores; usaremos cruces en equipos
    ];
    // Mejor: convertir cruces en equipos con formato [jugA, jugB]
    const list = [
      [[A[0],A[1]],[B[2],B[3]]], // 1A-2A vs 3B-4B
      [[A[2],A[3]],[B[0],B[1]]], // 3A-4A vs 1B-2B
      [[B[0],B[1]],[A[2],A[3]]], // 1B-2B vs 3A-4A (lado B)
      [[B[2],B[3]],[A[0],A[1]]], // 3B-4B vs 1A-2A
    ];
    list.forEach(pp=>{
      games.push({ id:uid(), court:1, round:1, teamA:pp[0], teamB:pp[1], scoreA:0, scoreB:0, done:false });
    });
  }else{
    // Semifinales cruzadas: (1A–2A) vs (1B–2B)
    if(A.length<2 || B.length<2){
      alert('Se necesitan al menos 2 jugadores por cancha para semifinales cruzadas.');
      return;
    }
    const s1 = [[A[0],A[1]],[B[0],B[1]]];
    const s2 = [[A[0],A[1]],[B[0],B[1]]]; // dos canchas disponibles; si quieres en una sola, deja solo s1
    games.push({ id:uid(), court:1, round:1, teamA:s1[0], teamB:s1[1], scoreA:0, scoreB:0, done:false });
    games.push({ id:uid(), court:2, round:1, teamA:s1[0], teamB:s1[1], scoreA:0, scoreB:0, done:false });
  }

  state.matches = games;
}

function seedTeamsTop8(rank){
  if(rank.length<8) return [];
  const top4 = rank.slice(0,4);   // 1,2,3,4
  const low4 = rank.slice(4,8);   // 5,6,7,8
  // (1–3) vs (2–4) y (5–7) vs (6–8)
  return [
    [top4[0],top4[2]],
    [top4[1],top4[3]],
    [low4[0],low4[2]],
    [low4[1],low4[3]],
  ];
}

/***** Wiring Botones *****/
function attachMainButtons(){
  el('#genBtn').onclick = genNextRound;
  el('#playoffBtn').onclick = createPlayoff;
}

/***** Init *****/
function boot(){
  initTop();
  attachMainButtons();
  attachPlayerUI();
  // ejemplo: (no agrego nada; usas los tuyos)
  renderAll();
}
boot();
