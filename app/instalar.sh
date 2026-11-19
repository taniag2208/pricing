#!/usr/bin/env bash
# Instalador de Tita Pricing Intelligence 360° en un servidor Ubuntu 22.04 o 24.04.
# Uso: copia la carpeta app/ al servidor y ejecuta:  sudo ./instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker…"
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  echo "Configuración inicial (solo la primera vez)."
  read -rp "Dominio de la plataforma (ej. pricing.titamedia.com): " DOMAIN
  read -rp "Correo del primer administrador de Tita: " ADMIN_EMAIL
  read -rsp "Contraseña temporal del administrador (mínimo 10 caracteres; la cambiará al entrar): " ADMIN_PASSWORD; echo
  read -rsp "API key de Anthropic (sk-ant-…): " ANTHROPIC_API_KEY; echo
  umask 077
  cat > .env <<EOT
DOMAIN=$DOMAIN
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
SESSION_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
NODE_ENV=production
TZ=America/Bogota
EOT
  echo "Archivo .env creado (solo lo puede leer root)."
fi

mkdir -p respaldos
docker compose up -d --build
echo
echo "Listo. Cuando el DNS del dominio apunte a este servidor, abre https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
echo "Registros de la aplicación: docker compose logs -f app"
