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

