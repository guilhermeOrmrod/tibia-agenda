// =========================================
// SISTEMA DE AUTENTICAÇÃO — Supabase Auth
// =========================================
var tipoUsuario = null; // "admin" | "serviceiro" | "cliente" | null

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

