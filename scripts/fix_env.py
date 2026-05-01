import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('89.167.119.164', username='root', password='eJM9qEfrVgnd')

print("Uploading .env.production to server...")
sftp = ssh.open_sftp()
sftp.put('/home/gustavo/Documentos/BlockMiner 2.1/.env.production', '/root/blockminer/.env.production')
sftp.close()
print("Upload done.")

# Restart all app containers to pick up new env
cmds = [
    "cd /root/blockminer && docker compose --profile proxy restart app phd support-admin",
]

for cmd in cmds:
    print(f"\nRunning: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(f"Exit: {exit_status}")
    if out: print(f"OUT: {out}")
    if err: print(f"ERR: {err}")

# Also clear any remaining SEC_LOCK entries
print("\nClearing any remaining SEC_LOCK entries...")
stdin, stdout, stderr = ssh.exec_command(
    "docker exec block-miner-db-1 psql -U blockminer -d blockminer_db -c \"DELETE FROM callback_queue WHERE callback_type = 'SEC_LOCK';\""
)
stdout.channel.recv_exit_status()
print("OUT:", stdout.read().decode())

print("\nDone! All containers restarted with correct env.")
ssh.close()
