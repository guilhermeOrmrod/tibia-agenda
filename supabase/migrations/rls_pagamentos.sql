-- ============================================================
-- RLS da tabela `pagamentos` — visibilidade por papel
--   admin      → vê e gere tudo
--   serviceiro → vê pagamentos dos chamados dele (serviceiro = seu serviceiro_nome/nick)
--   cliente    → vê apenas os próprios (nome = seu nick)
-- Rode no Supabase: SQL Editor > New query > cole > Run.
-- (As gravações/aprovações continuam via Edge Function com service_role,
--  que ignora RLS — então isto controla apenas a LEITURA direta.)
-- ============================================================

ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;

-- Remove policies antigas com estes nomes (evita duplicar ao re-rodar)
DROP POLICY IF EXISTS pag_admin_all      ON pagamentos;
DROP POLICY IF EXISTS pag_serviceiro_sel ON pagamentos;
DROP POLICY IF EXISTS pag_cliente_sel    ON pagamentos;
DROP POLICY IF EXISTS pag_insert_logado  ON pagamentos;

-- Admin: leitura total (demais ações já passam pela Edge Function)
CREATE POLICY pag_admin_all ON pagamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Serviceiro: vê pagamentos cujo campo `serviceiro` bate com o nome vinculado dele
CREATE POLICY pag_serviceiro_sel ON pagamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.id = auth.uid()
        AND p.role = 'serviceiro'
        AND pagamentos.serviceiro = COALESCE(p.serviceiro_nome, p.nick)
    )
  );

-- Cliente: vê apenas os próprios pagamentos (nome = seu nick, sem diferenciar maiúsculas)
CREATE POLICY pag_cliente_sel ON pagamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.id = auth.uid()
        AND p.role = 'cliente'
        AND lower(pagamentos.nome) = lower(p.nick)
    )
  );

-- Inserção: qualquer usuário logado pode enviar um comprovante
CREATE POLICY pag_insert_logado ON pagamentos
  FOR INSERT TO authenticated
  WITH CHECK (true);
