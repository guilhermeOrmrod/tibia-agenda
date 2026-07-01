// =========================================
// HISTÓRICO DE SERVIÇOS
// =========================================
async function carregarHistorico() {
  const container = document.getElementById("listaHistorico");

  // Bloqueia acesso para não logados
  if (!tipoUsuario) {
    container.innerHTML = `
      <div class="contatos-bloqueado">
        <span class="bloqueado-icon">🔒</span>
        <p>Faça login para consultar o histórico de serviços.</p>
      </div>`;
    return;
  }

  const statusFiltro  = document.getElementById("filtroStatusHistorico").value;
  const servicFiltro  = document.getElementById("filtroServiceiroHistorico").value;
  container.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Carregando...</p>';

  try {
    const chamadoFiltro = document.getElementById("filtroChamado")?.value.trim();
    const nomeFiltro    = document.getElementById("filtroNomeHistorico")?.value.trim();
    let query = "arquivado=not.is.true&order=inicio.desc";
    if (statusFiltro !== "todos")  query += `&status=eq.${statusFiltro}`;
    if (servicFiltro !== "todos")  query += `&serviceiro=eq.${encodeURIComponent(servicFiltro)}`;
    if (chamadoFiltro)             query += `&numero_chamado=eq.${chamadoFiltro}`;
    if (nomeFiltro)                query += `&nome_cliente=ilike.*${encodeURIComponent(nomeFiltro)}*`;

    const ags = await supaGet("agendamentos", query);

    // Popula filtro de serviceiros
    const selServ = document.getElementById("filtroServiceiroHistorico");
    const atual   = selServ.value;
    const todos   = [...new Set(Object.values(SERVICEIROS).flat())].sort();
    selServ.innerHTML = '<option value="todos">Todos os serviceiros</option>';
    todos.forEach(n => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = n;
      selServ.appendChild(opt);
    });
    selServ.value = atual;

    if (ags.length === 0) {
      container.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px;padding:20px 0;text-align:center">Nenhum serviço encontrado.</p>';
      return;
    }

    container.innerHTML = agruparPorMesHTML(ags, "inicio", ag => {
      const concluido = ag.status === "concluido" || ag.status === "encerrado";
      const valor = ag.valor_final != null ? Number(ag.valor_final) : (concluido ? valorCalculado(ag) : null);
      return `
      <div class="historico-card status-${ag.status}">
        <div class="hc-status-icon">${STATUS_ICONS[ag.status] || "❓"}</div>
        <div class="hc-body">
          <div class="hc-titulo">
            ${ag.numero_chamado ? `<span class="hc-num-chamado">#${ag.numero_chamado}</span>` : ''}
            ${ag.nome_cliente} → ${ag.serviceiro}
          </div>
          <div class="hc-detalhe">
            <span>⚔️ ${ag.vocacao}</span>
            <span>🗺️ ${ag.hunt} · ${ag.tipo}</span>
            <span>📅 ${new Date(ag.inicio).toLocaleString("pt-BR")} – ${new Date(ag.fim).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>
            ${concluido ? `<span>⏱️ ${fmtDuracao(duracaoMs(ag))} trabalhadas</span>` : ""}
            ${valor != null ? `<span style="color:#c9a84c;font-weight:600">💰 ${fmtBRL(valor)}</span>` : ""}
          </div>
          ${timelineHTML(ag)}
          ${ag.print_url ? `<a href="${ag.print_url}" target="_blank" class="hc-print"><img src="${ag.print_url}" alt="Print do serviço" loading="lazy"><span>📸 Ver print</span></a>` : ""}
          ${ag.anotacoes ? `<div class="hc-anotacoes">🗒️ <b>Anotações do serviceiro:</b><br>${ag.anotacoes.replace(/</g,"&lt;").replace(/\n/g,"<br>")}</div>` : ""}
          ${ag.obs_conclusao ? `<div class="hc-obs">📝 ${ag.obs_conclusao}</div>` : ""}
          ${tipoUsuario === "cliente" ? `<button class="btn-repetir" data-repetir='${JSON.stringify({serviceiro:ag.serviceiro,vocacao:ag.vocacao,tipo:ag.tipo,hunt:ag.hunt}).replace(/'/g,"&#39;")}'>🔁 Repetir agendamento</button>` : ""}
        </div>
        <span class="hc-badge ${ag.status}">${STATUS_LABELS[ag.status] || ag.status}</span>
      </div>`;
    });

    // Botão repetir agendamento (cliente)
    container.querySelectorAll("[data-repetir]").forEach(btn => {
      btn.addEventListener("click", () => {
        let dados;
        try { dados = JSON.parse(btn.dataset.repetir.replace(/&#39;/g, "'")); } catch { return; }
        // Vai para a aba Agenda e pré-preenche
        document.getElementById("btnNavAgenda")?.click();
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal("vocacao", dados.vocacao);
        // dispara o change da vocação para popular os serviceiros
        document.getElementById("vocacao")?.dispatchEvent(new Event("change"));
        setTimeout(() => {
          setVal("serviceiro", dados.serviceiro);
          setVal("tipo", dados.tipo);
          if (dados.hunt) {
            const huntSel = document.getElementById("hunt");
            if (huntSel && [...huntSel.options].some(o => o.value === dados.hunt)) {
              huntSel.value = dados.hunt;
            } else {
              setVal("hunt", "custom");
              const hc = document.getElementById("huntCustom");
              if (hc) { hc.style.display = "block"; hc.value = dados.hunt; }
            }
          }
          if (perfilAtual?.nick) setVal("nome", perfilAtual.nick);
          mostrarMensagem("🔁 Dados preenchidos! Escolha a data e o horário para agendar.", "sucesso");
        }, 150);
      });
    });

  } catch(e) { container.innerHTML = '<p style="color:rgba(224,90,58,0.7);font-size:13px">Erro ao carregar histórico.</p>'; }
}

