# Configuração de Domínio - blockminer.space

## 📋 Checklist de Configuração

Este guia detalha todos os passos necessários para configurar o domínio oficial **blockminer.space** no BlockMiner.

---

## 1️⃣ Configuração de DNS

Configure os seguintes registros DNS no seu provedor de domínio:

```
Tipo    Nome    Valor                        TTL
A       @       [IP-DO-SEU-SERVIDOR]         300
A       www     [IP-DO-SEU-SERVIDOR]         300
CNAME   www     blockminer.space             300
```

**Tempo de propagação:** 5 minutos a 48 horas (normalmente < 1 hora)

---

## 2️⃣ Configuração do Arquivo .env

Atualize o arquivo `.env` com as seguintes variáveis:

```bash
# ============================================================================
# CORS & DEPLOYMENT
# ============================================================================

# Domínios permitidos (HTTPS e WWW)
CORS_ORIGINS=https://blockminer.space,https://www.blockminer.space

# URL base da aplicação
APP_URL=https://blockminer.space

# Ambiente de produção
NODE_ENV=production
PORT=3000

# ============================================================================
# SECURITY (IMPORTANTE!)
# ============================================================================

# Gere um JWT secret forte (execute no terminal):
# openssl rand -hex 64
JWT_SECRET=[COLE-O-RESULTADO-AQUI]

# Credenciais do Admin
ADMIN_EMAIL=seu-email@blockminer.space
ADMIN_SECURITY_CODE=SenhaForte123!
```

---

## 3️⃣ Configuração do NGINX

Atualize o arquivo `nginx/nginx.conf`:

### Antes:
```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name _;
```

### Depois:
```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name blockminer.space www.blockminer.space;
```

### Arquivo completo atualizado:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name blockminer.space www.blockminer.space;
    return 301 https://blockminer.space$request_uri;
}

# Redirect www to non-www (opcional, mas recomendado)
server {
    listen 443 ssl;
    http2 on;
    server_name www.blockminer.space;
    
    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    
    return 301 https://blockminer.space$request_uri;
}

# HTTPS server principal
server {
    listen 443 ssl;
    http2 on;
    server_name blockminer.space;

    # SSL certificates from Let's Encrypt
    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer" always;

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 4️⃣ Certificado SSL (Let's Encrypt)

### Opção A: Certbot Manual (Recomendado)

```bash
# Instalar certbot
sudo apt update
sudo apt install certbot

# Gerar certificado
sudo certbot certonly --standalone -d blockminer.space -d www.blockminer.space

# Certificados estarão em:
# /etc/letsencrypt/live/blockminer.space/fullchain.pem
# /etc/letsencrypt/live/blockminer.space/privkey.pem

# Copiar para o diretório do projeto
sudo cp /etc/letsencrypt/live/blockminer.space/fullchain.pem nginx/certs/cert.pem
sudo cp /etc/letsencrypt/live/blockminer.space/privkey.pem nginx/certs/key.pem
sudo chmod 644 nginx/certs/cert.pem
sudo chmod 600 nginx/certs/key.pem
```

### Opção B: Docker + Certbot (Automático)

```bash
# Adicionar ao docker-compose.yml (opcional)
certbot:
  image: certbot/certbot
  volumes:
    - ./nginx/certs:/etc/letsencrypt
  command: certonly --webroot -w /var/www/certbot -d blockminer.space -d www.blockminer.space --email seu-email@blockminer.space --agree-tos --no-eff-email
```

### Renovação Automática

Adicione ao crontab do servidor:

```bash
# Editar crontab
sudo crontab -e

# Adicionar linha (renovar a cada 2 meses às 3AM)
0 3 1 */2 * certbot renew --quiet && docker-compose restart nginx
```

---

## 5️⃣ Deploy e Testes

### 1. Rebuild Docker (se usando Docker)

```bash
# Parar containers
docker-compose down

# Rebuild e reiniciar
docker-compose up -d --build

# Verificar logs
docker-compose logs -f app
docker-compose logs -f nginx
```

### 2. Testar CORS

```bash
# Testar de outro domínio (deve funcionar)
curl -H "Origin: https://blockminer.space" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://blockminer.space/api/health -v

# Deve retornar header:
# Access-Control-Allow-Origin: https://blockminer.space
```

### 3. Testar SSL

```bash
# Verificar certificado
openssl s_client -connect blockminer.space:443 -servername blockminer.space

# Teste online
# https://www.ssllabs.com/ssltest/analyze.html?d=blockminer.space
```

### 4. Verificar Redirecionamentos

```bash
# HTTP → HTTPS deve redirecionar
curl -I http://blockminer.space
# Should return: 301 → https://blockminer.space

# WWW → non-WWW deve redirecionar (se configurado)
curl -I https://www.blockminer.space
# Should return: 301 → https://blockminer.space
```

---

## 6️⃣ Variáveis de Ambiente Adicionais

### ZerAds (se aplicável)

Se o ZerAds precisar saber o domínio para callbacks:

```bash
# No .env
ZERADS_CALLBACK_URL=https://blockminer.space/zeradsptc.php
```

Informe ao ZerAds o novo callback URL no painel deles.

---

## 7️⃣ Monitoramento

### Logs do NGINX

```bash
# Logs de acesso
docker-compose exec nginx tail -f /var/log/nginx/access.log

# Logs de erro
docker-compose exec nginx tail -f /var/log/nginx/error.log
```

### Logs da Aplicação

```bash
docker-compose logs -f app
```

---

## 8️⃣ Rollback (Se Necessário)

Se algo der errado:

```bash
# 1. Reverter nginx.conf
git checkout nginx/nginx.conf

# 2. Reverter .env
# Restaurar valores antigos de CORS_ORIGINS e APP_URL

# 3. Reiniciar
docker-compose restart
```

---

## ✅ Checklist Final

- [ ] DNS configurado e propagado
- [ ] `.env` atualizado com `CORS_ORIGINS` e `APP_URL`
- [ ] `nginx.conf` atualizado com `server_name`
- [ ] Certificado SSL instalado e válido
- [ ] Docker rebuild executado
- [ ] Teste de CORS passou
- [ ] Redirecionamento HTTP → HTTPS funcionando
- [ ] Redirecionamento WWW → non-WWW funcionando (se configurado)
- [ ] WebSocket funcionando (testar mining/games)
- [ ] ZerAds callback URL atualizado (se aplicável)
- [ ] Logs monitorados por 24h

---

## 🆘 Problemas Comuns

### CORS Bloqueado

**Sintoma:** Console do navegador mostra "blocked by CORS policy"

**Solução:**
```bash
# Verificar .env
grep CORS_ORIGINS .env

# Deve mostrar:
# CORS_ORIGINS=https://blockminer.space,https://www.blockminer.space

# Reiniciar app
docker-compose restart app
```

### SSL Certificate Error

**Sintoma:** "Your connection is not private" no navegador

**Solução:**
```bash
# Verificar certificados
ls -la nginx/certs/

# Devem existir:
# cert.pem (certificado)
# key.pem (chave privada)

# Verificar permissões
chmod 644 nginx/certs/cert.pem
chmod 600 nginx/certs/key.pem

# Reiniciar nginx
docker-compose restart nginx
```

### WebSocket Connection Failed

**Sintoma:** Mining/games não funcionam

**Solução:**
```bash
# Verificar se nginx está fazendo upgrade de conexão
docker-compose logs nginx | grep Upgrade

# Testar WebSocket manualmente
wscat -c wss://blockminer.space/socket.io/
```

---

## 📞 Suporte

Se precisar de ajuda:
1. Verificar logs: `docker-compose logs -f`
2. Testar health endpoint: `curl https://blockminer.space/api/health`
3. Verificar DNS: `nslookup blockminer.space`
4. Verificar porta aberta: `telnet blockminer.space 443`

---

**Última atualização:** 2026-02-23
**Domínio:** blockminer.space
**Versão:** 1.0
