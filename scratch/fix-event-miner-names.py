"""
Restores event miner names on corrupted UserOwnedMachine rows in RACK location.

Only fixes cases where a SINGLE event miner matches the hashRate (unambiguous).
Ambiguous cases (multiple event miners with same H/s) are reported for manual fix.
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
    return out


def main():
    host, user, password = load_secret()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)

    mode = "DRY-RUN" if DRY_RUN else "LIVE"
    print(f"\n{'#'*60}\nEvent Miner Name Restore — {mode}\n{'#'*60}")

    # Unambiguous fix: exactly 1 event miner per hashRate
    unambiguous_sql = """
        WITH event_unique_hr AS (
          SELECT hash_rate, MIN(id) AS em_id, MIN(name) AS em_name
          FROM event_miners
          GROUP BY hash_rate
          HAVING COUNT(*) = 1
        )
        SELECT
          uom.id AS owned_machine_id,
          uom.user_id,
          uom.miner_name AS current_name,
          uom.hash_rate,
          eu.em_id AS event_miner_id,
          eu.em_name AS event_miner_name,
          um.id AS user_miner_id
        FROM user_owned_machines uom
        JOIN event_unique_hr eu ON eu.hash_rate = uom.hash_rate
        LEFT JOIN user_miners um ON um.owned_machine_id = uom.id
        WHERE uom.location = 'RACK'
          AND uom.miner_id IS NULL
          AND LOWER(TRIM(uom.miner_name)) IN (
            'máquina custom', 'maquina custom', 'máquina', 'maquina',
            'miner', 'unknown miner', 'gpu 1 ghs'
          )
        ORDER BY uom.user_id, uom.hash_rate;
    """
    psql(ssh, unambiguous_sql, "Unambiguous fixes (single event miner per H/s)")

    ambiguous_sql = """
        WITH event_dup_hr AS (
          SELECT hash_rate
          FROM event_miners
          GROUP BY hash_rate
          HAVING COUNT(*) > 1
        )
        SELECT
          uom.id AS owned_machine_id,
          uom.user_id,
          uom.miner_name AS current_name,
          uom.hash_rate,
          STRING_AGG(em.name, ', ' ORDER BY em.id) AS possible_event_miners,
          um.id AS user_miner_id
        FROM user_owned_machines uom
        JOIN event_dup_hr ed ON ed.hash_rate = uom.hash_rate
        JOIN event_miners em ON em.hash_rate = uom.hash_rate
        LEFT JOIN user_miners um ON um.owned_machine_id = uom.id
        WHERE uom.location = 'RACK'
          AND uom.miner_id IS NULL
          AND LOWER(TRIM(uom.miner_name)) IN (
            'máquina custom', 'maquina custom', 'máquina', 'maquina',
            'miner', 'unknown miner', 'gpu 1 ghs'
          )
        GROUP BY uom.id, uom.user_id, uom.miner_name, uom.hash_rate, um.id
        ORDER BY uom.user_id, uom.hash_rate;
    """
    psql(ssh, ambiguous_sql, "AMBIGUOUS — cannot auto-fix (multiple event miners with same H/s). Fix manually via admin panel.")

    if not DRY_RUN:
        fix_sql = """
            WITH event_unique_hr AS (
              SELECT hash_rate, MIN(id) AS em_id, MIN(name) AS em_name
              FROM event_miners
              GROUP BY hash_rate
              HAVING COUNT(*) = 1
            )
            UPDATE user_owned_machines uom
            SET
              miner_name = '[Event] ' || eu.em_name,
              image_url  = NULL
            FROM event_unique_hr eu
            WHERE eu.hash_rate = uom.hash_rate
              AND uom.location = 'RACK'
              AND uom.miner_id IS NULL
              AND LOWER(TRIM(uom.miner_name)) IN (
                'máquina custom', 'maquina custom', 'máquina', 'maquina',
                'miner', 'unknown miner', 'gpu 1 ghs'
              );
        """
        psql(ssh, fix_sql, "Applied fix (unambiguous only)")
        psql(ssh, unambiguous_sql, "Post-fix verification (should be 0 rows)")

    ssh.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
