import paramiko
import sys

def upload_clean_nginx():
    host = "178.104.220.3"
    user = "root"
    password = "WvmRsVPNrHb3"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(host, username=user, password=password)
        
        with client.open_sftp() as sftp:
            sftp.put("/home/gustavo/Documentos/BlockMiner 2.1/scratch/nginx.conf.clean", "/opt/blockminer-test/nginx/nginx.conf")
        
        print("nginx.conf uploaded successfully")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    upload_clean_nginx()
