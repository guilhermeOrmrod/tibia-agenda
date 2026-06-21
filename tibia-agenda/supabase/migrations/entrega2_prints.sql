-- ============================================================
-- Entrega 2: bucket de Storage para prints dos serviços
-- ============================================================
-- O Storage do Supabase NÃO se cria por SQL comum — faça pelo painel:
--
-- 1. No Supabase, vá em Storage (menu lateral) > New bucket
-- 2. Name: prints-servicos
-- 3. Public bucket: MARQUE como público (os prints serão vistos pelo cliente
--    via link direto no histórico). Como o nome do arquivo é aleatório/único,
--    não dá pra "adivinhar" o print de outro serviço.
-- 4. Create bucket
--
-- Coluna para guardar o link do print no agendamento:

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS print_url text;
