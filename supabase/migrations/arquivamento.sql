-- Arquivamento de serviços (fechar o mês sem perder dados).
-- Serviços arquivados somem das telas, mas continuam no banco.
-- Rode no Supabase: SQL Editor > New query > cole > Run.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS arquivado boolean DEFAULT false;

-- Índice opcional para acelerar os filtros por arquivado
CREATE INDEX IF NOT EXISTS idx_agendamentos_arquivado ON agendamentos(arquivado);
