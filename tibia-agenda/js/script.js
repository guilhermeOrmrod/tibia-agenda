// =========================================
// script.js — Agenda Rubinot Panic
// =========================================


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


// ── Persistência (localStorage) ───────────
const STORAGE_KEY = "rubinot_agendamentos";

function salvarEventos(eventos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(eventos));
}

function carregarEventos() {
  const dados = localStorage.getItem(STORAGE_KEY);
  return dados ? JSON.parse(dados) : [];
}


// ── Calendário ────────────────────────────
const calendarEl = document.getElementById("calendar");

const calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: "dayGridMonth",
  eventDisplay: "block",
  locale: "pt-br",

  eventClick: function (info) {
    const ep = info.event.extendedProps;
    const detalhes =
      "📌 " + ep.nome +
      " | Tipo: "    + ep.tipo +
      " | Hunt: "    + ep.hunt +
      " | Vocação: " + ep.vocacao +
      "\nInício: "   + info.event.start.toLocaleString("pt-BR") +
      " | Fim: "     + info.event.end.toLocaleString("pt-BR");

    if (tipoUsuario === "admin") {
      if (confirm(detalhes + "\n\nDeseja excluir este agendamento?")) {
        info.event.remove();
        const salvos = carregarEventos().filter(ev => ev.id !== ep.id);
        salvarEventos(salvos);
        mostrarMensagem("🗑️ Evento excluído com sucesso!", "sucesso");
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

// Carrega eventos salvos ao abrir a página
carregarEventos().forEach(ev => {
  calendar.addEvent({
    id:    ev.id,
    title: ev.nome + " — " + ev.tipo + " / " + ev.hunt + " (" + ev.vocacao + ")",
    start: ev.inicio,
    end:   ev.fim,
    extendedProps: { id: ev.id, nome: ev.nome, tipo: ev.tipo, hunt: ev.hunt, vocacao: ev.vocacao }
  });
});


// ── Autenticação ──────────────────────────
// Atenção: senhas no front-end são visíveis
// no DevTools. Ok para uso pessoal entre amigos.
const SENHA_ADMIN   = "adminFatal1289";
const SENHA_CLIENTE = "cliente123";
let tipoUsuario = null;

document.getElementById("loginBtn").addEventListener("click", () => {
  const senha = document.getElementById("senha").value;

  if (senha === SENHA_ADMIN) {
    tipoUsuario = "admin";
    mostrarMensagem("✅ Logado como ADMIN", "sucesso");
    document.getElementById("formAgendamento").style.display = "block";
    document.getElementById("loginArea").style.display       = "none";
    document.getElementById("userArea").style.display        = "block";
    document.getElementById("usuarioLogado").textContent     = "👤 ADMIN";

  } else if (senha === SENHA_CLIENTE) {
    tipoUsuario = "cliente";
    mostrarMensagem("✅ Logado como CLIENTE", "sucesso");
    document.getElementById("formAgendamento").style.display = "block";
    document.getElementById("loginArea").style.display       = "none";
    document.getElementById("userArea").style.display        = "block";
    document.getElementById("usuarioLogado").textContent     = "👤 CLIENTE";

  } else {
    mostrarMensagem("⚠️ Senha incorreta!", "erro");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  tipoUsuario = null;
  document.getElementById("formAgendamento").style.display = "none";
  document.getElementById("loginArea").style.display       = "block";
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

  const nome       = document.getElementById("nome").value.trim();
  const data       = document.getElementById("data").value;
  const horaInicio = document.getElementById("horaInicio").value;
  const horaFim    = document.getElementById("horaFim").value;
  const tipo       = document.getElementById("tipo").value;
  const hunt       = document.getElementById("hunt").value;
  const vocacao    = document.getElementById("vocacao").value;

  // Validação de campos
  if (!nome || !data || !horaInicio || !horaFim || !tipo || !hunt || !vocacao) {
    mostrarMensagem("⚠️ Preencha todos os campos.", "erro");
    return;
  }

  const inicio = new Date(data + "T" + horaInicio);
  const fim    = new Date(data + "T" + horaFim);
  const agora  = new Date();

  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    mostrarMensagem("⚠️ Data ou horário inválido.", "erro");
    return;
  }

  if (fim <= inicio) {
    mostrarMensagem("⚠️ O horário de fim deve ser após o início.", "erro");
    return;
  }

  if (inicio < agora) {
    mostrarMensagem("⚠️ Não é possível agendar em datas/horários anteriores ao atual.", "erro");
    return;
  }

  // Verifica conflito de horários
  const conflito = calendar.getEvents().some(ev => {
    return (
      (inicio >= ev.start && inicio <  ev.end) ||
      (fim    >  ev.start && fim    <= ev.end) ||
      (inicio <= ev.start && fim    >= ev.end)
    );
  });

  if (conflito) {
    mostrarMensagem("⚠️ Já existe um agendamento neste horário.", "erro");
    return;
  }

  // ID único para permitir exclusão futura
  const id = Date.now().toString();

  // Adiciona no calendário
  calendar.addEvent({
    id,
    title: nome + " — " + tipo + " / " + hunt + " (" + vocacao + ")",
    start: inicio,
    end:   fim,
    extendedProps: { id, nome, tipo, hunt, vocacao }
  });

  // Salva no localStorage
  const salvos = carregarEventos();
  salvos.push({
    id,
    nome,
    tipo,
    hunt,
    vocacao,
    inicio: inicio.toISOString(),
    fim:    fim.toISOString()
  });
  salvarEventos(salvos);

  mostrarMensagem("✅ Agendamento realizado com sucesso!", "sucesso");

  // Limpa o formulário
  e.target.reset();
});
