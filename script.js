/* Americano por cancha — una sola partida abierta por cancha, máx. 8 jugadores por cancha
   Mantiene tablas separadas y permite, al terminar el americano por cancha, crear playoff global.
*/

(function(){
  // ---------- Estado ----------
  const state = {
    room: makeRoomCode(),
    goal: 3,
    courts: 1,
    // por cancha
    players: { 1: [], 2: [] },               // ["a","b",...]
    standings: { 1: {}, 2: {} },             // {name:{pts:0,w:0,l:0,played:0,lastRound:0}}
    round: { 1: 1, 2: 1 },
    queue: { 1: [], 2: [] },                 // cola de partidos (cada => {a:[p1,p2], b:[p3,p4], done:false})
    openMatch: { 1: null, 2: null },         // el partido que se está jugando (o null)
    finished: { 1: false, 2: false }         // true cuando se jugaron todos
  };

  // ---------- Utilidades ----------
  function makeRoomCode(){ return (Math.random().toString(36).slice(2, 8)); }
  function $(sel){ return document.querySelector(sel); }
  function el(tag, attrs={}, children=[]){
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==="class") n.className = v;
      else if(k==="text") n.textContent=v;
      else n.setAttribute(k,v);
    });
    children.forEach(c=>n.appendChild(c));
    return n;
  }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  // ---------- Inicialización UI ----------
  $("#roomCode").textContent = state.room;
  $("#copyRoom").onclick = () => {
    navigator.clipboard.writeText(location.href.split("#")[0]+"#"+state.room).catch(()=>{});
  };

  $("#goalSelect").value = "3";
  $("#goalSelect").addEventListener("change", e=>{
    state.goal = parseInt(e.target.value,10);
    renderAll(); // para refrescar max de inputs
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

  $("#buildPlayoff").onclick = ()=> buildGlobalPlayoff();

  $("#closeModal").onclick = ()=> $("#playoffModal").close();

  // ---------- Lógica de Jugadores ----------
  function addPlayer(court, nameRaw){
    const name = (nameRaw||"").trim();
    if(!name) return;
    if(state.players[court].length>=8){ alert("Máximo 8 jugadores por cancha."); return; }
    if(state.players[1].includes(name) || state.players[2].includes(name)){
      alert("Ese nombre ya existe en alguna cancha."); return;
    }
    state.players[court].push(name);
    state.standings[court][name] = { pts:0, w:0, l:0, played:0, lastRound:0 };

    if(court===1) $("#playerInput1").value=""; else $("#playerInput2").value="";
    // invalidar planificación previa
    state.queue[court] = []; state.openMatch[court] = null; state.finished[court] = false; state.round[court] = 1;
    renderAll();
  }

  function removePlayer(court, name){
    state.players[court] = state.players[court].filter(n=>n!==name);
    delete state.standings[court][name];
    state.queue[court] = []; state.openMatch[court] = null; state.finished[court] = false; state.round[court] = 1;
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
    if(n<4){ alert("Necesitas al menos 4 jugadores para dobles."); return; }

    if(!state.openMatch[court] && state.queue[court].length===0){
      state.queue[court] = buildAmericanQueue(state.players[court]);
    }
    if(!state.openMatch[court]){
      state.openMatch[court] = state.queue[court].shift() || null;
    }
    renderAll();
  }

  // One-factorization (método del círculo) → pares por ronda → se agrupan en partidos (2 pares)
  function buildAmericanQueue(players){
    const BYE = "__BYE__";
    const arr = players.slice();
    const even = (arr.length % 2 === 0);
    if(!even) arr.push(BYE); // para 7, 5, etc.

    const n = arr.length;
    const rounds = []; // cada ronda => lista de parejas [a,b]
    let rot = arr.slice();

    for(let r=0; r<n-1; r++){
      const pairs = [];
      for(let i=0;i<n/2;i++){
        const a = rot[i], b = rot[n-1-i];
        pairs.push([a,b]);
      }
      rounds.push(pairs);
      // rotación (fijo rot[0])
      const fixed = rot[0];
      const rest = rot.slice(1);
      rest.unshift(rest.pop());
      rot = [fixed, ...rest];
    }

    // Convertir pares por ronda en partidos (dos parejas por partido).
    // Si hay BYE, lo excluimos y usamos "carry" para emparejar pares sueltos entre rondas.
    const matches = [];
    let carry = null;

    for(const pr of rounds){
      // quitar BYE
      let pairs = pr.filter(P => !P.includes(BYE));
      // si hay carry, buscar un par compatible (sin jugadores repetidos)
      if(carry){
        const idx = pairs.findIndex(p => disjoint(p, carry));
        if(idx>=0){
          matches.push({ a: carry.slice(), b: pairs[idx].slice(), done:false });
          pairs.splice(idx,1);
          carry = null;
        }
      }
      // agrupar de 2 en 2
      for(let i=0;i<pairs.length;i+=2){
        if(i+1 < pairs.length){
          matches.push({ a: pairs[i].slice(), b: pairs[i+1].slice(), done:false });
        }else{
          // par suelto → lo guardo para la siguiente ronda
          carry = pairs[i].slice();
        }
      }
    }
    // Nota: si queda carry al final, lo descartamos (no hay par compatible sin repetir jugadores).

    // Barajamos un poco para diversidad pero conservando la estructura general
    return matches;
  }

  function disjoint(p1, p2){ return p1[0]!==p2[0] && p1[0]!==p2[1] && p1[1]!==p2[0] && p1[1]!==p2[1]; }

  // ---------- Guardar resultado ----------
  function saveResult(court, aScore, bScore){
    const m = state.openMatch[court];
    if(!m) return;

    const sAraw = aScore.value.trim();
    const sBraw = bScore.value.trim();
    if(sAraw==="" || sBraw===""){ alert("Ingresa marcador."); return; }

    const sA = parseInt(sAraw,10);
    const sB = parseInt(sBraw,10);
    if(Number.isNaN(sA) || Number.isNaN(sB) || sA<0 || sB<0){ alert("Marcador inválido."); return; }
    if(sA===sB){ alert("No puede empatar."); return; }

    // Validación estricta a la meta:
    // Uno debe ser exactamente goal y el otro menor que goal.
    const G = state.goal;
    const valid = (sA===G && sB>=0 && sB<G) || (sB===G && sA>=0 && sA<G);
    if(!valid){
      alert(`Marcador inválido: el ganador debe llegar exactamente a ${G} y el perdedor quedar por debajo.`);
      return;
    }

    // Aplicar a standings (pts = games ganados)
    const allPlayers = [...m.a, ...m.b];
    allPlayers.forEach(p=>{
      const st = state.standings[court][p];
      if(st){ st.played += 1; st.lastRound = state.round[court]; }
    });

    m.done = true;
    if(sA>sB){
      m.winner = m.a; m.loser = m.b;
      m.a.forEach(p=>{ state.standings[court][p].w += 1; state.standings[court][p].pts += sA; });
      m.b.forEach(p=>{ state.standings[court][p].l += 1; state.standings[court][p].pts += sB; });
    }else{
      m.winner = m.b; m.loser = m.a;
      m.b.forEach(p=>{ state.standings[court][p].w += 1; state.standings[court][p].pts += sB; });
      m.a.forEach(p=>{ state.standings[court][p].l += 1; state.standings[court][p].pts += sA; });
    }

    state.openMatch[court] = null;
    state.round[court] += 1;

    if(state.queue[court].length>0){
      state.openMatch[court] = state.queue[court].shift();
    }else{
      state.finished[court] = true;
    }
    checkPlayoffReady();
    renderAll();
  }

  function checkPlayoffReady(){
    const ready = (state.courts===1 && state.finished[1]) ||
                  (state.courts===2 && state.finished[1] && state.finished[2]);
    $("#playoffBar").classList.toggle("hidden", !ready);
  }

  // ---------- Playoff global C1 vs C2 ----------
  function standingsOrdered(court){
    return Object.entries(state.standings[court]).map(([name,st])=>({
      name, pts: st.pts||0, w: st.w||0, l: st.l||0, played: st.played||0, lastRound: st.lastRound||0
    })).sort((a,b)=>{
      if(b.pts!==a.pts) return b.pts-a.pts;
      if(b.w!==a.w) return b.w-a.w;
      return a.name.localeCompare(b.name);
    });
  }

  function buildGlobalPlayoff(){
    if(state.courts===1){ alert("Necesitas 2 canchas finalizadas para el cruce global."); return; }
    if(!state.finished[1] || !state.finished[2]){ alert("Termina el americano en ambas canchas primero."); return; }

    const s1 = standingsOrdered(1).map(r=>r.name);
    const s2 = standingsOrdered(2).map(r=>r.name);

    if(s1.length<8 || s2.length<8){
      alert("Se requieren 8 jugadores en cada cancha para los cruces top/bottom 4.");
      return;
    }

    const top = [
      [`C1 (${s1[0]}, ${s1[2]}) vs C2 (${s2[0]}, ${s2[2]})`],
      [`C1 (${s1[1]}, ${s1[3]}) vs C2 (${s2[1]}, ${s2[3]})`],
    ];
    const bottom = [
      [`C1 (${s1[4]}, ${s1[6]}) vs C2 (${s2[4]}, ${s2[6]})`],
      [`C1 (${s1[5]}, ${s1[7]}) vs C2 (${s2[5]}, ${s2[7]})`],
    ];

    const list = [
      "<strong>Top 4</strong>",
      ...top.map(x=>"• "+x),
      "<strong style='margin-top:.5rem;display:block'>Bottom 4</strong>",
      ...bottom.map(x=>"• "+x),
    ].join("<br/>");

    $("#playoffList").innerHTML = list;
    $("#playoffModal").showModal();
  }

  // ---------- Render ----------
  function renderAll(){
    $("#globalRound").textContent = Math.max(state.round[1], state.round[2]);

    renderPlayersList(1); renderPlayersList(2);
    renderMatches(1); renderMatches(2);
    renderTable(1); renderTable(2);
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

    const G = state.goal;

    // tarjeta del partido abierto
    const card = el("div",{class:"card"},[
      el("div",{class:"meta",text:`Cancha ${court} · Ronda ${state.round[court]}`}),
      (()=> {
        const row = el("div",{class:"row",style:"gap:.5rem;align-items:center"});
        const tag = (n)=> el("span",{class:"tag",text:n});
        row.appendChild(tag(m.a[0])); row.appendChild(tag(m.a[1]));
        row.appendChild(el("span",{class:"muted",text:"VS"}));
        row.appendChild(tag(m.b[0])); row.appendChild(tag(m.b[1]));
        return row;
      })(),
      (()=> {
        const mark = el("div",{class:"mark"});
        const inA = el("input",{class:"score",type:"number",min:"0",max:String(G),value:"0"});
        const inB = el("input",{class:"score",type:"number",min:"0",max:String(G),value:"0"});
        mark.appendChild(el("span",{class:"muted",text:`Marcador (a ${G}):`}));
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
    })).sort((a,b)=>{
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
