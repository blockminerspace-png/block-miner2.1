"""
Find and fix orphaned UserOwnedMachine records.

Orphan = UserOwnedMachine row whose location-specific child row is missing:
  INVENTORY → no user_inventory row with owned_machine_id
  RACK      → no user_miners row with owned_machine_id
  WAREHOUSE → no user_vault row with owned_machine_id

Fix:
  INVENTORY orphan → INSERT into user_inventory
  RACK orphan      → INSERT into user_inventory + UPDATE location='INVENTORY'
                     (safe: avoids slot_index conflict)
  WAREHOUSE orphan → INSERT into user_vault
"""

import paramiko
from pathlib import Path
import importlib.util
import sys

SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
SECRET = SCRIPT_DIR / "vm_config_secret.py"

DRY_RUN = "--apply" not in sys.argv


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


def psql(ssh, sql, label=""):
    cmd = (
        f"docker exec -e PGPASSWORD=blockminer_password block-miner-db "
        f"psql -U blockminer -d blockminer_db -c \"{sql}\""
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode().strip()
    if label:
        print(f"\n=== {label} ===")
        print(out)
        if err:
            print("STDERR:", err)
    return out


FIND_ORPHANS_SQL = """
SELECT
    uom.id,
    uom.user_id,
    uom.location,
    uom.miner_id,
    uom.miner_name,
    uom.level,
    uom.hash_rate,
    uom.slot_size,
    uom.image_url,
    uom.created_at,
    u.email
FROM user_owned_machines uom
JOIN users u ON u.id = uom.user_id
LEFT JOIN user_inventory ui ON ui.owned_machine_id = uom.id
LEFT JOIN user_miners    um ON um.owned_machine_id = uom.id
LEFT JOIN user_vault     uv ON uv.owned_machine_id = uom.id
WHERE
    (uom.location = 'INVENTORY' AND ui.id IS NULL)
    OR (uom.location = 'RACK'      AND um.id IS NULL)
    OR (uom.location = 'WAREHOUSE' AND uv.id IS NULL)
ORDER BY uom.user_id, uom.id;
"""


def parse_psql_rows(output):
    """Parse psql aligned-format output into list of dicts."""
    lines = output.strip().splitlines()
    # find header line (contains column names separated by |)
    if len(lines) < 3:
        return []
    header_line = None
    data_start = None
    for i, line in enumerate(lines):
        if "|" in line and "---" not in line and i == 0:
            header_line = i
            data_start = i + 2  # skip separator line
            break
    if header_line is None:
        return []
    cols = [c.strip() for c in lines[header_line].split("|")]
    rows = []
    for line in lines[data_start:]:
        if not line.strip() or line.startswith("("):
            break
        vals = [v.strip() for v in line.split("|")]
        if len(vals) == len(cols):
            rows.append(dict(zip(cols, vals)))
    return rows


def build_fix_sql(orphans):
    statements = []
    for o in orphans:
        oid = o["id"]
        uid = o["user_id"]
        loc = o["location"]
        miner_id = "NULL" if not o["miner_id"] or o["miner_id"] == "" else o["miner_id"]
        miner_name = o["miner_name"].replace("'", "''")
        level = o["level"] or "1"
        hash_rate = o["hash_rate"] or "0"
        slot_size = o["slot_size"] or "1"
        image_url = "NULL" if not o["image_url"] or o["image_url"] == "" else f"'{o['image_url'].replace(chr(39), chr(39)*2)}'"

        if loc == "INVENTORY":
            statements.append(
                f"INSERT INTO user_inventory "
                f"(user_id, miner_id, miner_name, level, hash_rate, slot_size, image_url, owned_machine_id, acquired_at, updated_at) "
                f"VALUES ({uid}, {miner_id}, '{miner_name}', {level}, {hash_rate}, {slot_size}, {image_url}, {oid}, NOW(), NOW()) "
                f"ON CONFLICT (owned_machine_id) DO NOTHING;"
            )

        elif loc == "RACK":
            # Move to INVENTORY: create inventory row + update location
            statements.append(
                f"INSERT INTO user_inventory "
                f"(user_id, miner_id, miner_name, level, hash_rate, slot_size, image_url, owned_machine_id, acquired_at, updated_at) "
                f"VALUES ({uid}, {miner_id}, '{miner_name}', {level}, {hash_rate}, {slot_size}, {image_url}, {oid}, NOW(), NOW()) "
                f"ON CONFLICT (owned_machine_id) DO NOTHING;"
            )
            statements.append(
                f"UPDATE user_owned_machines SET location = 'INVENTORY', updated_at = NOW() "
                f"WHERE id = {oid} AND location = 'RACK';"
            )

        elif loc == "WAREHOUSE":
            statements.append(
                f"INSERT INTO user_vault "
                f"(user_id, miner_id, miner_name, level, hash_rate, slot_size, image_url, owned_machine_id, stored_at, updated_at) "
                f"VALUES ({uid}, {miner_id}, '{miner_name}', {level}, {hash_rate}, {slot_size}, {image_url}, {oid}, NOW(), NOW()) "
                f"ON CONFLICT (owned_machine_id) DO NOTHING;"
            )

    return statements


def main():
    print(f"Mode: {'DRY RUN (use --apply to fix)' if DRY_RUN else 'APPLY'}")

    host, user, password = load_secret()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)

    # 1. Find orphans
    out = psql(ssh, FIND_ORPHANS_SQL.replace("\n", " "), "Orphaned UserOwnedMachines")
    orphans = parse_psql_rows(out)

    if not orphans:
        print("\nNo orphaned machines found.")
        ssh.close()
        return

    print(f"\nFound {len(orphans)} orphaned machine(s):")
    for o in orphans:
        print(f"  id={o['id']} user={o['user_id']} ({o['email']}) location={o['location']} name={o['miner_name']}")

    # 2. Build fix SQL
    stmts = build_fix_sql(orphans)

    print(f"\nFix statements ({len(stmts)}):")
    for s in stmts:
        print(" ", s)

    if DRY_RUN:
        print("\nDRY RUN — nothing changed. Run with --apply to execute fixes.")
        ssh.close()
        return

    # 3. Run fixes inside a transaction
    transaction_sql = "BEGIN; " + " ".join(stmts) + " COMMIT;"
    psql(ssh, transaction_sql, "Applying fixes")

    # 4. Verify
    out2 = psql(ssh, FIND_ORPHANS_SQL.replace("\n", " "), "Verification (should be 0 rows)")
    remaining = parse_psql_rows(out2)
    if remaining:
        print(f"\nWARNING: {len(remaining)} orphan(s) still remain after fix!")
        for o in remaining:
            print(f"  id={o['id']} user={o['user_id']} location={o['location']} name={o['miner_name']}")
    else:
        print("\nAll orphans fixed successfully.")

    ssh.close()


if __name__ == "__main__":
    main()
