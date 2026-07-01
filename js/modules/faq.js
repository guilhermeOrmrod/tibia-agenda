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
