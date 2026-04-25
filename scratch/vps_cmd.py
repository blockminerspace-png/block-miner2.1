import paramiko
import sys

def run_vps_command(command):
    host = "178.104.220.3"
    user = "root"
    password = "WvmRsVPNrHb3"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(host, username=user, password=password)
        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode()
        err = stderr.read().decode()
        print(f"STDOUT:\n{out}")
        print(f"STDERR:\n{err}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_vps_command(sys.argv[1])
    else:
        print("No command provided")
