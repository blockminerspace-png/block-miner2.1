import paramiko
import os
from pathlib import Path

def deploy():
    host = "178.104.220.3"
    user = "root"
    password = "CbHKKmMkXTK3"
    repo_root = "/home/gustavo/Documentos/BlockMiner 2.1"
    local_zip = os.path.join(repo_root, "deploy.zip")
    local_env = os.path.join(repo_root, ".env.production")
    local_nginx = os.path.join(repo_root, "nginx/nginx.conf")
    remote_zip = "/root/deploy.zip"
    remote_dir = "/root/blockminer"
    
    print(f"Connecting to {host}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    
    print("Uploading ZIP...")
    sftp = ssh.open_sftp()
    sftp.put(local_zip, remote_zip)
    
    print("Uploading config files...")
    ssh.exec_command(f"mkdir -p {remote_dir}/nginx/certs")
    sftp.put(local_env, f"{remote_dir}/.env.production")
    sftp.put(local_nginx, f"{remote_dir}/nginx/nginx.conf")
    sftp.close()
    
    print("Extracting and Deploying...")
    commands = [
        f"cd {remote_dir} && unzip -o {remote_zip} -d .",
        f"cd {remote_dir} && docker compose --profile proxy build --no-cache",
        f"cd {remote_dir} && docker compose --profile proxy up -d --force-recreate"
    ]
    
    for cmd in commands:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        out = stdout.read().decode()
        err = stderr.read().decode()
        print(out)
        if err:
            print(f"Error: {err}")
            
    # Also run migrations
    print("Running Prisma migrations...")
    ssh.exec_command(f"cd {remote_dir} && docker compose exec -T app npx prisma migrate deploy")
    
    print("Deployment finished!")
    ssh.close()

if __name__ == "__main__":
    deploy()
