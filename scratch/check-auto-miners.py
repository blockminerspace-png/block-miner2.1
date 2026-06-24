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
    
    tables = ["user_inventory", "user_vault", "user_miners", "user_owned_machines"]
    
    for t in tables:
        print(f"=== Table: {t} ===")
        # If t is user_miners, there is no miner_name directly, it references user_owned_machines or miner.
        if t == "user_miners":
            sql = """
            SELECT um.miner_id, om.miner_name, um.image_url, COUNT(*) 
            FROM user_miners um 
            LEFT JOIN user_owned_machines om ON um.owned_machine_id = om.id 
            WHERE (om.miner_name IN ('Pulse GPU v1', 'GPU 1 GHS') OR um.miner_id IS NULL) 
            GROUP BY um.miner_id, om.miner_name, um.image_url;
            """
        else:
            sql = f"""
            SELECT miner_id, miner_name, image_url, COUNT(*) 
            FROM {t} 
            WHERE miner_name IN ('Pulse GPU v1', 'GPU 1 GHS') 
            GROUP BY miner_id, miner_name, image_url;
            """
        
        cmd = f"docker exec -e PGPASSWORD=blockminer_password block-miner-db psql -U blockminer -d blockminer_db -c \"{sql}\""
        stdin, stdout, stderr = ssh.exec_command(cmd)
        stdout.channel.recv_exit_status()
        print(stdout.read().decode())
        print(stderr.read().decode())
        print("-" * 50)
        
    ssh.close()

if __name__ == "__main__":
    main()
