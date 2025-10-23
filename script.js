/* Americano por cancha + Eliminatoria embebida (sin modal)
   Reglas conservadas: max 8 por cancha, sin empates, ganador debe llegar EXACTO a la meta.
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
    finished: { 1: false, 2: false },

    // Eliminatoria
    playoff: null // se llena con { metaTxt, top:{semi1,semi2,final}, bottom:{...} }
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
    state.playoff=null; // si cambian jugadores, invalidar playoff
    checkPlayoffReady(); renderAll();
  }

  function removePlayer(court, name){
    state.players[court] = state.players[court].filter(n=>n!==name);
    delete state.standings[court][name];
    state.queue[court]=[]; state.openMatch[court]=null; state.finished[court]=false; state.round[court]=1;
    state.playoff=null;
    checkPlayoffReady(); renderAll();
  }

  function resetCourt(court){
    state.players[court]=[];
    state.standings[court]={};
    state.queue[court]=[];
    state.openMatch[court]=null;
    state.finished[court]=false;
    state.round[court]=1;
    state.playoff=null;
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

  // ---------- Guardar resultado de americano ----------
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

  // ---------- Playoff ready ----------
  function checkPlayoffReady(){
    const oneCourtReady = (state.courts===1 && state.finished[1]);
    const twoCourtsReady = (state.courts===2 && state.finished[1] && state.finished[2]);
    const ready = oneCourtReady || twoCourtsReady;
    $("#playoffBar").classList.toggle("hidden", !ready);
    $("#playoffHint").textContent = ready
      ? (state.courts===1 ? "Modo 1 cancha: Top4 (y Bottom si hay 8)." : "Modo 2 canchas: cruces C1 vs C2 (Top y Bottom flexibles).")
      : "";
  }

  // ---------- Playoff model ----------
  function teamFmtLabel(team){
    if(!team) return "(pendiente)";
    const [court, a, b] = team;
    if(court==="C1" || court==="C2") return `${court} (${a}, ${b})`;
    // 1 cancha usa "C1" también
    return `C1 (${a}, ${b})`;
  }

  function makeTeam(court, a, b){ return [court, a, b]; }

  function buildBottomTeamsFromOrdered(ordered){
    const n = ordered.length;
    const L = ordered;
    const teams = [];
    if(n<6) return teams;
    if(n===6){ teams.push([L[4], L[5]]); return teams; }
    if(n===7){ return [[L[4], L[5]]]; } // consolidado (5,6)
    // n>=8
    teams.push([L[4], L[6]]);
    teams.push([L[5], L[7]]);
    return teams;
  }

  // Crear estructura de playoff (sin modal)
  function buildPlayoff(){
    if(state.courts===1){
      if(!state.finished[1]){ alert("Termina el americano primero."); return; }
      const s = standingsOrdered(1).map(r=>r.name);
      if(s.length<6){ alert("Se requieren al menos 6 jugadores para eliminatoria (1 cancha)."); return; }

      const topSemi1 = { teamA: makeTeam("C1", s[0], s[2]), teamB: makeTeam("C1", s[1], s[3]), scoreA:null, scoreB:null, winner:null };
      const topSemi2 = null; // 1 llave de semifinal directa (1,3) vs (2,4); final se forma al registrar este juego
      const topFinal = { teamA: "winner_top_semi1", teamB: null, scoreA:null, scoreB:null, winner:null };

      const bottom = (s.length>=8)
        ? {
            semi1: { teamA: makeTeam("C1", s[4], s[6]), teamB: makeTeam("C1", s[5], s[7]), scoreA:null, scoreB:null, winner:null },
            semi2: null,
            final: { teamA: "winner_bottom_semi1", teamB: null, scoreA:null, scoreB:null, winner:null }
          }
        : null;

      state.playoff = {
        metaTxt: "1 cancha",
        top: { semi1: topSemi1, semi2: topSemi2, final: topFinal },
        bottom
      };
    }else{
      if(!state.finished[1] || !state.finished[2]){ alert("Termina el americano en ambas canchas primero."); return; }

      const s1 = standingsOrdered(1).map(r=>r.name);
      const s2 = standingsOrdered(2).map(r=>r.name);

      const top = (s1.length>=4 && s2.length>=4)
        ? {
            semi1: { teamA: makeTeam("C1", s1[0], s1[2]), teamB: makeTeam("C2", s2[0], s2[2]), scoreA:null, scoreB:null, winner:null },
            semi2: { teamA: makeTeam("C1", s1[1], s1[3]), teamB: makeTeam("C2", s2[1], s2[3]), scoreA:null, scoreB:null, winner:null },
            final: { teamA: "winner_top_semi1", teamB: "winner_top_semi2", scoreA:null, scoreB:null, winner:null }
          }
        : null;

      // Bottom flexible cruzado
      const b1 = buildBottomTeamsFromOrdered(s1).map(t=>makeTeam("C1", t[0], t[1]));
      const b2 = buildBottomTeamsFromOrdered(s2).map(t=>makeTeam("C2", t[0], t[1]));
      const pairs = [];
      const len = Math.max(b1.length, b2.length);
      for(let i=0;i<len;i++){
        const t1 = b1[i] || null;
        const t2 = b2[i] || null;
        pairs.push([t1, t2]); // si uno es null → bye
      }

      let bottom = null;
      if(pairs.length>0){
        // Construyo “semifinales” según cuantos pares haya (1 o 2)
        if(pairs.length===1){
          bottom = {
            semi1: { teamA: pairs[0][0], teamB: pairs[0][1], scoreA:null, scoreB:null, winner:null },
            semi2: null,
            final: { teamA: "winner_bottom_semi1", teamB: null, scoreA:null, scoreB:null, winner:null }
          };
        }else{
          bottom = {
            semi1: { teamA: pairs[0][0], teamB: pairs[0][1], scoreA:null, scoreB:null, winner:null },
            semi2: { teamA: pairs[1][0], teamB: pairs[1][1], scoreA:null, scoreB:null, winner:null },
            final: { teamA: "winner_bottom_semi1", teamB: "winner_bottom_semi2", scoreA:null, scoreB:null, winner:null }
          };
        }
      }

      state.playoff = { metaTxt: "2 canchas cruzadas", top, bottom };
    }

    $("#playoffSection").classList.remove("hidden");
    renderPlayoff();
  }

  // ---------- Registro de resultados en playoff ----------
  function savePlayoffResult(scope, key, scoreA, scoreB){
    const node = state.playoff[scope][key];
    const G = state.goal;

    const a = parseInt((scoreA.value||"").trim(),10);
    const b = parseInt((scoreB.value||"").trim(),10);
    if([a,b].some(x=>Number.isNaN(x)||x<0)){ alert("Marcador inválido."); return; }
    if(a===b){ alert("No puede empatar."); return; }
    const valid = (a===G && b<G) || (b===G && a<G);
    if(!valid){ alert(`Marcador inválido: el ganador debe llegar exactamente a ${G} y el perdedor quedar por debajo.`); return; }

    node.scoreA = a; node.scoreB = b;
    node.winner = (a>b) ? node.teamA : node.teamB;

    // Promocionar a final si aplica
    const bracket = state.playoff[scope];
    if(bracket.final){
      if(bracket.final.teamA==="winner_"+scope+"_semi1" || bracket.final.teamA==="winner_top_semi1" || bracket.final.teamA==="winner_bottom_semi1"){
        if(key==="semi1") bracket.final.teamA = node.winner;
      }
      if(bracket.final.teamB==="winner_"+scope+"_semi2" || bracket.final.teamB==="winner_top_semi2" || bracket.final.teamB==="winner_bottom_semi2"){
        if(key==="semi2") bracket.final.teamB = node.winner;
      }
      // Para el caso 1 cancha (solo semi1 en top/bottom), final.teamB sigue null hasta que agreguemos otra llave; lo dejamos así.
    }

    renderPlayoff();
  }

  // ---------- Render ----------
  function renderAll(){
    $("#globalRound").textContent = Math.max(state.round[1], state.round[2]);

    renderPlayersList(1); renderPlayersList(2);
    renderMatches(1); renderMatches(2);
    renderTable(1); renderTable(2);
    renderPlayoff();
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

  // ---------- Render playoff (embebido) ----------
  function renderPlayoff(){
    const sec = $("#playoffSection");
    const topBox = $("#playoffTop");
    const botBox = $("#playoffBottom");
    const meta = $("#playoffMeta");

    if(!state.playoff){
      sec.classList.add("hidden");
      return;
    }
    sec.classList.remove("hidden");
    meta.textContent = state.playoff.metaTxt + ` · Meta ${state.goal}`;

    // Helpers UI
    function matchCard(scope, key, node, title){
      const card = el("div",{class:"card"});
      card.appendChild(el("div",{class:"meta",text:title}));

      // bye auto-avance
      if(!node.teamA && !node.teamB){
        card.appendChild(el("div",{class:"muted",text:"(sin equipos)"}));
        return card;
      }
      if(node.teamA && !node.teamB){
        card.appendChild(el("div",{text: teamFmtLabel(node.teamA) + " — bye (avanza)"}));
        node.winner = node.teamA;
        return card;
      }
      if(!node.teamA && node.teamB){
        card.appendChild(el("div",{text: teamFmtLabel(node.teamB) + " — bye (avanza)"}));
        node.winner = node.teamB;
        return card;
      }

      // Teams row
      const row = el("div",{class:"row",style:"gap:.5rem;align-items:center"});
      const tag = (t)=> el("span",{class:"tag",text:teamFmtLabel(t)});
      row.appendChild(tag(node.teamA));
      row.appendChild(el("span",{class:"muted",text:"VS"}));
      row.appendChild(tag(node.teamB));
      card.appendChild(row);

      const G = state.goal;
      const mark = el("div",{class:"mark"});
      const inA = el("input",{class:"score",type:"number",min:"0",max:String(G),value: node.scoreA??0 });
      const inB = el("input",{class:"score",type:"number",min:"0",max:String(G),value: node.scoreB??0 });
      mark.appendChild(el("span",{class:"muted",text:`Marcador (a ${G}):`}));
      mark.appendChild(inA);
      mark.appendChild(el("span",{text:"-"}));
      mark.appendChild(inB);
      const btn = el("button",{class:"primary",text:"Guardar"});
      btn.onclick = ()=> savePlayoffResult(scope, key, inA, inB);

      const wrap = el("div",{class:"row",style:"justify-content:space-between;gap:.5rem"});
      wrap.appendChild(mark); wrap.appendChild(btn);
      card.appendChild(wrap);

      if(node.winner){
        card.appendChild(el("div",{class:"muted",text:"Ganador: "+teamFmtLabel(node.winner)}));
      }
      return card;
    }

    topBox.innerHTML = "";
    botBox.innerHTML = "";

    if(state.playoff.top){
      const {semi1, semi2, final} = state.playoff.top;
      if(semi1) topBox.appendChild(matchCard("top","semi1",semi1,"Semifinal"));
      if(semi2) topBox.appendChild(matchCard("top","semi2",semi2,"Semifinal"));
      if(final){
        // Si final tiene referencias a winners y aún no están ambos definidos, lo mostramos informativo
        const fNode = {
          teamA: (typeof final.teamA==="string") ? null : final.teamA,
          teamB: (typeof final.teamB==="string") ? null : final.teamB,
          scoreA: final.scoreA, scoreB: final.scoreB, winner: final.winner
        };
        topBox.appendChild(matchCard("top","final",final,"Final"));
      }
    }else{
      topBox.appendChild(el("div",{class:"muted",text:"(No hay Top disponible)"}));
    }

    if(state.playoff.bottom){
      const {semi1, semi2, final} = state.playoff.bottom;
      if(semi1) botBox.appendChild(matchCard("bottom","semi1",semi1,"Semifinal"));
      if(semi2) botBox.appendChild(matchCard("bottom","semi2",semi2,"Semifinal"));
      if(final) botBox.appendChild(matchCard("bottom","final",final,"Final Consolación"));
    }else{
      botBox.appendChild(el("div",{class:"muted",text:"(No hay Bottom en este formato)"}));
    }
  }

  // Primera pintura
  renderAll();
})();
