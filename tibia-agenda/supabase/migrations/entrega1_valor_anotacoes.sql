-- Entrega 1: valor do serviço + anotações.
-- (Timeline usa colunas que já existem: criado_em, iniciado_em, finalizado_em.)
-- Rode no Supabase: SQL Editor > New query > cole > Run.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS valor_final numeric,      -- valor cobrado (ajustável pelo serviceiro)
  ADD COLUMN IF NOT EXISTS anotacoes   text;          -- diário do serviço (serviceiro/admin escrevem)
