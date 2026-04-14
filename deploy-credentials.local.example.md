# Credenciais VPS (exemplo — não coloques passwords reais aqui)

Este ficheiro **pode** ser commitado. Copia para `deploy-credentials.local.md` (ignorado pelo Git) e preenche.

| Campo | Exemplo |
|--------|---------|
| Host | `your.server.ip` |
| User | `root` |
| Password | *(só no ficheiro local)* |

## Ficheiros locais (nunca no Git)

- `deploy-credentials.local.md` — notas humanas + credenciais
- `scripts/deploy_credentials.local.py` — constantes para scripts Python
- `.deploy-pw.txt` — **uma linha**, só a password (usado por `scripts/deploy-vps-windows.ps1`)

Se a password tiver sido partilhada em chat ou issue, **altera-a no servidor**.

---

## GitHub Actions — deploy automático na VM de teste (gitflow)

Fluxo: pushes na branch **`develop`** disparam o **CI**; quando o CI conclui com sucesso, o workflow **Deploy Test VM** faz SSH no servidor de teste, faz bootstrap do clone se necessário, e executa `scripts/deploy-production-safe.sh`.

**IP de teste por defeito no workflow:** `89.167.114.67` (user `root`). Podes sobrepor com a variable `TEST_VPS_HOST`.

### Variáveis no repositório (Settings → Secrets and variables → Actions → Variables)

| Variable | Valor |
|----------|--------|
| `ENABLE_TEST_VM_DEPLOY` | `true` para ativar o deploy automático na VM de teste |

| Variable (opcional) | Exemplo |
|---------------------|---------|
| `TEST_VPS_HOST` | `89.167.114.67` (omitir para usar o default do workflow) |
| `TEST_VPS_USER` | `root` |
| `TEST_VPS_APP_PATH` | `/root/block-miner-v3` |
| `TEST_REPO_URL` | `https://github.com/blockminerspace-png/block-miner-v3.git` |
| `TEST_GIT_BRANCH` | `develop` |
| `TEST_VPS_PORT` | `22` |

### Secrets (Settings → Secrets and variables → Actions → Secrets)

| Secret | Descrição |
|--------|-----------|
| `TEST_VPS_PASSWORD` | **Obrigatório** para o workflow atual: password SSH do `root` na VM de teste |

**Alternativa (recomendado a médio prazo):** em vez de password, configura chave SSH no servidor e adapta o workflow para usar `key: ${{ secrets.TEST_VPS_SSH_PRIVATE_KEY }}` (e remove `password`).

**Não** reutilizes os secrets de produção (`VPS_HOST`, etc.). Mantém teste e produção separados.

**Rotação:** se a password da VM de teste foi escrita em chat ou issue, altera-a no servidor e atualiza o secret `TEST_VPS_PASSWORD`.

### Git (local)

```bash
git checkout -b develop
git push -u origin develop
```

Features: trabalhar em `feature/...`, abrir PR para `develop`. Após merge em `develop`, o CI corre e o deploy na VM de teste corre se `ENABLE_TEST_VM_DEPLOY=true`.
