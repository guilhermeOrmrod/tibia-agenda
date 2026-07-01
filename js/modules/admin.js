// =========================================
// PAINEL ADMIN
// =========================================
var cfgAtual = { hunts: [], serviceiros: {}, precos: {}, senhas: {} };

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

