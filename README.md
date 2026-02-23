# Block Miner

Servidor Node.js (Express + Socket.IO + SQLite) para simulação de mineração, carteira, faucet e recursos administrativos.

**Domínio Oficial:** [blockminer.space](https://blockminer.space)

## 🚀 Deploy Rápido (Produção)

**Novo domínio blockminer.space?** Leia primeiro:
- **[DEPLOY_QUICK_START.md](./DEPLOY_QUICK_START.md)** - Guia rápido de deploy
- **[DOMAIN_SETUP.md](./DOMAIN_SETUP.md)** - Configuração completa do domínio

```bash
# Deploy automatizado (Linux/Mac)
chmod +x deploy.sh
./deploy.sh

# Deploy manual (Windows/Linux)
cp .env.production .env
# Editar .env com suas configurações
docker-compose up -d --build
```

---

## Requisitos

- Node.js 20+
- npm 10+
- Docker & Docker Compose (para produção)
- Variáveis de ambiente definidas (base em `.env.example`)

## Setup local

1. Instale dependências:
   - `npm ci`
2. Configure ambiente:
   - copie `.env.example` para `.env`
   - preencha segredos obrigatórios (`JWT_SECRET`, `WITHDRAWAL_PRIVATE_KEY` ou `WITHDRAWAL_MNEMONIC`, etc.)
3. Rode em desenvolvimento:
   - `npm run dev`

## Comandos

- `npm start`: inicia servidor em produção
- `npm run dev`: inicia com nodemon
- `npm test`: executa testes (`node:test`)
- `npm run lint`: executa lint
- `npm run format`: valida formatação
- `npm run backup`: executa backup manual

## Operação com Docker

- Subir stack:
  - `docker compose up -d --build`
- Logs:
  - `docker compose logs -f app`
- Parar:
  - `docker compose down`

## Checklist de produção

- [ ] `JWT_SECRET` com no mínimo 32 caracteres
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGINS` configurado para domínio real
- [ ] `ADMIN_EMAIL` e `ADMIN_SECURITY_CODE` configurados
- [ ] Chave da hot wallet (`WITHDRAWAL_PRIVATE_KEY`/`WITHDRAWAL_MNEMONIC`) protegida
- [ ] HTTPS ativo em proxy reverso (Nginx)
- [ ] `DB_PATH`, `BACKUP_DIR` e retenção de backup configurados
- [ ] Cron de backup habilitado e restore testado
- [ ] CI verde (`test` + `lint`)

## Segurança (resumo)

- Sessão por cookie `HttpOnly` + CSRF
- JWT com `issuer`/`audience`
- Rate limit por endpoint
- Hardening de headers com `helmet`
- Logs com escrita assíncrona e rotação por tamanho

## Estrutura (alto nível)

- `server.js`: bootstrap HTTP e registro de rotas
- `src/services/publicStateService.js`: agregações de estado público
- `src/socket/registerMinerSocketHandlers.js`: handlers Socket.IO
- `controllers/`: lógica de API
- `middleware/`: auth, csrf, rate limit, csp
- `routes/`: composição de rotas
- `cron/`: tarefas recorrentes
