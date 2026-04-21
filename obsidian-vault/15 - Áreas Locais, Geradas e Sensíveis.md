# Áreas Locais, Geradas e Sensíveis

Esta nota registra partes reais do workspace que existem localmente, mas não devem ser confundidas com código-fonte principal.

## Dependências e artefatos gerados

```text
node_modules/
client/node_modules/
contracts/node_modules/
client/dist/
coverage/
client/coverage/
__pycache__/
server/logs/
logs/
uploads/
```

## Dados, bancos e backups

```text
data/
├── blockminer.db
└── blockminer_recovered.db

backups/
├── backup.log
├── cron.log
├── blockminer-db-*.sql.gz
├── blockminer-full-*.tar.gz
└── BM_SECURE_*.sql.gz.gpg

admin-export-db-20260305-194835.db
backup-2026-04-17T00-46-57-896Z.sql
```

## Arquivos de ambiente e segredos locais

```text
.env
.env.example
.env.production
.env.production.example
.env.production.vm-backup
deploy.secrets.example
deploy.secrets.local
deploy-credentials.local.example.md
deploy-credentials.local.md
scripts/vm_config_secret.example.py
scripts/vm_config_secret.py
```

## Ferramentas auxiliares e vendors

```text
vendor-notebooklm/
LiveDashboard/
DASHBOARD CRYPTO/
.codex
.claude
.cursor
.opencode
```

## Observações

- `obsidian-vault/` é o novo cofre documental do projeto.
- Os diretórios gerados pesados foram registrados aqui para manter o vault útil e rápido no Obsidian.
- A árvore operacional relevante do código está distribuída entre [[10 - Árvore Raiz]], [[11 - Frontend Client]], [[12 - Backend Server]] e [[13 - Infra, Deploy e Operação]].
