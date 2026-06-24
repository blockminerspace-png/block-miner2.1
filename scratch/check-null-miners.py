import paramiko
from pathlib import Path
import importlib.util

SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
SECRET = SCRIPT_DIR / "vm_config_secret.py"

def load_secret():
    if SECRET.exists():
        spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        ip = str(getattr(mod, "IP", "") or "").strip()
        login = str(getattr(mod, "LOGIN", "root") or "root").strip()
        pw = str(getattr(mod, "ROOT_PASSWORD", "") or "").strip()
        if ip and pw:
            return ip, login, pw
    raise SystemExit("Missing vm_config_secret.py")

def main():
    host, user, password = load_secret()
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    
    queries = [
        ("user_inventory null miner_ids", "SELECT miner_name, image_url, COUNT(*) FROM user_inventory WHERE miner_id IS NULL GROUP BY miner_name, image_url;"),
        ("user_vault null miner_ids", "SELECT miner_name, image_url, COUNT(*) FROM user_vault WHERE miner_id IS NULL GROUP BY miner_name, image_url;"),
        ("user_miners null miner_ids", "SELECT image_url, COUNT(*) FROM user_miners WHERE miner_id IS NULL GROUP BY image_url;"),
        ("user_owned_machines null miner_ids", "SELECT miner_name, image_url, COUNT(*) FROM user_owned_machines WHERE miner_id IS NULL GROUP BY miner_name, image_url;")
    ]
    
    for title, sql in queries:
        print(f"=== {title} ===")
        cmd = f"docker exec -e PGPASSWORD=blockminer_password block-miner-db psql -U blockminer -d blockminer_db -c \"{sql}\""
        stdin, stdout, stderr = ssh.exec_command(cmd)
        stdout.channel.recv_exit_status()
        print(stdout.read().decode())
        print(stderr.read().decode())
        print("-" * 50)
        
    ssh.close()

if __name__ == "__main__":
    main()
