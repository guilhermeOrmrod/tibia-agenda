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
let sessaoAuth = null;   // objeto session do Supabase
let perfilAtual = null;  // linha da tabela perfis

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

// =========================================
// SISTEMA DE AUTENTICAÇÃO — Supabase Auth
// =========================================
let tipoUsuario = null; // "admin" | "serviceiro" | "cliente" | null

// ── Aplica sessão na UI ──
async function aplicarSessao(session, event = '') {
  sessaoAuth = session;
  if (!session) {
    tipoUsuario = null;
    perfilAtual = null;
    atualizarHeaders(null);
    atualizarUI();
    return;
  }

  atualizarHeaders(session.access_token);

  // Busca perfil usando o JWT do usuário (garante que RLS permite)
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/perfis?id=eq.${session.user.id}&select=*`,
      {
        headers: {
          "apikey": SUPA_KEY,
          "Authorization": "Bearer " + session.access_token,
          "Content-Type": "application/json"
        }
      }
    );
    const perfis = await res.json();
    perfilAtual = Array.isArray(perfis) && perfis.length > 0 ? perfis[0] : null;
  } catch(e) {
    console.warn("Erro ao buscar perfil:", e);
    perfilAtual = null;
  }

  if (!perfilAtual) {
    // Perfil não encontrado — pode ser delay do trigger, aguarda 1s e tenta de novo
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(
        `${SUPA_URL}/rest/v1/perfis?id=eq.${session.user.id}&select=*`,
        {
          headers: {
            "apikey": SUPA_KEY,
            "Authorization": "Bearer " + session.access_token,
            "Content-Type": "application/json"
          }
        }
      );
      const perfis = await res.json();
      perfilAtual = Array.isArray(perfis) && perfis.length > 0 ? perfis[0] : null;
    } catch(e) {}
  }

  if (!perfilAtual) {
    tipoUsuario = null;
    mostrarMensagem("⚠️ Perfil não encontrado. Contate o admin.", "erro");
    // NÃO faz signOut — apenas não aplica a sessão
    atualizarUI();
    return;
  }

  if (!perfilAtual.aprovado) {
    tipoUsuario = null;
    mostrarMensagem("⏳ Conta aguardando aprovação do admin.", "erro");
    // NÃO faz signOut — usuário pode tentar mais tarde
    atualizarUI();
    return;
  }

  tipoUsuario = perfilAtual.role;

  // (Não baixamos mais a senha admin para o navegador — a Edge Function valida pelo JWT.)

  atualizarUI();
  // Só mostra boas-vindas no login real, não no refresh
  if (event === "SIGNED_IN") {
    mostrarMensagem(`✅ Bem-vindo, ${perfilAtual.nick}!`, "sucesso");
    if (tipoUsuario === "cliente") avisarStatusCliente();
    if (tipoUsuario === "serviceiro" || (tipoUsuario === "admin" && perfilAtual.serviceiro_nome)) avisarPendentesServiceiro();
  }
}

// Avisa o cliente sobre chamados aceitos/em andamento/concluídos ao logar
async function avisarStatusCliente() {
  try {
    const meus = await supaGet("agendamentos",
      `nome_cliente=eq.${encodeURIComponent(perfilAtual.nick)}&status=in.(aprovado,em_andamento,concluido)&order=criado_em.desc`);
    // Cobranças a pagar
    const cobrancas = await supaGet("pagamentos",
      `nome=eq.${encodeURIComponent(perfilAtual.nick)}&status=eq.cobranca`).catch(() => []);
    if (cobrancas.length) {
      const total = cobrancas.reduce((s,c) => s + (parseFloat(c.valor)||0), 0);
      setTimeout(() => mostrarMensagem(`💰 Você tem ${cobrancas.length} serviço(s) a pagar (R$ ${total.toFixed(2)}). Veja na aba Pagamentos.`, "sucesso"), 1500);
    }
    if (!meus.length) return;
    const aprovados = meus.filter(a => a.status === "aprovado").length;
    const andamento = meus.filter(a => a.status === "em_andamento").length;
    const partes = [];
    if (aprovados) partes.push(`${aprovados} aceito(s) ✅`);
    if (andamento) partes.push(`${andamento} em andamento ⚔️`);
    if (partes.length) {
      setTimeout(() => mostrarMensagem(`📣 Você tem ${partes.join(" e ")}. Veja no Histórico.`, "sucesso"), 2500);
    }
  } catch(e) { console.warn("avisarStatusCliente:", e); }
}

// Avisa o serviceiro sobre chamados pendentes ao logar
async function avisarPendentesServiceiro() {
  try {
    const nomeServ = perfilAtual.serviceiro_nome || perfilAtual.nick;
    const pend = await supaGet("agendamentos",
      `serviceiro=eq.${encodeURIComponent(nomeServ)}&status=eq.pendente`);
    if (pend.length) {
      setTimeout(() => mostrarMensagem(`🔔 Você tem ${pend.length} chamado(s) pendente(s) aguardando sua resposta.`, "sucesso"), 2500);
    }
  } catch(e) { console.warn("avisarPendentesServiceiro:", e); }
}

// ── Atualiza a interface conforme o papel ──
async function atualizarUI() {
  const logado       = tipoUsuario !== null;
  const isAdmin      = tipoUsuario === "admin";
  const isServiceiro = tipoUsuario === "serviceiro";
  // "Faz serviços" = serviceiro puro OU admin vinculado a um nome de serviceiro
  const fazServicos  = isServiceiro || (isAdmin && !!perfilAtual?.serviceiro_nome);
  const nick         = perfilAtual?.nick || "";

  // Header
  document.getElementById("loginArea").style.display  = logado ? "none" : "flex";
  document.getElementById("userArea").style.display   = logado ? "flex" : "none";
  document.getElementById("usuarioLogado").textContent =
    isAdmin ? `⚔️ ${nick}` : isServiceiro ? `🗡️ ${nick}` : `👤 ${nick}`;

  // Botões de navegação por papel
  document.getElementById("btnNavAdmin").style.display       = isAdmin ? "inline-block" : "none";
  document.getElementById("btnNavServicos").style.display    = fazServicos ? "inline-block" : "none";
  document.getElementById("btnEditarContatos").style.display = isAdmin ? "inline-block" : "none";

  // Formulário de agendamento — clientes e admin podem agendar
  const podeAgendar = logado && (tipoUsuario === "cliente" || isAdmin);
  document.getElementById("formAgendamento").style.display  = podeAgendar ? "block" : "none";
  document.getElementById("agendaBloqueado").style.display  = !logado ? "flex" : "none";

  // Atualiza dados das abas
  renderizarContatos();
  renderizarPagamentos();
  carregarHistorico();
  popularSelectServiceiroPagamento();

  if (isAdmin) {
    carregarPainelAdmin();
    expirarPendentesVencidos();
  }
  // Carrega o painel de serviços para serviceiro puro OU admin-serviceiro
  if (fazServicos) carregarPainelServiceiro();

  // Aplica permissões para cliente e serviceiro
  if (tipoUsuario === "cliente" || tipoUsuario === "serviceiro") {
    await carregarPermissoes();
    aplicarPermissoes();
  }
}

// ── Modal de Auth ──
document.getElementById("btnAbrirAuth").addEventListener("click", () => {
  document.getElementById("modalAuth").style.display = "flex";
});
document.getElementById("btnFecharAuth").addEventListener("click", () => {
  document.getElementById("modalAuth").style.display = "none";
});
document.getElementById("modalAuth").addEventListener("click", e => {
  if (e.target === document.getElementById("modalAuth"))
    document.getElementById("modalAuth").style.display = "none";
});

// Abas Login/Cadastro
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".auth-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("auth-" + tab.dataset.auth).classList.add("active");
  });
});

// campo de convite sempre visível (tipo detectado pelo código)

// ── Login ──
document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const senha  = document.getElementById("loginSenha").value;
  const erroEl = document.getElementById("loginErro");
  erroEl.textContent = "";

  if (!email || !senha) { erroEl.textContent = "Preencha email e senha."; return; }

  const btnLogin = document.getElementById("btnLogin");
  btnLogin.disabled = true;
  btnLogin.textContent = "⏳ Entrando...";

  try {
    const { data, error } = await _supa.auth.signInWithPassword({ email, password: senha });
    if (error) {
      erroEl.textContent = "Email ou senha incorretos.";
      return;
    }
    document.getElementById("modalAuth").style.display = "none";
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginSenha").value = "";
  } catch(e) {
    erroEl.textContent = "Erro de conexão. Tente novamente.";
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "⚔️ Entrar";
  }
});

// ── Cadastro ──
document.getElementById("btnCadastro").addEventListener("click", async () => {
  const nick    = document.getElementById("cadNick").value.trim();
  const email   = document.getElementById("cadEmail").value.trim();
  const senha   = document.getElementById("cadSenha").value;
  const convite = document.getElementById("cadConvite").value.trim().toUpperCase();
  const erroEl  = document.getElementById("cadErro");
  erroEl.textContent = "";

  if (!nick || !email || !senha) { erroEl.textContent = "Preencha todos os campos."; return; }
  if (senha.length < 6) { erroEl.textContent = "Senha deve ter ao menos 6 caracteres."; return; }
  if (!/^[a-zA-ZÀ-ÿ ]+$/.test(nick)) { erroEl.textContent = "Nick inválido — só letras e espaços."; return; }
  if (!convite) { erroEl.textContent = "Informe o código de convite."; return; }
  if (!document.getElementById("cadAceiteTermos")?.checked) {
    erroEl.textContent = "Você precisa aceitar os Termos de Uso para criar a conta."; return;
  }

  // Valida código via Edge Function (não expõe a lista de convites)
  let roleDetectada = "cliente";
  try {
    const vres = await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY
      },
      body: JSON.stringify({ acao: "validar_convite", dados: { codigo: convite } })
    });
    const vdata = await vres.json();
    if (!vdata.valido) {
      erroEl.textContent = "Código de convite inválido ou já usado."; return;
    }
    roleDetectada = vdata.role || "cliente";
  } catch (e) {
    erroEl.textContent = "Erro ao validar o convite. Tente novamente."; return;
  }

  const { data, error } = await _supa.auth.signUp({
    email, password: senha,
    options: { data: { nick, role: roleDetectada } }
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("rate limit") || msg.includes("email rate") || msg.includes("over_email_send_rate") || error.status === 429) {
      erroEl.innerHTML = "⏳ Limite de cadastros atingido no momento. Por segurança, o sistema permite poucas contas novas por hora.<br><br>Aguarde cerca de <b>1 hora</b> e tente novamente, ou fale com um <b>admin</b> para liberar seu acesso.";
    } else if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already")) {
      erroEl.textContent = "Este e-mail já está cadastrado. Tente fazer login ou use 'Esqueceu a senha?'.";
    } else if (msg.includes("password") && (msg.includes("least") || msg.includes("weak") || msg.includes("short"))) {
      erroEl.textContent = "Senha muito curta. Use pelo menos 6 caracteres.";
    } else if (msg.includes("invalid") && msg.includes("email")) {
      erroEl.textContent = "E-mail inválido. Verifique e tente novamente.";
    } else {
      erroEl.textContent = error.message;
    }
    return;
  }

  // Marca convite como usado via Edge Function (não precisa ler a lista)
  try {
    await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY
      },
      body: JSON.stringify({ acao: "marcar_convite_usado", dados: { codigo: convite } })
    });
  } catch(e) { console.warn("Erro ao marcar convite como usado:", e); }

  document.getElementById("modalAuth").style.display = "none";
  if (roleDetectada === "serviceiro") {
    mostrarMensagem("⚔️ Cadastro de serviceiro enviado! Aguarde aprovação do admin.", "sucesso");
  } else {
    mostrarMensagem("✅ Conta criada com sucesso! Já pode fazer login.", "sucesso");
  }
});

// ── Preview do tipo ao digitar o código ──
let _conviteTipoTimer = null;
document.getElementById("cadConvite")?.addEventListener("input", (e) => {
  const codigo  = e.target.value.trim().toUpperCase();
  const tipoEl  = document.getElementById("cadConviteTipo");
  if (!tipoEl) return;
  if (codigo.length < 4) { tipoEl.textContent = ""; return; }

  clearTimeout(_conviteTipoTimer);
  _conviteTipoTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY },
        body: JSON.stringify({ acao: "validar_convite", dados: { codigo } })
      });
      const data = await res.json();
      if (!data.valido) {
        tipoEl.textContent = "❌ Código inválido ou já usado";
        tipoEl.style.color = "#e05a3a";
      } else {
        const role = data.role || "cliente";
        tipoEl.textContent = role === "serviceiro" ? "✅ Código de Serviceiro" : "✅ Código de Cliente";
        tipoEl.style.color = role === "serviceiro" ? "#a855f7" : "#4caf6e";
      }
    } catch (err) { tipoEl.textContent = ""; }
  }, 500);
});

// ── Esqueceu a senha ──
document.getElementById("btnEsqueceuSenha").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const erroEl = document.getElementById("loginErro");

  if (!email) {
    erroEl.textContent = "Digite seu email acima primeiro.";
    erroEl.style.color = "#e05a3a";
    document.getElementById("loginEmail").focus();
    return;
  }

  const { error } = await _supa.auth.resetPasswordForEmail(email, {
    redirectTo: "https://www.fatal-services.com.br"
  });

  if (error) {
    erroEl.textContent = "Erro ao enviar email. Tente novamente.";
    erroEl.style.color = "#e05a3a";
  } else {
    erroEl.textContent = "✅ Email de recuperação enviado! Verifique sua caixa de entrada.";
    erroEl.style.color = "#4caf6e";
    document.getElementById("modalAuth").style.display = "none";
    mostrarMensagem("📧 Email de recuperação enviado para " + email, "sucesso");
  }
});

// ── Logout ──
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await _supa.auth.signOut();
  mostrarMensagem("Saiu da conta.", "sucesso");
});

// ── Escuta mudanças de sessão ──
let inicializacaoConcluida = false;
let aplicandoSessao = false; // evita chamadas simultâneas

_supa.auth.onAuthStateChange(async (event, session) => {
  console.log("Auth event:", event);
  // Ignora SIGNED_OUT durante inicialização (falso positivo do refresh)
  if (!inicializacaoConcluida && event === "SIGNED_OUT") return;
  if (aplicandoSessao) return;
  aplicandoSessao = true;
  try {
    await aplicarSessao(session, event);
  } finally {
    aplicandoSessao = false;
  }
});

// ── Pré-preenche nick ao focar no formulário ──
document.getElementById("formAgendamento")?.addEventListener("focusin", () => {
  const nomeEl = document.getElementById("nome");
  if (nomeEl && !nomeEl.value && perfilAtual?.nick) {
    nomeEl.value = perfilAtual.nick;
  }
});

// ── Banner global de modo evento (visível para todos) ──
function aplicarAvisoEvento() {
  const banner = document.getElementById("bannerEvento");
  if (!banner) return;
  if (cfgAtual.precos?.modo_evento) {
    const ev = parseFloat(cfgAtual.precos?.evento || 0);
    banner.innerHTML = `🎉 <b>Dia de evento ativo!</b> Todos os serviços estão com o valor de evento${ev ? `: ${fmtBRL(ev)}/hora` : ""}.`;
    banner.style.display = "block";
  } else {
    banner.style.display = "none";
  }
}

// ── Estimativa de valor ao vivo no formulário ──
function atualizarEstimativa() {
  const box = document.getElementById("estimativaBox");
  if (!box) return;
  const ini = document.getElementById("horaInicio").value;
  const fim = document.getElementById("horaFim").value;
  if (!ini || !fim || fim <= ini) { box.style.display = "none"; return; }

  const [hI, mI] = ini.split(":").map(Number);
  const [hF, mF] = fim.split(":").map(Number);
  const minutos = (hF*60 + mF) - (hI*60 + mI);
  if (minutos <= 0) { box.style.display = "none"; return; }
  const horas = minutos / 60;

  const precoNormal = parseFloat(cfgAtual.precos?.normal || 0);
  const precoEvento = parseFloat(cfgAtual.precos?.evento || 0);
  const eventoAtivo = !!cfgAtual.precos?.modo_evento;
  const precoVigente = (eventoAtivo && precoEvento) ? precoEvento : precoNormal;
  const totalVigente = precoVigente * horas;

  const hTxt = horas % 1 === 0 ? `${horas}h` : `${Math.floor(horas)}h${Math.round((horas%1)*60)}min`;
  let html;
  if (eventoAtivo && precoEvento) {
    html = `🎉 <b>Dia de evento!</b> ${hTxt} × ${fmtBRL(precoVigente)}/h = <b style="color:#e0a23a">${fmtBRL(totalVigente)}</b>`;
  } else {
    html = `💰 <b>Estimativa:</b> ${hTxt} × ${fmtBRL(precoVigente)}/h = <b style="color:#c9a84c">${fmtBRL(totalVigente)}</b>`;
    if (precoEvento && precoEvento !== precoNormal) {
      html += `<br><span style="font-size:12px;color:rgba(232,223,192,0.55)">Em dia de evento: ${fmtBRL(precoEvento * horas)}</span>`;
    }
  }
  html += `<br><span style="font-size:11px;color:rgba(232,223,192,0.45)">Valor base estimado. O serviceiro confirma o total ao concluir.</span>`;
  box.innerHTML = html;
  box.style.display = "block";
}

["horaInicio", "horaFim", "tipo"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", atualizarEstimativa);
  document.getElementById(id)?.addEventListener("input", atualizarEstimativa);
});

// ── Sugere serviceiros alternativos disponíveis no mesmo horário ──
async function acharServiceirosAlternativos(vocacao, excluir, inicio, fim) {
  const fonte = Object.keys(cfgAtual.serviceiros || {}).length > 0 ? cfgAtual.serviceiros : SERVICEIROS;
  const candidatos = (fonte[vocacao] || []).filter(n => n !== excluir);
  if (candidatos.length === 0) return [];

  const diasPT = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const diaSemana = diasPT[inicio.getDay()];
  const iniMin = inicio.getHours() * 60 + inicio.getMinutes();
  const fimMin = fim.getHours() * 60 + fim.getMinutes();

  const disponiveis = [];
  for (const nome of candidatos) {
    const horarios = horariosCache.filter(h => h.serviceiro === nome && h.ativo &&
      (h.dia_semana === diaSemana || h.dia_semana === "Todos os dias"));
    let cobre = horarios.length === 0; // sem horários = sem restrição
    if (!cobre) {
      cobre = horarios.some(h => {
        const [hI,mI] = h.hora_inicio.split(":").map(Number);
        const [hF,mF] = h.hora_fim.split(":").map(Number);
        return iniMin >= (hI*60+mI) && fimMin <= (hF*60+mF);
      });
    }
    if (!cobre) continue;

    const conflito = await supaGet("agendamentos",
      `serviceiro=eq.${encodeURIComponent(nome)}&inicio=lte.${fim.toISOString()}&fim=gte.${inicio.toISOString()}&status=in.(pendente,aprovado,em_andamento)`
    );
    if (conflito.length === 0) disponiveis.push(nome);
  }
  return disponiveis;
}

function mostrarAlternativas(alternativas, vocacao) {
  const box = document.getElementById("alternativasBox");
  if (!box) return;
  if (!alternativas.length) {
    box.style.display = "block";
    box.innerHTML = `<p style="margin:0">😕 Nenhum outro ${vocacao} disponível neste horário. Tente outro dia/horário ou veja a aba Serviceiros.</p>`;
    return;
  }
  box.style.display = "block";
  box.innerHTML = `
    <p style="margin:0 0 8px"><b>✨ Disponíveis neste horário:</b> toque para selecionar</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${alternativas.map(n => `<button type="button" class="btn-alternativa" data-serv="${n}">⚔️ ${n}</button>`).join("")}
    </div>`;
  box.querySelectorAll(".btn-alternativa").forEach(btn => {
    btn.addEventListener("click", () => {
      const sel = document.getElementById("serviceiro");
      if (![...sel.options].some(o => o.value === btn.dataset.serv)) {
        const opt = document.createElement("option");
        opt.value = btn.dataset.serv; opt.textContent = btn.dataset.serv;
        sel.appendChild(opt);
      }
      sel.value = btn.dataset.serv;
      box.style.display = "none";
      mostrarMensagem(`✅ Serviceiro alterado para ${btn.dataset.serv}. Clique em Agendar novamente.`, "sucesso");
    });
  });
}

// ── Formulário de agendamento ─────────────
document.getElementById("formAgendamento").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!tipoUsuario) { mostrarMensagem("⚠️ Faça login primeiro.", "erro"); return; }

  const nome_cliente = limitarTexto(document.getElementById("nome").value, 50);
  const data         = document.getElementById("data").value;
  const horaInicio   = document.getElementById("horaInicio").value;
  const horaFim      = document.getElementById("horaFim").value;
  const tipo         = document.getElementById("tipo").value;
  const huntSelect    = document.getElementById("hunt").value;
  const huntCustomVal = limitarTexto(document.getElementById("huntCustom").value, 60);
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
        `⚠️ ${serviceiro} não está disponível na ${diaSemana}. Veja alternativas abaixo ou consulte a aba Serviceiros.`,
        "erro"
      );
      const alt = await acharServiceirosAlternativos(vocacao, serviceiro, inicio, fim);
      mostrarAlternativas(alt, vocacao);
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
      const alt = await acharServiceirosAlternativos(vocacao, serviceiro, inicio, fim);
      mostrarAlternativas(alt, vocacao);
      return;
    }
  }

  // Risco 3: Limite de agendamentos pendentes por cliente (anti-abuso)
  const pendentesCliente = await supaGet("agendamentos",
    `nome_cliente=eq.${encodeURIComponent(nome_cliente)}&status=eq.pendente`
  );
  if (pendentesCliente.length >= 2) {
    mostrarMensagem(`⚠️ Você já tem ${pendentesCliente.length} agendamento(s) aguardando aprovação. Aguarde a aprovação antes de criar novos.`, "erro"); return;
  }

  // Verifica conflito — bloqueia se já tem pendente ou aprovado no horário
  const existentes = await supaGet("agendamentos",
    `serviceiro=eq.${encodeURIComponent(serviceiro)}&inicio=lte.${fim.toISOString()}&fim=gte.${inicio.toISOString()}&status=in.(pendente,aprovado)`
  );
  if (existentes.length > 0) {
    const status = existentes[0].status === "pendente" ? "aguardando aprovação" : "já agendado";
    mostrarMensagem(`⚠️ ${serviceiro} já tem um serviço ${status} neste horário. Veja quem está livre abaixo.`, "erro");
    const alt = await acharServiceirosAlternativos(vocacao, serviceiro, inicio, fim);
    mostrarAlternativas(alt, vocacao);
    return;
  }

  // Gera número de chamado atômico via função do Supabase (evita race condition)
  let numeroChamado = 1;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/gerar_numero_chamado`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    numeroChamado = await res.json();
  } catch(e) {
    // Fallback: usa MAX + 1 se a função falhar
    const ultimo = await supaGet("agendamentos", "numero_chamado=not.is.null&order=numero_chamado.desc&limit=1");
    numeroChamado = ultimo.length > 0 ? (ultimo[0].numero_chamado + 1) : 1;
  }

  // Salva no Supabase com status pendente e número de chamado
  try {
    await supaPost("agendamentos", {
      nome_cliente, serviceiro, vocacao, tipo, hunt,
      inicio: inicio.toISOString(), fim: fim.toISOString(),
      status: "pendente",
      numero_chamado: numeroChamado
    });
  } catch (err) {
    mostrarMensagem(`❌ Não foi possível criar o agendamento: ${err.message}`, "erro");
    console.error("Erro ao salvar agendamento:", err);
    return;
  }

  // Não adiciona ao calendário — só aparece após aprovação
  verificarDisponibilidade(dataFiltroEl.value);
  // Mostra modal com o número do chamado
  mostrarModalChamado(numeroChamado);
  e.target.reset();
  const altBox = document.getElementById("alternativasBox");
  if (altBox) altBox.style.display = "none";
  const estBox = document.getElementById("estimativaBox");
  if (estBox) estBox.style.display = "none";
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
  await adminAction("update", "contatos", id, { whats, pix, discord });
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
    // Ajusta subtítulo e botão conforme o papel
    const subtitulo = document.getElementById("pgSubtitulo");
    const btnNovo   = document.getElementById("btnNovoPagamento");
    if (subtitulo) {
      if (tipoUsuario === "admin")           subtitulo.textContent = "Todos os pagamentos da guild.";
      else if (tipoUsuario === "serviceiro") subtitulo.textContent = "Pagamentos dos seus chamados.";
      else if (tipoUsuario === "cliente")    subtitulo.textContent = "Seus comprovantes enviados.";
      else                                   subtitulo.textContent = "";
    }
    // Serviceiro só consulta (não registra pagamento)
    if (btnNovo) btnNovo.style.display = (tipoUsuario === "serviceiro") ? "none" : "";

    const todosPags = await supaGet("pagamentos", "order=criado_em.desc");

    // Filtra por papel:
    // - admin: vê tudo
    // - serviceiro: vê pagamentos dos chamados dele (campo serviceiro)
    // - cliente: vê apenas os próprios pagamentos (campo nome = seu nick)
    let pags = todosPags;
    if (tipoUsuario === "serviceiro") {
      const nomeServ = perfilAtual?.serviceiro_nome || perfilAtual?.nick || "";
      pags = todosPags.filter(p => (p.serviceiro || "") === nomeServ);
    } else if (tipoUsuario === "cliente") {
      const meuNick = (perfilAtual?.nick || "").toLowerCase();
      pags = todosPags.filter(p => (p.nome || "").toLowerCase() === meuNick);
    }

    const cobrancas = pags.filter(p => p.status === "cobranca");
    const analise   = pags.filter(p => p.status === "analise");
    const aprovados = pags.filter(p => p.status === "aprovado");
    const recusados = pags.filter(p => p.status === "recusado");

    // Resumo financeiro (serviceiro vê dos chamados dele; admin vê geral)
    const resumoEl = document.getElementById("pgResumo");
    if (resumoEl && (tipoUsuario === "serviceiro" || tipoUsuario === "admin")) {
      const soma = arr => arr.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
      const totalRecebido = soma(aprovados);
      const totalPendente = soma(analise);
      resumoEl.style.display = "grid";
      resumoEl.innerHTML = `
        <div class="dash-metrica">
          <div class="dm-label">💰 Recebido (aprovado)</div>
          <div class="dm-valor" style="color:#4caf6e">R$ ${totalRecebido.toFixed(2)}</div>
        </div>
        <div class="dash-metrica">
          <div class="dm-label">🕐 Pendente (em análise)</div>
          <div class="dm-valor" style="color:#f0c040">R$ ${totalPendente.toFixed(2)}</div>
        </div>
        <div class="dash-metrica">
          <div class="dm-label">📊 Pagamentos recebidos</div>
          <div class="dm-valor">${aprovados.length}</div>
        </div>`;
    } else if (resumoEl) {
      resumoEl.style.display = "none";
    }

    function cardHTML(p) {
      const isAdmin = tipoUsuario === "admin";
      const isServiceiro = tipoUsuario === "serviceiro";
      // Admin vê todos os comprovantes; serviceiro vê os dos próprios chamados; cliente não vê.
      const podeVerComprovante = isAdmin || isServiceiro;
      const imgHTML = (podeVerComprovante && p.comprovante_url)
        ? `<a href="${p.comprovante_url}" target="_blank" class="pg-comprovante">🖼️ Ver comprovante</a>`
        : "";
      const acoes = ((isAdmin || isServiceiro) && p.status === "analise") ? `
        <div class="pg-acoes">
          <button class="btn-aprovar" data-id="${p.id}">✅ Aprovar</button>
          <button class="btn-recusar" data-id="${p.id}">❌ Recusar</button>
        </div>` : "";
      // Botão "Pagar" para o cliente nas cobranças
      const isCliente = tipoUsuario === "cliente";
      const btnPagar = (isCliente && p.status === "cobranca") ? `
        <button class="btn-gold" style="width:100%;margin-top:8px" data-pagar="${p.id}">💳 Pagar agora</button>` : "";
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
          ${btnPagar}
          ${btnExcluir}
        </div>`;
    }

    document.getElementById("listaCobranca").innerHTML  = cobrancas.length ? cobrancas.map(cardHTML).join("") : '<div class="vazio-msg">Nada a pagar</div>';
    document.getElementById("listaAnalise").innerHTML   = analise.length   ? analise.map(cardHTML).join("")   : '<div class="vazio-msg">Nenhum pagamento</div>';
    document.getElementById("listaAprovados").innerHTML = aprovados.length ? aprovados.map(cardHTML).join("") : '<div class="vazio-msg">Nenhum aprovado</div>';
    document.getElementById("listaRecusados").innerHTML = recusados.length ? recusados.map(cardHTML).join("") : '<div class="vazio-msg">Nenhum recusado</div>';

    // Botão "Pagar" nas cobranças (cliente)
    document.querySelectorAll("[data-pagar]").forEach(btn =>
      btn.addEventListener("click", () => abrirPagamentoCobranca(btn.dataset.pagar)));

    document.querySelectorAll(".btn-aprovar").forEach(btn =>
      btn.addEventListener("click", () => alterarStatusPagamento(btn.dataset.id, "aprovado")));
    document.querySelectorAll(".btn-recusar[data-id]").forEach(btn =>
      btn.addEventListener("click", () => alterarStatusPagamento(btn.dataset.id, "recusado")));
    document.querySelectorAll("[data-excluir]").forEach(btn =>
      btn.addEventListener("click", async () => {
        if (confirm("Excluir este pagamento?")) {
          await adminAction("delete", "pagamentos", btn.dataset.excluir);
          renderizarPagamentos();
          mostrarMensagem("🗑️ Pagamento excluído!", "sucesso");
        }
      }));

  } catch(e) {
    console.error("Erro ao carregar pagamentos:", e);
  }
}

// Cliente paga uma cobrança: anexa comprovante e move de "cobranca" para "analise"
async function abrirPagamentoCobranca(pagamentoId) {
  const antigo = document.getElementById("modalPagar");
  if (antigo) antigo.remove();

  const modal = document.createElement("div");
  modal.id = "modalPagar";
  modal.className = "modal";
  modal.style.display = "flex";
  modal.innerHTML = `
    <div class="modal-conteudo" style="max-width:420px">
      <h3 style="font-family:Cinzel,serif;color:var(--gold);margin:0 0 12px">💳 Confirmar pagamento</h3>
      <p style="font-size:13px;color:rgba(232,223,192,0.7);margin:0 0 14px">Faça o Pix do valor combinado e anexe o comprovante abaixo. O serviceiro vai confirmar o recebimento.</p>
      <label style="font-size:12px;color:rgba(232,223,192,0.7);font-family:Cinzel,serif">📎 Comprovante do Pix</label>
      <input type="file" id="pagComprovante" accept="image/*" style="width:100%;margin:4px 0 12px">
      <div style="display:flex;gap:8px">
        <button id="pagConfirmar" class="btn-gold" style="flex:1">Enviar comprovante</button>
        <button id="pagCancelar" class="btn-cancelar">Cancelar</button>
      </div>
      <p id="pagErro" style="color:#e05a3a;font-size:12px;margin:8px 0 0;min-height:14px"></p>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("pagCancelar").onclick = () => modal.remove();

  document.getElementById("pagConfirmar").onclick = async () => {
    const erroEl = document.getElementById("pagErro");
    const btn    = document.getElementById("pagConfirmar");
    const file   = document.getElementById("pagComprovante").files[0];
    if (!file) { erroEl.textContent = "Anexe o comprovante."; return; }
    if (!file.type.startsWith("image/")) { erroEl.textContent = "O comprovante precisa ser uma imagem."; return; }
    if (file.size > 5 * 1024 * 1024) { erroEl.textContent = "Imagem muito grande (máx. 5MB)."; return; }

    btn.disabled = true; btn.textContent = "⏳ Enviando...";
    try {
      const ext  = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `comprovante_${pagamentoId}_${Date.now()}.${ext}`;
      const url  = await supaUpload("comprovantes", path, file);
      // Atualiza a cobrança: vira "analise" com o comprovante (valida dono na Edge Function)
      await supaAction("cliente_pagar", "pagamentos", pagamentoId, { comprovante_url: url });
      modal.remove();
      mostrarMensagem("📤 Comprovante enviado! Aguarde a confirmação do serviceiro.", "sucesso");
      renderizarPagamentos();
    } catch (e) {
      btn.disabled = false; btn.textContent = "Enviar comprovante";
      erroEl.textContent = "Erro: " + e.message;
    }
  };
}

async function alterarStatusPagamento(id, novoStatus) {
  try {
    if (tipoUsuario === "admin") {
      await adminAction("update", "pagamentos", id, { status: novoStatus });
    } else {
      // serviceiro: aprova/recusa só pagamento de chamado dele (validado na Edge Function)
      await supaAction("serviceiro_update_pag", "pagamentos", id, { status: novoStatus });
    }
    renderizarPagamentos();
    mostrarMensagem(novoStatus === "aprovado" ? "✅ Pagamento aprovado!" : "❌ Pagamento recusado!",
      novoStatus === "aprovado" ? "sucesso" : "erro");
  } catch (e) {
    mostrarMensagem(`❌ Erro: ${e.message}`, "erro");
    console.error("alterarStatusPagamento:", e);
  }
}

document.getElementById("btnNovoPagamento").addEventListener("click", () => {
  const form = document.getElementById("formPagamento");
  // Pré-preenche o nome com o nick do cliente (garante que o pagamento aparece pra ele depois)
  const pgNomeEl = document.getElementById("pgNome");
  if (pgNomeEl && perfilAtual?.nick && tipoUsuario === "cliente") {
    pgNomeEl.value = perfilAtual.nick;
    pgNomeEl.readOnly = true;
    pgNomeEl.style.opacity = "0.7";
  }
  form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("btnEnviarPagamento").addEventListener("click", async () => {
  const nome        = document.getElementById("pgNome").value.trim();
  const serviceiro  = document.getElementById("pgServiceiro").value;
  const numChamado  = document.getElementById("pgNumeroChamado").value.trim();
  const data        = document.getElementById("pgData").value;
  const valor       = document.getElementById("pgValor").value;
  const obs         = limitarTexto(document.getElementById("pgObs").value, 300);
  const arquivo     = document.getElementById("pgArquivo").files[0];

  if (!nome || !serviceiro || !data || !valor || !arquivo) {
    mostrarMensagem("⚠️ Preencha todos os campos obrigatórios e anexe o comprovante.", "erro"); return;
  }

  // Valida nome
  const nomeRegexPg = /^[a-zA-ZÀ-ÿ ]+$/;
  if (!nomeRegexPg.test(nome)) {
    document.getElementById("pgNome").classList.add("campo-invalido");
    mostrarMensagem("⚠️ Nome inválido! Use apenas seu nick real (ex: Fear Popstar). Sem números ou símbolos.", "erro");
    return;
  }

  // Número do chamado agora é obrigatório: o pagamento só é liberado para
  // chamados que o serviceiro já aceitou (status a partir de "aprovado").
  if (!numChamado) {
    mostrarMensagem("⚠️ Informe o número do chamado. O pagamento só pode ser enviado para um chamado aceito pelo serviceiro.", "erro");
    return;
  }

  let agendamento_id = null;
  {
    const chamados = await supaGet("agendamentos",
      `numero_chamado=eq.${numChamado}&nome_cliente=ilike.${encodeURIComponent(nome)}`
    );
    if (chamados.length === 0) {
      mostrarMensagem(`⚠️ Chamado #${numChamado} não encontrado para o nick "${nome}". Verifique os dados.`, "erro"); return;
    }
    if (chamados[0].serviceiro !== serviceiro) {
      mostrarMensagem(`⚠️ O chamado #${numChamado} pertence ao serviceiro ${chamados[0].serviceiro}, não a ${serviceiro}.`, "erro"); return;
    }

    // Regra de fluxo: só permite pagar a partir de "aprovado"
    const statusOk = ["aprovado", "em_andamento", "concluido", "encerrado"];
    const st = chamados[0].status;
    if (!statusOk.includes(st)) {
      const motivo = (st === "pendente")
        ? "ainda não foi aceito pelo serviceiro"
        : `está com status "${STATUS_LABELS[st] || st}"`;
      mostrarMensagem(`⚠️ O chamado #${numChamado} ${motivo}. O pagamento só pode ser enviado após o serviceiro aceitar o serviço.`, "erro");
      return;
    }

    agendamento_id = chamados[0].id;
  }

  mostrarMensagem("⏳ Enviando comprovante...", "sucesso");

  // Validação anti-abuso: só imagem, máx 5MB
  if (!arquivo.type.startsWith("image/")) {
    mostrarMensagem("⚠️ O comprovante precisa ser uma imagem (jpg, png, webp).", "erro"); return;
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    mostrarMensagem("⚠️ Imagem muito grande (máximo 5MB).", "erro"); return;
  }

  const ext  = arquivo.name.split(".").pop();
  const path = `${Date.now()}_${nome.replace(/[^a-zA-Z0-9]/g,"_")}.${ext}`;
  let comprovante_url = "";

  try {
    comprovante_url = await supaUpload("comprovantes", path, arquivo);
  } catch(e) {
    mostrarMensagem("⚠️ Erro no upload do comprovante.", "erro"); return;
  }

  await supaPost("pagamentos", {
    nome, serviceiro, data, valor: parseFloat(valor), obs,
    comprovante_url, status: "analise",
    ...(agendamento_id ? { agendamento_id } : {})
  });
  renderizarPagamentos();
  mostrarMensagem("📤 Pagamento enviado para análise!", "sucesso");
  document.getElementById("formPagamento").style.display = "none";
  ["pgNome","pgServiceiro","pgNumeroChamado","pgData","pgValor","pgObs"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
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

// ── Agrupa uma lista de agendamentos por mês, em blocos recolhíveis ──
function agruparPorMesHTML(itens, campoData, renderCard) {
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const grupos = {};
  itens.forEach(ag => {
    const d = new Date(ag[campoData] || ag.inicio || ag.criado_em);
    const chave = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`;
    (grupos[chave] = grupos[chave] || []).push(ag);
  });
  const chaves = Object.keys(grupos).sort((a,b) => b.localeCompare(a));

  return chaves.map((chave, idx) => {
    const [ano, mes] = chave.split("-");
    const titulo = `${MESES[parseInt(mes)]} ${ano}`;
    const cards  = grupos[chave].map(renderCard).join("");
    const aberto = idx === 0 ? "open" : "";
    return `
      <details class="grupo-mes" ${aberto}>
        <summary class="grupo-mes-titulo">
          <span>📅 ${titulo}</span>
          <span class="grupo-mes-contagem">${grupos[chave].length}</span>
        </summary>
        <div class="grupo-mes-conteudo">${cards}</div>
      </details>`;
  }).join("");
}

const STATUS_ICONS = {
  pendente:     "⏳",
  aprovado:     "✅",
  em_andamento: "⚔️",
  concluido:    "🏆",
  recusado:     "❌",
  encerrado:    "🛑",
  cancelado:    "🚫",
  expirado:     "⏰"
};

const STATUS_LABELS = {
  pendente:     "Pendente",
  aprovado:     "Aprovado",
  em_andamento: "Em andamento",
  concluido:    "Concluído",
  recusado:     "Recusado",
  encerrado:    "Encerrado",
  cancelado:    "Cancelado",
  expirado:     "Expirado"
};

let abaAgAtual = "pendente";

// ── Helpers de detalhes do serviço (Entrega 1) ──

// Duração real em ms: de iniciado_em até finalizado_em; cai para o previsto se faltar.
function duracaoMs(ag) {
  const ini = ag.iniciado_em ? new Date(ag.iniciado_em) : new Date(ag.inicio);
  const fim = ag.finalizado_em ? new Date(ag.finalizado_em) : new Date(ag.fim);
  const d = fim - ini;
  return d > 0 ? d : 0;
}

function fmtDuracao(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

// Valor calculado: horas reais × preço/hora. Usa o preço de evento quando o
// modo evento global está ativo; senão, o preço normal.
function valorCalculado(ag) {
  const eventoAtivo = !!cfgAtual.precos?.modo_evento;
  const precoHora = (eventoAtivo && cfgAtual.precos?.evento)
    ? parseFloat(cfgAtual.precos.evento || 0)
    : parseFloat(cfgAtual.precos?.normal || 0);
  const horas = duracaoMs(ag) / 3600000;
  return precoHora * horas;
}

const fmtBRL = (v) => `R$ ${(Number(v) || 0).toFixed(2).replace(".", ",")}`;

// Monta a timeline (etapas com horário) a partir dos timestamps do chamado.
function timelineHTML(ag) {
  const etapas = [];
  if (ag.criado_em)     etapas.push(["📝", "Criado", ag.criado_em]);
  if (ag.iniciado_em)   etapas.push(["⚔️", "Iniciado", ag.iniciado_em]);
  if (ag.finalizado_em) {
    const rotulo = ag.status === "encerrado" ? "Encerrado" : "Concluído";
    etapas.push([STATUS_ICONS[ag.status] || "🏆", rotulo, ag.finalizado_em]);
  }
  if (etapas.length === 0) return "";
  const fmt = (d) => new Date(d).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
  return `
    <div class="timeline">
      ${etapas.map(([ic, label, ts]) => `
        <div class="tl-item">
          <span class="tl-ic">${ic}</span>
          <span class="tl-label">${label}</span>
          <span class="tl-ts">${fmt(ts)}</span>
        </div>`).join("")}
    </div>`;
}

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
    const query = status === "todos"
      ? "arquivado=not.is.true&order=inicio.desc"
      : `status=eq.${status}&arquivado=not.is.true&order=inicio.asc`;
    const ags = await supaGet("agendamentos", query);
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
      const rotulo = status === "todos" ? "Todos" : (STATUS_LABELS[status] || status);
      container.innerHTML = `<p style="color:rgba(232,223,192,0.4);font-size:13px;padding:8px 0">Nenhum agendamento${status === "todos" ? "." : ` com status "${rotulo}".`}</p>`;
      return;
    }

    container.innerHTML = agruparPorMesHTML(ags, "inicio", ag => {
      const acoes    = gerarAcoesAdmin(ag);
      const numChamado = ag.numero_chamado ? `<span class="ag-chamado">#${ag.numero_chamado}</span>` : '';
      const expirado = new Date(ag.fim) < new Date();
      const st       = ag.status; // usa o status real do agendamento (importante na aba "Todos")
      return `
        <div class="agendamento-card ${st}" style="${expirado ? 'border-left:3px solid #e05a3a;opacity:0.85' : ''}">
          <div class="ag-header">
            <span class="ag-nome">${numChamado} ${ag.nome_cliente} ${expirado ? '<span style="font-size:10px;color:#e05a3a;font-family:Cinzel,serif">⏰ EXPIRADO</span>' : ''}</span>
            <span class="ag-status-badge">${STATUS_ICONS[st]} ${STATUS_LABELS[st]}</span>
          </div>
          <div class="ag-info">
            <span>⚔️ ${ag.serviceiro} (${ag.vocacao})</span>
            <span>🗺️ ${ag.hunt} · ${ag.tipo}</span>
            <span>📅 ${new Date(ag.inicio).toLocaleString("pt-BR")} → ${new Date(ag.fim).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}</span>
            ${ag.obs_conclusao ? `<span style="color:rgba(76,175,110,0.8);font-style:italic">📝 ${ag.obs_conclusao}</span>` : ""}
          </div>
          ${acoes}
        </div>`;
    });

    // Botões
    container.querySelectorAll(".btn-aprovar[data-ag-id]").forEach(btn => {
      btn.addEventListener("click", () => aprovarAgendamento(btn.dataset.agId, ags));
    });
    container.querySelectorAll("[data-ag-recusar]").forEach(btn => {
      const ag = ags.find(a => a.id === btn.dataset.agRecusar);
      btn.addEventListener("click", () => recusarAgendamento(btn.dataset.agRecusar, ag?.status || "pendente"));
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
  const agora  = new Date();
  const inicio = new Date(ag.inicio);
  const fim    = new Date(ag.fim);

  if (ag.status === "pendente") {
    return `<div class="pg-acoes">
      <button class="btn-aprovar"  data-ag-id="${ag.id}">✅ Aprovar</button>
      <button class="btn-recusar"  data-ag-recusar="${ag.id}">❌ Recusar</button>
    </div>`;
  }

  if (ag.status === "aprovado") {
    const podeInic  = agora >= inicio;
    const titleInic = podeInic ? "" : `title="Disponível a partir de ${inicio.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}"`;
    return `<div class="pg-acoes">
      <button class="btn-andamento${podeInic ? "" : " btn-concluir-bloqueado"}" data-ag-andamento="${ag.id}" ${titleInic}>
        ⚔️ ${podeInic ? "Iniciar serviço" : "Aguardando data/hora"}
      </button>
      <button class="btn-encerrar" data-ag-encerrar="${ag.id}">🛑 Encerrar</button>
      <button class="btn-recusar"  data-ag-recusar="${ag.id}">🚫 Cancelar</button>
    </div>`;
  }

  if (ag.status === "em_andamento") {
    const podeConc  = agora >= fim;
    const titleConc = podeConc ? "" : `title="Disponível após ${fim.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}"`;
    return `<div class="pg-acoes">
      <button class="btn-concluir${podeConc ? "" : " btn-concluir-bloqueado"}" data-ag-concluir="${ag.id}" ${titleConc}>
        🏆 ${podeConc ? "Marcar concluído" : "Aguardando horário de fim"}
      </button>
      <button class="btn-encerrar" data-ag-encerrar="${ag.id}">🛑 Encerrar antecipadamente</button>
    </div>`;
  }
  return "";
}

// Atualiza um agendamento usando o caminho certo conforme o papel:
// admin → adminAction (senha admin); serviceiro → supaAction com validação por JWT.
async function updateAgendamento(id, dados) {
  if (tipoUsuario === "admin") {
    // Admin grava os mesmos timestamps reais (a Edge Function já faz isso no caminho do serviceiro)
    const extra = {};
    if (dados.status === "em_andamento") extra.iniciado_em = new Date().toISOString();
    if (dados.status === "concluido" || dados.status === "encerrado") extra.finalizado_em = new Date().toISOString();
    return adminAction("update", "agendamentos", id, { ...dados, ...extra });
  }
  return supaAction("serviceiro_update_ag", "agendamentos", id, dados);
}

async function aprovarAgendamento(id, lista) {
  try {
    await updateAgendamento(id, { status: "aprovado" });
    const ag = lista.find(a => a.id === id);

    if (tipoUsuario === "admin") {
      if (ag && typeof calendar !== "undefined" && calendar) {
        calendar.addEvent({
          id, title: `#${ag.numero_chamado} ${ag.serviceiro} → ${ag.nome_cliente} (${ag.hunt})`,
          start: ag.inicio, end: ag.fim, color: "#9333ea",
          extendedProps: { id, nome_cliente: ag.nome_cliente, serviceiro: ag.serviceiro, vocacao: ag.vocacao, tipo: ag.tipo, hunt: ag.hunt, status: "aprovado", numero_chamado: ag.numero_chamado }
        });
      }
      mostrarMensagem(`✅ Agendamento aprovado! Chamado #${ag?.numero_chamado} confirmado.`, "sucesso");
      carregarAgendamentosPendentes(abaAgAtual);
      if (dataFiltroEl) verificarDisponibilidade(dataFiltroEl.value);
    } else {
      // Serviceiro: apenas recarrega o próprio painel
      mostrarMensagem(`✅ Chamado #${ag?.numero_chamado} aceito!`, "sucesso");
      carregarMeusAgendamentos("pendente");
    }
  } catch (e) {
    mostrarMensagem(`❌ Erro ao aceitar: ${e.message}`, "erro");
    console.error("aprovarAgendamento:", e);
  }
}

async function recusarAgendamento(id, statusAtual) {
  const eCancelamento = statusAtual === "aprovado" || statusAtual === "em_andamento";
  const label = eCancelamento ? "cancelamento" : "recusa";

  const motivo = prompt(`Motivo do ${label} (obrigatório):`);
  if (!motivo || motivo.trim() === "") {
    mostrarMensagem(`⚠️ Informe o motivo do ${label}.`, "erro");
    return;
  }

  const novoStatus = eCancelamento ? "cancelado" : "recusado";
  const icone      = eCancelamento ? "🚫" : "❌";
  const obs        = `${icone} ${eCancelamento ? "Cancelado" : "Recusado"}: ${motivo.trim()}`;

  try {
    await updateAgendamento(id, { status: novoStatus, obs_conclusao: obs });
    if (typeof calendar !== "undefined" && calendar) {
      const ev = calendar.getEventById(id);
      if (ev) ev.remove();
    }
    mostrarMensagem(`${icone} Agendamento ${novoStatus}.`, "erro");
    if (tipoUsuario === "admin") {
      carregarAgendamentosPendentes(abaAgAtual);
      if (dataFiltroEl) verificarDisponibilidade(dataFiltroEl.value);
    } else {
      carregarMeusAgendamentos(eCancelamento ? "aprovado" : "pendente");
    }
  } catch (e) {
    mostrarMensagem(`❌ Erro: ${e.message}`, "erro");
    console.error("recusarAgendamento:", e);
  }
}

async function atualizarStatusAg(id, novoStatus, msg) {
  try {
    await updateAgendamento(id, { status: novoStatus });
    if (typeof calendar !== "undefined" && calendar) {
      const ev = calendar.getEventById(id);
      if (ev) ev.setProp("color", novoStatus === "em_andamento" ? "#378add" : "#4caf6e");
    }
    mostrarMensagem(msg, "sucesso");
    if (tipoUsuario === "admin") carregarAgendamentosPendentes(abaAgAtual);
    if (tipoUsuario === "serviceiro") carregarMeusAgendamentos(novoStatus === "em_andamento" ? "aprovado" : "em_andamento");
  } catch (e) {
    mostrarMensagem(`❌ Erro: ${e.message}`, "erro");
    console.error("atualizarStatusAg:", e);
  }
}

async function encerrarAgendamento(ag) {
  const motivo = prompt("Motivo do encerramento antecipado (obrigatório):");
  if (!motivo || motivo.trim() === "") {
    mostrarMensagem("⚠️ Informe o motivo do encerramento.", "erro");
    return;
  }
  try {
    await updateAgendamento(ag.id, {
      status: "encerrado",
      obs_conclusao: `🛑 Encerrado antecipadamente: ${motivo.trim()}`
    });
    if (typeof calendar !== "undefined" && calendar) {
      const ev = calendar.getEventById(ag.id);
      if (ev) ev.setProp("color", "#e05a3a");
    }
    mostrarMensagem("🛑 Serviço encerrado antecipadamente.", "erro");
    if (tipoUsuario === "admin") {
      carregarAgendamentosPendentes(abaAgAtual);
      if (dataFiltroEl) verificarDisponibilidade(dataFiltroEl.value);
    } else {
      carregarMeusAgendamentos("aprovado");
      carregarMinhaProducao();
    }
  } catch (e) {
    mostrarMensagem(`❌ Erro: ${e.message}`, "erro");
    console.error("encerrarAgendamento:", e);
  }
}

async function concluirAgendamento(ag) {
  const agora = new Date();
  const fim   = new Date(ag.fim);

  if (agora < fim) {
    const min  = Math.ceil((fim - agora) / 60000);
    const h    = Math.floor(min / 60);
    const m    = min % 60;
    const tempo = h > 0 ? `${h}h${m > 0 ? m + "min" : ""}` : `${min}min`;
    mostrarMensagem(
      `⚠️ O serviço só pode ser concluído após o horário de fim. Faltam ${tempo} (${fim.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}).`,
      "erro"
    );
    return;
  }

  // Abre o modal de finalização (observação, anotações, valor e print)
  abrirModalFinalizar(ag);
}

function abrirModalFinalizar(ag) {
  const antigo = document.getElementById("modalFinalizar");
  if (antigo) antigo.remove();

  const finIni = ag.iniciado_em ? new Date(ag.iniciado_em) : new Date(ag.inicio);
  const finFim = new Date();
  const sugestao = valorCalculado({ ...ag, iniciado_em: finIni.toISOString(), finalizado_em: finFim.toISOString() });
  const horas    = fmtDuracao(duracaoMs({ ...ag, iniciado_em: finIni.toISOString(), finalizado_em: finFim.toISOString() }));
  const eventoAtivo = !!cfgAtual.precos?.modo_evento;
  const precoHora = (eventoAtivo && cfgAtual.precos?.evento) ? parseFloat(cfgAtual.precos.evento) : parseFloat(cfgAtual.precos?.normal || 0);

  const modal = document.createElement("div");
  modal.id = "modalFinalizar";
  modal.className = "modal";
  modal.style.display = "flex";
  modal.innerHTML = `
    <div class="modal-conteudo" style="max-width:460px">
      <h3 style="font-family:Cinzel,serif;color:var(--gold);margin:0 0 4px">🏆 Finalizar serviço #${ag.numero_chamado || ""}</h3>
      <p style="font-size:12px;color:rgba(232,223,192,0.5);margin:0 0 14px">${ag.nome_cliente} · ${ag.hunt} · ${horas} trabalhadas</p>

      <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:#e8dfc0">
        🧮 <b>Cálculo:</b> ${horas} × ${fmtBRL(precoHora)}/h = <b style="color:#c9a84c">${fmtBRL(sugestao)}</b>${eventoAtivo ? ' <span style="color:#e0a23a;font-size:11px">(evento)</span>' : ''}
      </div>

      <label style="font-size:12px;color:rgba(232,223,192,0.7);font-family:Cinzel,serif">💰 Valor a cobrar (R$) — ajuste se quiser cobrar mais</label>
      <input type="number" id="finValor" step="0.01" value="${sugestao.toFixed(2)}" style="width:100%;margin:4px 0 12px">

      <label style="font-size:12px;color:rgba(232,223,192,0.7);font-family:Cinzel,serif">🗒️ Anotações (o cliente verá)</label>
      <textarea id="finAnotacoes" rows="3" placeholder="Ex: subiu 2 levels, dropou X, sem mortes..." style="width:100%;margin:4px 0 12px;resize:vertical"></textarea>

      <label style="font-size:12px;color:rgba(232,223,192,0.7);font-family:Cinzel,serif">📸 Print do serviço (opcional)</label>
      <input type="file" id="finPrint" accept="image/*" style="width:100%;margin:4px 0 4px">
      <p style="font-size:11px;color:rgba(232,223,192,0.4);margin:0 0 14px">Imagem até 5MB (jpg, png, webp).</p>

      <div style="display:flex;gap:8px">
        <button id="finConfirmar" class="btn-gold" style="flex:1">✅ Concluir serviço</button>
        <button id="finCancelar" class="btn-cancelar" style="flex:0 0 auto">Cancelar</button>
      </div>
      <p id="finErro" style="color:#e05a3a;font-size:12px;margin:8px 0 0;min-height:14px"></p>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById("finCancelar").onclick = () => modal.remove();

  document.getElementById("finConfirmar").onclick = async () => {
    const erroEl  = document.getElementById("finErro");
    const btn     = document.getElementById("finConfirmar");
    const valorEl = document.getElementById("finValor");
    const anotEl  = document.getElementById("finAnotacoes");
    const fileEl  = document.getElementById("finPrint");

    const valorFinal = parseFloat((valorEl.value || "").replace(",", "."));
    const anotacoes  = limitarTexto(anotEl.value, 500);
    const arquivo    = fileEl.files[0];

    // Validação do print (se anexado)
    if (arquivo) {
      if (!arquivo.type.startsWith("image/")) { erroEl.textContent = "O print precisa ser uma imagem."; return; }
      if (arquivo.size > 5 * 1024 * 1024)     { erroEl.textContent = "Imagem muito grande (máx. 5MB)."; return; }
    }

    btn.disabled = true;
    btn.textContent = "⏳ Finalizando...";

    try {
      let print_url = "";
      if (arquivo) {
        const ext  = (arquivo.name.split(".").pop() || "png").toLowerCase();
        const path = `chamado_${ag.numero_chamado || ag.id}_${Date.now()}.${ext}`;
        print_url = await supaUpload("prints-servicos", path, arquivo);
      }

      const patch = {
        status: "concluido",
        obs_conclusao: "✅ Concluído com sucesso."
      };
      if (anotacoes) patch.anotacoes = anotacoes;
      if (!isNaN(valorFinal)) patch.valor_final = valorFinal;
      if (print_url) patch.print_url = print_url;

      await updateAgendamento(ag.id, patch);

      // Gera a cobrança automática do serviço (se houver valor definido)
      if (!isNaN(valorFinal) && valorFinal > 0) {
        try {
          await supaPost("pagamentos", {
            nome: ag.nome_cliente,
            serviceiro: ag.serviceiro,
            data: new Date().toISOString().slice(0,10),
            valor: valorFinal,
            obs: `Cobrança automática do serviço #${ag.numero_chamado || ""}`,
            status: "cobranca",
            agendamento_id: ag.id
          });
        } catch (errCob) {
          console.warn("Não foi possível gerar a cobrança automática:", errCob);
        }
      }

      if (typeof calendar !== "undefined" && calendar) {
        const ev = calendar.getEventById(ag.id);
        if (ev) ev.setProp("color", "#4caf6e");
      }
      modal.remove();
      mostrarMensagem("🏆 Serviço concluído! Cobrança gerada para o cliente.", "sucesso");
      if (tipoUsuario === "admin") carregarAgendamentosPendentes(abaAgAtual);
      else { carregarMeusAgendamentos("em_andamento"); carregarMinhaProducao(); }
      mostrarModalAvaliacao(ag);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "✅ Concluir serviço";
      erroEl.textContent = "Erro: " + e.message;
      console.error("finalizar:", e);
    }
  };
}

function mostrarModalAvaliacao(ag) {
  const antigo = document.getElementById("modalAvaliacao");
  if (antigo) antigo.remove();

  const modal = document.createElement("div");
  modal.id = "modalAvaliacao";
  modal.innerHTML = `
    <div class="chamado-box">
      <div class="chamado-icon">⭐</div>
      <h3>Serviço Concluído!</h3>
      <p>Avalie o atendimento de <strong>${ag.serviceiro}</strong> no chamado <strong>#${ag.numero_chamado}</strong></p>
      <div class="avaliacao-estrelas" id="estrelas">
        ${[1,2,3,4,5].map(n => `<span class="estrela" data-val="${n}">★</span>`).join("")}
      </div>
      <div id="avaliacaoNota" style="font-family:'Cinzel',serif;color:var(--gold);font-size:13px;margin:8px 0;min-height:20px"></div>
      <textarea id="avaliacaoComentario" placeholder="Comentário (opcional)" rows="3" style="width:100%;margin-top:8px;resize:vertical"></textarea>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="btnEnviarAvaliacao" style="flex:1">⭐ Enviar avaliação</button>
        <button id="btnPularAvaliacao" style="flex:1;background:rgba(255,255,255,0.06);color:rgba(232,223,192,0.6);border:1px solid rgba(201,168,76,0.2)">Pular</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let notaSelecionada = 0;
  const LABELS = ["","Péssimo","Ruim","Regular","Bom","Excelente!"];

  modal.querySelectorAll(".estrela").forEach(estrela => {
    estrela.addEventListener("mouseenter", () => {
      const val = parseInt(estrela.dataset.val);
      modal.querySelectorAll(".estrela").forEach((e,i) => {
        e.style.color = i < val ? "#f0c040" : "rgba(201,168,76,0.25)";
      });
      document.getElementById("avaliacaoNota").textContent = LABELS[val];
    });
    estrela.addEventListener("click", () => {
      notaSelecionada = parseInt(estrela.dataset.val);
    });
    estrela.addEventListener("mouseleave", () => {
      modal.querySelectorAll(".estrela").forEach((e,i) => {
        e.style.color = i < notaSelecionada ? "#f0c040" : "rgba(201,168,76,0.25)";
      });
      document.getElementById("avaliacaoNota").textContent = notaSelecionada ? LABELS[notaSelecionada] : "";
    });
  });

  document.getElementById("btnEnviarAvaliacao").addEventListener("click", async () => {
    if (!notaSelecionada) {
      document.getElementById("avaliacaoNota").textContent = "Selecione uma nota!";
      document.getElementById("avaliacaoNota").style.color = "#e05a3a";
      return;
    }
    const comentario = document.getElementById("avaliacaoComentario").value.trim();
    try {
      await supaPost("avaliacoes", {
        agendamento_id: ag.id,
        serviceiro: ag.serviceiro,
        nome_cliente: ag.nome_cliente,
        nota: notaSelecionada,
        comentario
      });
      mostrarMensagem("⭐ Avaliação enviada! Obrigado pelo feedback.", "sucesso");
    } catch(e) { console.warn("Erro ao salvar avaliação:", e); }
    modal.remove();
  });

  document.getElementById("btnPularAvaliacao").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

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

// =========================================
// GESTÃO DE USUÁRIOS (Admin)
// =========================================
const ROLE_LABELS = { admin: "⚔️ Admin", serviceiro: "🗡️ Serviceiro", cliente: "👤 Cliente", pendente: "⏳ Pendente" };

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

  const ags = await supaGet("agendamentos",
    `serviceiro=eq.${encodeURIComponent(nomeServ)}&status=eq.${status}&arquivado=not.is.true&order=inicio.asc`
  );

  // Guarda para os filtros e renderiza aplicando-os
  _meusAgsCache = ags;
  _meusStatusAtual = status;
  renderMeusAgendamentos();
}

// Cache da aba atual + estado dos filtros
let _meusAgsCache = [];
let _meusStatusAtual = "pendente";

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

// =========================================
// PERMISSÕES POR ROLE
// =========================================

const ABAS_CONFIG = {
  agenda:     { label: "📅 Agenda",     desc: "Ver calendário e criar agendamentos" },
  precos:     { label: "💰 Preços",     desc: "Ver tabela de preços" },
  contatos:   { label: "📞 Contatos",   desc: "Ver contatos dos serviceiros" },
  pagamentos: { label: "💳 Pagamentos", desc: "Registrar e ver comprovantes" },
  historico:  { label: "📋 Histórico",  desc: "Consultar chamados por número/nick" },
  stats:      { label: "📊 Stats",      desc: "Ver dashboard de métricas" }
};

const ACOES_CONFIG = {
  agendar:  { label: "📝 Agendar serviços",      desc: "Criar novos agendamentos" },
  aprovar:  { label: "✅ Aprovar agendamentos",   desc: "Aceitar pedidos pendentes" },
  recusar:  { label: "❌ Recusar agendamentos",   desc: "Recusar ou cancelar pedidos" },
  iniciar:  { label: "⚔️ Iniciar serviço",        desc: "Marcar como em andamento" },
  concluir: { label: "🏆 Concluir serviço",       desc: "Marcar como concluído" },
  encerrar: { label: "🛑 Encerrar antecipado",    desc: "Encerrar antes do horário" }
};

// Cache de permissões carregado do Supabase
let permissoesCache = {};
let permRoleAtual = "cliente";

// Abas do painel de permissões
document.querySelectorAll(".perm-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".perm-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    permRoleAtual = tab.dataset.permRole;
    renderizarPermissoes(permRoleAtual);
  });
});

// Salvar permissões
document.getElementById("btnSalvarPermissoes")?.addEventListener("click", async () => {
  const abas   = {};
  const acoes  = {};

  document.querySelectorAll(".perm-toggle[data-tipo='aba']").forEach(cb => {
    abas[cb.dataset.chave] = cb.checked;
  });
  document.querySelectorAll(".perm-toggle[data-tipo='acao']").forEach(cb => {
    acoes[cb.dataset.chave] = cb.checked;
  });

  await adminAction("update_perm", null, null, {
    role: permRoleAtual, abas, acoes
  });

  permissoesCache[permRoleAtual] = { abas, acoes };
  mostrarMensagem(`✅ Permissões de ${permRoleAtual} salvas!`, "sucesso");

  // Reaplica permissões na UI se o usuário atual for afetado
  if (tipoUsuario === permRoleAtual) aplicarPermissoes();
});

async function carregarPermissoes() {
  try {
    const rows = await supaGet("permissoes", "");
    rows.forEach(r => { permissoesCache[r.role] = { abas: r.abas, acoes: r.acoes }; });
  } catch(e) { console.warn("Erro ao carregar permissões:", e); }
}

function renderizarPermissoes(role) {
  const container = document.getElementById("painelPermissoes");
  if (!container) return;
  const perm = permissoesCache[role] || { abas: {}, acoes: {} };

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div style="font-family:'Cinzel',serif;font-size:12px;color:var(--gold);margin-bottom:12px;letter-spacing:1px">ABAS VISÍVEIS</div>
        ${Object.entries(ABAS_CONFIG).map(([chave, cfg]) => `
          <label class="perm-row">
            <div class="perm-info">
              <span class="perm-label">${cfg.label}</span>
              <span class="perm-desc">${cfg.desc}</span>
            </div>
            <div class="perm-switch">
              <input type="checkbox" class="perm-toggle" data-tipo="aba" data-chave="${chave}"
                ${perm.abas[chave] !== false ? "checked" : ""}>
              <span class="perm-slider"></span>
            </div>
          </label>`).join("")}
      </div>
      <div>
        <div style="font-family:'Cinzel',serif;font-size:12px;color:var(--gold);margin-bottom:12px;letter-spacing:1px">AÇÕES PERMITIDAS</div>
        ${Object.entries(ACOES_CONFIG).map(([chave, cfg]) => `
          <label class="perm-row">
            <div class="perm-info">
              <span class="perm-label">${cfg.label}</span>
              <span class="perm-desc">${cfg.desc}</span>
            </div>
            <div class="perm-switch">
              <input type="checkbox" class="perm-toggle" data-tipo="acao" data-chave="${chave}"
                ${perm.acoes[chave] ? "checked" : ""}>
              <span class="perm-slider"></span>
            </div>
          </label>`).join("")}
      </div>
    </div>`;
}

// Aplica permissões na UI do usuário atual
function aplicarPermissoes() {
  if (!tipoUsuario || tipoUsuario === "admin") return;
  const perm = permissoesCache[tipoUsuario];
  if (!perm) return;

  // Controla visibilidade das abas
  const mapaAbas = {
    agenda: "btnNavAgenda", precos: "btnNavPrecos",
    contatos: "btnNavContatos", pagamentos: "btnNavPagamentos",
    historico: "btnNavHistorico", stats: "btnNavStats"
  };
  Object.entries(mapaAbas).forEach(([chave, btnId]) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.style.display = perm.abas[chave] === false ? "none" : "";
  });

  // Controla formulário de agendamento
  if (perm.acoes?.agendar === false) {
    document.getElementById("formAgendamento").style.display = "none";
    document.getElementById("agendaBloqueado").style.display = "flex";
    document.getElementById("agendaBloqueado").querySelector("p").textContent =
      "Sua conta não tem permissão para agendar serviços.";
  }
}

// =========================================
// DASHBOARD DE MÉTRICAS
// =========================================
let _chartStatus = null;
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
    // Carrega permissões
    await carregarPermissoes();
    renderizarPermissoes("cliente");
    // Carrega sugestões
    carregarSugestoes();
    // Carrega agendamentos pendentes
    carregarAgendamentosPendentes('pendente');
    // Carrega usuários pendentes
    carregarUsuarios('pendente');
  } catch(e) { console.error("Erro ao carregar config:", e); }
}

function renderizarPainelAdmin() {
  // Preços
  document.getElementById("cfgPrecoNormal").value = cfgAtual.precos?.normal || "";
  document.getElementById("cfgPrecoEvento").value = cfgAtual.precos?.evento || "";
  document.getElementById("cfgPrecoObs").value    = cfgAtual.precos?.obs    || "";
  const chkEvento = document.getElementById("cfgModoEvento");
  if (chkEvento) chkEvento.checked = !!cfgAtual.precos?.modo_evento;

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

function listarTodosServiceiros() {
  const src = cfgAtual.serviceiros || SERVICEIROS || {};
  const todos = [];
  Object.values(src).forEach(lista => {
    (lista || []).forEach(nome => { if (!todos.includes(nome)) todos.push(nome); });
  });
  return todos.sort((a, b) => a.localeCompare(b, "pt-BR"));
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
  // configuracoes usa chave como PK — update_config via Edge Function (valida admin pelo JWT)
  if (!sessaoAuth?.access_token) throw new Error("Ação requer login de admin.");
  await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPA_KEY,
      "Authorization": "Bearer " + SUPA_KEY,
      "x-user-jwt":    sessaoAuth.access_token
    },
    body: JSON.stringify({
      acao:   "update_config",
      chave,
      dados:  { valor, atualizado_em: new Date().toISOString() }
    })
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
      li.className = "serv-quadrado";
      li.innerHTML = `
        <div class="sq-topo">
          <span class="status-icon">⏳</span>
          <span class="nome">${nome}</span>
        </div>
        <span class="badge verificando">...</span>
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

// Botão: arquivar serviços finalizados (fechar o mês)
document.getElementById("btnArquivarMes")?.addEventListener("click", async () => {
  const ok = confirm(
    "📦 Arquivar todos os serviços FINALIZADOS?\n\n" +
    "Isto remove das telas os chamados concluídos, encerrados, cancelados, recusados e expirados. " +
    "Eles continuam guardados no banco (não são apagados), e pagamentos/avaliações são mantidos.\n\n" +
    "Pendentes e em andamento NÃO são afetados.\n\nDeseja continuar?"
  );
  if (!ok) return;
  try {
    const r = await adminAction("arquivar_finalizados", null, null, null, {});
    mostrarMensagem(`📦 ${r.arquivados || 0} serviço(s) arquivado(s) com sucesso!`, "sucesso");
    carregarAgendamentosPendentes(abaAgAtual);
    carregarHistorico();
  } catch (e) {
    mostrarMensagem(`❌ Erro ao arquivar: ${e.message}`, "erro");
  }
});

// Botão: salvar preços
document.getElementById("btnSalvarPrecos").addEventListener("click", async () => {
  const normal = parseFloat(document.getElementById("cfgPrecoNormal").value);
  const evento = parseFloat(document.getElementById("cfgPrecoEvento").value);
  const obs    = document.getElementById("cfgPrecoObs").value.trim();
  if (!normal || !evento) { mostrarMensagem("⚠️ Preencha os dois valores.", "erro"); return; }
  cfgAtual.precos = { normal, evento, obs, modo_evento: !!cfgAtual.precos?.modo_evento };
  await salvarConfig("precos", cfgAtual.precos);
  // Atualiza a aba de preços visualmente
  document.getElementById("precoNormal").textContent = `R$ ${normal.toFixed(2).replace(".",",")} / hora em dias normais`;
  document.getElementById("precoEvento").textContent = `R$ ${evento.toFixed(2).replace(".",",")} / hora em dias de evento`;
  mostrarMensagem("✅ Preços atualizados!", "sucesso");
});

// Liga/desliga o modo evento global (só admin)
document.getElementById("cfgModoEvento")?.addEventListener("change", async (e) => {
  const ativo = e.target.checked;
  cfgAtual.precos = { ...(cfgAtual.precos || {}), modo_evento: ativo };
  try {
    await salvarConfig("precos", cfgAtual.precos);
    aplicarAvisoEvento();
    atualizarEstimativa();
    mostrarMensagem(ativo ? "🎉 Modo evento ATIVADO! Todos os agendamentos usam o valor de evento." : "Modo evento desativado. Valores normais.", "sucesso");
  } catch (err) {
    e.target.checked = !ativo; // reverte visual em caso de erro
    mostrarMensagem(`❌ Erro: ${err.message}`, "erro");
  }
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
      span.innerHTML = '<span class="horario-livre">🕐 Sem horário fixo — consulte</span>';
      return;
    }
    // Botão compacto que abre o modal com os horários detalhados
    span.innerHTML = `<button class="btn-ver-horarios" data-serv-horarios="${nome}">🕐 Ver horários (${horarios.length})</button>`;
  });

  // Liga os botões ao modal
  document.querySelectorAll("[data-serv-horarios]").forEach(btn => {
    btn.addEventListener("click", () => abrirModalHorarios(btn.dataset.servHorarios));
  });
}

// Agrupa dias consecutivos com mesmo horário (reuso no modal)
function agruparHorarios(nome) {
  const horarios = horariosCache
    .filter(h => h.serviceiro === nome)
    .sort((a,b) => DIAS_ORDEM.indexOf(a.dia_semana) - DIAS_ORDEM.indexOf(b.dia_semana));
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
  return grupos;
}

function abrirModalHorarios(nome) {
  const antigo = document.getElementById("modalHorarios");
  if (antigo) antigo.remove();

  // Agrupa por DIA: cada dia aparece uma vez, com todas as faixas juntas
  const horarios = horariosCache
    .filter(h => h.serviceiro === nome)
    .sort((a,b) => DIAS_ORDEM.indexOf(a.dia_semana) - DIAS_ORDEM.indexOf(b.dia_semana));

  const porDia = {};
  horarios.forEach(h => {
    const faixa = `${h.hora_inicio.slice(0,5)}–${h.hora_fim.slice(0,5)}`;
    (porDia[h.dia_semana] = porDia[h.dia_semana] || []).push(faixa);
  });
  const diasOrdenados = Object.keys(porDia).sort((a,b) => DIAS_ORDEM.indexOf(a) - DIAS_ORDEM.indexOf(b));

  const linhas = diasOrdenados.length === 0
    ? '<p style="color:rgba(232,223,192,0.5);grid-column:1/-1;text-align:center">Sem horário fixo cadastrado. Consulte o serviceiro.</p>'
    : diasOrdenados.map(dia => `
        <div class="mh-dia">
          <span class="mh-dia-nome">${dia.slice(0,3)}</span>
          <span class="mh-dia-faixas">${porDia[dia].join("<br>")}</span>
        </div>`).join("");

  const modal = document.createElement("div");
  modal.id = "modalHorarios";
  modal.className = "modal";
  modal.style.display = "flex";
  modal.innerHTML = `
    <div class="modal-conteudo" style="max-width:420px">
      <h3 style="font-family:Cinzel,serif;color:var(--gold);margin:0 0 2px">🕐 Disponibilidade</h3>
      <p style="font-size:13px;color:rgba(232,223,192,0.6);margin:0 0 14px">⚔️ ${nome}</p>
      <div class="mh-grade">${linhas}</div>
      <button id="fecharModalHorarios" class="btn-gold" style="width:100%;margin-top:16px">Fechar</button>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("fecharModalHorarios").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
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
      await adminAction("delete", "horarios_serviceiros", btn.dataset.delId);
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

  const novos = await adminAction("insert", "horarios_serviceiros", null, {
    serviceiro, dia_semana: dia, hora_inicio: inicio, hora_fim: fim, ativo: true
  });
  const novo = Array.isArray(novos) ? novos[0] : novos;
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
  const nome     = limitarTexto(document.getElementById("sugNome").value, 50);
  const mensagem = limitarTexto(document.getElementById("sugMensagem").value, 1000);

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
        await adminAction("update", "sugestoes", btn.dataset.sugId, { lida: true });
        carregarSugestoes();
      });
    });

    // Excluir
    container.querySelectorAll("[data-del-sug]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (confirm("Excluir esta sugestão?")) {
          await adminAction("delete", "sugestoes", btn.dataset.delSug);
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

// ── Detecta link vindo do email (confirmação de cadastro vs. reset de senha) ──
(async () => {
  const hash = window.location.hash;
  if (!hash.includes("access_token") && !hash.includes("type=")) return;

  const params      = new URLSearchParams(hash.replace("#", ""));
  const accessToken = params.get("access_token");
  // type pode vir no hash (#type=recovery) ou na query (?type=recovery)
  const queryParams = new URLSearchParams(window.location.search);
  const tipo        = params.get("type") || queryParams.get("type"); // "recovery" | "signup" | ...

  if (!accessToken) return;

  // Estabelece a sessão a partir do token do link
  await _supa.auth.setSession({
    access_token: accessToken,
    refresh_token: params.get("refresh_token") || ""
  });

  // Limpa o hash da URL em qualquer caso
  history.replaceState(null, "", window.location.pathname);

  if (tipo === "recovery") {
    // Veio de "Esqueceu a senha?" → pedir nova senha
    mostrarModalNovaSenha();
  } else {
    // Confirmação de cadastro (type=signup) ou magic link → só entra no site
    mostrarMensagem("✅ E-mail confirmado! Você já está logado.", "sucesso");
  }
})();

function mostrarModalNovaSenha() {
  const antigo = document.getElementById("modalNovaSenha");
  if (antigo) antigo.remove();

  const modal = document.createElement("div");
  modal.id = "modalNovaSenha";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10003;display:flex;align-items:center;justify-content:center";
  modal.innerHTML = `
    <div class="auth-box" style="max-width:380px;width:94vw">
      <div class="auth-logo">🔑 <span>Nova Senha</span></div>
      <p style="font-size:13px;color:rgba(232,223,192,0.6);text-align:center;margin-bottom:16px">Digite sua nova senha abaixo</p>
      <div class="auth-field">
        <label>Nova senha</label>
        <input type="password" id="novaSenhaInput" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
      </div>
      <div class="auth-field" style="margin-top:10px">
        <label>Confirmar senha</label>
        <input type="password" id="novaSenhaConfirm" placeholder="Repita a senha" autocomplete="new-password">
      </div>
      <p id="novaSenhaErro" class="auth-erro" style="margin-top:8px"></p>
      <button id="btnSalvarNovaSenha" style="margin-top:12px;background:var(--gold);color:#0a0a0f;border:none;border-radius:8px;padding:12px;font-family:Cinzel,serif;font-size:13px;font-weight:700;cursor:pointer;width:100%;letter-spacing:1px">✅ Salvar nova senha</button>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById("btnSalvarNovaSenha").addEventListener("click", async () => {
    const nova     = document.getElementById("novaSenhaInput").value;
    const confirma = document.getElementById("novaSenhaConfirm").value;
    const erroEl   = document.getElementById("novaSenhaErro");

    if (!nova || nova.length < 6) { erroEl.textContent = "Senha deve ter ao menos 6 caracteres."; return; }
    if (nova !== confirma) { erroEl.textContent = "As senhas não coincidem."; return; }

    const { error } = await _supa.auth.updateUser({ password: nova });
    if (error) {
      erroEl.textContent = "Erro ao salvar senha. Tente novamente.";
    } else {
      modal.remove();
      mostrarMensagem("✅ Senha alterada com sucesso! Faça login com a nova senha.", "sucesso");
      await _supa.auth.signOut();
    }
  });
}

// ── Expira agendamentos pendentes vencidos ──────────────
async function expirarPendentesVencidos() {
  try {
    const agora = new Date().toISOString();
    // Busca pendentes cujo horário de fim já passou
    const vencidos = await supaGet("agendamentos",
      `status=eq.pendente&fim=lt.${agora}`
    );
    if (vencidos.length === 0) return;

    // Atualiza cada um para "expirado" via fetch direto (anon pode inserir, service_role atualiza)
    // Usa adminAction se logado como admin, senão ignora (será feito ao logar)
    if (tipoUsuario === "admin" && sessaoAuth?.access_token) {
      for (const ag of vencidos) {
        await adminAction("update", "agendamentos", ag.id, {
          status: "expirado",
          obs_conclusao: "⏰ Expirado automaticamente — não foi aceito dentro do prazo."
        });
      }
      if (vencidos.length > 0) {
        mostrarMensagem(`⚠️ ${vencidos.length} agendamento(s) pendente(s) expiraram automaticamente.`, "erro");
        carregarAgendamentosPendentes(abaAgAtual);
        verificarDisponibilidade(dataFiltroEl.value);
      }
    }
  } catch(e) { console.warn("Erro ao expirar pendentes:", e); }
}

// ── Inicializa ────────────────────────────
(async () => {
  try {
    // 1. Carrega configurações públicas
    const rows = await supaGet("configuracoes", "");
    rows.forEach(r => { cfgAtual[r.chave] = r.valor; });
    atualizarSelectHunts();
    atualizarServiceiros();
    if (cfgAtual.precos?.normal) {
      document.getElementById("precoNormal").textContent =
        `R$ ${parseFloat(cfgAtual.precos.normal).toFixed(2).replace(".",",")} / hora em dias normais`;
      document.getElementById("precoEvento").textContent =
        `R$ ${parseFloat(cfgAtual.precos.evento).toFixed(2).replace(".",",")} / hora em dias de evento`;
    }
    aplicarAvisoEvento();
  } catch(e) { console.warn("Erro ao carregar configs:", e); }

  // 2. Carrega horários e disponibilidade
  try {
    await carregarHorariosCards();
    verificarDisponibilidade(dataFiltroEl.value);
  } catch(e) { console.warn("Erro horários:", e); }

  // 3. Carrega calendário
  try { carregarCalendario(); } catch(e) { console.warn("Erro calendário:", e); }

  // 4. Carrega dados públicos
  try { renderizarContatos(); } catch(e) {}
  try { renderizarPagamentos(); } catch(e) {}

  // 5. Restaura sessão Supabase Auth
  try {
    const { data: { session } } = await _supa.auth.getSession();
    if (session) {
      aplicandoSessao = true;
      await aplicarSessao(session, "INITIAL_SESSION");
      aplicandoSessao = false;
    }
  } catch(e) {
    console.warn("Erro sessão:", e);
    aplicandoSessao = false;
  } finally {
    inicializacaoConcluida = true;
  }
})();
