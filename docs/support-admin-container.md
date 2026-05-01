# Support/Admin container

O `support-admin` e uma segunda instancia da mesma imagem do `app`. Ele serve o mesmo painel em `/admin/*`, usa o mesmo backend/admin API, conecta no mesmo Postgres do Compose e inicia com `ADMIN_ONLY_MODE=true`.

Variaveis:

```env
SUPPORT_ADMIN_DOMAIN=
SUPPORT_ADMIN_PUBLIC_URL=
SUPPORT_ADMIN_HOST_PORT=1001
SUPPORT_ADMIN_INTERNAL_PORT=3000
SUPPORT_ADMIN_ALLOWED_ORIGINS=
SUPPORT_ADMIN_COOKIE_DOMAIN=
```

Mapeamento local padrao:

```text
app principal: 127.0.0.1:${APP_HOST_PORT:-3000} -> container app:3000
support/admin: 127.0.0.1:${SUPPORT_ADMIN_HOST_PORT:-1001} -> container support-admin:3000
```

Exemplo de reverse proxy Nginx para o dominio support, preenchendo valores reais no arquivo da VM:

```nginx
server {
  listen 80;
  server_name support.example.com;
  return 301 https://support.example.com$request_uri;
}

server {
  listen 443 ssl;
  http2 on;
  server_name support.example.com;

  ssl_certificate /etc/letsencrypt/live/support.example.com/cert.pem;
  ssl_certificate_key /etc/letsencrypt/live/support.example.com/key.pem;

  location / {
    proxy_pass http://127.0.0.1:1001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }
}
```

Validacao:

```bash
docker compose config
docker compose build support-admin
docker compose up -d support-admin
curl -i http://127.0.0.1:${SUPPORT_ADMIN_HOST_PORT:-1001}/admin/login
```
