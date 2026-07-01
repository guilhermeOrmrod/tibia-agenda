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

var STATUS_ICONS = {
  pendente:     "⏳",
  aprovado:     "✅",
  em_andamento: "⚔️",
  concluido:    "🏆",
  recusado:     "❌",
  encerrado:    "🛑",
  cancelado:    "🚫",
  expirado:     "⏰"
};

var STATUS_LABELS = {
  pendente:     "Pendente",
  aprovado:     "Aprovado",
  em_andamento: "Em andamento",
  concluido:    "Concluído",
  recusado:     "Recusado",
  encerrado:    "Encerrado",
  cancelado:    "Cancelado",
  expirado:     "Expirado"
};

var abaAgAtual = "pendente";

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

var fmtBRL = (v) => `R$ ${(Number(v) || 0).toFixed(2).replace(".", ",")}`;

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

