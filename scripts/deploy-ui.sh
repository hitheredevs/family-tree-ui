#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${UI_DOMAIN:-family.hitheredevs.com}"
WEB_ROOT="${UI_WEB_ROOT:-/var/www/family-tree-ui}"
DIST_DIR="${UI_DIST_DIR:-dist}"
NGINX_SITE_PATH="/etc/nginx/sites-available/${DOMAIN}"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

require_sudo() {
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required for nginx/certbot setup"
    exit 1
  fi
}

install_nginx() {
  if command -v nginx >/dev/null 2>&1; then
    return
  fi

  sudo apt-get update
  sudo apt-get install -y nginx
}

install_certbot() {
  if command -v certbot >/dev/null 2>&1; then
    return
  fi

  sudo apt-get update
  sudo apt-get install -y certbot python3-certbot-nginx
}

ensure_web_root() {
  sudo mkdir -p "${WEB_ROOT}"
  sudo mkdir -p "${WEB_ROOT}/releases"
}

write_nginx_config() {
  sudo tee "${NGINX_SITE_PATH}" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${WEB_ROOT}/current;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

  sudo ln -sfn "${NGINX_SITE_PATH}" "${NGINX_SITE_LINK}"
  if [[ -L /etc/nginx/sites-enabled/default ]]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
}

deploy_build() {
  if [[ ! -d "${DIST_DIR}" ]]; then
    echo "Build output not found at ${DIST_DIR}"
    exit 1
  fi

  local release_dir
  release_dir="${WEB_ROOT}/releases/$(date +%Y%m%d%H%M%S)"
  sudo mkdir -p "${release_dir}"
  sudo cp -R "${DIST_DIR}/." "${release_dir}/"
  sudo ln -sfn "${release_dir}" "${WEB_ROOT}/current"
}

enable_and_reload_nginx() {
  sudo nginx -t
  sudo systemctl enable nginx
  sudo systemctl reload nginx || sudo systemctl restart nginx
}

ensure_certificate() {
  if [[ -z "${CERTBOT_EMAIL}" ]]; then
    echo "CERTBOT_EMAIL is required to provision TLS certificates"
    exit 1
  fi

  if sudo test -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"; then
    return
  fi

  sudo certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "${CERTBOT_EMAIL}" \
    -d "${DOMAIN}"
}

cleanup_old_releases() {
  if [[ -d "${WEB_ROOT}/releases" ]]; then
    sudo find "${WEB_ROOT}/releases" -mindepth 1 -maxdepth 1 -type d | sort | head -n -3 | xargs -r sudo rm -rf
  fi
}

main() {
  require_sudo
  install_nginx
  install_certbot
  ensure_web_root
  write_nginx_config
  deploy_build
  enable_and_reload_nginx
  ensure_certificate
  enable_and_reload_nginx
  cleanup_old_releases
}

main "$@"
