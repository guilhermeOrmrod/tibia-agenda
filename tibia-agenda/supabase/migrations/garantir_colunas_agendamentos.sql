-- Garante TODAS as colunas extras que o front usa em agendamentos.
-- Idempotente: pode rodar sem medo, não dá erro se a coluna já existir.
-- Rode no Supabase: SQL Editor > New query > cole > Run.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS char_vocacao  text,
  ADD COLUMN IF NOT EXISTS char_level    integer,
  ADD COLUMN IF NOT EXISTS char_mundo    text,
  ADD COLUMN IF NOT EXISTS iniciado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS finalizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS obs_conclusao text;
