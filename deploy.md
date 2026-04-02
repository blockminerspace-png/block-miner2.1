# Deploy — Block Miner

**Este ficheiro é o guia oficial de deploy.** Usa sempre estes passos (VM, Windows ou script). O `Dockerfile` faz build do React dentro da imagem; em produção normalmente só precisas de reconstruir o serviço **`app`**.

## Requisitos

- **Docker** + **Docker Compose v2** (`docker compose`).
- Na VM: **Git** + clone do repo no path real (ex.: `/root/block-miner`).
- **`.env.production`** na raiz do projeto **no servidor** (não commits). Copia de `.env.example` / `.env.production.example` e preenche segredos aí.
- `DATABASE_URL` no `docker-compose.yml` já aponta para `db:5432` dentro da rede Docker.

### Credenciais só para deploy (nunca no Git)

| Ficheiro | Commit? |
|----------|--------|
| **`deploy.secrets.example`** | Sim — modelo sem segredos |
| **`deploy.secrets.local`** | **Não** — está no `.gitignore` |

1. Copia `deploy.secrets.example` → **`deploy.secrets.local`** (na raiz do repo).
2. Preenche `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `REMOTE_PATH`.
3. No Windows, **`scripts/deploy-vps-windows.ps1`** lê `deploy.secrets.local` sozinho (host, user, path e password).

Quem automatiza deploy (incl. assistente) pode ler **`deploy.secrets.local`** — desde que continues a **não** o adicionar ao Git.

---

## Escolhe o cenário

| Situação | O que fazer |
|----------|-------------|
| Estás **com SSH na VPS** (Linux) | Secção [Na própria VM](#1-na-própria-vm-com-ssh) |
| Estás no **Windows** com password SSH / PuTTY | Secção [Windows + PuTTY](#2-windows--putty-scriptsdeploy-vps-windowsp1) |
| Tens **OpenSSH + chave** e queres um comando da tua máquina | Secção [Python remoto](#3-script-python-deploy-remoto-com-chave-ssh) |
| Tens **só Docker nesta máquina** (teste local) | Secção [Deploy local](#4-deploy-local-docker-nesta-máquina) |

### Atalhos npm (na raiz do repo)

| Comando | Equivalente |
|---------|-------------|
| `npm run deploy` | `python scripts/deploy.py` — build + `up -d` do compose **nesta máquina** |
| `npm run deploy:app` | `python scripts/deploy.py --service app` — só o serviço **app** (recomendado após mudanças no código) |
| `npm run deploy:app:nocache` | Igual com `build --no-cache` |

Deploy **remoto** por Python não usa password; precisas de chave SSH. Para password no Windows usa o script PowerShell abaixo.

---

## 1. Na própria VM (com SSH)

Conecta à VPS, vai à pasta do projeto e puxa o código + Docker:

```bash
cd /root/block-miner   # ou ~/block-miner — o path real do teu clone
git pull origin main
docker compose up -d --build --no-deps app
```

Stack completo (inclui `db` + `nginx`) se mudaste compose ou primeira vez:

```bash
docker compose build
docker compose up -d
```

Rebuild agressivo (cache):

```bash
docker compose build --no-cache
docker compose up -d
```

**Health check** (app em `127.0.0.1:3000` no host):

```bash
curl -sS http://127.0.0.1:3000/health
```

---

## 2. Windows + PuTTY (`scripts/deploy-vps-windows.ps1`)

Para enviar o projeto **a partir do Windows** com **password** (sem chave SSH no `deploy.py`):

1. Instala **PuTTY** (`pscp.exe` e `plink.exe`, normalmente em `C:\Program Files\PuTTY\`).
2. Garante **`deploy.secrets.local`** na raiz (ver tabela acima). Alternativas: `$env:BLOCKMINER_VPS_PW`, **`.deploy-pw.txt`** (uma linha), ou **`-PwFile`**.
3. No PowerShell, na raiz do repo:

```powershell
Set-Location "c:\caminho\para\block-miner"
.\scripts\deploy-vps-windows.ps1
```

Parâmetros úteis (override ao ficheiro de secrets): `-SshHost`, `-SshUser`, `-RemotePath`, `-PwFile`. Valores por defeito no `.ps1` aplicam-se se não houver `deploy.secrets.local`.

O script cria um `.tar.gz`, envia com `pscp`, extrai na VPS e corre `docker compose up -d --build --no-deps app`.

---

## 3. Script Python deploy remoto (com chave SSH)

Na máquina onde tens **OpenSSH** e a chave já autorizada no servidor:

```bash
python scripts/deploy.py --remote root@SEU_IP --path /root/block-miner --service app
```

Sem cache:

```bash
python scripts/deploy.py --no-cache --remote root@SEU_IP --path /root/block-miner --service app
```

Opções extra passam para o `ssh` (ex.: `-i ~/.ssh/id_ed25519`, `-p 2222`).

Variável opcional: **`BLOCKMINER_REMOTE_PATH`** (default `~/block-miner` no parser; usa `--path` para bater certo com o clone na VPS).

---

## 4. Deploy local (Docker nesta máquina)

Útil para validar imagem antes de subir à VPS:

```bash
npm run deploy:app
# ou
python scripts/deploy.py --service app
```

Opcional: `git pull` antes (só local):

```bash
python scripts/deploy.py --git-pull --service app
```

---

## Prisma / base de dados

O **`docker-entrypoint.sh`** do contentor `app` espera Postgres em `db:5432`, corre `prisma generate` e **`prisma db push`**.

---

## Nginx e TLS

O serviço **nginx** monta `./nginx/nginx.conf` e `./nginx/certs`. Alinha `server_name` e certificados com o domínio (ex.: `blockminer.space`).

---

## Depois do deploy

- **Hard refresh** no browser (Ctrl+Shift+R) para carregar o bundle novo do Vite.
- Se algo falhar: `docker compose ps`, `docker compose logs -f app` na VPS.

---

## Problemas frequentes

- **Timeout no `deploy-vps-windows.ps1`:** firewall, IP da VPS mudou, ou SSH fechado. Confirma host no `-SshHost` e acesso `ping`/porta 22.
- **`git push` para outro remoto falha com `unpack failed`:** problema no repositório GitHub/Git remoto; o deploy na VM usa `git pull` do remoto que lá estiver configurado (`origin`).
- **`deploy.py --remote` pede password em loop:** esse fluxo é só com chave; para password usa a secção **Windows + PuTTY** acima.
