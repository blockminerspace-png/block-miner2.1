import pexpect
import sys

def run_cmd(cmd, password):
    print(f"Executing: {cmd}")
    child = pexpect.spawn(cmd, encoding='utf-8', timeout=600)
    child.logfile = sys.stdout
    
    index = child.expect(['(?i)password:', '(?i)are you sure you want to continue connecting', pexpect.EOF, pexpect.TIMEOUT])
    
    if index == 0: # Password prompt
        child.sendline(password)
    elif index == 1: # SSH key prompt
        child.sendline('yes')
        child.expect('(?i)password:')
        child.sendline(password)
    elif index == 2:
        return
    elif index == 3:
        print("Timeout reached!")
        return

    child.expect(pexpect.EOF)
    print("\nCommand finished.")

IP = "89.167.114.67"
USER = "root"
PASS = "gMKbVKEsmpLw"
ZIP = "deploy.zip"
REMOTE_DIR = "/root/blockminer"

# Step 1: SCP
run_cmd(f"scp -o StrictHostKeyChecking=no {ZIP} {USER}@{IP}:/root/", PASS)

# Step 2: SSH Deploy
deploy_script = f"""
mkdir -p {REMOTE_DIR} && 
unzip -o /root/{ZIP} -d {REMOTE_DIR} && 
cd {REMOTE_DIR} && 
docker compose --profile proxy down && 
docker compose --profile proxy build --no-cache && 
docker compose --profile proxy up -d
"""
run_cmd(f"ssh -o StrictHostKeyChecking=no {USER}@{IP} '{deploy_script}'", PASS)
