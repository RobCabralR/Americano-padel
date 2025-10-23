/* Americano por cancha — una sola partida abierta por cancha, máx. 8 jugadores por cancha
   Mantiene tablas separadas y permite, al terminar el americano por cancha, crear playoff.
*/

(function(){
  // ---------- Estado ----------
  const state = {
    room: makeRoomCode(),
    goal: 3,
    courts: 1,
    roundGlobal: 1,
    // por cancha
    players: { 1: [], 2: [] },               // ["a","b",...]
    standings: { 1: {}, 2: {} },             // {name:{pts:0,w:0,l:0,played:0,lastRound:0}}
    round: { 1: 1, 2: 1 },
    queue: { 1: [], 2: [] },                 // cola de partidos (cada elemento => {a:[p1,p2], b:[p3,p4], done:false})
    openMatch: { 1: null, 2: null },         // el partido que se está jugando (o null)
    finished: { 1: false, 2: false }         // true cuando se jugaron todos los encuentros
  };

  // ---------- Utilidades ----------
  function makeRoomCode(){
    return (Math.random().toString(36).slice(2, 8));
  }
  function $(sel){ return document.querySelector(sel); }
  function el(tag, attrs={}, children=[]){
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==="class") n.className = v; else if(k==="text") n.textContent=v; else n.setAttribute(k,v);
    });
    children.forEach(c=>n.appendChild(c));
    return n;
  }
  function shuffle(a){
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  const uniq = (arr)=>[...new Set(arr.map(s=>s.trim()).filter(Boolean))];

  // ---------- Inicialización UI ----------
  $("#roomCode").textContent = state.room;
  $("#copyRoom").onclick = () => {
    navigator.clipboard.writeText(location.href.split("#")[0]+"#"+state.room).catch(()=>{});
  };

  // selects
  $("#goalSelect").value = "3";
  $("#goalSelect").addEventListener("change", e=>{
    state.goal = parseInt(e.target.value,10);
  });

  $("#courtsSelect").addEventListener("change", e=>{
    state.courts = parseInt(e.target.value,10);
    $("#row-c2").classList.toggle("hidden", state.courts===1);
    renderAll();
  });

  // Añadir jugadores por cancha (máx. 8)
  $("#addPlayer1").onclick = ()=> addPlayer(1, $("#playerInput1").value);
  $("#addPlayer2").onclick = ()=> addPlayer(2, $("#playerInput2").value);
  $("#playerInput1").addEventListener("keydown", e=>{ if(e.key==="Enter") $("#addPlayer1").click(); });
  $("#playerInput2").addEventListener("keydown", e=>{ if(e.key==="Enter") $("#addPlayer2").click(); });

  $("#reset1").onclick = ()=> resetCourt(1);
  $("#reset2").onclick = ()=> resetCourt(2);

  $("#gen1").onclick = ()=> generateIfNeeded(1);
  $("#gen2").onclick = ()=> generateIfNeeded(2);

  $("#buildPlayoff").onclick = ()=> alert("Playoff por canchas: aquí puedes mezclar top por cancha (p.ej., 1-2 de C1 + 1-2 de C2 → semis; 1-4 de cada → cuartos). Esta parte se engancha cuando lo pidas.");

  // ---------- Lógica de Jugadores ----------
  function addPlayer(court, nameRaw){
    const name = (nameRaw||"").trim();
    if(!name) return;

    if(state.players[court].length>=8){
      alert("Máximo 8 jugadores por cancha.");
      return;
    }
    if(state.players[1].includes(name) || state.players[2].includes(name)){
      alert("Ese nombre ya existe en alguna cancha.");
      return;
    }
    state.players[court].push(name);
    // standings base
    state.standings[court][name] = { pts:0, w:0, l:0, played:0, lastRound:0 };
    // limpiar input
    if(court===1) $("#playerInput1").value=""; else $("#playerInput2").value="";
    // al añadir jugadores, se invalida planificación previa
    state.queue[court] = [];
    state.openMatch[court] = null;
    state.finished[court] = false;
    state.round[court] = 1;
    renderAll();
  }

  function removePlayer(court, name){
    state.players[court] = state.players[court].filter(n=>n!==name);
    delete state.standings[court][name];
    // invalidar planificación
    state.queue[court] = [];
    state.openMatch[court] = null;
    state.finished[court] = false;
    state.round[court] = 1;
    renderAll();
  }

  function resetCourt(court){
    state.players[court] = [];
    state.standings[court] = {};
    state.queue[court] = [];
    state.openMatch[court] = null;
    state.finished[court] = false;
    state.round[court] = 1;
    renderAll();
  }

  // ---------- Generación de Partidos (por cancha) ----------
  function generateIfNeeded(court){
    const n = state.players[court].length;
    if(n<4){
      alert("Necesitas al menos 4 jugadores para dobles.");
      return;
    }
    // si no hay cola ni partido abierto, planificamos todo el americano de esa cancha
    if(!state.openMatch[court] && state.queue[court].length===0){
      state.queue[court] = buildAmericanQueue(state.players[court]);
    }
    // si no hay partido abierto, sacamos el siguiente
    if(!state.openMatch[court]){
      state.openMatch[court] = state.queue[court].shift() || null;
    }
    renderAll();
  }

  // Construye TODA la cola de partidos para una cancha (dobles), sin repetir pareja
  function buildAmericanQueue(players){
    // 1) todas las parejas posibles (combinaciones de 2)
    const pairs = [];
    for(let i=0;i<players.length;i++){
      for(let j=i+1;j<players.length;j++){
        pairs.push([players[i], players[j]]);
      }
    }
    // 2) todos los enfrentamientos de parejas disjuntas
    const matches = [];
    for(let i=0;i<pairs.length;i++){
      for(let j=i+1;j<pairs.length;j++){
        const a = pairs[i], b = pairs[j];
        if(a[0]!==b[0] && a[0]!==b[1] && a[1]!==b[0] && a[1]!==b[1]){
          matches.push({ a:[a[0],a[1]], b:[b[0],b[1]], done:false });
        }
      }
    }
    // 3) barajamos para diversidad
    shuffle(matches);
    return matches;
  }

  // ---------- Guardar resultado ----------
  function saveResult(court, aScore, bScore){
    const m = state.openMatch[court];
    if(!m) return;

    const sA = parseInt(aScore.value,10)||0;
    const sB = parseInt(bScore.value,10)||0;
    if(sA===0 && sB===0){ alert("Ingresa marcador."); return; }
    if(sA===sB){ alert("No puede empatar."); return; }

    // Aplicar a standings (pts = games ganados)
    const allPlayers = [...m.a, ...m.b];
    allPlayers.forEach(p=>{
      const st = state.standings[court][p];
      if(st){ st.played += 1; st.lastRound = state.round[court]; }
    });

    m.done = true;
    if(sA>sB){
      m.winner = m.a;
      m.loser = m.b;
      m.a.forEach(p=>{ state.standings[court][p].w += 1; state.standings[court][p].pts += sA; });
      m.b.forEach(p=>{ state.standings[court][p].l += 1; state.standings[court][p].pts += sB; });
    }else{
      m.winner = m.b;
      m.loser = m.a;
      m.b.forEach(p=>{ state.standings[court][p].w += 1; state.standings[court][p].pts += sB; });
      m.a.forEach(p=>{ state.standings[court][p].l += 1; state.standings[court][p].pts += sA; });
    }

    // cerrar partido, avanzar ronda, abrir siguiente si existe
    state.openMatch[court] = null;
    state.round[court] += 1;

    if(state.queue[court].length>0){
      state.openMatch[court] = state.queue[court].shift();
    }else{
      state.finished[court] = true;
    }
    // actualizar barra playoff si ambas canchas finalizaron
    checkPlayoffReady();
    renderAll();
  }

  function checkPlayoffReady(){
    const ready = (state.courts===1 && state.finished[1]) ||
                  (state.courts===2 && state.finished[1] && state.finished[2]);
    $("#playoffBar").classList.toggle("hidden", !ready);
  }

  // ---------- Render ----------
  function renderAll(){
    $("#globalRound").textContent = Math.max(state.round[1], state.round[2]);

    // Jugadores
    renderPlayersList(1);
    renderPlayersList(2);

    // Partidos (sólo el abierto por cancha)
    renderMatches(1);
    renderMatches(2);

    // Tablas
    renderTable(1);
    renderTable(2);
  }

  function renderPlayersList(court){
    const ul = court===1 ? $("#playersList1") : $("#playersList2");
    ul.innerHTML = "";
    state.players[court].forEach(name=>{
      const li = el("li",{},[
        el("div",{class:"left"},[
          el("span",{class:"tag",text:name}),
          el("span",{class:"badge",text:`C${court}`})
        ]),
        el("div",{},[
          el("button",{class:"danger",text:"x"})
        ])
      ]);
      li.querySelector("button").onclick = ()=> removePlayer(court, name);
      ul.appendChild(li);
    });
  }

  function renderMatches(court){
    const box = court===1 ? $("#matches1") : $("#matches2");
    box.innerHTML = "";

    if(state.players[court].length<4){
      box.appendChild(el("div",{class:"muted",text:"Agrega al menos 4 jugadores para empezar."}));
      return;
    }

    const m = state.openMatch[court];
    if(!m){
      const msg = state.finished[court] ? "Americano completado. Puedes crear eliminatoria."
                                        : "Pulsa “Generar partidos”.";
      box.appendChild(el("div",{class:"muted",text:msg}));
      return;
    }

    // tarjeta del partido abierto
    const card = el("div",{class:"card"},[
      el("div",{class:"meta",text:`Cancha ${court} · Ronda ${state.round[court]}`}),
      // vs
      (()=> {
        const row = el("div",{class:"row",style:"gap:.5rem;align-items:center"});
        const tag = (n)=> el("span",{class:"tag",text:n});
        row.appendChild(tag(m.a[0])); row.appendChild(tag(m.a[1]));
        row.appendChild(el("span",{class:"muted",text:"VS"}));
        row.appendChild(tag(m.b[0])); row.appendChild(tag(m.b[1]));
        return row;
      })(),
      // marcador
      (()=> {
        const mark = el("div",{class:"mark"});
        const inA = el("input",{class:"score",type:"number",min:"0",value:"0"});
        const inB = el("input",{class:"score",type:"number",min:"0",value:"0"});
        mark.appendChild(el("span",{class:"muted",text:`Marcador (a ${state.goal}):`}));
        mark.appendChild(inA);
        mark.appendChild(el("span",{text:"-"}));
        mark.appendChild(inB);
        const btn = el("button",{class:"primary",text:"Guardar resultado"});
        btn.onclick = ()=> saveResult(court, inA, inB);
        const wrap = el("div",{class:"row",style:"justify-content:space-between;gap:.5rem"});
        wrap.appendChild(mark); wrap.appendChild(btn);
        return wrap;
      })()
    ]);
    box.appendChild(card);

    // cola pendiente (info)
    if(state.queue[court].length>0){
      box.appendChild(el("div",{class:"muted",text:`Pendientes: ${state.queue[court].length} partidos`}));
    }
  }

  function renderTable(court){
    const tbody = court===1 ? $("#table1") : $("#table2");
    tbody.innerHTML = "";

    const rows = Object.entries(state.standings[court]).map(([name,st])=>({
      name,
      pts: st.pts||0,
      w: st.w||0,
      l: st.l||0,
      played: st.played||0,
      lastRound: st.lastRound||0
    }));

    rows.sort((a,b)=>{
      if(b.pts!==a.pts) return b.pts-a.pts;
      if(b.w!==a.w) return b.w-a.w;
      return a.name.localeCompare(b.name);
    });

    rows.forEach((r,idx)=>{
      const tr = el("tr",{},[
        el("td",{text:String(idx+1)}),
        el("td",{text:r.name}),
        el("td",{text:String(r.pts)}),
        el("td",{text:String(r.w)}),
        el("td",{text:String(r.l)}),
        el("td",{text:String(r.played)}),
        el("td",{text:String(r.lastRound)})
      ]);
      tbody.appendChild(tr);
    });
  }

  // Primera pintura
  renderAll();
})();
