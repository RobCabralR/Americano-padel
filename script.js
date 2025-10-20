/* ============================================================
   Americano Padel – full script
   – Semis balanceadas (Top4 vs 5-8)
   – Cuartos siempre Top-8
   – Playoff automático
   – Inputs Agregar C1 / C2
   – Límite 8 por cancha
   – RTDB opcional (compat)
   ============================================================ */

const $ = s => document.querySelector(s);
const rnd = arr => arr.sort(()=>Math.random()-0.5);

// ---------- Estado ----------
const state = {
  room: null,
  courts: 1,
  target: 3,
  players: [],            // nombres únicos
  playerCourts: {},       // nombre -> cancha (1..N)
  matches: [],            // [{id, round, court, pairs:[[a,b],[c,d]], status, scoreA, scoreB, _group?}]
  standings: {},          // nombre -> {pts,w,l,p,lastRound}
  round: 1,
  phase: "group"          // "group" | "bracket"
};

// ---------- Firebase (opcional) ----------
let db = null;
try {
  if (window.firebase && window.firebaseConfig) {
    const app = firebase.initializeApp(window.firebaseConfig);
    db = firebase.database();
  }
} catch (e) { /* local */ }

// ---------- Util ----------
function setupOk(){
  return (state.courts>=1 && state.target>=1);
}
function ensurePlayerInit(name){
  if(!state.standings[name]){
    state.standings[name] = { pts:0, w:0, l:0, p:0, lastRound:0 };
  }
  if(!state.playerCourts[name]) state.playerCourts[name]=1;
}
function canAddToCourt(court){
  const count = state.players.filter(p=>state.playerCourts[p]===court).length;
  return count<8;
}
function roomFromHash(){
  if(location.hash.slice(1)) return location.hash.slice(1);
  const rid = Math.random().toString(36).slice(2,8);
  location.hash = rid; return rid;
}

// ---------- Render ----------
function renderPlayers(){
  const ul = $("#playersList"); ul.innerHTML = "";
  const courts = Math.max(1,state.courts||1);
  state.players.forEach(p=>{
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="left">
        <span class="badge">${p}</span>
        ${courts>1? courtSelector(p):""}
      </div>
      <button class="ghost" data-del="${p}">✕</button>
    `;
    ul.appendChild(li);
  });

  ul.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick = ()=>{
      const n = b.dataset.del;
      state.players = state.players.filter(x=>x!==n);
      delete state.standings[n];
      delete state.playerCourts[n];
      pushCloud(); renderAll();
    };
  });

  function courtSelector(name){
    const cts = Math.max(1,state.courts||1);
    const cur = state.playerCourts[name]||1;
    let html = `<select data-court="${name}">`;
    for(let i=1;i<=cts;i++){
      html += `<option ${cur===i?"selected":""} value="${i}">${i}</option>`;
    }
    html += `</select>`;
    return html;
  }

  ul.querySelectorAll("[data-court]").forEach(sel=>{
    sel.onchange = ()=>{
      const p = sel.dataset.court;
      const c = Number(sel.value);
      if(!canAddToCourt(c)){
        sel.value = state.playerCourts[p];
        alert(`La cancha ${c} ya tiene 8 jugadores.`);
        return;
      }
      state.playerCourts[p]=c;
      pushCloud();
    };
  });
}

function renderTable(){
  const t = $("#table");
  const arr = state.players.map(n=>({n, ...(state.standings[n]||{})}));
  arr.sort((a,b)=> b.pts - a.pts || (b.w-b.l) - (a.w-a.l) );
  let html = `<tr><th>#</th><th>Jugador</th><th>Pts (games)</th><th>JG</th><th>JP</th><th>Partidos</th><th>Últ. ronda</th></tr>`;
  arr.forEach((r,i)=>{
    html += `<tr>
      <td>${i+1}</td>
      <td>${r.n}</td>
      <td>${r.pts||0}</td>
      <td>${r.w||0}</td>
      <td>${r.l||0}</td>
      <td>${r.p||0}</td>
      <td>${r.lastRound||0}</td>
    </tr>`;
  });
  t.innerHTML = html;
}

function renderMatches(){
  $("#roundLbl").textContent = String(state.round);
  $("#roundTitle").textContent = `ronda ${state.round}`;

  const box = $("#matches"); box.innerHTML = "";
  const list = state.matches.filter(m=>m.round===state.round);
  if(!list.length){
    const pByCourt = courtStats();
    const doneCourt = Object.keys(pByCourt).map(c=>{
      const n = pByCourt[c];
      const pairs = n*(n-1)/2;        // combinaciones de parejas
      const theo = Math.ceil(pairs/2); // partidos aproximados (2 parejas por partido)
      return `Cancha ${c}: parejas ${pairs}/${pairs} · partidos teóricos ${theo}`;
    }).join(" · ");
    const msg = state.phase==="group"
      ? (pByCourt ? ` ${doneCourt}` : "")
      : "Fase: Eliminatoria";
    const div = document.createElement("div");
    div.className="card";
    div.innerHTML = `<div class="meta">No hay partidos abiertos en esta ronda.${msg?` <span class="muted">${msg}</span>`:""}</div>`;
    box.appendChild(div);
    return;
  }

  list.forEach(m=>{
    const card = document.createElement("div");
    card.className = "card";
    const [A1,A2]=m.pairs[0], [B1,B2]=m.pairs[1];
    card.innerHTML = `
      <div class="meta">Cancha ${m.court} · ${m.status==="done"?"Terminado":"En juego"}</div>
      <div class="vs">
        <span class="tag">${A1}</span>
        <span class="tag">${A2}</span>
        <span>vs</span>
        <span class="tag">${B1}</span>
        <span class="tag">${B2}</span>

        <div class="mark">
          <span class="muted">Marcador (a ${state.target}):</span>
          <input class="score" type="number" min="0" value="${m.scoreA}" data-a="${m.id}">
          <span>–</span>
          <input class="score" type="number" min="0" value="${m.scoreB}" data-b="${m.id}">
          <button class="primary" data-save="${m.id}">Guardar resultado</button>
        </div>
      </div>
    `;
    box.appendChild(card);
  });

  box.querySelectorAll("[data-save]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.save;
      const a = box.querySelector(`[data-a="${id}"]`);
      const b = box.querySelector(`[data-b="${id}"]`);
      saveMatch(id, Number(a.value), Number(b.value));
    };
  });
}

function renderAll(){
  renderPlayers();
  renderMatches();
  renderTable();
}

// ---------- Lógica American (simple y estable) ----------
function courtStats(){
  const stats={};
  const courts = Math.max(1,state.courts||1);
  for(let c=1;c<=courts;c++){
    stats[c] = state.players.filter(p=>state.playerCourts[p]===c).length;
  }
  return stats;
}

function nextGroupRound(){
  const courts = Math.max(1,state.courts||1);
  for(let c=1;c<=courts;c++){
    const pool = state.players.filter(p=>state.playerCourts[p]===c);
    if(pool.length<4) continue;

    // Si impar y >=5 → agrega/garantiza “comodin-#”
    if(pool.length%2!==0 && pool.length>=5){
      const tag = `comodin-${c}`;
      if(!state.players.includes(tag)){
        state.players.push(tag);
        ensurePlayerInit(tag);
        state.playerCourts[tag]=c;
      }
    }
    // Genera un partido con los primeros 4 disponibles
    const avail = pool.slice();
    rnd(avail);
    const sel = avail.slice(0,4);
    if(sel.length===4){
      const teams = [[sel[0],sel[1]],[sel[2],sel[3]]];
      state.matches.push({
        id:crypto.randomUUID(), round:state.round, court:c,
        pairs:teams, status:"open", scoreA:0, scoreB:0, _group:true
      });
    }
  }
}

function saveMatch(id, a, b){
  const m = state.matches.find(x=>x.id===id);
  if(!m) return;
  const tgt = Number(state.target||3);
  if( (a<0||b<0) || (a===b) || (a>tgt && b>tgt) ){
    alert("Marcador inválido."); return;
  }
  m.scoreA=a; m.scoreB=b; m.status="done";

  const addPts = (name, pts, w, l)=>{
    ensurePlayerInit(name);
    state.standings[name].pts += pts;
    if(w) state.standings[name].w += 1;
    if(l) state.standings[name].l += 1;
    state.standings[name].p += 1;
    state.standings[name].lastRound = state.round;
  };

  const A = m.pairs[0], B = m.pairs[1];
  const wA = a>b;
  A.forEach(n=> addPts(n, a,  wA, !wA));
  B.forEach(n=> addPts(n, b, !wA,  wA));

  pushCloud(); renderAll();

  // si todos cerrados → avanzar ronda o bracket
  const open = state.matches.some(x=>x.round===state.round && x.status!=="done");
  if(!open){
    if(state.phase==="group"){
      state.round += 1;
      pushCloud(); renderAll();
    }else{
      advanceBracketIfReady();
    }
  }
}

// ---------- Bracket helpers ----------
function rankedPlayers(){
  // ranking por puntos; comodines cuentan como jugador
  const arr = state.players.slice();
  arr.sort((a,b)=>{
    const A = state.standings[a]||{}, B = state.standings[b]||{};
    return (B.pts||0)-(A.pts||0);
  });
  return arr;
}
function makeTeamsFromGroup(players8){
  // pares consecutivos → 4 equipos
  const cp = players8.slice(); rnd(cp);
  const teams=[];
  for(let i=0;i<cp.length;i+=2) teams.push([cp[i], cp[i+1]]);
  return teams;
}
function createRoundFromTeams(teams, round){
  const courts = Math.max(1, state.courts||1);
  const matches=[];
  for(let i=0;i<teams.length;i+=2){
    matches.push({
      id:crypto.randomUUID(),
      round,
      court: (i/2)%courts + 1,
      pairs: [teams[i], teams[i+1]],
      status:"open", scoreA:0, scoreB:0, _group:false
    });
  }
  return matches;
}

// --- balance semis ---
function buildBalancedSemisTeams(rankedTop8){
  const top4 = rankedTop8.slice(0,4);
  const low4 = rankedTop8.slice(4,8);
  rnd(top4); rnd(low4);
  const teams=[];
  for(let i=0;i<4;i++) teams.push([top4[i], low4[i]]);
  return teams;
}
function createSemisFromBalancedTeams(teams, round){
  const courts = Math.max(1, state.courts||1);
  const order = [[0,2],[1,3]];
  const matches=[];
  order.forEach((pair, idx)=>{
    matches.push({
      id:crypto.randomUUID(),
      round,
      court:(idx%courts)+1,
      pairs:[teams[pair[0]], teams[pair[1]]],
      status:"open", scoreA:0, scoreB:0, _group:false
    });
  });
  return matches;
}

// Avance auto dentro del bracket
function advanceBracketIfReady(){
  const cur = state.matches.filter(m=>m.round===state.round);
  if(cur.some(m=>m.status!=="done")) return;

  // tomar ganadores
  const winners=[];
  cur.forEach(m=>{
    const winA = m.scoreA>m.scoreB;
    winners.push( winA ? m.pairs[0] : m.pairs[1] );
  });

  if(winners.length===2){
    // Final
    state.round += 1;
    const fm = createRoundFromTeams(winners, state.round);
    state.matches.push(...fm);
    pushCloud(); renderAll();
    return;
  }
  if(winners.length===4){
    // Semifinales → Final
    state.round += 1;
    const fm = createRoundFromTeams(winners, state.round);
    state.matches.push(...fm);
    pushCloud(); renderAll();
    return;
  }
  // Final terminado → no más
}

// Crear bracket según selector / automático
function createBracket(){
  if(state.players.length<4) return alert("Agrega jugadores antes.");
  const ranked = rankedPlayers();
  const realCount = ranked.length;

  let chosen = $("#selPlayoff").value; // "auto" | "semis" | "quarters" | "final"
  if(chosen==="auto"){
    // Reglas pedidas:
    // 6 reales  → final
    // 7 reales  → final (sugerir comodín) – si ya hay comodín cuenta igual
    // 8 reales  → semis
    // 9..11 + comodín → 2 canchas (si hay) y semis
    // 12+ → cuartos
    if(realCount>=12) chosen="quarters";
    else if(realCount>=8) chosen="semis";
    else chosen="final";
  }

  // limpiar rondas abiertas y entrar a bracket
  state.phase="bracket";
  state.matches = [];
  state.round = 1;

  if(chosen==="final"){
    if(realCount<4) return alert("Se requieren al menos 4 jugadores reales para final.");
    const top4 = ranked.slice(0,4);
    const teams = makeTeamsFromGroup(top4);   // 2 equipos
    const m = createRoundFromTeams(teams, 1); // final directa (1 partido)
    state.matches.push(...m);
    pushCloud(); renderAll();
    return;
  }

  if(chosen==="semis"){
    if(realCount<8) return alert("Se requieren al menos 8 jugadores reales para semifinales.");
    const top8 = ranked.slice(0,8);
    const balancedTeams = buildBalancedSemisTeams(top8);
    const m = createSemisFromBalancedTeams(balancedTeams, 1);
    state.matches.push(...m);
    pushCloud(); renderAll();
    return;
  }

  if(chosen==="quarters"){
    if(realCount<12) return alert("Se requieren al menos 12 jugadores reales para cuartos.");
    const top8 = ranked.slice(0,8);                  // <-- siempre 8
    const teams = makeTeamsFromGroup(top8);          // 4 equipos
    const m = createRoundFromTeams(teams, 1);        // 4 partidos
    state.matches.push(...m);
    pushCloud(); renderAll();
    return;
  }
}

// ---------- Cloud sync ----------
function pushCloud(){
  localStorage.setItem("padel-state", JSON.stringify(state));
  if(!db || !state.room) return;
  db.ref(`/sesiones/${state.room}`).set(state).catch(()=>{});
}
function pullCloud(){
  if(!db || !state.room) {
    // local
    const s = localStorage.getItem("padel-state");
    if(s){
      try{ Object.assign(state, JSON.parse(s)); }catch{}
      renderAll();
    }
    return;
  }
  db.ref(`/sesiones/${state.room}`).on("value", snap=>{
    const val = snap.val();
    if(val){
      Object.assign(state, val);
      renderAll();
    }
  });
}

// ---------- Eventos ----------
document.addEventListener("DOMContentLoaded", ()=>{
  // room
  state.room = roomFromHash();
  $("#roomId").textContent = state.room;
  $("#copyRoom").onclick = ()=>{
    navigator.clipboard.writeText(location.href);
  };

  // selects
  $("#selCourts").onchange = e=>{
    state.courts = Number(e.target.value);
    pushCloud(); renderAll();
  };
  $("#selTarget").onchange = e=>{
    state.target = Number(e.target.value);
    pushCloud(); renderAll();
  };

  // valores iniciales
  state.courts = Number($("#selCourts").value);
  state.target = Number($("#selTarget").value);

  // add players rápidos
  const pn1 = $("#playerName1"), pn2 = $("#playerName2");
  $("#addP1").onclick = ()=>{ addPlayerToCourt(pn1.value,1); pn1.value=""; };
  $("#addP2").onclick = ()=>{ addPlayerToCourt(pn2.value,2); pn2.value=""; };
  pn1.addEventListener("keydown",e=>{ if(e.key==="Enter") $("#addP1").click(); });
  pn2.addEventListener("keydown",e=>{ if(e.key==="Enter") $("#addP2").click(); });

  $("#btnReset").onclick = ()=>{
    if(!confirm("¿Reiniciar toda la sesión?")) return;
    state.players=[]; state.playerCourts={}; state.matches=[];
    state.standings={}; state.round=1; state.phase="group";
    pushCloud(); renderAll();
  };

  $("#btnGen").onclick = ()=>{
    if(!setupOk()) return alert("Primero elige canchas y meta (juegos).");
    if(state.phase!=="group") return alert("Ya estás en eliminatoria.");
    nextGroupRound(); pushCloud(); renderAll();
  };

  $("#btnCreateBracket").onclick = createBracket;

  // carga
  pullCloud();
});

// helpers agregar
function addPlayerToCourt(name, court){
  if(!setupOk()) return alert("Primero elige canchas y meta (juegos).");
  const n = (name||"").trim(); if(!n) return;
  if(state.players.includes(n)) return alert("Ese nombre ya existe.");
  const courts = Math.max(1,state.courts||1);
  if(court<1||court>courts) court=1;
  if(!canAddToCourt(court)) return alert(`La cancha ${court} ya tiene 8 jugadores.`);
  state.players.push(n); ensurePlayerInit(n); state.playerCourts[n]=court;
  pushCloud(); renderAll();
}
