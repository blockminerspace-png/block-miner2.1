"""
Batch fix for rack overflow: sets blockedByMinerId on free adjacent slots of 2-slot miners.
Single SQL UPDATE — fast regardless of row count.
"""

import paramiko
from pathlib import Path
import importlib.util
import sys

DRY_RUN = "--fix" not in sys.argv

SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
SECRET = SCRIPT_DIR / "vm_config_secret.py"


def load_secret():
    if not SECRET.exists():
        raise SystemExit("Missing scripts/vm_config_secret.py")
    spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ip = str(getattr(mod, "IP", "") or "").strip()
    login = str(getattr(mod, "LOGIN", "root") or "root").strip()
    pw = str(getattr(mod, "ROOT_PASSWORD", "") or "").strip()
    if not (ip and pw):
        raise SystemExit("Missing IP/ROOT_PASSWORD")
    return ip, login, pw


def psql(ssh, sql, label=""):
    safe = sql.replace("'", "'\\''")
    cmd = (
        f"docker exec -e PGPASSWORD=blockminer_password block-miner-db "
        f"psql -U blockminer -d blockminer_db -c '{safe}'"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode().strip()
    if label:
        print(f"\n{'='*60}\n{label}\n{'='*60}")
        print(out)
        if err:
            print("STDERR:", err)
    return out, err


def main():
    host, user, password = load_secret()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)

    print(f"\n{'#'*60}\nRack Overflow Batch Fix — {'DRY-RUN' if DRY_RUN else 'LIVE'}\n{'#'*60}")
    if DRY_RUN:
        print("Pass --fix to apply.\n")

    # Count fixable rows first
    count_sql = """
        SELECT COUNT(*) AS fixable
        FROM user_racks primary_rack
        JOIN user_miners um ON um.id = primary_rack.user_miner_id AND um.slot_size = 2
        JOIN user_racks adj_rack
          ON adj_rack.room_id = primary_rack.room_id
         AND adj_rack.position = primary_rack.position + 1
         AND adj_rack.user_miner_id IS NULL
         AND adj_rack.blocked_by_miner_id IS NULL;
    """
    psql(ssh, count_sql, "Fixable rows (adjacent slot free, blockedByMinerId missing)")

    count_double_sql = """
        SELECT COUNT(*) AS double_booked
        FROM user_racks primary_rack
        JOIN user_miners um ON um.id = primary_rack.user_miner_id AND um.slot_size = 2
        JOIN user_racks adj_rack
          ON adj_rack.room_id = primary_rack.room_id
         AND adj_rack.position = primary_rack.position + 1
         AND adj_rack.user_miner_id IS NOT NULL
         AND adj_rack.user_miner_id <> primary_rack.user_miner_id;
    """
    psql(ssh, count_double_sql, "Double-booked rows (adjacent has its own miner — NOT auto-fixed)")

    if not DRY_RUN:
        fix_sql = """
            UPDATE user_racks adj_rack
            SET blocked_by_miner_id = primary_rack.user_miner_id
            FROM user_racks primary_rack
            JOIN user_miners um ON um.id = primary_rack.user_miner_id AND um.slot_size = 2
            WHERE adj_rack.room_id = primary_rack.room_id
              AND adj_rack.position = primary_rack.position + 1
              AND adj_rack.user_miner_id IS NULL
              AND adj_rack.blocked_by_miner_id IS NULL;
        """
        psql(ssh, fix_sql, "Applied fix")

        # Verify
        psql(ssh, count_sql, "Post-fix: remaining fixable (should be 0)")

    # Show double-booked detail (top 30)
    detail_sql = """
        SELECT
          primary_rack.room_id,
          primary_rack.position AS primary_pos,
          primary_rack.user_miner_id AS primary_miner,
          adj_rack.position AS adj_pos,
          adj_rack.user_miner_id AS adj_miner,
          ur2.user_id
        FROM user_racks primary_rack
        JOIN user_miners um ON um.id = primary_rack.user_miner_id AND um.slot_size = 2
        JOIN user_racks adj_rack
          ON adj_rack.room_id = primary_rack.room_id
         AND adj_rack.position = primary_rack.position + 1
         AND adj_rack.user_miner_id IS NOT NULL
         AND adj_rack.user_miner_id <> primary_rack.user_miner_id
        JOIN user_rooms ur2 ON ur2.id = primary_rack.room_id
        ORDER BY ur2.user_id, primary_rack.room_id, primary_rack.position
        LIMIT 30;
    """
    psql(ssh, detail_sql, "Double-booked detail (top 30, need manual review)")

    ssh.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
