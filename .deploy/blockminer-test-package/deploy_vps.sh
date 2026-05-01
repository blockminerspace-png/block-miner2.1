#!/bin/bash
# script de deploy para o BlockMiner na VM

# Configurações
IP="89.167.114.67"
USER="root"
PASSWORD="gMKbVKEsmpLw"
ZIP_FILE="deploy.zip"
REMOTE_DIR="/root/blockminer"

echo "==========================================="
echo "   BLOCKMINER DEPLOY - 89.167.114.67"
echo "==========================================="

# Verifica se o sshpass está instalado localmente para automatizar
if ! command -v sshpass &> /dev/null; then
    echo "[!] sshpass não encontrado. Você terá que digitar a senha manualmente."
    SCP_CMD="scp $ZIP_FILE $USER@$IP:/root/"
    SSH_CMD="ssh $USER@$IP"
else
    SCP_CMD="sshpass -p '$PASSWORD' scp $ZIP_FILE $USER@$IP:/root/"
    SSH_CMD="sshpass -p '$PASSWORD' ssh $USER@$IP"
fi

echo "[1/3] Enviando arquivo zip..."
$SCP_CMD

echo "[2/3] Preparando ambiente remoto e extraindo arquivos..."
$SSH_CMD "mkdir -p $REMOTE_DIR && unzip -o /root/$ZIP_FILE -d $REMOTE_DIR"

echo "[3/3] Iniciando build sem cache e subindo containers..."
$SSH_CMD "cd $REMOTE_DIR && \
          docker compose --profile proxy down && \
          docker compose --profile proxy build --no-cache && \
          docker compose --profile proxy up -d"

echo "==========================================="
echo "   DEPLOY CONCLUÍDO!"
echo "==========================================="
