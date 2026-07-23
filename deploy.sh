#!/bin/bash
# ─── Деплой SongCraft на сервер ──────────────────────────────────────────
# Заполни переменные ниже (или задай их через окружение) и запусти:
#   bash deploy.sh
#
# БЕЗОПАСНОСТЬ: приватный SSH-ключ НИКОГДА не хранится в этом файле.
# Указывай ПУТЬ к файлу ключа (например ~/.ssh/id_songcraft), а сам ключ
# держи только локально с правами 600. Файл ключа добавлен в .gitignore.
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

# === ЗАПОЛНИ (можно переопределить через переменные окружения) ===
SSH_HOST="${SSH_HOST:-root@178.105.255.47}"       # user@host
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_songcraft}"      # ПУТЬ к приватному ключу, не сам ключ
REMOTE_DIR="${REMOTE_DIR:-/opt/songcraft}"         # каталог проекта на сервере

# === Дальше не трогай ===
SRC="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "${SSH_KEY}" ]]; then
  echo "✖ Файл ключа не найден: ${SSH_KEY}"
  echo "  Создай ключ (ssh-keygen -t ed25519 -f ${SSH_KEY}), добавь публичную часть в"
  echo "  ~/.ssh/authorized_keys на сервере и укажи путь в SSH_KEY."
  exit 1
fi
chmod 600 "${SSH_KEY}" 2>/dev/null || true

SSH=(ssh -p "${SSH_PORT}" -i "${SSH_KEY}" "${SSH_HOST}")
SCP=(scp -P "${SSH_PORT}" -i "${SSH_KEY}")

echo "═══ Собираем .next ═══"
cd "${SRC}"
npm run build

echo "═══ Пакуем файлы ═══"
# Только исходники — Docker на сервере сам соберёт образ
tar czf /tmp/songcraft-src.tar.gz \
  src/ \
  prisma/ \
  public/ \
  scripts/ \
  services/ \
  package.json \
  package-lock.json \
  tsconfig.json \
  tsconfig.worker.json \
  next.config.ts \
  tsconfig-paths-register.js \
  Dockerfile \
  docker-compose.yml

echo "═══ Копируем на ${SSH_HOST}:${REMOTE_DIR} ═══"
"${SCP[@]}" /tmp/songcraft-src.tar.gz "${SSH_HOST}:/tmp/songcraft-src.tar.gz"

echo "═══ Распаковываем и перезапускаем Docker ═══"
"${SSH[@]}" "set -e
  mkdir -p ${REMOTE_DIR}
  cd ${REMOTE_DIR}
  tar xzf /tmp/songcraft-src.tar.gz --overwrite
  rm -f /tmp/songcraft-src.tar.gz
  docker compose down
  docker compose up -d --build
  sleep 8
  docker compose ps"

rm -f /tmp/songcraft-src.tar.gz
echo "═══ Готово ═══"
