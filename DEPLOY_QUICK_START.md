# 🌐 Migração de Domínio - blockminer.space

## Resumo Rápido

Este projeto está configurado para o domínio oficial **blockminer.space**.

---

## ⚡ Deploy Rápido (Linux/Mac)

```bash
# 1. Tornar script executável
chmod +x deploy.sh

# 2. Executar deploy
./deploy.sh
```

O script vai:
- ✅ Verificar/criar arquivo .env
- ✅ Validar variáveis críticas
- ✅ Configurar SSL (opcionalmente)
- ✅ Criar diretórios necessários
- ✅ Build e iniciar Docker containers

---

## 🪟 Deploy no Windows

### PowerShell (Recomendado)

```powershell
# 1. Copiar template de produção
Copy-Item .env.production .env

# 2. Editar .env e atualizar:
#    - JWT_SECRET (gerar: openssl rand -hex 64)
#    - ADMIN_EMAIL
#    - ADMIN_SECURITY_CODE
#    - WITHDRAWAL_PRIVATE_KEY
#    - ZERADS_CALLBACK_PASSWORD

# 3. Criar diretórios
New-Item -ItemType Directory -Force data, logs, backups, nginx/certs

# 4. Build e iniciar
docker-compose up -d --build

# 5. Ver logs
docker-compose logs -f
```

---

## 📋 Checklist Pré-Deploy

### Antes de rodar deploy.sh ou docker-compose:

1. **DNS Configurado**
   ```
   A record: blockminer.space → [IP-DO-SERVIDOR]
   A record: www.blockminer.space → [IP-DO-SERVIDOR]
   ```

2. **Arquivo .env Criado e Editado**
   ```bash
   cp .env.production .env
   nano .env  # ou vim, code, etc
   ```
   
   Alterar:
   - `JWT_SECRET` - Gerar com: `openssl rand -hex 64`
   - `ADMIN_EMAIL` - Seu email de admin
   - `ADMIN_SECURITY_CODE` - Senha forte para admin
   - `WITHDRAWAL_PRIVATE_KEY` - Private key da hot wallet
   - `ZERADS_CALLBACK_PASSWORD` - Senha do callback ZerAds

3. **Certificado SSL** (Produção)
   ```bash
   # Opção A: Let's Encrypt (recomendado)
   sudo certbot certonly --standalone \
     -d blockminer.space \
     -d www.blockminer.space
   
   sudo cp /etc/letsencrypt/live/blockminer.space/fullchain.pem nginx/certs/cert.pem
   sudo cp /etc/letsencrypt/live/blockminer.space/privkey.pem nginx/certs/key.pem
   
   # Opção B: Self-signed (apenas teste)
   ./deploy.sh  # Escolher opção 2 quando perguntar sobre SSL
   ```

4. **Docker Instalado**
   ```bash
   docker --version
   docker-compose --version
   ```

---

## 🔧 Configurações Importantes

### Variáveis Críticas (.env)

```bash
# CORS - Domínios permitidos
CORS_ORIGINS=https://blockminer.space,https://www.blockminer.space

# URL base da aplicação
APP_URL=https://blockminer.space

# Ambiente
NODE_ENV=production

# Segurança (GERAR NOVO!)
JWT_SECRET=[resultado-de-openssl-rand-hex-64]

# Admin
ADMIN_EMAIL=admin@blockminer.space
ADMIN_SECURITY_CODE=[senha-forte-aqui]

# Hot Wallet (para saques)
WITHDRAWAL_PRIVATE_KEY=[private-key-64-hex-chars]

# ZerAds
ZERADS_CALLBACK_PASSWORD=[senha-do-zerads]
```

### NGINX (nginx/nginx.conf)

Já configurado para:
- ✅ `blockminer.space`
- ✅ `www.blockminer.space` → redireciona para blockminer.space
- ✅ HTTP → HTTPS redirect
- ✅ SSL/TLS 1.2+
- ✅ Security headers
- ✅ WebSocket support (mining/games)

---

## 🚀 Comandos Úteis

```bash
# Iniciar serviços
docker-compose up -d

# Ver logs (todos)
docker-compose logs -f

# Ver logs (apenas app)
docker-compose logs -f app

# Ver logs (apenas nginx)
docker-compose logs -f nginx

# Reiniciar serviços
docker-compose restart

# Reiniciar apenas app
docker-compose restart app

# Parar tudo
docker-compose down

# Rebuild completo
docker-compose down
docker-compose up -d --build

# Entrar no container
docker-compose exec app sh

# Ver status
docker-compose ps
```

---

## 🧪 Testes Pós-Deploy

### 1. Health Check

```bash
curl https://blockminer.space/api/health
# Esperado: {"ok":true,"status":"healthy",...}
```

### 2. CORS

```bash
curl -H "Origin: https://blockminer.space" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://blockminer.space/api/health -v
# Deve ter header: Access-Control-Allow-Origin: https://blockminer.space
```

### 3. SSL

```bash
# Verificar certificado
openssl s_client -connect blockminer.space:443 -servername blockminer.space | grep "Verify return code"
# Esperado: Verify return code: 0 (ok)

# Teste online
# https://www.ssllabs.com/ssltest/analyze.html?d=blockminer.space
```

### 4. Redirects

```bash
# HTTP → HTTPS
curl -I http://blockminer.space
# Esperado: 301 → https://blockminer.space

# WWW → non-WWW
curl -I https://www.blockminer.space
# Esperado: 301 → https://blockminer.space
```

### 5. Páginas Principais

- https://blockminer.space → Homepage
- https://blockminer.space/login.html → Login
- https://blockminer.space/register.html → Registro
- https://blockminer.space/dashboard.html → Dashboard (após login)
- https://blockminer.space/admin/login.html → Admin Login
- https://blockminer.space/earnings-ptc.html → ZerAds PTC

---

## 🔐 Segurança

### Gerar JWT Secret

```bash
# Linux/Mac/Git Bash
openssl rand -hex 64

# PowerShell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### Gerar Private Key (Nova Wallet)

```bash
# Se você ainda não tem uma hot wallet, gerar com:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

⚠️ **IMPORTANTE:** Guarde a private key em local seguro! Perder = perder fundos.

---

## 📝 ZerAds Callback

Após deploy, informar ao suporte ZerAds:

```
Callback URL: https://blockminer.space/zeradsptc.php
Password: [valor-de-ZERADS_CALLBACK_PASSWORD]
Site ID: 10146
```

Eles vão configurar no sistema deles.

---

## 🆘 Problemas Comuns

### "blocked by CORS policy"

**Solução:**
```bash
# Verificar .env
grep CORS_ORIGINS .env

# Deve ter:
# CORS_ORIGINS=https://blockminer.space,https://www.blockminer.space

# Se não tiver, adicionar e reiniciar
docker-compose restart app
```

### "Your connection is not private"

**Solução:**
```bash
# Verificar certificados
ls -la nginx/certs/
# Devem existir: cert.pem e key.pem

# Gerar certificado Let's Encrypt
sudo certbot certonly --standalone -d blockminer.space -d www.blockminer.space
sudo cp /etc/letsencrypt/live/blockminer.space/fullchain.pem nginx/certs/cert.pem
sudo cp /etc/letsencrypt/live/blockminer.space/privkey.pem nginx/certs/key.pem
docker-compose restart nginx
```

### WebSocket não conecta

**Solução:**
```bash
# Verificar logs do nginx
docker-compose logs nginx | grep -i upgrade

# Testar WebSocket
wscat -c wss://blockminer.space/socket.io/

# Se não funcionar, verificar firewall
sudo ufw allow 443/tcp
```

### Saques não funcionam

**Solução:**
```bash
# Verificar se WITHDRAWAL_PRIVATE_KEY está configurada
docker-compose exec app node -e "console.log(process.env.WITHDRAWAL_PRIVATE_KEY ? 'OK' : 'NOT SET')"

# Verificar hot wallet tem fundos
# (checar no PolygonScan)
```

---

## 📚 Documentação Completa

Para guia detalhado passo-a-passo, leia: **[DOMAIN_SETUP.md](./DOMAIN_SETUP.md)**

---

## 📞 Suporte Rápido

```bash
# Verificar se app está rodando
docker-compose ps

# Ver últimos logs (erros)
docker-compose logs --tail=50 app

# Health check
curl -s https://blockminer.space/api/health | jq

# Verificar DNS
nslookup blockminer.space

# Verificar porta aberta
telnet blockminer.space 443
```

---

**Última atualização:** 2026-02-23  
**Domínio:** blockminer.space  
**Ambiente:** Production
