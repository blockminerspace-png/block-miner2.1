import paramiko
import sys
import re

def cleanup_nginx_conf():
    host = "178.104.220.3"
    user = "root"
    password = "WvmRsVPNrHb3"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(host, username=user, password=password)
        
        # Read current nginx.conf
        stdin, stdout, stderr = client.exec_command("cat /opt/blockminer-test/nginx/nginx.conf")
        content = stdout.read().decode()
        
        # Remove server blocks for blockminer.space (non-test)
        # This is a bit tricky with regex, so I'll just look for the server blocks
        
        # New strategy: Keep the http header, and only the server blocks we want.
        # But wait, I already added the test blocks.
        
        # Let's just comment out the blocks that use /etc/nginx/certs/cert.pem
        lines = content.splitlines()
        new_lines = []
        in_bad_block = False
        brace_count = 0
        
        for line in lines:
            if 'server {' in line and ('server_name blockminer.space' in line or 'server_name www.blockminer.space' in line):
                in_bad_block = True
                brace_count = 0
            
            if in_bad_block:
                new_lines.append("# " + line)
                brace_count += line.count('{')
                brace_count -= line.count('}')
                if brace_count == 0 and '}' in line:
                    in_bad_block = False
            else:
                new_lines.append(line)
        
        new_content = "\n".join(new_lines)
        
        with client.open_sftp() as sftp:
            with sftp.file("/opt/blockminer-test/nginx/nginx.conf.tmp", "w") as f:
                f.write(new_content)
        
        client.exec_command("mv /opt/blockminer-test/nginx/nginx.conf.tmp /opt/blockminer-test/nginx/nginx.conf")
        print("nginx.conf cleaned up successfully")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    cleanup_nginx_conf()
