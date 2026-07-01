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

