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

// ── Ações privilegiadas via Edge Function (service_role) ──
async function adminAction(acao, tabela, id = null, dados = null, extra = {}) {
  // Sempre usa a senha admin como token (só admin chama isso)
  if (!SENHA_ADMIN_DIN) throw new Error("Ação requer permissão de admin.");
  const res = await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPA_KEY,
      "Authorization": "Bearer " + SUPA_KEY,
      "x-admin-token": SENHA_ADMIN_DIN
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
      "x-admin-token": SENHA_ADMIN_DIN || "",
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
      carregarUsuarios("pendente");
    }
    if (aba === "historico")  carregarHistorico();
    if (aba === "dashboard")  carregarDashboard();
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

// carregarCalendario() é chamado após auth restaurada

// =========================================
// SISTEMA DE AUTENTICAÇÃO — Supabase Auth
// =========================================
let tipoUsuario = null; // "admin" | "serviceiro" | "cliente" | null
let SENHA_ADMIN_DIN = null; // mantido para compatibilidade com adminAction

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

  // Carrega senha admin
  if (tipoUsuario === "admin") {
    try {
      const rows = await supaGet("configuracoes", "chave=eq.senhas");
      if (rows[0]?.valor?.admin) SENHA_ADMIN_DIN = rows[0].valor.admin;
    } catch(e) {}
  }

  atualizarUI();
  // Só mostra boas-vindas no login real, não no refresh
  if (event === "SIGNED_IN") {
    mostrarMensagem(`✅ Bem-vindo, ${perfilAtual.nick}!`, "sucesso");
  }
}

// ── Atualiza a interface conforme o papel ──
async function atualizarUI() {
  const logado       = tipoUsuario !== null;
  const isAdmin      = tipoUsuario === "admin";
  const isServiceiro = tipoUsuario === "serviceiro";
  const nick         = perfilAtual?.nick || "";

  // Header
  document.getElementById("loginArea").style.display  = logado ? "none" : "flex";
  document.getElementById("userArea").style.display   = logado ? "flex" : "none";
  document.getElementById("usuarioLogado").textContent =
    isAdmin ? `⚔️ ${nick}` : isServiceiro ? `🗡️ ${nick}` : `👤 ${nick}`;

  // Botões de admin
  document.getElementById("btnNavAdmin").style.display       = isAdmin ? "inline-block" : "none";
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
  if (tipoUsuario === "serviceiro") carregarPainelServiceiro();

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

  // Valida código e detecta role automaticamente
  const conviteRows = await supaGet("convites", `codigo=eq.${encodeURIComponent(convite)}&usado=eq.false`);
  if (conviteRows.length === 0) {
    erroEl.textContent = "Código de convite inválido ou já usado."; return;
  }
  const roleDetectada = conviteRows[0].role || "cliente";

  const { data, error } = await _supa.auth.signUp({
    email, password: senha,
    options: { data: { nick, role: roleDetectada } }
  });

  if (error) { erroEl.textContent = error.message; return; }

  // Marca convite como usado via Edge Function (RLS bloqueia anon de fazer UPDATE)
  try {
    const conviteRow = await supaGet("convites", `codigo=eq.${encodeURIComponent(convite)}`);
    if (conviteRow[0]) {
      await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPA_KEY,
          "Authorization": "Bearer " + SUPA_KEY,
          "x-admin-token": "SISTEMA_INTERNO"
        },
        body: JSON.stringify({
          acao: "update",
          tabela: "convites",
          id: conviteRow[0].id,
          dados: { usado: true }
        })
      });
    }
  } catch(e) { console.warn("Erro ao marcar convite como usado:", e); }

  document.getElementById("modalAuth").style.display = "none";
  if (roleDetectada === "serviceiro") {
    mostrarMensagem("⚔️ Cadastro de serviceiro enviado! Aguarde aprovação do admin.", "sucesso");
  } else {
    mostrarMensagem("✅ Conta criada com sucesso! Já pode fazer login.", "sucesso");
  }
});

// ── Preview do tipo ao digitar o código ──
document.getElementById("cadConvite")?.addEventListener("input", async (e) => {
  const codigo  = e.target.value.trim().toUpperCase();
  const tipoEl  = document.getElementById("cadConviteTipo");
  if (!tipoEl) return;
  if (codigo.length < 4) { tipoEl.textContent = ""; return; }

  const rows = await supaGet("convites", `codigo=eq.${encodeURIComponent(codigo)}&usado=eq.false`);
  if (rows.length === 0) {
    tipoEl.textContent = "❌ Código inválido ou já usado";
    tipoEl.style.color = "#e05a3a";
  } else {
    const role = rows[0].role || "cliente";
    tipoEl.textContent = role === "serviceiro" ? "✅ Código de Serviceiro" : "✅ Código de Cliente";
    tipoEl.style.color = role === "serviceiro" ? "#a855f7" : "#4caf6e";
  }
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
    mostrarMensagem(`⚠️ ${serviceiro} já tem um serviço ${status} neste horário.`, "erro"); return;
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
  await supaPost("agendamentos", {
    nome_cliente, serviceiro, vocacao, tipo, hunt,
    inicio: inicio.toISOString(), fim: fim.toISOString(),
    status: "pendente",
    numero_chamado: numeroChamado
  });

  // Não adiciona ao calendário — só aparece após aprovação
  verificarDisponibilidade(dataFiltroEl.value);
  // Mostra modal com o número do chamado
  mostrarModalChamado(numeroChamado);
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
          await adminAction("delete", "pagamentos", btn.dataset.excluir);
          renderizarPagamentos();
          mostrarMensagem("🗑️ Pagamento excluído!", "sucesso");
        }
      }));

  } catch(e) {
    console.error("Erro ao carregar pagamentos:", e);
  }
}

async function alterarStatusPagamento(id, novoStatus) {
  await adminAction("update", "pagamentos", id, { status: novoStatus });
  renderizarPagamentos();
  mostrarMensagem(novoStatus === "aprovado" ? "✅ Pagamento aprovado!" : "❌ Pagamento recusado!",
    novoStatus === "aprovado" ? "sucesso" : "erro");
}

document.getElementById("btnNovoPagamento").addEventListener("click", () => {
  const form = document.getElementById("formPagamento");
  form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("btnEnviarPagamento").addEventListener("click", async () => {
  const nome        = document.getElementById("pgNome").value.trim();
  const serviceiro  = document.getElementById("pgServiceiro").value;
  const numChamado  = document.getElementById("pgNumeroChamado").value.trim();
  const data        = document.getElementById("pgData").value;
  const valor       = document.getElementById("pgValor").value;
  const obs         = document.getElementById("pgObs").value.trim();
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

  // Risco 4: valida número de chamado se informado
  let agendamento_id = null;
  if (numChamado) {
    const chamados = await supaGet("agendamentos",
      `numero_chamado=eq.${numChamado}&nome_cliente=ilike.${encodeURIComponent(nome)}`
    );
    if (chamados.length === 0) {
      mostrarMensagem(`⚠️ Chamado #${numChamado} não encontrado para o nick "${nome}". Verifique os dados.`, "erro"); return;
    }
    if (chamados[0].serviceiro !== serviceiro) {
      mostrarMensagem(`⚠️ O chamado #${numChamado} pertence ao serviceiro ${chamados[0].serviceiro}, não a ${serviceiro}.`, "erro"); return;
    }
    agendamento_id = chamados[0].id;
  }

  mostrarMensagem("⏳ Enviando comprovante...", "sucesso");

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

const STATUS_ICONS = {
  pendente:     "⏳",
  aprovado:     "✅",
  em_andamento: "⚔️",
  concluido:    "🏆",
  recusado:     "❌",
  encerrado:    "🛑",
  cancelado:    "🚫"
};

const STATUS_LABELS = {
  pendente:     "Pendente",
  aprovado:     "Aprovado",
  em_andamento: "Em andamento",
  concluido:    "Concluído",
  recusado:     "Recusado",
  encerrado:    "Encerrado",
  cancelado:    "Cancelado"
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
    const query = status === "todos"
      ? "order=inicio.desc"
      : `status=eq.${status}&order=inicio.asc`;
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

    container.innerHTML = ags.map(ag => {
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
    }).join("");

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

async function aprovarAgendamento(id, lista) {
  await adminAction("update", "agendamentos", id, { status: "aprovado" });
  const ag = lista.find(a => a.id === id);
  if (ag) {
    calendar.addEvent({
      id, title: `#${ag.numero_chamado} ${ag.serviceiro} → ${ag.nome_cliente} (${ag.hunt})`,
      start: ag.inicio, end: ag.fim, color: "#9333ea",
      extendedProps: { id, nome_cliente: ag.nome_cliente, serviceiro: ag.serviceiro, vocacao: ag.vocacao, tipo: ag.tipo, hunt: ag.hunt, status: "aprovado", numero_chamado: ag.numero_chamado }
    });
  }
  mostrarMensagem(`✅ Agendamento aprovado! Chamado #${ag?.numero_chamado} confirmado.`, "sucesso");
  carregarAgendamentosPendentes(abaAgAtual);
  verificarDisponibilidade(dataFiltroEl.value);
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

  await adminAction("update", "agendamentos", id, { status: novoStatus, obs_conclusao: obs });

  const ev = calendar.getEventById(id);
  if (ev) ev.remove();

  mostrarMensagem(`${icone} Agendamento ${novoStatus}.`, "erro");
  carregarAgendamentosPendentes(abaAgAtual);
  verificarDisponibilidade(dataFiltroEl.value);
}

async function atualizarStatusAg(id, novoStatus, msg) {
  await adminAction("update", "agendamentos", id, { status: novoStatus });
  const ev = calendar.getEventById(id);
  if (ev) ev.setProp("color", novoStatus === "em_andamento" ? "#378add" : "#4caf6e");
  mostrarMensagem(msg, "sucesso");
  if (tipoUsuario === "admin") carregarAgendamentosPendentes(abaAgAtual);
  if (tipoUsuario === "serviceiro") carregarMeusAgendamentos(novoStatus === "em_andamento" ? "aprovado" : "em_andamento");
}

async function encerrarAgendamento(ag) {
  const motivo = prompt("Motivo do encerramento antecipado (obrigatório):");
  if (!motivo || motivo.trim() === "") {
    mostrarMensagem("⚠️ Informe o motivo do encerramento.", "erro");
    return;
  }
  await adminAction("update", "agendamentos", ag.id, {
    status: "encerrado",
    obs_conclusao: `🛑 Encerrado antecipadamente: ${motivo.trim()}`
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

  const obs = prompt("Observação da conclusão (opcional):");
  const obsTexto = obs && obs.trim() ? `✅ Concluído: ${obs.trim()}` : "✅ Concluído com sucesso.";

  await adminAction("update", "agendamentos", ag.id, { status: "concluido", obs_conclusao: obsTexto });
  const ev = calendar.getEventById(ag.id);
  if (ev) ev.setProp("color", "#4caf6e");
  mostrarMensagem("🏆 Serviço marcado como concluído!", "sucesso");
  carregarAgendamentosPendentes(abaAgAtual);
  // Solicita avaliação ao cliente
  mostrarModalAvaliacao(ag);
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
    let query = "order=inicio.desc";
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

    container.innerHTML = ags.map(ag => `
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
          </div>
          ${ag.obs_conclusao ? `<div class="hc-obs">📝 ${ag.obs_conclusao}</div>` : ""}
        </div>
        <span class="hc-badge ${ag.status}">${STATUS_LABELS[ag.status] || ag.status}</span>
      </div>
    `).join("");

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
    if (filtroRole === "pendente") {
      filtros.push({ coluna: "aprovado", op: "eq", valor: false });
    } else if (filtroRole !== "todos") {
      filtros.push({ coluna: "role", op: "eq", valor: filtroRole });
      filtros.push({ coluna: "aprovado", op: "eq", valor: true });
    }

    const perfis = await adminAction("select", "perfis", null, null, {
      filtros,
      ordem: { coluna: "criado_em", ascending: false }
    });
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
        ${p.role === "serviceiro" ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(201,168,76,0.12);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;color:rgba(232,223,192,0.55);font-family:Cinzel,serif">🔗 Vincular ao serviceiro:</span>
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

// ── FIX 7: Painel do Serviceiro ──
async function carregarPainelServiceiro() {
  if (tipoUsuario !== "serviceiro" || !perfilAtual) return;

  // Mostra aba exclusiva do serviceiro
  const navAdmin = document.getElementById("btnNavAdmin");
  navAdmin.style.display = "inline-block";
  navAdmin.textContent = "⚔️ Meus Serviços";
  navAdmin.dataset.tab = "serviceiro-painel";

  // Inicializa abas do painel serviceiro
  document.querySelectorAll(".srv-ag-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".srv-ag-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      carregarMeusAgendamentos(tab.dataset.srvTab);
    });
  });

  carregarMeusAgendamentos("pendente");
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
    `serviceiro=eq.${encodeURIComponent(nomeServ)}&status=eq.${status}&order=inicio.asc`
  );

  if (ags.length === 0) {
    container.innerHTML = `<p style="color:rgba(232,223,192,0.4);font-size:13px;padding:8px 0">Nenhum agendamento ${STATUS_LABELS[status]?.toLowerCase() || status}.</p>`;
    return;
  }

  container.innerHTML = ags.map(ag => {
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
      <div class="agendamento-card ${ag.status}">
        <div class="ag-header">
          <span class="ag-nome">${ag.numero_chamado ? `<span class="ag-chamado">#${ag.numero_chamado}</span>` : ""} ${ag.nome_cliente}</span>
          <span class="ag-status-badge">${STATUS_ICONS[ag.status]} ${STATUS_LABELS[ag.status]}</span>
        </div>
        <div class="ag-info">
          <span>🗺️ ${ag.hunt} · ${ag.tipo}</span>
          <span>📅 ${new Date(ag.inicio).toLocaleString("pt-BR")} → ${new Date(ag.fim).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>
          ${ag.obs_conclusao ? `<span style="font-style:italic;color:rgba(232,223,192,0.6)">📝 ${ag.obs_conclusao}</span>` : ""}
        </div>
        ${acoes}
      </div>`;
  }).join("");

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
    btn.addEventListener("click", () => concluirAgendamento(ag));
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
async function carregarDashboard() {
  try {
    const [todos, avaliacoes] = await Promise.all([
      supaGet("agendamentos", "order=criado_em.desc"),
      supaGet("avaliacoes", "order=criado_em.desc&limit=5").catch(() => [])
    ]);

    const total     = todos.length;
    const concluidos = todos.filter(a => a.status === "concluido").length;
    const pendentes  = todos.filter(a => a.status === "pendente").length;
    const cancelados = todos.filter(a => ["cancelado","recusado","encerrado"].includes(a.status)).length;

    // Métricas principais
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
        <div class="dm-label">Pendentes</div>
        <div class="dm-valor" style="color:#f0c040">${pendentes}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">Cancelados/Recusados</div>
        <div class="dm-valor" style="color:#e05a3a">${cancelados}</div>
      </div>
      <div class="dash-metrica">
        <div class="dm-label">Taxa de conclusão</div>
        <div class="dm-valor">${total > 0 ? Math.round((concluidos/total)*100) : 0}%</div>
      </div>`;

    // Top serviceiros por serviços concluídos
    const porServiceiro = {};
    todos.filter(a => a.status === "concluido").forEach(a => {
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

    // Avaliações recentes
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
  // configuracoes usa chave como PK — faz PATCH direto via fetch com service_role
  const token = SENHA_ADMIN_DIN;
  await fetch(`${SUPA_URL}/functions/v1/admin-action`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPA_KEY,
      "Authorization": "Bearer " + SUPA_KEY,
      "x-admin-token": token
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
    if (tipoUsuario === "admin" && SENHA_ADMIN_DIN) {
      for (const ag of vencidos) {
        await adminAction("update", "agendamentos", ag.id, {
          status: "recusado",
          obs_conclusao: "⏰ Expirado automaticamente — não foi aceito dentro do prazo."
        });
      }
      if (vencidos.length > 0) {
        mostrarMensagem(`⚠️ ${vencidos.length} agendamento(s) pendente(s) expiraram e foram recusados automaticamente.`, "erro");
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
