import paramiko
import os
import sys

IP = "89.167.114.67"
USER = "root"
PW = "gMKbVKEsmpLw"
APP_ROOT = "/root/block-miner-v3"

def main():
    print(f"Connecting to {IP}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(IP, username=USER, password=PW)

    print("Starting build without cache...")
    cmd = f"cd {APP_ROOT} && export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 && docker compose build --no-cache phd app && docker compose up -d db phd app"
    
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    
    while True:
        line = stdout.readline()
        if not line:
            break
        print(line, end='')
        sys.stdout.flush()

    exit_status = stdout.channel.recv_exit_status()
    print(f"Build finished with status {exit_status}")
    ssh.close()

if __name__ == "__main__":
    main()
