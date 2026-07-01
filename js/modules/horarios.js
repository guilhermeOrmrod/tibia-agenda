// =========================================
// HORÁRIOS DOS SERVICEIROS
// =========================================
var horariosCache = [];

var DIAS_ORDEM = ["Todos os dias","Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];

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

