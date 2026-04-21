# Infra, Deploy e Operação

## Infraestrutura do repositório

```text
infra/
├── Dockerfile
├── docker-compose.yml
├── docker-compose.local.yml
├── docker-entrypoint.sh
├── config/
│   ├── default.json
│   └── production.json
├── docker/
│   └── btcpay/
│       ├── docker-compose.yml
│       ├── env.example
│       ├── install-btcpay.sh
│       ├── reinstall-btcpay.sh
│       ├── GUIA-COMPLETO-PT.md
│       └── LEIAME-PT.txt
├── k8s/
│   ├── app.yaml
│   └── postgres.yaml
├── nginx/
│   ├── nginx.conf
│   ├── certs/
│   └── certs-btcpay/
├── certbot-www/
└── scripts/
    ├── deploy-production-safe.sh
    ├── push-deploy-test-vm.sh
    ├── deploy-test-vm-remote.py
    ├── vm-test-deploy-remote.sh
    ├── vm-deploy-local-over-ssh.py
    ├── vm-poll-deploy.sh
    ├── deploy-vps-windows.ps1
    ├── remote-btcpay-setup.ps1
    ├── remote-btcpay-stop.ps1
    ├── remote-btcpay-letsencrypt.ps1
    ├── vps-btcpay-coexist-install.sh
    ├── vps-btcpay-docker-down.sh
    ├── vps-issue-btcpay-letsencrypt.sh
    ├── sync-le-certs-to-nginx.sh
    ├── security-audit.mjs
    ├── backup.js
    ├── seed-rewards-data.js
    ├── migrateData.js
    ├── clear-faucet-inventory-expiry.mjs
    └── systemd/
        ├── blockminer-git-deploy.service
        └── blockminer-git-deploy.timer
```

## Documentação operacional

```text
docs/
├── 2048-fix.md
├── AUTO_MINING_V2.md
├── DEPLOYMENT.md
├── PRODUCTION_DEPLOY_SAFE_RUNBOOK.md
├── SECURITY-AUDIT.md
├── coverage-report.md
├── faucet-checkin-fix.md
└── polygon-hd-deposit-service-spec.md
```

## Contratos e blockchain

```text
contracts/
├── contracts/
│   └── BlockMinerDeposit.sol
├── hardhat-tests/
│   └── BlockMinerDeposit.js
├── scripts/
│   └── deploy.js
├── hardhat.config.cjs
├── package.json
└── package-lock.json
```

## Git e automação

```text
.github/workflows/
.githooks/
.cursor/rules/
.cursor/skills/
.claude/
.opencode/
```
