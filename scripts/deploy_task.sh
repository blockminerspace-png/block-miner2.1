#!/bin/bash
# Script para deploy do BlockMiner no VPS 89.167.119.164
# Requisitos: zip, sshpass (opcional)

set -e

# Configurações
IP="89.167.119.164"
USER="root"
REMOTE_DIR="/root/blockminer"
ZIP_FILE="deploy_blockminer_$(date +%Y%m%d_%H%M%S).zip"

echo "==========================================="
echo "   BLOCKMINER DEPLOY - $IP"
echo "==========================================="

# 1. Gerar ZIP do projeto (excluindo desnecessários)
echo "[1/4] Gerando arquivo zip: $ZIP_FILE ..."
zip -r "$ZIP_FILE" . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x "client/node_modules/*" \
    -x "server/node_modules/*" \
    -x "*.zip" \
    -x "backups/*" \
    -x "logs/*" \
    -x "data/*" \
    -x ".env" \
    -x ".env.local" \
    -x ".env.production.local" \
    -x ".deploy-pw.txt" \
    -x "coverage/*" \
    -x ".next/*" \
    -x ".cursor/*" \
    -x ".claude/*" \
    -x ".opencode/*"

# 2. Upload via SSH/SCP
echo "[2/4] Enviando arquivo para o servidor..."
# Tentando usar sshpass se a senha estiver no ambiente ou no arquivo, caso contrário pede manual
if [ -n "$BLOCKMINER_VPS_PW" ]; then
    sshpass -p "$BLOCKMINER_VPS_PW" scp "$ZIP_FILE" "$USER@$IP:/root/"
else
    scp "$ZIP_FILE" "$USER@$IP:/root/"
fi

# 3. Extração e Configuração no Servidor
echo "[3/4] Extraindo arquivos e configurando no servidor..."
SSH_CMD() {
    if [ -n "$BLOCKMINER_VPS_PW" ]; then
        sshpass -p "$BLOCKMINER_VPS_PW" ssh "$USER@$IP" "$@"
    else
        ssh "$USER@$IP" "$@"
    fi
}

SSH_CMD "mkdir -p $REMOTE_DIR && unzip -o /root/$ZIP_FILE -d $REMOTE_DIR"

# 4. Deploy sem Cache (Docker Compose)
echo "[4/4] Iniciando build sem cache e subindo containers..."
# Nota: Usamos --no-cache para garantir deploy limpo, mas preservamos volumes (DB seguro)
SSH_CMD "cd $REMOTE_DIR && \
          docker compose --profile proxy build --no-cache && \
          docker compose --profile proxy up -d"

echo "==========================================="
echo "   DEPLOY CONCLUÍDO COM SUCESSO!"
echo "   Domínios configurados: blockminer.space, support.blockminer.space"
echo "   Verifique os logs: docker compose logs -f app"
echo "==========================================="

# Limpeza local
# rm "$ZIP_FILE"
