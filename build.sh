#!/bin/bash
# build.sh — Junta os módulos e gera as versões minificadas para produção.
#
# Você edita os arquivos em js/modules/ (cada um cuida de um assunto).
# Este script junta todos na ordem certa e gera o script.min.js que o site usa.
#
# Pré-requisito (instalar uma vez):
#   npm install -g terser clean-css-cli
#
# Uso:  bash build.sh

echo "📦 Juntando os módulos na ordem de dependência..."
cat \
  js/modules/core.js \
  js/modules/admin.js \
  js/modules/horarios.js \
  js/modules/agendamentos-admin.js \
  js/modules/usuarios.js \
  js/modules/dashboard.js \
  js/modules/auth.js \
  js/modules/contatos.js \
  js/modules/pagamentos.js \
  js/modules/historico.js \
  js/modules/permissoes.js \
  js/modules/faq.js > js/script.js

echo "🔨 Minificando JavaScript..."
terser js/script.js --compress --mangle --output js/script.min.js

echo "🔨 Minificando CSS..."
cleancss -o css/style.min.css css/style.css

echo "✅ Pronto! O site usa js/script.min.js e css/style.min.css"
echo "   (você edita em js/modules/ e roda este script)"
