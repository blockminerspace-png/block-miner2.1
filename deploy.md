# Deploy — Block Miner

Guia para publicar a aplicação (Node + React build + Postgres + Nginx) com **Docker Compose**.

## O que precisas

- **Docker** e **Docker Compose v2** (`docker compose`, não só `docker-compose` legado).
- Na VM: **Git** (se fores puxar código com `git pull`).
- Ficheiro **`.env.production`** na pasta do projeto no servidor — o `docker-compose.yml` do serviço `app` usa `env_file: .env.production`.  
  - Copia de `.env.example` / `.env.production.example` se existir, preenche segredos **no servidor** e **não commits** credenciais.
- `DATABASE_URL` no compose já é sobrescrita para `...@db:5432/...` — não é preciso duplicar no `.env.production` para o contentor `app`, mas podes deixar uma linha coerente para scripts locais.

## Na própria VM (SSH na máquina onde corre o stack)

```bash
cd ~/block-miner   # ou o caminho real do repo
git pull origin main
docker compose build
docker compose up -d
```

Rebuild completo (frontend + backend dentro da imagem, útil após mudanças no React):

```bash
docker compose build --no-cache
docker compose up -d
```

Só reconstruir o serviço da app (mantém `db` e `nginx` como estão):

```bash
docker compose up -d --build --no-deps app
```

**Health check** (o `app` escuta na porta 3000 dentro da rede Docker; no host está em `127.0.0.1:3000`):

```bash
curl -sS http://127.0.0.1:3000/health
```

## A partir do Windows (tarball + PuTTY)

Já existe o script **`scripts/deploy-vps-windows.ps1`**: cria um `.tar.gz`, envia com `pscp`, extrai na VPS e corre `docker compose up -d --build --no-deps app`.  
Lê a documentação no topo desse ficheiro (credenciais via `$env:BLOCKMINER_VPS_PW`, `.deploy-pw.txt`, etc.).

## Script Python (local ou SSH com chave)

Argumentos desconhecidos são repassados ao `ssh` (ex.: chave ou porta):

```bash
# Na máquina onde tens o repo e Docker (build aqui)
python scripts/deploy.py
# ou: npm run deploy

# Na mesma situação, forçar rebuild sem cache
python scripts/deploy.py --no-cache

# Na VM remota (autenticação por chave SSH; sem senha no script)
python scripts/deploy.py --remote root@SEU_IP --path ~/block-miner

# Com chave ou porta explícitas (parse_known_args → ssh)
python scripts/deploy.py -i ~/.ssh/id_ed25519 -p 2222 --remote root@SEU_IP --path /root/block-miner
```

Variável opcional: `BLOCKMINER_REMOTE_PATH` (default `~/block-miner`).

**Senha SSH no Windows:** o script Python não envia password; usa o fluxo do **`scripts/deploy-vps-windows.ps1`** (PuTTY) ou configura chaves com `ssh-copy-id`.

## Prisma / base de dados

O **`docker-entrypoint.sh`** do contentor `app` espera Postgres em `db:5432`, corre `prisma generate` e **`prisma db push`**.  
Para ambientes que preferem apenas migrações versionadas, avalia trocar para `prisma migrate deploy` no entrypoint ou num passo manual documentado para a tua equipa.

## Nginx e TLS

O serviço **nginx** monta `./nginx/nginx.conf` e `./nginx/certs`. Garante certificados e `server_name` alinhados com o domínio (ex.: `blockminer.space`).

## Depois do deploy

- Hard refresh no browser (Ctrl+Shift+R) para carregar o novo bundle do Vite (nome do ficheiro muda com o hash).
- Se o **login admin** falhar com mensagens antigas, confirma que a imagem nova está a correr (`docker compose ps`, `docker compose logs -f app`).
