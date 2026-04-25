import paramiko
import os


IP = "89.167.114.67"
USER = "root"
PW = "gMKbVKEsmpLw"
LOCAL_FILE = "blockminer.zip"
REMOTE_PATH = "/tmp/blockminer.zip"
APP_ROOT = "/root/block-miner-v3"

def main():
    print(f"Connecting to {IP}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(IP, username=USER, password=PW)

    if not os.path.exists(LOCAL_FILE):
        print(f"Error: {LOCAL_FILE} not found!")
        return

    def progress(done, total):
        print(f"Uploaded {done}/{total} bytes ({100.0*done/total:.1f}%)", end='\r')

    print(f"Uploading {LOCAL_FILE} to {REMOTE_PATH}...")
    sftp = ssh.open_sftp()
    sftp.put(os.path.abspath(LOCAL_FILE), REMOTE_PATH, callback=progress)
    print("\nUpload complete!")
    sftp.close()




    print("Extracting zip and building...")
    commands = [
        "apt-get update && apt-get install -y unzip",
        f"mkdir -p {APP_ROOT}",
        f"unzip -o {REMOTE_PATH} -d {APP_ROOT}",
        f"cd {APP_ROOT} && export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 && docker compose build --no-cache phd app && docker compose up -d db phd app",
        f"rm {REMOTE_PATH}"
    ]


    for cmd in commands:
        print(f"Executing: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            print(f"Command failed with status {exit_status}")
            print(stderr.read().decode())
        else:
            print(stdout.read().decode())

    ssh.close()
    print("Deployment finished!")

if __name__ == "__main__":
    main()
