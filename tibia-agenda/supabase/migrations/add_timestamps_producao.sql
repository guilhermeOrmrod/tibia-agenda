-- Momentos reais do serviço, para cálculo de horas trabalhadas.
-- iniciado_em  = quando virou "em andamento"
-- finalizado_em = quando virou "concluído" ou "encerrado"
-- Rode no Supabase: SQL Editor > New query > cole > Run.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS iniciado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS finalizado_em timestamptz;
