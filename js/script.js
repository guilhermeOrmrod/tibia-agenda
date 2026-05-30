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

function verificarDisponibilidade(dataSelecionada) {
  const eventos = carregarEventos();

  // Para cada li de serviceiro na página
  document.querySelectorAll(".serviceiros-list li").forEach(li => {
    const nome  = li.dataset.nome;
    const badge = li.querySelector(".badge");

    // Verifica se o serviceiro tem agendamento nessa data
    const ocupado = eventos.some(ev => {
      const dataEvento = ev.inicio.split("T")[0];
      return ev.serviceiro === nome && dataEvento === dataSelecionada;
    });

    if (ocupado) {
      badge.textContent = "Ocupado";
      badge.className   = "badge ocupado";
    } else {
      badge.textContent = "Disponível";
      badge.className   = "badge disponivel";
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
