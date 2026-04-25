import paramiko
import sys

def update_nginx_conf():
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
        
        # New server blocks
        new_blocks = """
    # TEST domain
    server {
        listen 80;
        server_name test.blockminer.space;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        http2 on;
        server_name test.blockminer.space;

        ssl_certificate /etc/nginx/certs/live/test.blockminer.space/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/live/test.blockminer.space/privkey.pem;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        location ^~ /api/ {
            client_max_body_size 10M;
            proxy_pass http://$bm_upstream_host:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
        }

        location ^~ /socket.io/ {
            proxy_pass http://$bm_upstream_host:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
        }

        location / {
            proxy_pass http://$bm_upstream_host:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
        }
    }
"""
        # Insert before the last closing brace
        last_brace_index = content.rfind("}")
        if last_brace_index != -1:
            new_content = content[:last_brace_index] + new_blocks + content[last_brace_index:]
            
            # Write back using a temporary file and then moving it
            with client.open_sftp() as sftp:
                with sftp.file("/opt/blockminer-test/nginx/nginx.conf.tmp", "w") as f:
                    f.write(new_content)
            
            client.exec_command("mv /opt/blockminer-test/nginx/nginx.conf.tmp /opt/blockminer-test/nginx/nginx.conf")
            print("nginx.conf updated successfully")
        else:
            print("Could not find closing brace in nginx.conf")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    update_nginx_conf()
