import paramiko
import os
from pathlib import Path

def deploy():
    host = "89.167.114.67"
    user = "root"
    password = "gMKbVKEsmpLw"
    local_zip = "/home/gustavo/Documentos/BlockMiner 2.1/deploy.zip"
    remote_zip = "/root/deploy.zip"
    remote_dir = "/root/blockminer"
    
    print(f"Connecting to {host}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    
    print("Uploading ZIP...")
    sftp = ssh.open_sftp()
    sftp.put(local_zip, remote_zip)
    sftp.close()
    
    print("Extracting and Deploying...")
    commands = [
        f"mkdir -p {remote_dir}",
        f"unzip -o {remote_zip} -d {remote_dir}",
        f"cd {remote_dir} && docker compose --profile proxy down",
        f"cd {remote_dir} && docker compose --profile proxy build --no-cache",
        f"cd {remote_dir} && docker compose --profile proxy up -d"
    ]
    
    for cmd in commands:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out: print(f"STDOUT: {out}")
        if err: print(f"STDERR: {err}")
        if exit_status != 0:
            print(f"Command failed with exit status {exit_status}")
            break
            
    ssh.close()
    print("Deployment finished!")

if __name__ == "__main__":
    deploy()
