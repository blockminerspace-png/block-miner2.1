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
    
    print("=== docker ps ===")
    stdin, stdout, stderr = ssh.exec_command("docker ps")
    print(stdout.read().decode())
    print(stderr.read().decode())
    
    print("=== docker ps -a ===")
    stdin, stdout, stderr = ssh.exec_command("docker ps -a")
    print(stdout.read().decode())
    print(stderr.read().decode())

    ssh.close()

if __name__ == "__main__":
    main()
