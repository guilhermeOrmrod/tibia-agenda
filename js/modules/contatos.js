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

