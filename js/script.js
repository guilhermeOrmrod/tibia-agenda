// =========================================
// script.js — Fatal Services · Rubinot
// =========================================

// ── Dados dos serviceiros por vocação ─────
const SERVICEIROS = {
  "Master Sorcerer": ["Fear", "Panic", "Cassinho", "Murilo"],
  "Elder Druid":     ["Murilo", "Cassinho", "Panic"],
  "Elite Knight":    ["Paradox", "Raikess", "Cassinho", "Murilo"],
  "Royal Paladin":   ["Accid", "Cassinho", "Raikess"],
  "Exalted Monk":    ["Murilo"]
};

// ── Persistência (localStorage) ───────────
const STORAGE_KEY = "rubinot_agendamentos";

function salvarEventos(eventos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(eventos));
}

function carregarEventos() {
  const dados = localStorage.getItem(STORAGE_KEY);
  return dados ? JSON.parse(dados) : [];
}

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
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ── Lógica de disponibilidade ──────────────
// Define a data do filtro como hoje por padrão
const dataFiltroEl = document.getElementById("dataFiltro");
const hoje = new Date().toISOString().split("T")[0];
dataFiltroEl.value = hoje;

function formatarHora(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function verificarDisponibilidade(dataSelecionada) {
  const eventos = carregarEventos();

  document.querySelectorAll(".serviceiros-list li").forEach(li => {
    const nome  = li.dataset.nome;
    const badge = li.querySelector(".badge");

    // Filtra agendamentos do serviceiro nessa data, ordenados por início
    const agendamentosDia = eventos
      .filter(ev => ev.serviceiro === nome && ev.inicio.split("T")[0] === dataSelecionada)
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

    if (agendamentosDia.length === 0) {
      badge.textContent = "Disponível";
      badge.className   = "badge disponivel";
      badge.title       = "";
    } else {
      // Monta string com todos os horários ocupados
      const horarios = agendamentosDia
        .map(ev => formatarHora(ev.inicio) + "–" + formatarHora(ev.fim))
        .join(", ");

      badge.textContent = "Ocupado";
      badge.className   = "badge ocupado";
      badge.title       = "Horários: " + horarios;

      // Adiciona span com os horários visível abaixo do badge
      let spanHorario = li.querySelector(".horarios-ocupados");
      if (!spanHorario) {
        spanHorario = document.createElement("span");
        spanHorario.className = "horarios-ocupados";
        li.appendChild(spanHorario);
      }
      spanHorario.textContent = horarios;
    }

    // Remove span de horários se ficou disponível
    if (agendamentosDia.length === 0) {
      const spanExistente = li.querySelector(".horarios-ocupados");
      if (spanExistente) spanExistente.remove();
    }
  });
}

// Verifica ao carregar e ao mudar a data
verificarDisponibilidade(dataFiltroEl.value);
dataFiltroEl.addEventListener("change", () => {
  verificarDisponibilidade(dataFiltroEl.value);
});

// ── Select dinâmico: serviceiro por vocação ─
const vocacaoEl   = document.getElementById("vocacao");
const servicEireEl = document.getElementById("serviceiro");

vocacaoEl.addEventListener("change", () => {
  const vocacao = vocacaoEl.value;
  servicEireEl.innerHTML = '<option value="">Serviceiro</option>';
  if (vocacao && SERVICEIROS[vocacao]) {
    SERVICEIROS[vocacao].forEach(nome => {
      const opt  = document.createElement("option");
      opt.value  = nome;
      opt.textContent = nome;
      servicEireEl.appendChild(opt);
    });
  }
});

// ── Limpa highlight de erro ao preencher campo ──
["nome","data","horaInicio","horaFim","tipo","hunt","vocacao","serviceiro"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", () => el.classList.remove("campo-invalido"));
  if (el) el.addEventListener("input",  () => el.classList.remove("campo-invalido"));
});

// ── Calendário ────────────────────────────
const calendarEl = document.getElementById("calendar");

const calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: "dayGridMonth",
  initialDate: new Date(),
  eventDisplay: "block",
  locale: "pt-br",

  eventClick: function (info) {
    const ep = info.event.extendedProps;
    const detalhes =
      "📌 " + ep.nomeCliente +
      " | Serviceiro: " + ep.serviceiro +
      " | " + ep.vocacao +
      " | Tipo: " + ep.tipo +
      " | Hunt: " + ep.hunt +
      "\nInício: " + info.event.start.toLocaleString("pt-BR") +
      " | Fim: "  + info.event.end.toLocaleString("pt-BR");

    if (tipoUsuario === "admin") {
      if (confirm(detalhes + "\n\nDeseja excluir este agendamento?")) {
        info.event.remove();
        const salvos = carregarEventos().filter(ev => ev.id !== ep.id);
        salvarEventos(salvos);
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

// Corrige bug de tamanho ao trocar de monitor ou redimensionar janela
window.addEventListener("resize", () => {
  calendar.updateSize();
});

// Força recálculo ao trocar de aba (Serviceiros <-> Agenda)
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    setTimeout(() => calendar.updateSize(), 50);
  });
});

// Carrega eventos salvos
carregarEventos().forEach(ev => {
  calendar.addEvent({
    id:    ev.id,
    title: ev.serviceiro + " → " + ev.nomeCliente + " (" + ev.hunt + ")",
    start: ev.inicio,
    end:   ev.fim,
    extendedProps: { id: ev.id, nomeCliente: ev.nomeCliente, serviceiro: ev.serviceiro, vocacao: ev.vocacao, tipo: ev.tipo, hunt: ev.hunt }
  });
});

// ── Autenticação ──────────────────────────
const SENHA_ADMIN   = "admin123";
const SENHA_CLIENTE = "cliente123";
let tipoUsuario = null;

document.getElementById("loginBtn").addEventListener("click", () => {
  const senha = document.getElementById("senha").value;

  if (senha === SENHA_ADMIN) {
    tipoUsuario = "admin";
    mostrarMensagem("✅ Logado como ADMIN", "sucesso");
    document.getElementById("formAgendamento").style.display = "block";
    document.getElementById("loginArea").style.display       = "none";
    document.getElementById("userArea").style.display        = "flex";
    document.getElementById("usuarioLogado").textContent     = "⚔️ ADMIN";
    document.getElementById("btnEditarContatos").style.display = "inline-block";
    renderizarContatos();
    renderizarPagamentos();

  } else if (senha === SENHA_CLIENTE) {
    tipoUsuario = "cliente";
    mostrarMensagem("✅ Logado como CLIENTE", "sucesso");
    document.getElementById("formAgendamento").style.display = "block";
    document.getElementById("loginArea").style.display       = "none";
    document.getElementById("userArea").style.display        = "flex";
    document.getElementById("usuarioLogado").textContent     = "🗡️ CLIENTE";

  } else {
    mostrarMensagem("⚠️ Senha incorreta!", "erro");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  tipoUsuario = null;
  document.getElementById("formAgendamento").style.display = "none";
  document.getElementById("loginArea").style.display       = "flex";
  document.getElementById("userArea").style.display        = "none";
  document.getElementById("senha").value                   = "";
  document.getElementById("btnEditarContatos").style.display = "none";
  renderizarContatos();
  renderizarPagamentos();
  mostrarMensagem("Saiu da conta.", "sucesso");
});

// ── Formulário de agendamento ─────────────
document.getElementById("formAgendamento").addEventListener("submit", (e) => {
  e.preventDefault();

  if (!tipoUsuario) {
    mostrarMensagem("⚠️ Você precisa estar logado.", "erro");
    return;
  }

  const nomeCliente = document.getElementById("nome").value.trim();
  const data        = document.getElementById("data").value;
  const horaInicio  = document.getElementById("horaInicio").value;
  const horaFim     = document.getElementById("horaFim").value;
  const tipo        = document.getElementById("tipo").value;
  const hunt        = document.getElementById("hunt").value;
  const vocacao     = document.getElementById("vocacao").value;
  const serviceiro  = document.getElementById("serviceiro").value;

  // Validação visual: destaca campos vazios
  const campos = [
    { id: "nome",       val: nomeCliente },
    { id: "data",       val: data },
    { id: "horaInicio", val: horaInicio },
    { id: "horaFim",    val: horaFim },
    { id: "tipo",       val: tipo },
    { id: "hunt",       val: hunt },
    { id: "vocacao",    val: vocacao },
    { id: "serviceiro", val: serviceiro }
  ];

  let temVazio = false;
  campos.forEach(c => {
    const el = document.getElementById(c.id);
    if (!c.val) {
      el.classList.add("campo-invalido");
      temVazio = true;
    } else {
      el.classList.remove("campo-invalido");
    }
  });

  if (temVazio) {
    mostrarMensagem("⚠️ Preencha todos os campos obrigatórios.", "erro");
    return;
  }


  const inicio = new Date(data + "T" + horaInicio);
  const fim    = new Date(data + "T" + horaFim);
  const agora  = new Date();

  if (fim <= inicio) {
    mostrarMensagem("⚠️ Horário de fim deve ser após o início.", "erro");
    return;
  }

  if (inicio < agora) {
    mostrarMensagem("⚠️ Não é possível agendar no passado.", "erro");
    return;
  }

  // Verifica conflito para o mesmo serviceiro
  const eventosSalvos = carregarEventos();
  const conflito = eventosSalvos.some(ev => {
    if (ev.serviceiro !== serviceiro) return false;
    const evInicio = new Date(ev.inicio);
    const evFim    = new Date(ev.fim);
    return (
      (inicio >= evInicio && inicio <  evFim) ||
      (fim    >  evInicio && fim    <= evFim) ||
      (inicio <= evInicio && fim    >= evFim)
    );
  });

  if (conflito) {
    mostrarMensagem("⚠️ " + serviceiro + " já tem agendamento neste horário.", "erro");
    return;
  }

  const id = Date.now().toString();

  calendar.addEvent({
    id,
    title: serviceiro + " → " + nomeCliente + " (" + hunt + ")",
    start: inicio,
    end:   fim,
    extendedProps: { id, nomeCliente, serviceiro, vocacao, tipo, hunt }
  });

  eventosSalvos.push({ id, nomeCliente, serviceiro, vocacao, tipo, hunt, inicio: inicio.toISOString(), fim: fim.toISOString() });
  salvarEventos(eventosSalvos);

  // Atualiza badges de disponibilidade
  verificarDisponibilidade(dataFiltroEl.value);

  mostrarMensagem("✅ Agendamento com " + serviceiro + " realizado!", "sucesso");
  e.target.reset();
  servicEireEl.innerHTML = '<option value="">Serviceiro</option>';
});


// =========================================
// CONTATOS
// =========================================
const STORAGE_CONTATOS = "rubinot_contatos";

const CONTATOS_PADRAO = [
  { nome: "Fear",    vocacao: "Master Sorcerer", whats: "",  pix: "", discord: "" },
  { nome: "Panic",   vocacao: "Master Sorcerer", whats: "",  pix: "", discord: "" },
  { nome: "Cassinho",vocacao: "Multi",            whats: "",  pix: "", discord: "" },
  { nome: "Murilo",  vocacao: "Multi",            whats: "",  pix: "", discord: "" },
  { nome: "Paradox", vocacao: "Elite Knight",     whats: "",  pix: "", discord: "" },
  { nome: "Raikess", vocacao: "Multi",            whats: "",  pix: "", discord: "" },
  { nome: "Accid",   vocacao: "Royal Paladin",    whats: "",  pix: "", discord: "" }
];

function carregarContatos() {
  const dados = localStorage.getItem(STORAGE_CONTATOS);
  return dados ? JSON.parse(dados) : JSON.parse(JSON.stringify(CONTATOS_PADRAO));
}

function salvarContatos(contatos) {
  localStorage.setItem(STORAGE_CONTATOS, JSON.stringify(contatos));
}

function renderizarContatos() {
  const contatos = carregarContatos();
  const container = document.getElementById("tabelaContatos");

  container.innerHTML = `
    <div class="contato-row header">
      <span>Nome</span>
      <span>WhatsApp</span>
      <span>Pix</span>
      <span>Discord</span>
      <span></span>
    </div>
  `;

  contatos.forEach(c => {
    const row = document.createElement("div");
    row.className = "contato-row";
    const isAdmin = tipoUsuario === "admin";

    row.innerHTML = `
      <span class="contato-nome">${c.nome}</span>
      <span class="contato-info">${c.whats ? `<a href="https://wa.me/55${c.whats.replace(/[^0-9]/g,'')}" target="_blank">📱 ${c.whats}</a>` : '<em>—</em>'}</span>
      <span class="contato-info">${c.pix || '<em>—</em>'}</span>
      <span class="contato-info">${c.discord || '<em>—</em>'}</span>
      <span>${isAdmin ? `<button class="btn-edit-contato" data-nome="${c.nome}">✏️</button>` : ''}</span>
    `;
    container.appendChild(row);
  });

  // Botões de edição
  document.querySelectorAll(".btn-edit-contato").forEach(btn => {
    btn.addEventListener("click", () => abrirModalContato(btn.dataset.nome));
  });
}

function abrirModalContato(nome) {
  const contatos = carregarContatos();
  const c = contatos.find(x => x.nome === nome);
  if (!c) return;
  document.getElementById("editNome").value    = c.nome;
  document.getElementById("editWhats").value   = c.whats    || "";
  document.getElementById("editPix").value     = c.pix      || "";
  document.getElementById("editDiscord").value = c.discord  || "";
  document.getElementById("modalContato").style.display = "flex";
}

document.getElementById("btnFecharModal").addEventListener("click", () => {
  document.getElementById("modalContato").style.display = "none";
});

document.getElementById("btnSalvarContato").addEventListener("click", () => {
  const nome    = document.getElementById("editNome").value;
  const whats   = document.getElementById("editWhats").value.trim();
  const pix     = document.getElementById("editPix").value.trim();
  const discord = document.getElementById("editDiscord").value.trim();
  const contatos = carregarContatos();
  const idx = contatos.findIndex(x => x.nome === nome);
  if (idx !== -1) {
    contatos[idx].whats   = whats;
    contatos[idx].pix     = pix;
    contatos[idx].discord = discord;
    salvarContatos(contatos);
  }
  document.getElementById("modalContato").style.display = "none";
  renderizarContatos();
  mostrarMensagem("✅ Contato de " + nome + " atualizado!", "sucesso");
});

// Fecha modal clicando fora
document.getElementById("modalContato").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modalContato")) {
    document.getElementById("modalContato").style.display = "none";
  }
});

// Botão admin editar contatos
document.getElementById("btnEditarContatos").addEventListener("click", () => {
  renderizarContatos();
});

// =========================================
// PAGAMENTOS
// =========================================
const STORAGE_PAGAMENTOS = "rubinot_pagamentos";

function carregarPagamentos() {
  const dados = localStorage.getItem(STORAGE_PAGAMENTOS);
  return dados ? JSON.parse(dados) : [];
}

function salvarPagamentos(pags) {
  localStorage.setItem(STORAGE_PAGAMENTOS, JSON.stringify(pags));
}

function renderizarPagamentos() {
  const pags = carregarPagamentos();
  const analise   = pags.filter(p => p.status === "analise");
  const aprovados = pags.filter(p => p.status === "aprovado");
  const recusados = pags.filter(p => p.status === "recusado");

  function cardHTML(p) {
    const isAdmin = tipoUsuario === "admin";
    const acoes = (isAdmin && p.status === "analise") ? `
      <div class="pg-acoes">
        <button class="btn-aprovar" data-id="${p.id}">✅ Aprovar</button>
        <button class="btn-recusar" data-id="${p.id}">❌ Recusar</button>
      </div>` : "";
    const btnExcluir = (isAdmin) ? `<button class="btn-recusar" style="margin-top:6px;width:100%" data-excluir="${p.id}">🗑️ Excluir</button>` : "";
    return `
      <div class="pagamento-card">
        <div class="pg-nome">${p.nome}</div>
        <div class="pg-detail">Serviceiro: ${p.serviceiro}</div>
        <div class="pg-detail">Data: ${p.data} | Pix: ${p.comprovante}</div>
        ${p.obs ? `<div class="pg-detail">Obs: ${p.obs}</div>` : ""}
        <div class="pg-valor">R$ ${parseFloat(p.valor).toFixed(2)}</div>
        ${acoes}
        ${btnExcluir}
      </div>`;
  }

  const listaAnalise   = document.getElementById("listaAnalise");
  const listaAprovados = document.getElementById("listaAprovados");
  const listaRecusados = document.getElementById("listaRecusados");

  listaAnalise.innerHTML   = analise.length   ? analise.map(cardHTML).join("")   : '<div class="vazio-msg">Nenhum pagamento</div>';
  listaAprovados.innerHTML = aprovados.length ? aprovados.map(cardHTML).join("") : '<div class="vazio-msg">Nenhum aprovado</div>';
  listaRecusados.innerHTML = recusados.length ? recusados.map(cardHTML).join("") : '<div class="vazio-msg">Nenhum recusado</div>';

  // Botões aprovar/recusar/excluir
  document.querySelectorAll(".btn-aprovar").forEach(btn => {
    btn.addEventListener("click", () => alterarStatusPagamento(btn.dataset.id, "aprovado"));
  });
  document.querySelectorAll(".btn-recusar[data-id]").forEach(btn => {
    btn.addEventListener("click", () => alterarStatusPagamento(btn.dataset.id, "recusado"));
  });
  document.querySelectorAll("[data-excluir]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("Excluir este pagamento?")) {
        const pags = carregarPagamentos().filter(p => p.id !== btn.dataset.excluir);
        salvarPagamentos(pags);
        renderizarPagamentos();
        mostrarMensagem("🗑️ Pagamento excluído!", "sucesso");
      }
    });
  });
}

function alterarStatusPagamento(id, novoStatus) {
  const pags = carregarPagamentos();
  const idx  = pags.findIndex(p => p.id === id);
  if (idx !== -1) {
    pags[idx].status = novoStatus;
    salvarPagamentos(pags);
    renderizarPagamentos();
    mostrarMensagem(novoStatus === "aprovado" ? "✅ Pagamento aprovado!" : "❌ Pagamento recusado!", novoStatus === "aprovado" ? "sucesso" : "erro");
  }
}

// Mostrar/ocultar form de pagamento
document.getElementById("btnNovoPagamento").addEventListener("click", () => {
  const form = document.getElementById("formPagamento");
  form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("btnEnviarPagamento").addEventListener("click", () => {
  const nome        = document.getElementById("pgNome").value.trim();
  const serviceiro  = document.getElementById("pgServiceiro").value.trim();
  const data        = document.getElementById("pgData").value;
  const valor       = document.getElementById("pgValor").value;
  const comprovante = document.getElementById("pgComprovante").value.trim();
  const obs         = document.getElementById("pgObs").value.trim();

  if (!nome || !serviceiro || !data || !valor || !comprovante) {
    mostrarMensagem("⚠️ Preencha todos os campos obrigatórios.", "erro");
    return;
  }

  const pags = carregarPagamentos();
  pags.push({ id: Date.now().toString(), nome, serviceiro, data, valor, comprovante, obs, status: "analise" });
  salvarPagamentos(pags);
  renderizarPagamentos();
  mostrarMensagem("📤 Pagamento enviado para análise!", "sucesso");
  document.getElementById("formPagamento").style.display = "none";

  // Limpa campos
  ["pgNome","pgServiceiro","pgData","pgValor","pgComprovante","pgObs"].forEach(id => {
    document.getElementById(id).value = "";
  });
});

// Inicializa contatos e pagamentos ao carregar
renderizarContatos();
renderizarPagamentos();
