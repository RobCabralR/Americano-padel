/* Americano por cancha — una sola partida abierta por cancha, máx. 8 jugadores por cancha
   Validaciones: meta exacta, sin empates. Elim. flexible: 1 o 2 canchas.
*/

(function(){
  // ---------- Estado ----------
  const state = {
    room: makeRoomCode(),
    goal: 3,
    courts: 1,
    players: { 1: [], 2: [] },
    standings: { 1: {}, 2: {} },
    round: { 1: 1, 2: 1 },
    queue: { 1: [], 2: [] },
    openMatch: { 1: null, 2: null },
    finished: { 1: false, 2: false }
  };

  // ---------- Utils ----------
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
  const disjoint=(p1,p2)=> p1[0]!==p2[0] && p1[0]!==p2[1] && p1[1]!==p2[0] && p1[1]!==p2[1];

  // ---------- UI init ----------
  $("#roomCode").textContent = state.room;
  $("#copyRoom").onclick = () => navigator.clipboard.writeText(location.href.split("#")[0]+"#"+state.room).catch(()=>{});
  $("#goalSelect").value = "3";
  $("#goalSelect").addEventListener("change", e=>{ state.goal = parseInt(e.target.value,10); renderAll(); });
  $("#courtsSelect").addEventListener("change", e=>{
    state.courts = parseInt(e.target.value,10);
    $("#row-c2").classList.toggle("hidden", state.courts===1);
    checkPlayoffReady(); renderAll();
  });

  $("#addPlayer1").onclick = ()=> addPlayer(1, $("#playerInput1").value);
  $("#addPlayer2").onclick = ()=> addPlayer(2, $("#playerInput2").value);
  $("#playerInput1").addEventListener("keydown", e=>{ if(e.key==="Enter") $("#addPlayer1").click(); });
  $("#playerInput2").addEventListener("keydown", e=>{ if(e.key==="Enter") $("#addPlayer2").click(); });
  $("#reset1").onclick = ()=> resetCourt(1);
  $("#reset2").onclick = ()=> resetCourt(2);
  $("#gen1").onclick = ()=> generateIfNeeded(1);
  $("#gen2").onclick = ()=> generateIfNeeded(2);
  $("#buildPlayoff").onclick = ()=> buildPlayoff();
  $("#closeModal").onclick = ()=> $("#playoffModal").close();

  // ---------- Jugadores ----------
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
    state.queue[court]=[]; state.openMatch[court]=null; state.finished[court]=false; state.round[court]=1;
    checkPlayoffReady(); renderAll();
  }

  function removePlayer(court, name){
    state.players[court] = state.players[court].filter(n=>n!==name);
    delete state.standings[court][name];
    state.queue[court]=[]; state.openMatch[court]=null; state.finished[court]=false; state.round[court]=1;
    checkPlayoffReady(); renderAll();
  }

  function resetCourt(court){
    state.players[court]=[];
    state.standings[court]={};
    state.queue[court]=[];
    state.openMatch[court]=null;
    state.finished[court]=false;
    state.round[court]=1;
    checkPlayoffReady(); renderAll();
  }

  // ---------- Generación de Partidos ----------
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

  // Round-robin “método del círculo” + aplanado a partidos de dobles
  function buildAmericanQueue(players){
    const BYE = "__BYE__";
    const arr = players.slice();
    if(arr.length % 2 === 1) arr.push(BYE);

    const n = arr.length;
    const rounds = [];
    let rot = arr.slice();

    for(let r=0; r<n-1; r++){
      const pairs = [];
      for(let i=0;i<n/2;i++){
        const a = rot[i], b = rot[n-1-i];
        pairs.push([a,b]);
      }
      rounds.push(pairs);
      const fixed = rot[0];
      const rest = rot.slice(1);
      rest.unshift(rest.pop());
      rot = [fixed, ...rest];
    }

    const matches = [];
    let carry = null;

    for(const pr of rounds){
      let pairs = pr.filter(P => !P.includes(BYE));
      if(carry){
        const idx = pairs.findIndex(p => disjoint(p, carry));
        if(idx>=0){
          matches.push({ a: carry.slice(), b: pairs[idx].slice(), done:false });
          pairs.splice(idx,1);
          carry = null;
        }
      }
      for(let i=0;i<pairs.length;i+=2){
        if(i+1 < pairs.length){
          matches.push({ a: pairs[i].slice(), b: pairs[i+1].slice(), done:false });
        }else{
          carry = pairs[i].slice();
        }
      }
    }
    return matches;
  }

  // ---------- Guardar resultado ----------
  function saveResult(court, aScore, bScore){
    const m = state.openMatch[court];
    if(!m) return;

    const sA = parseInt((aScore.value||"").trim(),10);
    const sB = parseInt((bScore.value||"").trim(),10);
    if([sA,sB].some(x=>Number.isNaN(x)||x<0)){ alert("Marcador inválido."); return; }
    if(sA===sB){ alert("No puede empatar."); return; }
    const G = state.goal;
    const valid = (sA===G && sB<G) || (sB===G && sA<G);
    if(!valid){ alert(`Marcador inválido: el ganador debe llegar exactamente a ${G} y el perdedor quedar por debajo.`); return; }

    const all = [...m.a, ...m.b];
    all.forEach(p=>{
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

    state.openMatch[court]=null;
    state.round[court]+=1;

    if(state.queue[court].length>0){
      state.openMatch[court] = state.queue[court].shift();
    }else{
      state.finished[court]=true;
    }
    checkPlayoffReady();
    renderAll();
  }

  // ---------- Standings helpers ----------
  function standingsOrdered(court){
    return Object.entries(state.standings[court]).map(([name,st])=>({
      name, pts: st.pts||0, w: st.w||0, l: st.l||0, played: st.played||0, lastRound: st.lastRound||0
    })).sort((a,b)=>{
      if(b.pts!==a.pts) return b.pts-a.pts;
      if(b.w!==a.w) return b.w-a.w;
      return a.name.localeCompare(b.name);
    });
  }

  // ---------- Playoff ready bar ----------
  function checkPlayoffReady(){
    const oneCourtReady = (state.courts===1 && state.finished[1]);
    const twoCourtsReady = (state.courts===2 && state.finished[1] && state.finished[2]);
    const ready = oneCourtReady || twoCourtsReady;
    $("#playoffBar").classList.toggle("hidden", !ready);
    $("#playoffHint").textContent = ready
      ? (state.courts===1 ? "Modo 1 cancha: Top4 (y Bottom si hay 8)." : "Modo 2 canchas: cruces C1 vs C2 (Top y Bottom flexibles).")
      : "";
  }

  // ---------- Playoff builder (1 ó 2 canchas) ----------
  function buildPlayoff(){
    if(state.courts===1) return buildPlayoffOneCourt();
    return buildPlayoffTwoCourts();
  }

  function teamFmt(court, a, b){ return `C${court} (${a}, ${b})`; }

  // 1 cancha
  function buildPlayoffOneCourt(){
    if(!state.finished[1]){ alert("Termina el americano primero."); return; }
    const s = standingsOrdered(1).map(r=>r.name);
    if(s.length<6){ alert("Se requieren al menos 6 jugadores para eliminatoria (1 cancha)."); return; }

    const lines = [];

    // Top4 siempre si hay >=6
    lines.push("<strong>Top 4</strong>");
    lines.push("• " + teamFmt(1, s[0], s[2]) + " vs " + teamFmt(1, s[1], s[3]));

    // Bottom solo si hay 8
    if(s.length>=8){
      lines.push("<strong style='margin-top:.5rem;display:block'>Bottom 4</strong>");
      lines.push("• " + teamFmt(1, s[4], s[6]) + " vs " + teamFmt(1, s[5], s[7]));
    }

    $("#playoffList").innerHTML = lines.join("<br/>");
    $("#playoffModal").showModal();
  }

  // 2 canchas (flexible para 6 u 8 por cancha)
  function buildPlayoffTwoCourts(){
    if(!state.finished[1] || !state.finished[2]){ alert("Termina el americano en ambas canchas primero."); return; }

    const s1 = standingsOrdered(1).map(r=>r.name);
    const s2 = standingsOrdered(2).map(r=>r.name);
    const n1 = s1.length, n2 = s2.length;

    const out = [];

    // --- Top 4 cruzado: requiere 4 y 4 ---
    if(n1>=4 && n2>=4){
      out.push("<strong>Top 4</strong>");
      out.push("• " + teamFmt(1, s1[0], s1[2]) + " vs " + teamFmt(2, s2[0], s2[2]));
      out.push("• " + teamFmt(1, s1[1], s1[3]) + " vs " + teamFmt(2, s2[1], s2[3]));
    }else{
      out.push("<em>No hay Top 4 porque alguna cancha tiene menos de 4 jugadores.</em>");
    }

    // --- Bottom flexible ---
    const bottomTeams1 = buildBottomTeamsFromOrdered(s1);
    const bottomTeams2 = buildBottomTeamsFromOrdered(s2);
    const bottomCount = bottomTeams1.length + bottomTeams2.length;

    if(bottomCount>0){
      out.push("<strong style='margin-top:.5rem;display:block'>Bottom</strong>");
      const len = Math.max(bottomTeams1.length, bottomTeams2.length);
      for(let i=0;i<len;i++){
        const t1 = bottomTeams1[i];
        const t2 = bottomTeams2[i];
        if(t1 && t2){
          out.push("• " + teamFmt(1, t1[0], t1[1]) + " vs " + teamFmt(2, t2[0], t2[1]));
        }else if(t1 && !t2){
          out.push("• " + teamFmt(1, t1[0], t1[1]) + " — <em>bye (sin rival de C2)</em>");
        }else if(!t1 && t2){
          out.push("• " + teamFmt(2, t2[0], t2[1]) + " — <em>bye (sin rival de C1)</em>");
        }
      }
    }

    if(out.length===0){
      out.push("<em>No hay suficientes jugadores para crear cruces.</em>");
    }

    $("#playoffList").innerHTML = out.join("<br/>");
    $("#playoffModal").showModal();
  }

  // Regla de armado de equipos "Bottom" por cancha:
  // - Si hay >=8 → dos equipos: (5,7) y (6,8)
  // - Si hay 7 → (5,7) y (6) queda sin pareja → degradamos a (5,6)
  // - Si hay 6 → un equipo: (5,6)
  // - <6 → ninguno
  function buildBottomTeamsFromOrdered(ordered){
    const n = ordered.length;
    const teams = [];
    if(n<6) return teams;
    if(n===6){ teams.push([ordered[4], ordered[5]]); return teams; }
    if(n===7){
      teams.push([ordered[4], ordered[6]]); // (5,7)
      teams.push([ordered[5], null]);       // marcará falta; luego lo corregimos a (5,6)? mejor consolidar:
      // consolidación simple: usar (5,6) y desechar lo anterior
      return [[ordered[4], ordered[5]]];
    }
    // n>=8
    teams.push([ordered[4], ordered[6]]);
    teams.push([ordered[5], ordered[7]]);
    return teams;
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
      name, pts: st.pts||0, w: st.w||0, l: st.l||0, played: st.played||0, lastRound: st.lastRound||0
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
