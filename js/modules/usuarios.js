// =========================================
// GESTÃO DE USUÁRIOS (Admin)
// =========================================
var ROLE_LABELS = { admin: "⚔️ Admin", serviceiro: "🗡️ Serviceiro", cliente: "👤 Cliente", pendente: "⏳ Pendente" };

document.querySelectorAll("[data-usr-tab]").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-usr-tab]").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    carregarUsuarios(tab.dataset.usrTab);
  });
});

async function carregarUsuarios(filtroRole = "pendente") {
  if (tipoUsuario !== "admin") return;
  const container = document.getElementById("listaUsuarios");
  container.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Carregando...</p>';

  // Busca todos os perfis se filtro for "todos", senão filtra por role
  const ROLE_CORES = {
    admin:      "rgba(201,168,76,0.2)",
    serviceiro: "rgba(147,51,234,0.15)",
    cliente:    "rgba(55,138,221,0.15)",
    pendente:   "rgba(240,192,64,0.15)"
  };

  try {
    // Lê perfis via Edge Function (service_role) — a RLS de `perfis` só permite
    // SELECT do próprio perfil, então o REST direto com o JWT do admin não traz
    // os outros usuários. A Edge Function roda com service_role e enxerga todos.
    const filtros = [];
    let posFiltro = null; // filtro extra aplicado no cliente após buscar
    if (filtroRole === "pendente") {
      filtros.push({ coluna: "aprovado", op: "eq", valor: false });
    } else if (filtroRole === "serviceiro") {
      // Aba "Serviceiros": traz serviceiros puros E admins vinculados a um serviceiro.
      // Busca todos os aprovados e filtra no cliente (a RLS/edge não faz OR composto).
      filtros.push({ coluna: "aprovado", op: "eq", valor: true });
      posFiltro = (p) => p.role === "serviceiro" || (p.role === "admin" && p.serviceiro_nome);
    } else if (filtroRole !== "todos") {
      filtros.push({ coluna: "role", op: "eq", valor: filtroRole });
      filtros.push({ coluna: "aprovado", op: "eq", valor: true });
    }

    let perfis = await adminAction("select", "perfis", null, null, {
      filtros,
      ordem: { coluna: "criado_em", ascending: false }
    });
    if (posFiltro && Array.isArray(perfis)) perfis = perfis.filter(posFiltro);
    const error = null;

    if (error) throw error;

    if (!perfis || perfis.length === 0) {
      container.innerHTML = `<p style="color:rgba(232,223,192,0.4);font-size:13px;padding:8px 0">Nenhum usuário encontrado.</p>`;
      return;
    }

    container.innerHTML = perfis.map(p => {
      const isSelf = p.id === perfilAtual?.id;
      return `
      <div class="usr-card" style="background:${ROLE_CORES[p.role] || 'rgba(255,255,255,0.03)'};border:1px solid rgba(201,168,76,0.15);border-radius:8px;padding:14px 16px;margin-bottom:10px;${!p.aprovado ? 'border-left:3px solid #f0c040' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:15px;font-weight:600;color:#e8dfc0">${p.nick}</span>
              <span class="hc-badge ${p.role}" style="font-size:10px;padding:2px 8px">${ROLE_LABELS[p.role] || p.role}</span>
              ${!p.aprovado ? '<span style="font-size:10px;color:#f0c040;font-family:Cinzel,serif">● Aguardando aprovação</span>' : ''}
              ${isSelf ? '<span style="font-size:10px;color:rgba(232,223,192,0.4);font-family:Cinzel,serif">(você)</span>' : ''}
            </div>
            <div style="font-size:12px;color:rgba(232,223,192,0.45)">${p.email}</div>
            <div style="font-size:11px;color:rgba(232,223,192,0.3);margin-top:2px;font-family:Cinzel,serif">Cadastrado ${new Date(p.criado_em).toLocaleDateString("pt-BR")}</div>
          </div>

          ${!isSelf ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
            ${!p.aprovado ? `<button class="btn-marcar-lida" data-aprovar="${p.id}" style="font-size:11px">✅ Aprovar</button>` : ""}
            <select class="role-select" data-usr-id="${p.id}" style="font-size:11px;padding:4px 8px;width:auto;margin:0;font-family:Cinzel,serif;background:rgba(255,255,255,0.06);color:#e8dfc0;border:1px solid rgba(201,168,76,0.3);border-radius:5px">
              <option value="cliente"    ${p.role === "cliente"    ? "selected" : ""}>👤 Cliente</option>
              <option value="serviceiro" ${p.role === "serviceiro" ? "selected" : ""}>🗡️ Serviceiro</option>
              <option value="admin"      ${p.role === "admin"      ? "selected" : ""}>⚔️ Admin</option>
            </select>
            <button class="btn-admin-salvar" data-salvar-role="${p.id}" style="font-size:11px;padding:5px 10px">Salvar</button>
            <button class="btn-recusar" style="width:auto;padding:4px 10px;font-size:11px" data-remover-usr="${p.id}">🗑️</button>
          </div>` : '<span style="font-size:11px;color:rgba(232,223,192,0.3)">Sua conta</span>'}
        </div>
        ${(p.role === "serviceiro" || p.role === "admin") ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(201,168,76,0.12);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;color:rgba(232,223,192,0.55);font-family:Cinzel,serif">🔗 Vincular ao serviceiro:${p.role === "admin" ? ' <span style="opacity:0.6">(admin que também faz serviços)</span>' : ''}</span>
          <select class="vinculo-serv-select" data-usr-id="${p.id}" style="font-size:11px;padding:4px 8px;width:auto;margin:0;font-family:Cinzel,serif;background:rgba(255,255,255,0.06);color:#e8dfc0;border:1px solid rgba(201,168,76,0.3);border-radius:5px">
            <option value="">— não vinculado —</option>
            ${listarTodosServiceiros().map(nome =>
              `<option value="${nome}" ${p.serviceiro_nome === nome ? "selected" : ""}>${nome}</option>`
            ).join("")}
          </select>
          <button class="btn-admin-salvar" data-salvar-vinculo="${p.id}" style="font-size:11px;padding:5px 10px">Salvar vínculo</button>
          ${p.serviceiro_nome ? `<span style="font-size:10px;color:rgba(76,175,110,0.8)">✓ ${p.serviceiro_nome}</span>` : '<span style="font-size:10px;color:#f0c040">⚠️ sem vínculo</span>'}
        </div>` : ""}
      </div>`
    }).join("");

    // Aprovar usuário
    container.querySelectorAll("[data-aprovar]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await adminAction("update", "perfis", btn.dataset.aprovar, { aprovado: true });
        mostrarMensagem("✅ Usuário aprovado!", "sucesso");
        carregarUsuarios(filtroRole);
      });
    });

    // Salvar nova role
    container.querySelectorAll("[data-salvar-role]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id  = btn.dataset.salvarRole;
        const sel = container.querySelector(`select[data-usr-id="${id}"]`);
        const novaRole = sel?.value;
        if (!novaRole) return;
        await adminAction("update", "perfis", id, { role: novaRole, aprovado: true });
        mostrarMensagem(`✅ Role alterada para ${ROLE_LABELS[novaRole]}`, "sucesso");
        carregarUsuarios(filtroRole);
      });
    });

    // Salvar vínculo serviceiro_nome
    container.querySelectorAll("[data-salvar-vinculo]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id  = btn.dataset.salvarVinculo;
        const sel = container.querySelector(`select.vinculo-serv-select[data-usr-id="${id}"]`);
        const nome = sel?.value || null;
        await adminAction("update", "perfis", id, { serviceiro_nome: nome });
        mostrarMensagem(nome ? `🔗 Conta vinculada a "${nome}".` : "🔗 Vínculo removido.", "sucesso");
        carregarUsuarios(filtroRole);
      });
    });

    // Mudar role
    container.querySelectorAll("[data-mudar-role]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const novaRole = btn.dataset.role;
        await adminAction("update", "perfis", btn.dataset.mudarRole, { role: novaRole, aprovado: true });
        mostrarMensagem(`✅ Role alterada para ${ROLE_LABELS[novaRole]}`, "sucesso");
        carregarUsuarios(filtroRole);
      });
    });

    // Remover usuário
    container.querySelectorAll("[data-remover-usr]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (confirm("Excluir este usuário por completo?\n\nIsto remove o perfil E o login (libera o e-mail para novo cadastro). Esta ação não pode ser desfeita.")) {
          await adminAction("delete_user", "perfis", btn.dataset.removerUsr);
          mostrarMensagem("🗑️ Usuário excluído por completo — e-mail liberado.", "sucesso");
          carregarUsuarios(filtroRole);
        }
      });
    });

  } catch(e) { console.error("Erro ao carregar usuários:", e); }
}

// ── Geração de códigos de convite ──
async function gerarCodigoConvite(role = "cliente") {
  const prefixo = role === "serviceiro" ? "SRV" : "CLI";
  const codigo  = prefixo + "-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  await adminAction("insert", "convites", null, { codigo, usado: false, role });
  const label = role === "serviceiro" ? "🗡️ Serviceiro" : "👤 Cliente";
  mostrarMensagem(`🎟️ Código gerado para ${label}: <strong>${codigo}</strong> — copie e envie!`, "sucesso");
  return codigo;
}

// ── Botões gerar convite ──
document.getElementById("btnGerarConviteCliente")?.addEventListener("click", () => gerarCodigoConvite("cliente"));
document.getElementById("btnGerarConviteServiceiro")?.addEventListener("click", () => gerarCodigoConvite("serviceiro"));

// ── Painel do Serviceiro (serviceiro puro ou admin-serviceiro) ──
async function carregarPainelServiceiro() {
  if (!perfilAtual) return;
  const fazServicos = tipoUsuario === "serviceiro" || (tipoUsuario === "admin" && perfilAtual.serviceiro_nome);
  if (!fazServicos) return;

  // O botão "⚔️ Meus Serviços" (btnNavServicos) já é controlado em atualizarUI.

  // Inicializa abas do painel serviceiro
  document.querySelectorAll(".srv-ag-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".srv-ag-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      carregarMeusAgendamentos(tab.dataset.srvTab);
    });
  });

  carregarMeusAgendamentos("pendente");
  carregarMinhaProducao();

  // Filtros do painel do serviceiro
  const fCli = document.getElementById("srvFiltroCliente");
  const fDat = document.getElementById("srvFiltroData");
  const fOrd = document.getElementById("srvFiltroOrdem");
  if (fCli) fCli.addEventListener("input", renderMeusAgendamentos);
  if (fDat) fDat.addEventListener("change", renderMeusAgendamentos);
  if (fOrd) fOrd.addEventListener("change", renderMeusAgendamentos);
  document.getElementById("srvLimparFiltros")?.addEventListener("click", () => {
    if (fCli) fCli.value = "";
    if (fDat) fDat.value = "";
    if (fOrd) fOrd.value = "chamado_desc";
    renderMeusAgendamentos();
  });

  carregarMeusHorarios();
  document.getElementById("btnSrvAddHorario")?.addEventListener("click", adicionarMeuHorario);
}

// ── Meus Horários (serviceiro gerencia a própria disponibilidade) ──
async function carregarMeusHorarios() {
  if (!perfilAtual) return;
  const nomeServ = perfilAtual.serviceiro_nome || perfilAtual.nick;
  const lista = document.getElementById("srvListaHorarios");
  if (!lista) return;
  try {
    const horarios = await supaGet("horarios_serviceiros",
      `serviceiro=eq.${encodeURIComponent(nomeServ)}&ativo=eq.true&order=dia_semana.asc`);
    if (!horarios.length) {
      lista.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Nenhum horário cadastrado. Adicione sua disponibilidade acima.</p>';
      return;
    }
    lista.innerHTML = horarios.map(h => `
      <div class="srv-horario-item">
        <span>📅 <b>${h.dia_semana}</b> · ${h.hora_inicio.slice(0,5)} às ${h.hora_fim.slice(0,5)}</span>
        <button class="btn-recusar" style="width:auto;padding:4px 10px;font-size:11px" data-del-horario="${h.id}">🗑️</button>
      </div>`).join("");
    lista.querySelectorAll("[data-del-horario]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Remover este horário?")) return;
        try {
          await supaAction("serviceiro_horario", "horarios_serviceiros", null, { sub: "delete", id: btn.dataset.delHorario });
          mostrarMensagem("🗑️ Horário removido.", "sucesso");
          carregarMeusHorarios();
        } catch (e) { mostrarMensagem(`❌ Erro: ${e.message}`, "erro"); }
      });
    });
  } catch (e) {
    console.error("Erro ao carregar horários:", e);
  }
}

async function adicionarMeuHorario() {
  const dia    = document.getElementById("srvHorarioDia").value;
  const inicio = document.getElementById("srvHorarioInicio").value;
  const fim    = document.getElementById("srvHorarioFim").value;

  if (!dia || !inicio || !fim) { mostrarMensagem("⚠️ Preencha dia e horários.", "erro"); return; }
  if (fim <= inicio) { mostrarMensagem("⚠️ Hora fim deve ser após a hora início.", "erro"); return; }

  try {
    await supaAction("serviceiro_horario", "horarios_serviceiros", null, {
      sub: "insert", dia_semana: dia, hora_inicio: inicio, hora_fim: fim
    });
    mostrarMensagem("✅ Horário adicionado!", "sucesso");
    document.getElementById("srvHorarioInicio").value = "";
    document.getElementById("srvHorarioFim").value = "";
    carregarMeusHorarios();
  } catch (e) {
    mostrarMensagem(`❌ Erro: ${e.message}`, "erro");
  }
}

// ── Minha Produção: horas trabalhadas (reais) por cliente ──
async function carregarMinhaProducao() {
  if (!perfilAtual) return;
  const nomeServ = perfilAtual.serviceiro_nome || perfilAtual.nick;
  const resumoEl = document.getElementById("srvResumoHoras");
  const listaEl  = document.getElementById("srvProducaoClientes");
  if (!resumoEl || !listaEl) return;

  try {
    // Só conta serviços que de fato aconteceram: concluídos e encerrados
    const ags = await supaGet("agendamentos",
      `serviceiro=eq.${encodeURIComponent(nomeServ)}&status=in.(concluido,encerrado)&order=finalizado_em.desc`
    );

    // Duração real: de iniciado_em até finalizado_em. Se faltar timestamp
    // (chamados antigos), cai para o previsto (inicio→fim) como aproximação.
    const durMs = (a) => {
      const ini = a.iniciado_em ? new Date(a.iniciado_em) : new Date(a.inicio);
      const fim = a.finalizado_em ? new Date(a.finalizado_em) : new Date(a.fim);
      const d = fim - ini;
      return d > 0 ? d : 0;
    };
    const fmtH = (ms) => {
      const totalMin = Math.round(ms / 60000);
      const h = Math.floor(totalMin / 60), m = totalMin % 60;
      return h > 0 ? `${h}h${m > 0 ? " " + m + "min" : ""}` : `${m}min`;
    };

    const totalMs = ags.reduce((s, a) => s + durMs(a), 0);

    resumoEl.innerHTML = `
      <div class="dash-metrica">
        <div class="dm-label">⏱️ Horas trabalhadas</div>
        <div class="dm-valor" style="color:#378add">${fmtH(totalMs)}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">🏆 Serviços realizados</div>
        <div class="dm-valor" style="color:#4caf6e">${ags.length}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">👥 Clientes atendidos</div>
        <div class="dm-valor">${new Set(ags.map(a => (a.nome_cliente || "").toLowerCase())).size}</div>
      </div>`;

    // Agrupa por cliente
    const porCliente = {};
    ags.forEach(a => {
      const nome = a.nome_cliente || "—";
      if (!porCliente[nome]) porCliente[nome] = { ms: 0, n: 0 };
      porCliente[nome].ms += durMs(a);
      porCliente[nome].n  += 1;
    });
    const linhas = Object.entries(porCliente).sort((a, b) => b[1].ms - a[1].ms);

    listaEl.innerHTML = linhas.length === 0
      ? '<p style="color:rgba(232,223,192,0.4);font-size:13px">Nenhum serviço concluído ou encerrado ainda.</p>'
      : `<div style="font-size:12px;color:rgba(232,223,192,0.5);font-family:Cinzel,serif;margin-bottom:6px">Detalhe por cliente</div>` +
        linhas.map(([nome, v]) => `
          <div class="dash-rank-row">
            <span class="dash-rank-nome" style="min-width:160px">${nome}</span>
            <span class="dash-rank-qtd" style="min-width:60px">${v.n} serv.</span>
            <span style="color:#378add;font-weight:600;min-width:90px;text-align:right">${fmtH(v.ms)}</span>
          </div>`).join("");

  } catch (e) {
    console.error("Erro ao carregar produção:", e);
    listaEl.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Não foi possível carregar a produção.</p>';
  }
}

async function carregarMeusAgendamentos(status = "pendente") {
  if (!perfilAtual) return;
  // Usa o nome vinculado pelo admin (serviceiro_nome). Fallback no nick para
  // contas antigas ainda não vinculadas.
  const nomeServ = perfilAtual.serviceiro_nome || perfilAtual.nick;
  const container = document.getElementById("listaMeusAgendamentos");
  if (!container) return;

  // Aviso quando a conta ainda não foi vinculada a um serviceiro da lista
  const aviso = document.getElementById("avisoVinculoServ");
  if (aviso) {
    aviso.style.display = perfilAtual.serviceiro_nome ? "none" : "block";
  }

  container.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Carregando...</p>';

  try {
    const ags = await supaGet("agendamentos",
      `serviceiro=eq.${encodeURIComponent(nomeServ)}&status=eq.${status}&arquivado=not.is.true&order=inicio.asc`
    );
    // Guarda para os filtros e renderiza aplicando-os
    _meusAgsCache = ags;
    _meusStatusAtual = status;
    renderMeusAgendamentos();
  } catch (e) {
    console.warn("Erro ao carregar meus agendamentos:", e);
    container.innerHTML = '<p style="color:rgba(224,90,58,0.7);font-size:13px">Erro ao carregar. Tente recarregar a página.</p>';
  }
}

// Cache da aba atual + estado dos filtros
var _meusAgsCache = [];
var _meusStatusAtual = "pendente";

function renderMeusAgendamentos() {
  const container = document.getElementById("listaMeusAgendamentos");
  if (!container) return;
  const status = _meusStatusAtual;

  // Lê os filtros
  const fCliente = (document.getElementById("srvFiltroCliente")?.value || "").toLowerCase().trim();
  const fData    = document.getElementById("srvFiltroData")?.value || "";
  const fOrdem   = document.getElementById("srvFiltroOrdem")?.value || "chamado_desc";

  let ags = [..._meusAgsCache];

  // Filtro por nome do cliente
  if (fCliente) ags = ags.filter(a => (a.nome_cliente || "").toLowerCase().includes(fCliente));

  // Filtro por dia (compara a data de início, no fuso local)
  if (fData) {
    ags = ags.filter(a => {
      const d = new Date(a.inicio);
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      return iso === fData;
    });
  }

  // Ordenação
  ags.sort((a, b) => {
    switch (fOrdem) {
      case "chamado_asc":  return (a.numero_chamado||0) - (b.numero_chamado||0);
      case "chamado_desc": return (b.numero_chamado||0) - (a.numero_chamado||0);
      case "data_asc":     return new Date(a.inicio) - new Date(b.inicio);
      case "data_desc":    return new Date(b.inicio) - new Date(a.inicio);
      case "cliente":      return (a.nome_cliente||"").localeCompare(b.nome_cliente||"", "pt-BR");
      default:             return 0;
    }
  });

  if (ags.length === 0) {
    const temFiltro = fCliente || fData;
    container.innerHTML = `<p style="color:rgba(232,223,192,0.4);font-size:13px;padding:8px 0">${
      temFiltro ? "Nenhum chamado encontrado com esses filtros." : `Nenhum agendamento ${STATUS_LABELS[status]?.toLowerCase() || status}.`
    }</p>`;
    return;
  }

  container.innerHTML = agruparPorMesHTML(ags, "inicio", ag => {
    const agora  = new Date();
    const inicio = new Date(ag.inicio);
    const fim    = new Date(ag.fim);
    let acoes = "";

    if (ag.status === "pendente") {
      acoes = `<div class="pg-acoes">
        <button class="btn-aprovar" data-ag-id="${ag.id}" data-ag-list='${JSON.stringify(ags)}'>✅ Aceitar</button>
        <button class="btn-recusar" data-ag-recusar="${ag.id}" data-ag-status="pendente">❌ Recusar</button>
      </div>`;
    } else if (ag.status === "aprovado") {
      const podeInic = agora >= inicio;
      acoes = `<div class="pg-acoes">
        <button class="btn-andamento${podeInic ? "" : " btn-concluir-bloqueado"}" data-ag-andamento="${ag.id}"
          ${podeInic ? "" : `title="Disponível a partir de ${inicio.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}"`}>
          ⚔️ ${podeInic ? "Iniciar" : "Aguardando horário"}
        </button>
        <button class="btn-encerrar" data-ag-encerrar="${ag.id}">🛑 Encerrar</button>
      </div>`;
    } else if (ag.status === "em_andamento") {
      const podeConc = agora >= fim;
      acoes = `<div class="pg-acoes">
        <button class="btn-concluir${podeConc ? "" : " btn-concluir-bloqueado"}" data-ag-concluir="${ag.id}"
          ${podeConc ? "" : `title="Disponível após ${fim.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}"`}>
          🏆 ${podeConc ? "Concluir" : "Aguardando fim"}
        </button>
        <button class="btn-encerrar" data-ag-encerrar="${ag.id}">🛑 Encerrar</button>
      </div>`;
    }

    return `
      <div class="agendamento-card ${ag.status}" style="${new Date(ag.fim) < new Date() && (ag.status==='pendente'||ag.status==='aprovado') ? 'border-left:3px solid #e05a3a;opacity:0.85' : ''}">
        <div class="ag-header">
          <span class="ag-nome">${ag.numero_chamado ? `<span class="ag-chamado">#${ag.numero_chamado}</span>` : ""} ${ag.nome_cliente}</span>
          <span class="ag-status-badge">${STATUS_ICONS[ag.status]} ${STATUS_LABELS[ag.status]}</span>
        </div>
        <div class="ag-info">
          <span>⚔️ ${ag.serviceiro} (${ag.vocacao})</span>
          <span>🗺️ ${ag.hunt} · ${ag.tipo}</span>
          <span>📅 ${new Date(ag.inicio).toLocaleString("pt-BR")} → ${new Date(ag.fim).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>
          ${ag.obs_conclusao ? `<span style="font-style:italic;color:rgba(232,223,192,0.6)">📝 ${ag.obs_conclusao}</span>` : ""}
        </div>
        ${acoes}
      </div>`;
  });

  // Listeners — reutiliza as funções do admin
  container.querySelectorAll(".btn-aprovar[data-ag-id]").forEach(btn => {
    btn.addEventListener("click", () => aprovarAgendamento(btn.dataset.agId, ags));
  });
  container.querySelectorAll("[data-ag-recusar]").forEach(btn => {
    btn.addEventListener("click", () => recusarAgendamento(btn.dataset.agRecusar, btn.dataset.agStatus));
  });
  container.querySelectorAll("[data-ag-andamento]").forEach(btn => {
    const ag = ags.find(a => a.id === btn.dataset.agAndamento);
    btn.addEventListener("click", () => {
      const agora = new Date(), inicio = new Date(ag.inicio);
      if (agora < inicio) {
        const diff = Math.ceil((inicio-agora)/60000);
        mostrarMensagem(`⚠️ Serviço começa em ${diff}min.`, "erro"); return;
      }
      atualizarStatusAg(btn.dataset.agAndamento, "em_andamento", "⚔️ Serviço iniciado!");
    });
  });
  container.querySelectorAll("[data-ag-concluir]").forEach(btn => {
    const ag = ags.find(a => a.id === btn.dataset.agConcluir);
    btn.addEventListener("click", () => {
      const agora = new Date(), fim = new Date(ag.fim);
      if (agora < fim) {
        const diff = Math.ceil((fim-agora)/60000);
        mostrarMensagem(`⚠️ O serviço só pode ser concluído após o horário de término (faltam ${diff}min). Se precisar encerrar antes, use "Encerrar".`, "erro");
        return;
      }
      concluirAgendamento(ag);
    });
  });
  container.querySelectorAll("[data-ag-encerrar]").forEach(btn => {
    const ag = ags.find(a => a.id === btn.dataset.agEncerrar);
    btn.addEventListener("click", () => encerrarAgendamento(ag));
  });
}

