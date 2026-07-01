// =========================================
// script.js — Fatal Services · Rubinot
// Supabase Auth + Roles
// =========================================

// ── Configuração Supabase ──────────────────
const SUPA_URL = "https://lkhnklrjaalxutbnlxsy.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxraG5rbHJqYWFseHV0Ym5seHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjE3NjUsImV4cCI6MjA5NTY5Nzc2NX0.BCifSPGyoI5pN1OTRgpWQQW4rRMnvTO-WOSi1xuIcPk";

// Cliente Supabase Auth com persistência garantida
const _supa = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
  auth: {
    persistSession: true,
    storageKey: "fatal_services_auth",
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
if (!_supa) throw new Error('Supabase não carregou!');

// Sessão atual
var sessaoAuth = null;   // objeto session do Supabase
var perfilAtual = null;  // linha da tabela perfis

const HEADERS = {
  "apikey":        SUPA_KEY,
  "Authorization": "Bearer " + SUPA_KEY,
  "Content-Type":  "application/json",
  "Prefer":        "return=representation"
};

// Atualiza Authorization quando usuário loga
function atualizarHeaders(token) {
  HEADERS["Authorization"] = "Bearer " + (token || SUPA_KEY);
}

async function supaGet(tabela, query = "") {
  const res = await fetch(`${SUPA_URL}/rest/v1/${tabela}?${query}`, { headers: HEADERS });
  if (!res.ok) {
    const erro = await res.json().catch(() => null);
    const msg = (erro && (erro.message || erro.hint)) || `Erro ${res.status} ao consultar ${tabela}`;
    throw new Error(msg);
  }
  return res.json();
}

// Limita o tamanho de um texto antes de salvar (anti-flood de dados grandes).
function limitarTexto(valor, max) {
  const v = (valor || "").trim();
  return v.length > max ? v.slice(0, max) : v;
}

// Anti-flood: impede disparar a mesma operação de escrita em rajada.
// Guarda o instante da última escrita por "chave" (tabela) e exige um intervalo mínimo.
const _ultimaEscrita = {};
function checarThrottle(chave, msMinimo = 3000) {
  const agora = Date.now();
  const ultimo = _ultimaEscrita[chave] || 0;
  if (agora - ultimo < msMinimo) {
    const faltam = Math.ceil((msMinimo - (agora - ultimo)) / 1000);
    throw new Error(`Aguarde ${faltam}s antes de tentar novamente.`);
  }
  _ultimaEscrita[chave] = agora;
}

async function supaPost(tabela, body) {
  checarThrottle("post_" + tabela, 3000); // no máx. 1 inserção a cada 3s por tabela
  const res = await fetch(`${SUPA_URL}/rest/v1/${tabela}`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.message || data.hint || data.details)) || `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ── Ações privilegiadas via Edge Function (service_role) ──
async function adminAction(acao, tabela, id = null, dados = null, extra = {}) {
  // Autentica pelo JWT do admin logado (a Edge Function valida o role).
  // Não trafega mais a senha admin para o navegador.
  if (!sessaoAuth?.access_token) throw new Error("Ação requer login de admin.");
  const res = await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPA_KEY,
      "Authorization": "Bearer " + SUPA_KEY,
      "x-user-jwt":    sessaoAuth.access_token
    },
    body: JSON.stringify({ acao, tabela, id, dados, ...extra })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro na ação admin");
  }
  return res.json();
}

// Ação via service_role usando JWT do usuário logado (para serviceiros)
async function supaAction(acao, tabela, id = null, dados = null) {
  if (!sessaoAuth) throw new Error("Não autenticado.");
  const res = await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPA_KEY,
      "Authorization": "Bearer " + SUPA_KEY,
      "x-user-jwt":   sessaoAuth.access_token
    },
    body: JSON.stringify({ acao, tabela, id, dados, userRole: tipoUsuario })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro na operação");
  }
  return res.json();
}

async function supaUpload(bucket, path, file) {
  // Usa o JWT do usuário logado (não a chave anon) para o Storage reconhecer
  // que é um usuário autenticado e aplicar a policy corretamente.
  const token = sessaoAuth?.access_token || SUPA_KEY;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + token },
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
      carregarUsuarios("pendente");
    }
    if (aba === "historico")  carregarHistorico();
    if (aba === "dashboard")  carregarDashboard();
  });
});

// Link "Termos" dentro do cadastro → fecha o modal e abre a aba de termos
document.getElementById("linkTermosCadastro")?.addEventListener("click", (e) => {
  e.preventDefault();
  const modalAuth = document.getElementById("modalAuth");
  if (modalAuth) modalAuth.style.display = "none";
  document.getElementById("btnNavTermos")?.click();
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
    // Só conta como ocupado: pendente/aprovado/em_andamento E que ainda não terminaram
    const agora = new Date().toISOString();
    agendamentosCache = await supaGet("agendamentos", `inicio=gte.${dataSelecionada}T00:00:00-03:00&inicio=lte.${dataSelecionada}T23:59:59-03:00&status=in.(pendente,aprovado,em_andamento)&fim=gte.${agora}`);
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
    let nomeWrap = li.querySelector(".sq-topo") || li.querySelector(".nome-wrap");
    if (!nomeWrap) {
      const nomeEl = li.querySelector(".nome");
      nomeWrap = document.createElement("div");
      nomeWrap.className = "sq-topo";
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

// ── Modal de número de chamado ───────────────
function mostrarModalChamado(numero) {
  // Remove modal anterior se existir
  const antigo = document.getElementById("modalChamado");
  if (antigo) antigo.remove();

  const modal = document.createElement("div");
  modal.id = "modalChamado";
  modal.innerHTML = `
    <div class="chamado-box">
      <div class="chamado-icon">🎫</div>
      <h3>Chamado criado com sucesso!</h3>
      <div class="chamado-numero">#${numero}</div>
      <p>Anote esse número. Acesse a aba <strong>Histórico</strong> e busque pelo chamado <strong>#${numero}</strong> para acompanhar o status do seu serviço.</p>
      <button id="btnFecharChamado">Entendido!</button>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("btnFecharChamado").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

// ── Limpa highlight de erro ────────────────
["nome","data","horaInicio","horaFim","tipo","hunt","huntCustom","vocacao","serviceiro"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", () => el.classList.remove("campo-invalido"));
  if (el) el.addEventListener("input",  () => el.classList.remove("campo-invalido"));
});

// ── Calendário ────────────────────────────
const calendarEl = document.getElementById("calendar");
var calendar   = new FullCalendar.Calendar(calendarEl, {
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
        await adminAction("delete", "agendamentos", ep.id);
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
    const STATUS_CORES = { aprovado: "#9333ea", em_andamento: "#378add", concluido: "#4caf6e", encerrado: "#e05a3a", cancelado: "#888780" };
    const eventos = await supaGet("agendamentos", "status=in.(aprovado,em_andamento,concluido,encerrado)&arquivado=not.is.true&order=inicio.asc");
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

// carregarCalendario() é chamado após auth restaurada

