// =========================================
// DASHBOARD DE MÉTRICAS
// =========================================
var _chartStatus = null;
async function carregarDashboard() {
  try {
    const [todos, avaliacoes, pagamentos] = await Promise.all([
      supaGet("agendamentos", "order=criado_em.desc"),
      supaGet("avaliacoes", "order=criado_em.desc&limit=8").catch(() => []),
      supaGet("pagamentos", "order=criado_em.desc").catch(() => [])
    ]);

    const total       = todos.length;
    const concluidos  = todos.filter(a => a.status === "concluido" || a.status === "encerrado").length;
    const pendentes   = todos.filter(a => a.status === "pendente").length;
    const emAndamento = todos.filter(a => a.status === "em_andamento").length;
    const cancelados  = todos.filter(a => ["cancelado","recusado","expirado"].includes(a.status)).length;

    // Receita (só admin): soma dos pagamentos aprovados
    let receitaHTML = "";
    if (tipoUsuario === "admin") {
      const aprovados = pagamentos.filter(p => p.status === "aprovado");
      const receita   = aprovados.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
      const ticket    = aprovados.length > 0 ? receita / aprovados.length : 0;
      receitaHTML = `
        <div class="dash-metrica">
          <div class="dm-label">💰 Receita aprovada</div>
          <div class="dm-valor" style="color:#c9a84c">R$ ${receita.toFixed(2)}</div>
        </div>
        <div class="dash-metrica">
          <div class="dm-label">🎟️ Ticket médio</div>
          <div class="dm-valor" style="color:#c9a84c">R$ ${ticket.toFixed(2)}</div>
        </div>`;
    }

    document.getElementById("dashMetricas").innerHTML = `
      <div class="dash-metrica">
        <div class="dm-label">Total de chamados</div>
        <div class="dm-valor">${total}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">Concluídos</div>
        <div class="dm-valor" style="color:#4caf6e">${concluidos}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">Em andamento</div>
        <div class="dm-valor" style="color:#378add">${emAndamento}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">Pendentes</div>
        <div class="dm-valor" style="color:#f0c040">${pendentes}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">Cancel./Recus.</div>
        <div class="dm-valor" style="color:#e05a3a">${cancelados}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">Taxa de conclusão</div>
        <div class="dm-valor">${total > 0 ? Math.round((concluidos/total)*100) : 0}%</div>
      </div>
      ${receitaHTML}`;

    // ── Gráfico de distribuição de status (pizza) ──
    const statusCount = {};
    todos.forEach(a => { statusCount[a.status] = (statusCount[a.status] || 0) + 1; });
    const ordemStatus = ["pendente","aprovado","em_andamento","concluido","recusado","expirado","cancelado","encerrado"];
    const coresStatus = {
      pendente:"#f0c040", aprovado:"#9333ea", em_andamento:"#378add", concluido:"#4caf6e",
      recusado:"#c0584f", expirado:"#e0a23a", cancelado:"#888780", encerrado:"#e05a3a"
    };
    const labels = ordemStatus.filter(s => statusCount[s]);
    if (typeof Chart !== "undefined" && labels.length) {
      const ctx = document.getElementById("dashChartStatus");
      if (_chartStatus) _chartStatus.destroy();
      _chartStatus = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: labels.map(s => STATUS_LABELS[s] || s),
          datasets: [{
            data: labels.map(s => statusCount[s]),
            backgroundColor: labels.map(s => coresStatus[s] || "#888"),
            borderColor: "rgba(10,10,15,0.6)", borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "right", labels: { color: "#e8dfc0", font: { size: 11 } } } }
        }
      });
    } else {
      const ctxWrap = document.getElementById("dashChartStatus");
      if (ctxWrap) ctxWrap.parentElement.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Sem dados ainda.</p>';
    }

    // ── Vocações mais procuradas ──
    const porVocacao = {};
    todos.forEach(a => { if (a.vocacao) porVocacao[a.vocacao] = (porVocacao[a.vocacao] || 0) + 1; });
    const rankVoc = Object.entries(porVocacao).sort((a,b) => b[1]-a[1]).slice(0,6);
    const maxVoc  = rankVoc.length ? rankVoc[0][1] : 1;
    document.getElementById("dashVocacoes").innerHTML = rankVoc.length === 0
      ? '<p style="color:rgba(232,223,192,0.4);font-size:13px">Nenhum chamado ainda.</p>'
      : rankVoc.map(([voc, qtd]) => `
          <div class="dash-rank-row">
            <span class="dash-rank-nome" style="min-width:120px">${voc}</span>
            <div class="dash-rank-bar-wrap">
              <div class="dash-rank-bar" style="width:${Math.round((qtd/maxVoc)*100)}%"></div>
            </div>
            <span class="dash-rank-qtd">${qtd}</span>
          </div>`).join("");

    // ── Top serviceiros por quantidade de serviços realizados (concluído + encerrado) ──
    const porServiceiro = {};
    todos.filter(a => a.status === "concluido" || a.status === "encerrado").forEach(a => {
      porServiceiro[a.serviceiro] = (porServiceiro[a.serviceiro] || 0) + 1;
    });
    const ranking = Object.entries(porServiceiro).sort((a,b) => b[1]-a[1]).slice(0,5);
    const maxVal  = ranking.length > 0 ? ranking[0][1] : 1;
    document.getElementById("dashTopServiceiros").innerHTML = ranking.length === 0
      ? '<p style="color:rgba(232,223,192,0.4);font-size:13px">Nenhum serviço concluído ainda.</p>'
      : ranking.map(([nome, qtd], i) => `
          <div class="dash-rank-row">
            <span class="dash-rank-pos">${i+1}</span>
            <span class="dash-rank-nome">${nome}</span>
            <div class="dash-rank-bar-wrap">
              <div class="dash-rank-bar" style="width:${Math.round((qtd/maxVal)*100)}%"></div>
            </div>
            <span class="dash-rank-qtd">${qtd}</span>
          </div>`).join("");

    // ── Top serviceiros por nota média ──
    const notasPorServ = {};
    const todasAval = await supaGet("avaliacoes", "order=criado_em.desc").catch(() => []);
    todasAval.forEach(av => {
      if (!notasPorServ[av.serviceiro]) notasPorServ[av.serviceiro] = { soma: 0, n: 0 };
      notasPorServ[av.serviceiro].soma += (av.nota || 0);
      notasPorServ[av.serviceiro].n += 1;
    });
    const rankNotas = Object.entries(notasPorServ)
      .map(([nome, v]) => [nome, v.soma / v.n, v.n])
      .sort((a,b) => b[1]-a[1]).slice(0,5);
    document.getElementById("dashTopNotas").innerHTML = rankNotas.length === 0
      ? '<p style="color:rgba(232,223,192,0.4);font-size:13px">Nenhuma avaliação ainda.</p>'
      : rankNotas.map(([nome, media, n], i) => `
          <div class="dash-rank-row">
            <span class="dash-rank-pos">${i+1}</span>
            <span class="dash-rank-nome">${nome}</span>
            <span style="color:#f0c040;font-size:13px;letter-spacing:1px">${"★".repeat(Math.round(media))}${"☆".repeat(5-Math.round(media))}</span>
            <span class="dash-rank-qtd">${media.toFixed(1)} <span style="opacity:0.5;font-size:11px">(${n})</span></span>
          </div>`).join("");

    // ── Avaliações recentes ──
    document.getElementById("dashAvaliacoes").innerHTML = avaliacoes.length === 0
      ? '<p style="color:rgba(232,223,192,0.4);font-size:13px">Nenhuma avaliação ainda.</p>'
      : avaliacoes.map(av => `
          <div class="dash-avaliacao">
            <div class="da-header">
              <span class="da-nome">${av.nome_cliente}</span>
              <span class="da-estrelas">${"★".repeat(av.nota)}${"☆".repeat(5-av.nota)}</span>
            </div>
            <div class="da-serviceiro">→ ${av.serviceiro}</div>
            ${av.comentario ? `<div class="da-comentario">"${av.comentario}"</div>` : ""}
          </div>`).join("");

  } catch(e) { console.error("Erro no dashboard:", e); }
}

// Filtros do histórico
document.getElementById("filtroStatusHistorico")?.addEventListener("change", carregarHistorico);
document.getElementById("filtroServiceiroHistorico")?.addEventListener("change", carregarHistorico);
document.getElementById("filtroChamado")?.addEventListener("input", carregarHistorico);
document.getElementById("filtroNomeHistorico")?.addEventListener("input", carregarHistorico);

