-- Vínculo entre a conta de serviceiro (perfis) e o nome usado nos agendamentos.
-- Rode isto no Supabase: SQL Editor > New query > cole > Run.

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS serviceiro_nome text;

-- (opcional) índice para acelerar o filtro do painel do serviceiro
CREATE INDEX IF NOT EXISTS idx_perfis_serviceiro_nome
  ON perfis (serviceiro_nome);
