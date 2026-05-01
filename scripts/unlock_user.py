import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('89.167.119.164', username='root', password='eJM9qEfrVgnd')

# Get the DATABASE_URL from the container
stdin, stdout, stderr = ssh.exec_command("docker exec block-miner-app-1 sh -c 'echo $DATABASE_URL'")
stdout.channel.recv_exit_status()
db_url = stdout.read().decode().strip()
print(f"DATABASE_URL: {db_url}")

# Write the script with proper Prisma instantiation
script = f"""import pg from '/app/node_modules/pg/lib/index.js';
import {{ PrismaPg }} from '/app/node_modules/@prisma/adapter-pg/dist/index.mjs';
import pkg from '/app/node_modules/@prisma/client/default.js';
const {{ PrismaClient }} = pkg;

const connectionString = '{db_url}';
const pool = new pg.Pool({{ connectionString }});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({{ adapter }});

prisma.user.updateMany({{
  where: {{ email: 'gustavo.empresarial.br@gmail.com' }},
  data: {{ loginFailedCount: 0, lockedUntil: null }}
}}).then(r => {{ console.log('Updated:', JSON.stringify(r)); process.exit(0); }}).catch(e => {{ console.error(e.message); process.exit(1); }});
"""

sftp = ssh.open_sftp()
with sftp.open('/tmp/unlock_user2.mjs', 'w') as f:
    f.write(script)
sftp.close()

# Use the same env vars as the container
cmd = "docker cp /tmp/unlock_user2.mjs block-miner-app-1:/app/unlock_user2.mjs && docker exec block-miner-app-1 node /app/unlock_user2.mjs"
stdin, stdout, stderr = ssh.exec_command(cmd)
exit_status = stdout.channel.recv_exit_status()
print('Exit:', exit_status)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())

ssh.close()
