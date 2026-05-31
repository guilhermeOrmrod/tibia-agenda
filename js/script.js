// =========================================
// script.js — Fatal Services · Rubinot
// Integrado com Supabase
// =========================================

// ── Configuração Supabase ──────────────────
const SUPA_URL = "https://lkhnklrjaalxutbnlxsy.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxraG5rbHJqYWFseHV0Ym5seHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjE3NjUsImV4cCI6MjA5NTY5Nzc2NX0.BCifSPGyoI5pN1OTRgpWQQW4rRMnvTO-WOSi1xuIcPk";

const HEADERS = {
  "apikey":        SUPA_KEY,
  "Authorization": "Bearer " + SUPA_KEY,
  "Content-Type":  "application/json",
  "Prefer":        "return=representation"
};

async function supaGet(tabela, query = "") {
  const res = await fetch(`${SUPA_URL}/rest/v1/${tabela}?${query}`, { headers: HEADERS });
  return res.json();
}

async function supaPost(tabela, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${tabela}`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body)
  });
  return res.json();
}

async function supaPatch(tabela, id, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${tabela}?id=eq.${id}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify(body)
  });
  return res.json();
}

async function supaDelete(tabela, id) {
  await fetch(`${SUPA_URL}/rest/v1/${tabela}?id=eq.${id}`, {
    method: "DELETE", headers: HEADERS
  });
}

async function supaUpload(bucket, path, file) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY },
    body: file
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error("Upload falhou: " + (err.message || res.status));
  }
  return `${SUPA_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ── Dados dos serviceiros por vocação ──────
const SERVICEIROS = {
  "Master Sorcerer": ["Fear", "Panic", "Cassinho", "Murilo", "Jambi"],
  "Elder Druid":     ["Murilo", "Cassinho", "Panic", "Jaapacrazy", "Jambi"],
  "Elite Knight":    ["Paradox", "Raikess", "Cassinho", "Murilo"],
  "Royal Paladin":   ["Accid", "Cassinho", "Raikess", "Jaapacrazy"],
  "Exalted Monk":    ["Murilo"]
};

// ── Mensagens de feedback ──────────────────
const mensagemEl = document.getElementById("mensagem");

function mostrarMensagem(texto, tipo) {
  mensagemEl.innerHTML = texto + ' <button id="fecharMsg">X</button>';
  mensagemEl.className = tipo;
  mensagemEl.style.display = "block";
  document.getElementById("fecharMsg").addEventListener("click", () => {
    mensagemEl.style.display = "none";
  });
}

// ── Navegação entre abas ───────────────────
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    const aba = btn.dataset.tab;
    document.getElementById("tab-" + aba).classList.add("active");
    if (aba === "agenda")     setTimeout(() => calendar.updateSize(), 50);
    if (aba === "contatos")   renderizarContatos();
    if (aba === "pagamentos") {
      renderizarPagamentos();
      popularSelectServiceiroPagamento();
    }
    if (aba === "admin") {
      atualizarSelectHorariosAdmin();
      carregarSugestoes();
      carregarAgendamentosPendentes("pendente");
    }
    if (aba === "historico") carregarHistorico();
  });
});

// ── Disponibilidade ────────────────────────
const dataFiltroEl = document.getElementById("dataFiltro");
dataFiltroEl.value = new Date().toISOString().split("T")[0];

function formatarHora(isoString) {
  return new Date(isoString).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

let agendamentosCache = [];

async function verificarDisponibilidade(dataSelecionada) {
  try {
    agendamentosCache = await supaGet("agendamentos", `inicio=gte.${dataSelecionada}T00:00:00-03:00&inicio=lte.${dataSelecionada}T23:59:59-03:00`);
  } catch(e) {
    agendamentosCache = [];
  }

  document.querySelectorAll(".serviceiros-list li").forEach(li => {
    const nome  = li.dataset.nome;
    const badge = li.querySelector(".badge");

    const agendamentosDia = agendamentosCache
      .filter(ev => ev.serviceiro === nome)
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

    // Remove spans antigos
    const spanExistente = li.querySelector(".horarios-ocupados");
    if (spanExistente) spanExistente.remove();

    // Garante que o nome tem wrapper com ícone
    let nomeWrap = li.querySelector(".nome-wrap");
    if (!nomeWrap) {
      const nomeEl = li.querySelector(".nome");
      nomeWrap = document.createElement("div");
      nomeWrap.className = "nome-wrap";
      const icon = document.createElement("span");
      icon.className = "status-icon";
      nomeWrap.appendChild(icon);
      if (nomeEl) {
        li.insertBefore(nomeWrap, nomeEl);
        nomeWrap.appendChild(nomeEl);
      }
    }

    const icon = nomeWrap.querySelector(".status-icon");

    if (agendamentosDia.length === 0) {
      badge.textContent = "Disponível";
      badge.className   = "badge disponivel";
      li.classList.remove("status-ocupado");
      li.classList.add("status-disponivel");
      if (icon) icon.textContent = "🟢";
    } else {
      const horarios = agendamentosDia
        .map(ev => formatarHora(ev.inicio) + "–" + formatarHora(ev.fim))
        .join(", ");
      badge.textContent = "Ocupado";
      badge.className   = "badge ocupado";
      li.classList.remove("status-disponivel");
      li.classList.add("status-ocupado");
      if (icon) icon.textContent = "🔴";
      const span = document.createElement("span");
      span.className   = "horarios-ocupados";
      span.textContent = horarios;
      li.appendChild(span);
    }
  });
}

verificarDisponibilidade(dataFiltroEl.value);
dataFiltroEl.addEventListener("change", () => verificarDisponibilidade(dataFiltroEl.value));

// ── Select dinâmico serviceiro ─────────────
const vocacaoEl    = document.getElementById("vocacao");
const servicEireEl = document.getElementById("serviceiro");

vocacaoEl.addEventListener("change", () => {
  const vocacao = vocacaoEl.value;
  servicEireEl.innerHTML = '<option value="">Serviceiro</option>';
  if (vocacao && SERVICEIROS[vocacao]) {
    SERVICEIROS[vocacao].forEach(nome => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = nome;
      servicEireEl.appendChild(opt);
    });
  }
  // Garante que campo de hunt customizado se mantém visível
  atualizarHuntCustom();
});

// ── Hunt customizado ──────────────────────────
document.getElementById("hunt").addEventListener("change", () => {
  const huntCustom = document.getElementById("huntCustom");
  if (document.getElementById("hunt").value === "custom") {
    huntCustom.style.display = "block";
    huntCustom.required = true;
    huntCustom.focus();
    // Nunca limpa o valor ao mostrar — preserva o que foi digitado
  } else {
    huntCustom.style.display = "none";
    huntCustom.required = false;
    // Preserva o valor mesmo escondido — só limpa ao agendar com sucesso
  }
});

// ── Popula select de serviceiro na aba pagamentos ──
function popularSelectServiceiroPagamento() {
  const sel = document.getElementById("pgServiceiro");
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione o serviceiro</option>';
  const fonte = Object.keys(cfgAtual.serviceiros || {}).length > 0
    ? cfgAtual.serviceiros : SERVICEIROS;
  const todos = [...new Set(Object.values(fonte).flat())].sort();
  todos.forEach(nome => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = nome;
    sel.appendChild(opt);
  });
  sel.value = atual;
}

// ── Limpa highlight de erro ────────────────
["nome","data","horaInicio","horaFim","tipo","hunt","huntCustom","vocacao","serviceiro"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", () => el.classList.remove("campo-invalido"));
  if (el) el.addEventListener("input",  () => el.classList.remove("campo-invalido"));
});

// ── Calendário ────────────────────────────
const calendarEl = document.getElementById("calendar");
const calendar   = new FullCalendar.Calendar(calendarEl, {
  initialView:   "dayGridMonth",
  initialDate:   new Date(),
  eventDisplay:  "block",
  locale:        "pt-br",

  eventClick: async function (info) {
    const ep = info.event.extendedProps;
    const detalhes =
      "📌 " + ep.nome_cliente +
      " | Serviceiro: " + ep.serviceiro +
      " | " + ep.vocacao +
      " | Tipo: " + ep.tipo +
      " | Hunt: " + ep.hunt +
      "\nInício: " + info.event.start.toLocaleString("pt-BR") +
      " | Fim: "   + info.event.end.toLocaleString("pt-BR");

    if (tipoUsuario === "admin") {
      if (confirm(detalhes + "\n\nDeseja excluir este agendamento?")) {
        await supaDelete("agendamentos", ep.id);
        info.event.remove();
        verificarDisponibilidade(dataFiltroEl.value);
        mostrarMensagem("🗑️ Agendamento excluído!", "sucesso");
      } else {
        mostrarMensagem(detalhes.replace(/\n/g, " "), "sucesso");
      }
    } else {
      mostrarMensagem(detalhes.replace(/\n/g, " "), "sucesso");
    }
  },
  events: []
});

calendar.render();
window.addEventListener("resize", () => calendar.updateSize());

// Carrega agendamentos do Supabase no calendário
async function carregarCalendario() {
  try {
    // Carrega agendamentos aprovados e em andamento no calendário
    const STATUS_CORES = { aprovado: "#9333ea", em_andamento: "#378add", concluido: "#4caf6e", encerrado: "#e05a3a" };
    const eventos = await supaGet("agendamentos", "status=in.(aprovado,em_andamento,concluido,encerrado)&order=inicio.asc");
    eventos.forEach(ev => {
      calendar.addEvent({
        id:         ev.id,
        title:      ev.serviceiro + " → " + ev.nome_cliente + " (" + ev.hunt + ")",
        start:      ev.inicio,
        end:        ev.fim,
        color:      STATUS_CORES[ev.status] || "#9333ea",
        extendedProps: { id: ev.id, nome_cliente: ev.nome_cliente, serviceiro: ev.serviceiro, vocacao: ev.vocacao, tipo: ev.tipo, hunt: ev.hunt, status: ev.status }
      });
    });
  } catch(e) {
    console.error("Erro ao carregar calendário:", e);
  }
}

carregarCalendario();

// ── Autenticação ──────────────────────────
// Senhas carregadas do Supabase — não ficam hardcoded
let SENHA_ADMIN_DIN   = null;
let SENHA_CLIENTE_DIN = null;
let senhasCarregadas  = false;
let tipoUsuario = null;

// Aplica o estado visual de login na tela
function aplicarSessao(tipo) {
  tipoUsuario = tipo;
  const isAdmin = tipo === "admin";
  document.getElementById("formAgendamento").style.display    = "block";
  document.getElementById("loginArea").style.display          = "none";
  document.getElementById("userArea").style.display           = "flex";
  document.getElementById("usuarioLogado").textContent        = isAdmin ? "⚔️ ADMIN" : "🗡️ CLIENTE";
  document.getElementById("btnEditarContatos").style.display  = isAdmin ? "inline-block" : "none";
  document.getElementById("btnNavAdmin").style.display        = isAdmin ? "inline-block" : "none";
  renderizarContatos();
  renderizarPagamentos();
  popularSelectServiceiroPagamento();
  if (isAdmin) carregarPainelAdmin();
}

// Restaura sessão — guardada para depois do Supabase carregar
const sessaoSalva = sessionStorage.getItem("fatal_session");

document.getElementById("loginBtn").addEventListener("click", () => {
  const senha = document.getElementById("senha").value;

  // Bloqueia login até as senhas carregarem do Supabase
  if (!senhasCarregadas) {
    mostrarMensagem("⏳ Aguarde, carregando configurações...", "sucesso");
    return;
  }

  if (senha === SENHA_ADMIN_DIN) {
    sessionStorage.setItem("fatal_session", "admin");
    mostrarMensagem("✅ Logado como ADMIN", "sucesso");
    setTimeout(() => location.reload(), 800);

  } else if (senha === SENHA_CLIENTE_DIN) {
    sessionStorage.setItem("fatal_session", "cliente");
    aplicarSessao("cliente");
    mostrarMensagem("✅ Logado como CLIENTE", "sucesso");

  } else {
    mostrarMensagem("⚠️ Senha incorreta!", "erro");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  tipoUsuario = null;
  sessionStorage.removeItem("fatal_session");
  document.getElementById("formAgendamento").style.display   = "none";
  document.getElementById("loginArea").style.display         = "flex";
  document.getElementById("userArea").style.display          = "none";
  document.getElementById("senha").value                     = "";
  document.getElementById("btnEditarContatos").style.display = "none";
  document.getElementById("btnNavAdmin").style.display = "none";
  renderizarContatos();
  renderizarPagamentos();
  mostrarMensagem("Saiu da conta.", "sucesso");
});

// ── Formulário de agendamento ─────────────
document.getElementById("formAgendamento").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!tipoUsuario) { mostrarMensagem("⚠️ Faça login primeiro.", "erro"); return; }

  const nome_cliente = document.getElementById("nome").value.trim();
  const data         = document.getElementById("data").value;
  const horaInicio   = document.getElementById("horaInicio").value;
  const horaFim      = document.getElementById("horaFim").value;
  const tipo         = document.getElementById("tipo").value;
  const huntSelect    = document.getElementById("hunt").value;
  const huntCustomVal = document.getElementById("huntCustom").value.trim();
  const hunt          = huntSelect === "custom" ? huntCustomVal : huntSelect;
  const vocacao      = document.getElementById("vocacao").value;
  const serviceiro   = document.getElementById("serviceiro").value;

  // Validação visual
  const campos = [
    {id:"nome",val:nome_cliente},{id:"data",val:data},
    {id:"horaInicio",val:horaInicio},{id:"horaFim",val:horaFim},
    {id:"tipo",val:tipo},
    {id:"hunt",val:huntSelect},
    ...(huntSelect === "custom" ? [{id:"huntCustom", val:huntCustomVal}] : []),
    {id:"vocacao",val:vocacao},{id:"serviceiro",val:serviceiro}
  ];
  let temVazio = false;
  campos.forEach(c => {
    const el = document.getElementById(c.id);
    if (!c.val) { el.classList.add("campo-invalido"); temVazio = true; }
    else el.classList.remove("campo-invalido");
  });
  if (temVazio) { mostrarMensagem("⚠️ Preencha todos os campos obrigatórios.", "erro"); return; }

  // Valida nome: só letras (incluindo acentos) e espaços
  const nomeRegex = /^[a-zA-ZÀ-ÿ ]+$/;
  if (!nomeRegex.test(nome_cliente)) {
    document.getElementById("nome").classList.add("campo-invalido");
    mostrarMensagem("⚠️ Nome inválido! Use apenas seu nick real (ex: Fear Popstar). Sem números ou símbolos.", "erro");
    return;
  }

  // Valida hunt customizado
  if (huntSelect === "custom" && !huntCustomVal) {
    document.getElementById("huntCustom").classList.add("campo-invalido");
    mostrarMensagem("⚠️ Descreva o hunt desejado.", "erro");
    return;
  }

  const inicio = new Date(data + "T" + horaInicio);
  const fim    = new Date(data + "T" + horaFim);
  if (fim <= inicio) { mostrarMensagem("⚠️ Horário de fim deve ser após o início.", "erro"); return; }
  if (inicio < new Date()) { mostrarMensagem("⚠️ Não é possível agendar no passado.", "erro"); return; }

  // Verifica se o serviceiro tem horários cadastrados
  const horariosServiceiro = horariosCache.filter(h => h.serviceiro === serviceiro && h.ativo);

  if (horariosServiceiro.length > 0) {
    // Descobre o dia da semana da data escolhida em português
    const diasPT = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
    const diaSemana = diasPT[inicio.getDay()];

    // Filtra horários válidos para esse dia (inclui "Todos os dias")
    const horariosNoDia = horariosServiceiro.filter(h =>
      h.dia_semana === diaSemana || h.dia_semana === "Todos os dias"
    );

    if (horariosNoDia.length === 0) {
      mostrarMensagem(
        `⚠️ ${serviceiro} não está disponível na ${diaSemana}. Veja os horários disponíveis na aba Serviceiros.`,
        "erro"
      );
      return;
    }

    // Verifica se o horário solicitado está dentro de algum horário disponível
    const horaInicioMin = inicio.getHours() * 60 + inicio.getMinutes();
    const horaFimMin    = fim.getHours() * 60 + fim.getMinutes();

    const dentroDoHorario = horariosNoDia.some(h => {
      const [hIni, mIni] = h.hora_inicio.split(":").map(Number);
      const [hFim, mFim] = h.hora_fim.split(":").map(Number);
      const dispIni = hIni * 60 + mIni;
      const dispFim = hFim * 60 + mFim;
      return horaInicioMin >= dispIni && horaFimMin <= dispFim;
    });

    if (!dentroDoHorario) {
      const horariosTexto = horariosNoDia
        .map(h => `${h.hora_inicio.slice(0,5)}–${h.hora_fim.slice(0,5)}`)
        .join(", ");
      mostrarMensagem(
        `⚠️ Horário fora do disponível para ${serviceiro} na ${diaSemana}. Disponível: ${horariosTexto}`,
        "erro"
      );
      return;
    }
  }

  // Verifica conflito — bloqueia se já tem pendente ou aprovado no horário
  const existentes = await supaGet("agendamentos",
    `serviceiro=eq.${encodeURIComponent(serviceiro)}&inicio=lte.${fim.toISOString()}&fim=gte.${inicio.toISOString()}&status=in.(pendente,aprovado)`
  );
  if (existentes.length > 0) {
    const status = existentes[0].status === "pendente" ? "aguardando aprovação" : "já agendado";
    mostrarMensagem(`⚠️ ${serviceiro} já tem um serviço ${status} neste horário.`, "erro"); return;
  }

  // Salva no Supabase com status pendente
  await supaPost("agendamentos", {
    nome_cliente, serviceiro, vocacao, tipo, hunt,
    inicio: inicio.toISOString(), fim: fim.toISOString(),
    status: "pendente"
  });

  // Não adiciona ao calendário — só aparece após aprovação
  verificarDisponibilidade(dataFiltroEl.value);
  mostrarMensagem("📋 Agendamento enviado! Aguarde a aprovação do admin.", "sucesso");
  e.target.reset();
  servicEireEl.innerHTML = '<option value="">Serviceiro</option>';
  document.getElementById("huntCustom").style.display = "none";
  document.getElementById("huntCustom").value = "";
});

// =========================================
// CONTATOS (Supabase)
// =========================================
async function renderizarContatos() {
  const container  = document.getElementById("tabelaContatos");
  const logado     = tipoUsuario !== null;
  const isAdmin    = tipoUsuario === "admin";

  // Usuário não logado vê aviso de acesso restrito
  if (!logado) {
    container.innerHTML = `
      <div class="contatos-bloqueado">
        <span class="bloqueado-icon">🔒</span>
        <p>Faça login para ver os contatos dos serviceiros.</p>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="contato-row header">
    <span>Nome</span><span>WhatsApp</span><span>Pix</span><span>Discord</span><span></span>
  </div>`;

  try {
    const contatos = await supaGet("contatos", "order=nome.asc");
    contatos.forEach(c => {
      const row = document.createElement("div");
      row.className = "contato-row";
      row.innerHTML = `
        <span class="contato-nome">${c.nome}</span>
        <span class="contato-info">${c.whats ? `<a href="https://wa.me/55${c.whats.replace(/[^0-9]/g,'')}" target="_blank">📱 ${c.whats}</a>` : "<em>—</em>"}</span>
        <span class="contato-info">${c.pix || "<em>—</em>"}</span>
        <span class="contato-info">${c.discord || "<em>—</em>"}</span>
        <span>${isAdmin ? `<button class="btn-edit-contato" data-id="${c.id}" data-nome="${c.nome}" data-whats="${c.whats||''}" data-pix="${c.pix||''}" data-discord="${c.discord||''}">✏️</button>` : ""}</span>
      `;
      container.appendChild(row);
    });
  } catch(e) {
    container.innerHTML += '<div style="padding:16px;color:rgba(232,223,192,0.4)">Erro ao carregar contatos.</div>';
  }

  document.querySelectorAll(".btn-edit-contato").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("editNome").value    = btn.dataset.nome;
      document.getElementById("editWhats").value   = btn.dataset.whats;
      document.getElementById("editPix").value     = btn.dataset.pix;
      document.getElementById("editDiscord").value = btn.dataset.discord;
      document.getElementById("modalContato").dataset.id = btn.dataset.id;
      document.getElementById("modalContato").style.display = "flex";
    });
  });
}

document.getElementById("btnFecharModal").addEventListener("click", () => {
  document.getElementById("modalContato").style.display = "none";
});

document.getElementById("modalContato").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modalContato"))
    document.getElementById("modalContato").style.display = "none";
});

document.getElementById("btnSalvarContato").addEventListener("click", async () => {
  const id      = document.getElementById("modalContato").dataset.id;
  const whats   = document.getElementById("editWhats").value.trim();
  const pix     = document.getElementById("editPix").value.trim();
  const discord = document.getElementById("editDiscord").value.trim();
  await supaPatch("contatos", id, { whats, pix, discord });
  document.getElementById("modalContato").style.display = "none";
  renderizarContatos();
  mostrarMensagem("✅ Contato atualizado!", "sucesso");
});

document.getElementById("btnEditarContatos").addEventListener("click", renderizarContatos);

// =========================================
// PAGAMENTOS (Supabase + Upload)
// =========================================
async function renderizarPagamentos() {
  const listasEl = ["listaAnalise","listaAprovados","listaRecusados"];

  // Usuário não logado vê aviso de acesso restrito
  if (!tipoUsuario) {
    listasEl.forEach(id => {
      document.getElementById(id).innerHTML = `
        <div class="contatos-bloqueado">
          <span class="bloqueado-icon">🔒</span>
          <p>Faça login para ver os pagamentos.</p>
        </div>`;
    });
    return;
  }

  try {
    const pags      = await supaGet("pagamentos", "order=criado_em.desc");
    const analise   = pags.filter(p => p.status === "analise");
    const aprovados = pags.filter(p => p.status === "aprovado");
    const recusados = pags.filter(p => p.status === "recusado");

    function cardHTML(p) {
      const isAdmin = tipoUsuario === "admin";
      // Somente admin pode ver o comprovante
      const imgHTML = (isAdmin && p.comprovante_url)
        ? `<a href="${p.comprovante_url}" target="_blank" class="pg-comprovante">🖼️ Ver comprovante</a>`
        : "";
      const acoes = (isAdmin && p.status === "analise") ? `
        <div class="pg-acoes">
          <button class="btn-aprovar" data-id="${p.id}">✅ Aprovar</button>
          <button class="btn-recusar" data-id="${p.id}">❌ Recusar</button>
        </div>` : "";
      const btnExcluir = isAdmin
        ? `<button class="btn-recusar" style="margin-top:6px;width:100%" data-excluir="${p.id}">🗑️ Excluir</button>`
        : "";
      return `
        <div class="pagamento-card">
          <div class="pg-nome">${p.nome}</div>
          <div class="pg-detail">Serviceiro: ${p.serviceiro}</div>
          <div class="pg-detail">Data: ${p.data}</div>
          ${p.obs ? `<div class="pg-detail">Obs: ${p.obs}</div>` : ""}
          <div class="pg-valor">R$ ${parseFloat(p.valor).toFixed(2)}</div>
          ${imgHTML}
          ${acoes}
          ${btnExcluir}
        </div>`;
    }

    document.getElementById("listaAnalise").innerHTML   = analise.length   ? analise.map(cardHTML).join("")   : '<div class="vazio-msg">Nenhum pagamento</div>';
    document.getElementById("listaAprovados").innerHTML = aprovados.length ? aprovados.map(cardHTML).join("") : '<div class="vazio-msg">Nenhum aprovado</div>';
    document.getElementById("listaRecusados").innerHTML = recusados.length ? recusados.map(cardHTML).join("") : '<div class="vazio-msg">Nenhum recusado</div>';

    document.querySelectorAll(".btn-aprovar").forEach(btn =>
      btn.addEventListener("click", () => alterarStatusPagamento(btn.dataset.id, "aprovado")));
    document.querySelectorAll(".btn-recusar[data-id]").forEach(btn =>
      btn.addEventListener("click", () => alterarStatusPagamento(btn.dataset.id, "recusado")));
    document.querySelectorAll("[data-excluir]").forEach(btn =>
      btn.addEventListener("click", async () => {
        if (confirm("Excluir este pagamento?")) {
          await supaDelete("pagamentos", btn.dataset.excluir);
          renderizarPagamentos();
          mostrarMensagem("🗑️ Pagamento excluído!", "sucesso");
        }
      }));

  } catch(e) {
    console.error("Erro ao carregar pagamentos:", e);
  }
}

async function alterarStatusPagamento(id, novoStatus) {
  await supaPatch("pagamentos", id, { status: novoStatus });
  renderizarPagamentos();
  mostrarMensagem(novoStatus === "aprovado" ? "✅ Pagamento aprovado!" : "❌ Pagamento recusado!",
    novoStatus === "aprovado" ? "sucesso" : "erro");
}

document.getElementById("btnNovoPagamento").addEventListener("click", () => {
  const form = document.getElementById("formPagamento");
  form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("btnEnviarPagamento").addEventListener("click", async () => {
  const nome       = document.getElementById("pgNome").value.trim();
  const serviceiro = document.getElementById("pgServiceiro").value;
  const data       = document.getElementById("pgData").value;
  const valor      = document.getElementById("pgValor").value;
  const obs        = document.getElementById("pgObs").value.trim();
  const arquivo    = document.getElementById("pgArquivo").files[0];

  if (!nome || !serviceiro || !data || !valor || !arquivo) {
    mostrarMensagem("⚠️ Preencha todos os campos e anexe o comprovante.", "erro"); return;
  }

  // Valida nome: só letras (incluindo acentos) e espaços
  const nomeRegexPg = /^[a-zA-ZÀ-ÿ ]+$/;
  if (!nomeRegexPg.test(nome)) {
    document.getElementById("pgNome").classList.add("campo-invalido");
    mostrarMensagem("⚠️ Nome inválido! Use apenas seu nick real (ex: Fear Popstar). Sem números ou símbolos.", "erro");
    return;
  }

  mostrarMensagem("⏳ Enviando comprovante...", "sucesso");

  // Upload do arquivo
  const ext  = arquivo.name.split(".").pop();
  const path = `${Date.now()}_${nome.replace(/[^a-zA-Z0-9]/g,"_")}.${ext}`;
  let comprovante_url = "";

  try {
    comprovante_url = await supaUpload("comprovantes", path, arquivo);
  } catch(e) {
    mostrarMensagem("⚠️ Erro no upload do comprovante.", "erro"); return;
  }

  await supaPost("pagamentos", { nome, serviceiro, data, valor: parseFloat(valor), obs, comprovante_url, status: "analise" });
  renderizarPagamentos();
  mostrarMensagem("📤 Pagamento enviado para análise!", "sucesso");
  document.getElementById("formPagamento").style.display = "none";
  ["pgNome","pgServiceiro","pgData","pgValor","pgObs"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("pgArquivo").value = "";
});

// Limpa highlight de erro ao corrigir campo de pagamento
const pgNomeEl = document.getElementById("pgNome");
if (pgNomeEl) {
  pgNomeEl.addEventListener("input", () => pgNomeEl.classList.remove("campo-invalido"));
}

// =========================================
// GESTÃO DE AGENDAMENTOS (Admin)
// =========================================

const STATUS_ICONS = {
  pendente:     "⏳",
  aprovado:     "✅",
  em_andamento: "⚔️",
  concluido:    "🏆",
  recusado:     "❌",
  encerrado:    "🛑"
};

const STATUS_LABELS = {
  pendente:     "Pendente",
  aprovado:     "Aprovado",
  em_andamento: "Em andamento",
  concluido:    "Concluído",
  recusado:     "Recusado",
  encerrado:    "Encerrado"
};

let abaAgAtual = "pendente";

// Listeners das abas internas de agendamentos
document.querySelectorAll(".admin-ag-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-ag-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    abaAgAtual = tab.dataset.agTab;
    carregarAgendamentosPendentes(abaAgAtual);
  });
});

async function carregarAgendamentosPendentes(status = "pendente") {
  if (tipoUsuario !== "admin") return;
  try {
    const ags = await supaGet("agendamentos", `status=eq.${status}&order=inicio.asc`);
    const badge = document.getElementById("badgeAgendamentos");

    // Badge só para pendentes
    if (status === "pendente" && ags.length > 0) {
      badge.textContent = ags.length;
      badge.style.display = "inline";
    } else if (status === "pendente") {
      badge.style.display = "none";
    }

    const container = document.getElementById("listaAgendamentosPendentes");
    if (ags.length === 0) {
      container.innerHTML = `<p style="color:rgba(232,223,192,0.4);font-size:13px;padding:8px 0">Nenhum agendamento com status "${STATUS_LABELS[status]}".</p>`;
      return;
    }

    container.innerHTML = ags.map(ag => {
      const acoes = gerarAcoesAdmin(ag);
      return `
        <div class="agendamento-card ${status}">
          <div class="ag-header">
            <span class="ag-nome">${ag.nome_cliente}</span>
            <span class="ag-status-badge">${STATUS_ICONS[status]} ${STATUS_LABELS[status]}</span>
          </div>
          <div class="ag-info">
            <span>⚔️ ${ag.serviceiro} (${ag.vocacao})</span>
            <span>🗺️ ${ag.hunt} · ${ag.tipo}</span>
            <span>📅 ${new Date(ag.inicio).toLocaleString("pt-BR")} → ${new Date(ag.fim).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}</span>
            ${ag.obs_conclusao ? `<span style="color:rgba(76,175,110,0.8);font-style:italic">📝 ${ag.obs_conclusao}</span>` : ""}
          </div>
          ${acoes}
        </div>`;
    }).join("");

    // Botões
    container.querySelectorAll(".btn-aprovar[data-ag-id]").forEach(btn => {
      btn.addEventListener("click", () => aprovarAgendamento(btn.dataset.agId, ags));
    });
    container.querySelectorAll("[data-ag-recusar]").forEach(btn => {
      btn.addEventListener("click", () => recusarAgendamento(btn.dataset.agRecusar));
    });
    container.querySelectorAll("[data-ag-andamento]").forEach(btn => {
      const ag = ags.find(a => a.id === btn.dataset.agAndamento);
      btn.addEventListener("click", () => {
        const agora  = new Date();
        const inicio = new Date(ag.inicio);
        if (agora < inicio) {
          const diff    = Math.ceil((inicio - agora) / 60000);
          const horas   = Math.floor(diff / 60);
          const minutos = diff % 60;
          const tempo   = horas > 0 ? `${horas}h${minutos > 0 ? minutos + "min" : ""}` : `${diff}min`;
          mostrarMensagem(
            `⚠️ O serviço só pode ser iniciado a partir de ${inicio.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}. Faltam ${tempo}.`,
            "erro"
          );
          return;
        }
        atualizarStatusAg(btn.dataset.agAndamento, "em_andamento", "⚔️ Serviço iniciado!");
      });
    });
    container.querySelectorAll("[data-ag-concluir]").forEach(btn => {
      const ag = ags.find(a => a.id === btn.dataset.agConcluir);
      btn.addEventListener("click", () => concluirAgendamento(ag));
    });

    container.querySelectorAll("[data-ag-encerrar]").forEach(btn => {
      const ag = ags.find(a => a.id === btn.dataset.agEncerrar);
      btn.addEventListener("click", () => encerrarAgendamento(ag));
    });

  } catch(e) { console.error("Erro ao carregar agendamentos:", e); }
}

function gerarAcoesAdmin(ag) {
  if (ag.status === "pendente") {
    return `<div class="pg-acoes">
      <button class="btn-aprovar" data-ag-id="${ag.id}">✅ Aprovar</button>
      <button class="btn-recusar" data-ag-recusar="${ag.id}">❌ Recusar</button>
    </div>`;
  }
  if (ag.status === "aprovado") {
    const agora    = new Date();
    const inicio   = new Date(ag.inicio);
    const podeInic = agora >= inicio;
    const titleInic = podeInic ? "" : `title="Disponível a partir de ${inicio.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}"`;
    return `<div class="pg-acoes">
      <button class="btn-andamento${podeInic ? "" : " btn-concluir-bloqueado"}" data-ag-andamento="${ag.id}" ${titleInic}>
        ⚔️ ${podeInic ? "Iniciar serviço" : "Aguardando data/hora"}
      </button>
      <button class="btn-encerrar" data-ag-encerrar="${ag.id}">🛑 Encerrar</button>
      <button class="btn-recusar" data-ag-recusar="${ag.id}">❌ Cancelar</button>
    </div>`;
  }
  if (ag.status === "em_andamento") {
    const agora = new Date();
    const fim   = new Date(ag.fim);
    const podeConc = agora >= fim;
    const btnTitle = podeConc ? "" : `title="Disponível após ${fim.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}"`;
    return `<div class="pg-acoes">
      <button class="btn-concluir${podeConc ? "" : " btn-concluir-bloqueado"}" data-ag-concluir="${ag.id}" ${btnTitle}>
        🏆 ${podeConc ? "Marcar concluído" : "Aguardando horário de fim"}
      </button>
      <button class="btn-encerrar" data-ag-encerrar="${ag.id}">🛑 Encerrar antecipadamente</button>
    </div>`;
  }
  return "";
}

async function aprovarAgendamento(id, lista) {
  await supaPatch("agendamentos", id, { status: "aprovado" });
  const ag = lista.find(a => a.id === id);
  if (ag) {
    calendar.addEvent({
      id, title: ag.serviceiro + " → " + ag.nome_cliente + " (" + ag.hunt + ")",
      start: ag.inicio, end: ag.fim, color: "#9333ea",
      extendedProps: { id, nome_cliente: ag.nome_cliente, serviceiro: ag.serviceiro, vocacao: ag.vocacao, tipo: ag.tipo, hunt: ag.hunt, status: "aprovado" }
    });
  }
  mostrarMensagem("✅ Agendamento aprovado!", "sucesso");
  carregarAgendamentosPendentes(abaAgAtual);
  verificarDisponibilidade(dataFiltroEl.value);
}

async function recusarAgendamento(id) {
  if (confirm("Cancelar/recusar este agendamento?")) {
    await supaPatch("agendamentos", id, { status: "recusado" });
    // Remove do calendário se estiver lá
    const evCalendario = calendar.getEventById(id);
    if (evCalendario) evCalendario.remove();
    mostrarMensagem("❌ Agendamento recusado.", "erro");
    carregarAgendamentosPendentes(abaAgAtual);
    verificarDisponibilidade(dataFiltroEl.value);
  }
}

async function atualizarStatusAg(id, novoStatus, msg) {
  await supaPatch("agendamentos", id, { status: novoStatus });
  // Atualiza cor no calendário
  const ev = calendar.getEventById(id);
  if (ev) ev.setProp("color", novoStatus === "em_andamento" ? "#378add" : "#4caf6e");
  mostrarMensagem(msg, "sucesso");
  carregarAgendamentosPendentes(abaAgAtual);
}

async function encerrarAgendamento(ag) {
  const motivo = prompt("Motivo do encerramento antecipado (obrigatório):");
  if (!motivo || motivo.trim() === "") {
    mostrarMensagem("⚠️ Informe o motivo do encerramento.", "erro");
    return;
  }
  await supaPatch("agendamentos", ag.id, {
    status: "encerrado",
    obs_conclusao: "🛑 Encerrado: " + motivo.trim()
  });
  const ev = calendar.getEventById(ag.id);
  if (ev) ev.setProp("color", "#e05a3a");
  mostrarMensagem("🛑 Serviço encerrado antecipadamente.", "erro");
  carregarAgendamentosPendentes(abaAgAtual);
  verificarDisponibilidade(dataFiltroEl.value);
}

async function concluirAgendamento(ag) {
  const agora = new Date();
  const fim   = new Date(ag.fim);

  // Só pode concluir depois do horário de fim do agendamento
  if (agora < fim) {
    const minutosRestantes = Math.ceil((fim - agora) / 60000);
    const horasRestantes   = Math.floor(minutosRestantes / 60);
    const minRest          = minutosRestantes % 60;
    const tempoMsg = horasRestantes > 0
      ? `${horasRestantes}h${minRest > 0 ? minRest + "min" : ""}`
      : `${minutosRestantes}min`;
    mostrarMensagem(
      `⚠️ O serviço só pode ser concluído após o horário de fim. Faltam ${tempoMsg} (${fim.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}).`,
      "erro"
    );
    return;
  }

  const obs = prompt("Observação da conclusão (opcional):");
  await supaPatch("agendamentos", ag.id, {
    status: "concluido",
    obs_conclusao: obs || ""
  });
  const ev = calendar.getEventById(ag.id);
  if (ev) ev.setProp("color", "#4caf6e");
  mostrarMensagem("🏆 Serviço marcado como concluído!", "sucesso");
  carregarAgendamentosPendentes(abaAgAtual);
}

// =========================================
// HISTÓRICO DE SERVIÇOS
// =========================================
async function carregarHistorico() {
  const statusFiltro     = document.getElementById("filtroStatusHistorico").value;
  const servicFiltro     = document.getElementById("filtroServiceiroHistorico").value;
  const container        = document.getElementById("listaHistorico");
  container.innerHTML    = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Carregando...</p>';

  try {
    let query = "order=inicio.desc";
    if (statusFiltro !== "todos")    query += `&status=eq.${statusFiltro}`;
    if (servicFiltro !== "todos")    query += `&serviceiro=eq.${encodeURIComponent(servicFiltro)}`;

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

    container.innerHTML = ags.map(ag => `
      <div class="historico-card status-${ag.status}">
        <div class="hc-status-icon">${STATUS_ICONS[ag.status] || "❓"}</div>
        <div class="hc-body">
          <div class="hc-titulo">${ag.nome_cliente} → ${ag.serviceiro}</div>
          <div class="hc-detalhe">
            <span>⚔️ ${ag.vocacao}</span>
            <span>🗺️ ${ag.hunt} · ${ag.tipo}</span>
            <span>📅 ${new Date(ag.inicio).toLocaleString("pt-BR")} – ${new Date(ag.fim).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>
          </div>
          ${ag.obs_conclusao ? `<div class="hc-obs">📝 ${ag.obs_conclusao}</div>` : ""}
        </div>
        <span class="hc-badge ${ag.status}">${STATUS_LABELS[ag.status] || ag.status}</span>
      </div>
    `).join("");

  } catch(e) { container.innerHTML = '<p style="color:rgba(224,90,58,0.7);font-size:13px">Erro ao carregar histórico.</p>'; }
}

// Filtros do histórico
document.getElementById("filtroStatusHistorico")?.addEventListener("change", carregarHistorico);
document.getElementById("filtroServiceiroHistorico")?.addEventListener("change", carregarHistorico);

// =========================================
// PAINEL ADMIN
// =========================================
let cfgAtual = { hunts: [], serviceiros: {}, precos: {}, senhas: {} };

async function carregarPainelAdmin() {
  try {
    const rows = await supaGet("configuracoes", "");
    rows.forEach(r => { cfgAtual[r.chave] = r.valor; });
    renderizarPainelAdmin();
    // Popula o select de serviceiros do painel de horários
    atualizarSelectHorariosAdmin();
    // Carrega os horários já cadastrados
    await carregarHorariosCards();
    // Carrega sugestões
    carregarSugestoes();
    // Carrega agendamentos pendentes
    carregarAgendamentosPendentes('pendente');
  } catch(e) { console.error("Erro ao carregar config:", e); }
}

function renderizarPainelAdmin() {
  // Preços
  document.getElementById("cfgPrecoNormal").value = cfgAtual.precos?.normal || "";
  document.getElementById("cfgPrecoEvento").value = cfgAtual.precos?.evento || "";
  document.getElementById("cfgPrecoObs").value    = cfgAtual.precos?.obs    || "";

  // Hunts
  renderizarTagsHunts();

  // Serviceiros
  renderizarTagsServiceiros();
}

function renderizarTagsHunts() {
  const container = document.getElementById("listaHunts");
  container.innerHTML = "";
  const hunts = cfgAtual.hunts || [];
  hunts.forEach((h, i) => {
    const tag = document.createElement("span");
    tag.className = "admin-tag";
    tag.innerHTML = `${h} <button data-idx="${i}" title="Remover">×</button>`;
    tag.querySelector("button").addEventListener("click", async () => {
      cfgAtual.hunts.splice(i, 1);
      await salvarConfig("hunts", cfgAtual.hunts);
      renderizarTagsHunts();
      atualizarSelectHunts();
      mostrarMensagem("🗑️ Hunt removida!", "sucesso");
    });
    container.appendChild(tag);
  });
}

function renderizarTagsServiceiros() {
  const vocacao   = document.getElementById("cfgVocacaoSel").value;
  const container = document.getElementById("listaServiceirosAdmin");
  container.innerHTML = "";
  const lista = cfgAtual.serviceiros?.[vocacao] || [];
  lista.forEach((s, i) => {
    const tag = document.createElement("span");
    tag.className = "admin-tag";
    tag.innerHTML = `${s} <button data-idx="${i}" title="Remover">×</button>`;
    tag.querySelector("button").addEventListener("click", async () => {
      cfgAtual.serviceiros[vocacao].splice(i, 1);
      await salvarConfig("serviceiros", cfgAtual.serviceiros);
      renderizarTagsServiceiros();
      atualizarServiceiros();
      mostrarMensagem("🗑️ Serviceiro removido!", "sucesso");
    });
    container.appendChild(tag);
  });
}

async function salvarConfig(chave, valor) {
  await fetch(`${SUPA_URL}/rest/v1/configuracoes?chave=eq.${chave}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ valor, atualizado_em: new Date().toISOString() })
  });
}

function atualizarSelectHunts() {
  const huntEl = document.getElementById("hunt");
  const atual  = huntEl.value;
  huntEl.innerHTML = '<option value="">Hunt</option>';
  (cfgAtual.hunts || []).forEach(h => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = h;
    huntEl.appendChild(opt);
  });
  const optCustom = document.createElement("option");
  optCustom.value = "custom";
  optCustom.textContent = "De sua escolha...";
  huntEl.appendChild(optCustom);
  huntEl.value = atual;
}

function atualizarServiceiros() {
  Object.assign(SERVICEIROS, cfgAtual.serviceiros || {});

  // Atualiza os cards de disponibilidade
  document.querySelectorAll(".serviceiros-list").forEach(ul => {
    const vocacao = ul.dataset.vocacao;
    const lista   = SERVICEIROS[vocacao] || [];
    ul.innerHTML  = "";
    lista.forEach(nome => {
      const li = document.createElement("li");
      li.dataset.nome = nome;
      li.innerHTML = `
        <div class="nome-wrap">
          <span class="status-icon">⏳</span>
          <span class="nome">${nome}</span>
        </div>
        <span class="badge verificando">verificando...</span>
        <span class="horarios-semana" data-serviceiro="${nome}"></span>`;
      ul.appendChild(li);
    });
  });

  // Atualiza select de serviceiro na agenda
  const vocacao = document.getElementById("vocacao").value;
  if (vocacao) {
    servicEireEl.innerHTML = '<option value="">Serviceiro</option>';
    (SERVICEIROS[vocacao] || []).forEach(nome => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = nome;
      servicEireEl.appendChild(opt);
    });
  }

  // Atualiza select de serviceiro no painel admin de horários
  atualizarSelectHorariosAdmin();

  // Reavalia disponibilidade
  verificarDisponibilidade(dataFiltroEl.value);

  // Re-renderiza horários nos novos <li> criados (usa cache, sem nova chamada ao Supabase)
  renderizarHorariosCards();
}

// Botão: salvar preços
document.getElementById("btnSalvarPrecos").addEventListener("click", async () => {
  const normal = parseFloat(document.getElementById("cfgPrecoNormal").value);
  const evento = parseFloat(document.getElementById("cfgPrecoEvento").value);
  const obs    = document.getElementById("cfgPrecoObs").value.trim();
  if (!normal || !evento) { mostrarMensagem("⚠️ Preencha os dois valores.", "erro"); return; }
  cfgAtual.precos = { normal, evento, obs };
  await salvarConfig("precos", cfgAtual.precos);
  // Atualiza a aba de preços visualmente
  document.getElementById("precoNormal").textContent = `R$ ${normal.toFixed(2).replace(".",",")} / hora em dias normais`;
  document.getElementById("precoEvento").textContent = `R$ ${evento.toFixed(2).replace(".",",")} / hora em dias de evento`;
  mostrarMensagem("✅ Preços atualizados!", "sucesso");
});

// Botão: salvar senha admin
document.getElementById("btnSalvarSenhaAdmin").addEventListener("click", async () => {
  const nova = document.getElementById("cfgSenhaAdmin").value.trim();
  if (!nova || nova.length < 6) { mostrarMensagem("⚠️ Senha deve ter ao menos 6 caracteres.", "erro"); return; }
  cfgAtual.senhas = { ...cfgAtual.senhas, admin: nova };
  await salvarConfig("senhas", cfgAtual.senhas);
  SENHA_ADMIN_DIN = nova;
  document.getElementById("cfgSenhaAdmin").value = "";
  mostrarMensagem("✅ Senha admin atualizada! Faça logout para confirmar.", "sucesso");
});

// Botão: salvar senha cliente
document.getElementById("btnSalvarSenhaCliente").addEventListener("click", async () => {
  const nova = document.getElementById("cfgSenhaCliente").value.trim();
  if (!nova || nova.length < 6) { mostrarMensagem("⚠️ Senha deve ter ao menos 6 caracteres.", "erro"); return; }
  cfgAtual.senhas = { ...cfgAtual.senhas, cliente: nova };
  await salvarConfig("senhas", cfgAtual.senhas);
  SENHA_CLIENTE_DIN = nova;
  document.getElementById("cfgSenhaCliente").value = "";
  mostrarMensagem("✅ Senha cliente atualizada!", "sucesso");
});

// Botão: adicionar hunt
document.getElementById("btnAdicionarHunt").addEventListener("click", async () => {
  const nova = document.getElementById("cfgNovaHunt").value.trim();
  if (!nova) { mostrarMensagem("⚠️ Digite o nome da hunt.", "erro"); return; }
  if (cfgAtual.hunts.includes(nova)) { mostrarMensagem("⚠️ Hunt já existe.", "erro"); return; }
  cfgAtual.hunts.push(nova);
  await salvarConfig("hunts", cfgAtual.hunts);
  document.getElementById("cfgNovaHunt").value = "";
  renderizarTagsHunts();
  atualizarSelectHunts();
  mostrarMensagem("✅ Hunt adicionada!", "sucesso");
});

// Botão: adicionar serviceiro
document.getElementById("btnAdicionarServiceiro").addEventListener("click", async () => {
  const novo    = document.getElementById("cfgNovoServiceiro").value.trim();
  const vocacao = document.getElementById("cfgVocacaoSel").value;
  if (!novo) { mostrarMensagem("⚠️ Digite o nome do serviceiro.", "erro"); return; }
  if (!cfgAtual.serviceiros[vocacao]) cfgAtual.serviceiros[vocacao] = [];
  if (cfgAtual.serviceiros[vocacao].includes(novo)) { mostrarMensagem("⚠️ Serviceiro já existe nesta vocação.", "erro"); return; }
  cfgAtual.serviceiros[vocacao].push(novo);
  await salvarConfig("serviceiros", cfgAtual.serviceiros);
  document.getElementById("cfgNovoServiceiro").value = "";
  renderizarTagsServiceiros();
  atualizarServiceiros();
  mostrarMensagem("✅ Serviceiro adicionado!", "sucesso");
});

// Troca de vocação no painel admin
document.getElementById("cfgVocacaoSel").addEventListener("change", renderizarTagsServiceiros);

// =========================================
// HORÁRIOS DOS SERVICEIROS
// =========================================
let horariosCache = [];

const DIAS_ORDEM = ["Todos os dias","Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];

async function carregarHorariosCards() {
  try {
    horariosCache = await supaGet("horarios_serviceiros", "ativo=eq.true&order=serviceiro.asc");
    renderizarHorariosCards();
  } catch(e) { console.warn("Erro ao carregar horários:", e); }
}

function renderizarHorariosCards() {
  document.querySelectorAll(".horarios-semana").forEach(span => {
    const nome = span.dataset.serviceiro;
    const horarios = horariosCache
      .filter(h => h.serviceiro === nome)
      .sort((a,b) => DIAS_ORDEM.indexOf(a.dia_semana) - DIAS_ORDEM.indexOf(b.dia_semana));

    if (horarios.length === 0) {
      span.innerHTML = "";
      return;
    }

    // Agrupa dias consecutivos com mesmo horário
    const grupos = [];
    horarios.forEach(h => {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.inicio === h.hora_inicio && ultimo.fim === h.hora_fim &&
          DIAS_ORDEM.indexOf(h.dia_semana) === DIAS_ORDEM.indexOf(ultimo.ultimoDia) + 1) {
        ultimo.ultimoDia = h.dia_semana;
      } else {
        grupos.push({ primeiroDia: h.dia_semana, ultimoDia: h.dia_semana, inicio: h.hora_inicio, fim: h.hora_fim });
      }
    });

    const linhas = grupos.map(g => {
      const dia = g.primeiroDia === g.ultimoDia
        ? g.primeiroDia
        : `${g.primeiroDia.slice(0,3)}–${g.ultimoDia.slice(0,3)}`;
      return `<span class="horario-tag">${dia} ${g.inicio.slice(0,5)}–${g.fim.slice(0,5)}</span>`;
    });

    span.innerHTML = `<div class="horarios-disponiveis">${linhas.join("")}</div>`;
  });
}

function atualizarSelectHorariosAdmin() {
  const sel = document.getElementById("cfgHorarioServiceiro");
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>';

  // Pega serviceiros do SERVICEIROS (em memória) OU do cfgAtual.serviceiros (Supabase)
  const fonte = Object.keys(cfgAtual.serviceiros || {}).length > 0
    ? cfgAtual.serviceiros
    : SERVICEIROS;
  const todos = [...new Set(Object.values(fonte).flat())].sort();

  todos.forEach(nome => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = nome;
    sel.appendChild(opt);
  });
  sel.value = atual;
  if (sel.value) renderizarHorariosAdmin(sel.value);
}

function renderizarHorariosAdmin(serviceiro) {
  const container = document.getElementById("listaHorariosAdmin");
  if (!container) return;
  const horarios = horariosCache
    .filter(h => h.serviceiro === serviceiro)
    .sort((a,b) => DIAS_ORDEM.indexOf(a.dia_semana) - DIAS_ORDEM.indexOf(b.dia_semana));

  if (horarios.length === 0) {
    container.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px;padding:8px 0">Nenhum horário cadastrado.</p>';
    return;
  }

  container.innerHTML = horarios.map(h => `
    <div class="horario-admin-row">
      <span class="horario-dia">${h.dia_semana}</span>
      <span class="horario-horas">${h.hora_inicio.slice(0,5)} – ${h.hora_fim.slice(0,5)}</span>
      <button class="btn-recusar" style="width:auto;padding:4px 10px;font-size:11px" data-del-id="${h.id}">🗑️</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-del-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await supaDelete("horarios_serviceiros", btn.dataset.delId);
      horariosCache = horariosCache.filter(h => h.id !== btn.dataset.delId);
      renderizarHorariosAdmin(serviceiro);
      renderizarHorariosCards();
      mostrarMensagem("🗑️ Horário removido!", "sucesso");
    });
  });
}

// Listener: troca de serviceiro no painel de horários
document.getElementById("cfgHorarioServiceiro")?.addEventListener("change", (e) => {
  renderizarHorariosAdmin(e.target.value);
});

// Botão: adicionar horário
document.getElementById("btnAdicionarHorario")?.addEventListener("click", async () => {
  const serviceiro = document.getElementById("cfgHorarioServiceiro").value;
  const dia        = document.getElementById("cfgHorarioDia").value;
  const inicio     = document.getElementById("cfgHorarioInicio").value;
  const fim        = document.getElementById("cfgHorarioFim").value;

  if (!serviceiro || !dia || !inicio || !fim) {
    mostrarMensagem("⚠️ Preencha todos os campos de horário.", "erro"); return;
  }
  if (fim <= inicio) {
    mostrarMensagem("⚠️ Hora fim deve ser após hora início.", "erro"); return;
  }

  // Verifica sobreposição de horários no mesmo dia
  const horaIniMin = parseInt(inicio.replace(":",""));
  const horaFimMin = parseInt(fim.replace(":",""));
  const sobreposicao = horariosCache.some(h => {
    if (h.serviceiro !== serviceiro || h.dia_semana !== dia) return false;
    const hIni = parseInt(h.hora_inicio.slice(0,5).replace(":",""));
    const hFim = parseInt(h.hora_fim.slice(0,5).replace(":",""));
    return !(horaFimMin <= hIni || horaIniMin >= hFim);
  });
  if (sobreposicao) {
    mostrarMensagem(`⚠️ Este horário sobrepõe um já cadastrado para ${serviceiro} na ${dia}.`, "erro"); return;
  }

  const [novo] = await supaPost("horarios_serviceiros", {
    serviceiro, dia_semana: dia, hora_inicio: inicio, hora_fim: fim, ativo: true
  });
  horariosCache.push(novo);
  renderizarHorariosAdmin(serviceiro);
  renderizarHorariosCards();
  mostrarMensagem(`✅ Horário adicionado para ${serviceiro}!`, "sucesso");
});

// Preview do arquivo antes de enviar
document.getElementById("pgArquivo").addEventListener("change", (e) => {
  const file    = e.target.files[0];
  const preview = document.getElementById("uploadPreview");
  preview.innerHTML = "";
  if (!file) return;
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src   = URL.createObjectURL(file);
    preview.appendChild(img);
  } else {
    preview.innerHTML = `<span style="font-size:13px;color:rgba(232,223,192,0.6)">📄 ${file.name}</span>`;
  }
});

// =========================================
// FAQ & SUGESTÕES
// =========================================

// Abre/fecha modal
document.getElementById("btnFaq").addEventListener("click", () => {
  document.getElementById("modalFaq").style.display = "flex";
});
document.getElementById("btnFecharFaq").addEventListener("click", () => {
  document.getElementById("modalFaq").style.display = "none";
});
document.getElementById("modalFaq").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modalFaq"))
    document.getElementById("modalFaq").style.display = "none";
});

// Abas internas do FAQ
document.querySelectorAll(".faq-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".faq-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".faq-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("faq-" + tab.dataset.faq).classList.add("active");
  });
});

// Acordeão das perguntas
document.querySelectorAll(".faq-pergunta").forEach(btn => {
  btn.addEventListener("click", () => {
    const resposta = btn.nextElementSibling;
    const aberta   = btn.classList.contains("aberta");
    // Fecha todas
    document.querySelectorAll(".faq-pergunta").forEach(b => b.classList.remove("aberta"));
    document.querySelectorAll(".faq-resposta").forEach(r => r.classList.remove("aberta"));
    // Abre a clicada (se não estava aberta)
    if (!aberta) {
      btn.classList.add("aberta");
      resposta.classList.add("aberta");
    }
  });
});

// Enviar sugestão
document.getElementById("btnEnviarSugestao").addEventListener("click", async () => {
  const nome     = document.getElementById("sugNome").value.trim();
  const mensagem = document.getElementById("sugMensagem").value.trim();

  if (!nome || !mensagem) {
    mostrarMensagem("⚠️ Preencha seu nick e a sugestão.", "erro"); return;
  }

  const nomeRegexSug = /^[a-zA-ZÀ-ÿ ]+$/;
  if (!nomeRegexSug.test(nome)) {
    mostrarMensagem("⚠️ Nome inválido — use apenas letras e espaços.", "erro"); return;
  }

  if (mensagem.length < 10) {
    mostrarMensagem("⚠️ Sugestão muito curta. Descreva melhor sua ideia!", "erro"); return;
  }

  try {
    await supaPost("sugestoes", { nome, mensagem, lida: false });
    document.getElementById("sugNome").value    = "";
    document.getElementById("sugMensagem").value = "";
    mostrarMensagem("✅ Sugestão enviada! Obrigado pelo feedback.", "sucesso");
    document.getElementById("modalFaq").style.display = "none";
  } catch(e) {
    mostrarMensagem("⚠️ Erro ao enviar sugestão. Tente novamente.", "erro");
  }
});

// Carrega sugestões no painel admin
async function carregarSugestoes() {
  if (tipoUsuario !== "admin") return;
  try {
    const sugestoes = await supaGet("sugestoes", "order=criado_em.desc");
    const naoLidas  = sugestoes.filter(s => !s.lida).length;

    // Badge no painel admin
    const badge = document.getElementById("badgeSugestoes");
    if (naoLidas > 0) {
      badge.textContent = naoLidas + " nova" + (naoLidas > 1 ? "s" : "");
      badge.style.display = "inline";
    } else {
      badge.style.display = "none";
    }

    const container = document.getElementById("listaSugestoesAdmin");
    if (sugestoes.length === 0) {
      container.innerHTML = '<p style="color:rgba(232,223,192,0.4);font-size:13px">Nenhuma sugestão recebida ainda.</p>';
      return;
    }

    container.innerHTML = sugestoes.map(s => `
      <div class="sugestao-card ${s.lida ? '' : 'nao-lida'}">
        <div class="sug-nome">${s.nome} ${!s.lida ? '<span style="color:var(--gold);font-size:11px;font-family:Cinzel,serif">● NOVA</span>' : ''}</div>
        <div class="sug-data">${new Date(s.criado_em).toLocaleString("pt-BR")}</div>
        <div class="sug-msg">${s.mensagem}</div>
        <div class="sug-acoes">
          ${!s.lida ? `<button class="btn-marcar-lida" data-sug-id="${s.id}">✅ Marcar como lida</button>` : '<span style="font-size:11px;color:rgba(232,223,192,0.3)">Lida</span>'}
          <button class="btn-recusar" style="width:auto;padding:4px 10px;font-size:11px" data-del-sug="${s.id}">🗑️</button>
        </div>
      </div>
    `).join("");

    // Marcar como lida
    container.querySelectorAll(".btn-marcar-lida").forEach(btn => {
      btn.addEventListener("click", async () => {
        await supaPatch("sugestoes", btn.dataset.sugId, { lida: true });
        carregarSugestoes();
      });
    });

    // Excluir
    container.querySelectorAll("[data-del-sug]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (confirm("Excluir esta sugestão?")) {
          await supaDelete("sugestoes", btn.dataset.delSug);
          carregarSugestoes();
          mostrarMensagem("🗑️ Sugestão excluída.", "sucesso");
        }
      });
    });

  } catch(e) { console.error("Erro ao carregar sugestões:", e); }
}

// ── Banner da guild ──────────────────────────
const bannerGuild = document.getElementById("bannerGuild");
const bannerFechado = sessionStorage.getItem("banner_fechado");
if (bannerFechado) bannerGuild.style.display = "none";

document.getElementById("btnFecharBanner").addEventListener("click", () => {
  bannerGuild.style.display = "none";
  sessionStorage.setItem("banner_fechado", "1");
});

// ── Inicializa ────────────────────────────
// Carrega configurações do Supabase — login bloqueado até concluir
(async () => {
  // Mostra estado de carregamento no botão de login
  const loginBtn = document.getElementById("loginBtn");
  loginBtn.textContent = "⏳";
  loginBtn.disabled    = true;

  try {
    const rows = await supaGet("configuracoes", "");
    rows.forEach(r => { cfgAtual[r.chave] = r.valor; });

    // Aplica senhas do Supabase
    if (cfgAtual.senhas?.admin)   SENHA_ADMIN_DIN   = cfgAtual.senhas.admin;
    if (cfgAtual.senhas?.cliente) SENHA_CLIENTE_DIN = cfgAtual.senhas.cliente;

    // Aplica hunts no select
    atualizarSelectHunts();
    // Aplica serviceiros
    atualizarServiceiros();
    // Aplica preços
    if (cfgAtual.precos?.normal) {
      document.getElementById("precoNormal").textContent =
        `R$ ${parseFloat(cfgAtual.precos.normal).toFixed(2).replace(".",",")} / hora em dias normais`;
      document.getElementById("precoEvento").textContent =
        `R$ ${parseFloat(cfgAtual.precos.evento).toFixed(2).replace(".",",")} / hora em dias de evento`;
    }

    senhasCarregadas = true;
    // Restaura sessão DEPOIS das configs carregarem (painel admin terá os dados)
    if (sessaoSalva) aplicarSessao(sessaoSalva);

  } catch(e) {
    console.warn("Erro ao carregar configurações:", e);
    SENHA_ADMIN_DIN   = "fatal-fallback-admin";
    SENHA_CLIENTE_DIN = "fatal-fallback-cliente";
    senhasCarregadas  = true;
    if (sessaoSalva) aplicarSessao(sessaoSalva);
  } finally {
    loginBtn.textContent = "Entrar";
    loginBtn.disabled    = false;
  }
})();

renderizarContatos();
renderizarPagamentos();

// Carrega horários após serviceiros estarem prontos
(async () => {
  await carregarHorariosCards();
})();
