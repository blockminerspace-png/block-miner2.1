import paramiko
import os

def deploy():
    host = "89.167.119.164"
    user = "root"
    password = "eJM9qEfrVgnd"
    local_file = "deploy_blockminer_clean.zip"
    remote_dir = "/root/blockminer"
    
    print(f"Connecting to {host}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(host, username=user, password=password)
        print("Connected!")
        
        # 1. Upload the zip
        print(f"Uploading {local_file}...")
        sftp = ssh.open_sftp()
        sftp.put(local_file, f"/root/{local_file}")
        sftp.close()
        
        # 2. Extract and Deploy
        print("Extracting and deploying...")
        commands = [
            "apt-get update && apt-get install -y unzip",
            f"mkdir -p {remote_dir}",
            f"unzip -o /root/{local_file} -d {remote_dir}",
            f"cd {remote_dir} && docker compose --profile proxy build --no-cache",
            f"cd {remote_dir} && docker compose --profile proxy up -d"
        ]
        
        for cmd in commands:
            print(f"Executing: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            # We want to see the output in real-time or at least after completion
            exit_status = stdout.channel.recv_exit_status()
            print(f"Exit Status: {exit_status}")
            out = stdout.read().decode()
            err = stderr.read().decode()
            if out: print(f"Output: {out}")
            if err: print(f"Error: {err}")
            
            if exit_status != 0:
                print(f"Command failed: {cmd}")
                break
                
        print("Deployment finished!")
        
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    deploy()
