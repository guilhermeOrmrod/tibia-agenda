-- Dados do personagem do cliente (puxados da TibiaData API no agendamento).
-- Rode no Supabase: SQL Editor > New query > cole > Run.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS char_vocacao text,
  ADD COLUMN IF NOT EXISTS char_level   integer,
  ADD COLUMN IF NOT EXISTS char_mundo   text;
