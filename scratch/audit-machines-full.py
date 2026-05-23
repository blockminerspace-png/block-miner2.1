"""
Full consistency audit for machine records.

Checks:
  A. UserOwnedMachine with no child row (already fixed, re-verify)
  B. Inventory/Vault/Miners rows with owned_machine_id=NULL (old-style, invisible to canonical system)
  C. UserOwnedMachine location mismatch (says INVENTORY but child is in vault, etc.)
  D. Child row user_id != UserOwnedMachine user_id (cross-user corruption)
  E. user_miners with no user_rack entry (RACK machine installed but slot not occupied)
  F. user_rack entries pointing to user_miners that have no owned_machine
  G. Duplicate owned_machine_id across tables (should be unique)
  H. inventory/vault/rack rows pointing to non-existent owned_machine_id
  I. UserOwnedMachine user_id pointing to non-existent user
"""

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


def psql(ssh, sql, label=""):
    safe = sql.replace('"', '\\"')
    cmd = (
        f'docker exec -e PGPASSWORD=blockminer_password block-miner-db '
        f'psql -U blockminer -d blockminer_db -c "{safe}"'
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode().strip()
    if label:
        print(f"\n{'='*60}")
        print(f"CHECK {label}")
        print('='*60)
        print(out)
        if err:
            print("STDERR:", err)
    return out


def count_from_output(out):
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("(") and line.endswith(")"):
            try:
                return int(line.strip("()").split()[0])
            except Exception:
                pass
    return -1


CHECKS = [
    (
        "A — UserOwnedMachine with no child row (orphan)",
        """
        SELECT uom.id, uom.user_id, uom.location, uom.miner_name, u.email
        FROM user_owned_machines uom
        JOIN users u ON u.id = uom.user_id
        LEFT JOIN user_inventory ui ON ui.owned_machine_id = uom.id
        LEFT JOIN user_miners    um ON um.owned_machine_id = uom.id
        LEFT JOIN user_vault     uv ON uv.owned_machine_id = uom.id
        WHERE
            (uom.location = 'INVENTORY' AND ui.id IS NULL)
            OR (uom.location = 'RACK'      AND um.id IS NULL)
            OR (uom.location = 'WAREHOUSE' AND uv.id IS NULL)
        ORDER BY uom.user_id, uom.id
        LIMIT 20;
        """,
    ),
    (
        "B — user_inventory rows with owned_machine_id=NULL",
        """
        SELECT ui.id, ui.user_id, ui.miner_name, ui.acquired_at, u.email
        FROM user_inventory ui
        JOIN users u ON u.id = ui.user_id
        WHERE ui.owned_machine_id IS NULL
        ORDER BY ui.user_id, ui.id
        LIMIT 30;
        """,
    ),
    (
        "B2 — user_vault rows with owned_machine_id=NULL",
        """
        SELECT uv.id, uv.user_id, uv.miner_name, uv.stored_at, u.email
        FROM user_vault uv
        JOIN users u ON u.id = uv.user_id
        WHERE uv.owned_machine_id IS NULL
        ORDER BY uv.user_id, uv.id
        LIMIT 30;
        """,
    ),
    (
        "B3 — user_miners rows with owned_machine_id=NULL",
        """
        SELECT um.id, um.user_id, um.slot_index, um.miner_id, u.email
        FROM user_miners um
        JOIN users u ON u.id = um.user_id
        WHERE um.owned_machine_id IS NULL
        ORDER BY um.user_id, um.id
        LIMIT 30;
        """,
    ),
    (
        "C — location mismatch (UOM says X but child row is elsewhere)",
        """
        SELECT
            uom.id AS uom_id,
            uom.user_id,
            uom.location AS uom_location,
            CASE
                WHEN ui.id IS NOT NULL THEN 'INVENTORY'
                WHEN um.id IS NOT NULL THEN 'RACK'
                WHEN uv.id IS NOT NULL THEN 'WAREHOUSE'
                ELSE 'NONE'
            END AS actual_location,
            uom.miner_name,
            u.email
        FROM user_owned_machines uom
        JOIN users u ON u.id = uom.user_id
        LEFT JOIN user_inventory ui ON ui.owned_machine_id = uom.id
        LEFT JOIN user_miners    um ON um.owned_machine_id = uom.id
        LEFT JOIN user_vault     uv ON uv.owned_machine_id = uom.id
        WHERE
            (uom.location = 'INVENTORY' AND ui.id IS NULL AND (um.id IS NOT NULL OR uv.id IS NOT NULL))
            OR (uom.location = 'RACK'      AND um.id IS NULL AND (ui.id IS NOT NULL OR uv.id IS NOT NULL))
            OR (uom.location = 'WAREHOUSE' AND uv.id IS NULL AND (ui.id IS NOT NULL OR um.id IS NOT NULL))
        ORDER BY uom.user_id, uom.id
        LIMIT 20;
        """,
    ),
    (
        "D — child row user_id != UserOwnedMachine user_id",
        """
        SELECT 'inventory' AS tbl, ui.id, ui.user_id AS child_uid, uom.user_id AS uom_uid, uom.miner_name
        FROM user_inventory ui
        JOIN user_owned_machines uom ON uom.id = ui.owned_machine_id
        WHERE ui.user_id <> uom.user_id
        UNION ALL
        SELECT 'vault', uv.id, uv.user_id, uom.user_id, uom.miner_name
        FROM user_vault uv
        JOIN user_owned_machines uom ON uom.id = uv.owned_machine_id
        WHERE uv.user_id <> uom.user_id
        UNION ALL
        SELECT 'miners', um.id, um.user_id, uom.user_id, uom.miner_name
        FROM user_miners um
        JOIN user_owned_machines uom ON uom.id = um.owned_machine_id
        WHERE um.user_id <> uom.user_id
        LIMIT 20;
        """,
    ),
    (
        "E — user_miners with is_active=true but no user_rack slot",
        """
        SELECT um.id, um.user_id, um.slot_index, um.miner_id, um.owned_machine_id, u.email
        FROM user_miners um
        JOIN users u ON u.id = um.user_id
        LEFT JOIN user_racks ur ON ur.user_miner_id = um.id
        WHERE um.is_active = true
          AND ur.id IS NULL
          AND um.owned_machine_id IS NOT NULL
        ORDER BY um.user_id, um.id
        LIMIT 30;
        """,
    ),
    (
        "F — user_racks pointing to user_miners that have no owned_machine",
        """
        SELECT ur.id AS rack_id, ur.user_id, ur.room_id, ur.position, um.id AS miner_row_id, u.email
        FROM user_racks ur
        JOIN user_miners um ON um.id = ur.user_miner_id
        JOIN users u ON u.id = ur.user_id
        WHERE um.owned_machine_id IS NULL
        ORDER BY ur.user_id, ur.id
        LIMIT 20;
        """,
    ),
    (
        "G — owned_machine_id referenced by multiple child rows (should be impossible via UNIQUE)",
        """
        SELECT owned_machine_id, COUNT(*) AS cnt
        FROM (
            SELECT owned_machine_id FROM user_inventory WHERE owned_machine_id IS NOT NULL
            UNION ALL
            SELECT owned_machine_id FROM user_vault     WHERE owned_machine_id IS NOT NULL
            UNION ALL
            SELECT owned_machine_id FROM user_miners    WHERE owned_machine_id IS NOT NULL
        ) t
        GROUP BY owned_machine_id
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
        LIMIT 20;
        """,
    ),
    (
        "H — child rows pointing to non-existent UserOwnedMachine",
        """
        SELECT 'inventory' AS tbl, ui.id, ui.user_id, ui.owned_machine_id
        FROM user_inventory ui
        LEFT JOIN user_owned_machines uom ON uom.id = ui.owned_machine_id
        WHERE ui.owned_machine_id IS NOT NULL AND uom.id IS NULL
        UNION ALL
        SELECT 'vault', uv.id, uv.user_id, uv.owned_machine_id
        FROM user_vault uv
        LEFT JOIN user_owned_machines uom ON uom.id = uv.owned_machine_id
        WHERE uv.owned_machine_id IS NOT NULL AND uom.id IS NULL
        UNION ALL
        SELECT 'miners', um.id, um.user_id, um.owned_machine_id
        FROM user_miners um
        LEFT JOIN user_owned_machines uom ON uom.id = um.owned_machine_id
        WHERE um.owned_machine_id IS NOT NULL AND uom.id IS NULL
        LIMIT 20;
        """,
    ),
    (
        "I — UserOwnedMachine for non-existent user",
        """
        SELECT uom.id, uom.user_id, uom.location, uom.miner_name
        FROM user_owned_machines uom
        LEFT JOIN users u ON u.id = uom.user_id
        WHERE u.id IS NULL
        LIMIT 20;
        """,
    ),
    (
        "SUMMARY — counts per table",
        """
        SELECT
            (SELECT COUNT(*) FROM user_owned_machines)  AS owned_machines,
            (SELECT COUNT(*) FROM user_inventory)       AS inventory_rows,
            (SELECT COUNT(*) FROM user_vault)           AS vault_rows,
            (SELECT COUNT(*) FROM user_miners)          AS miner_slots,
            (SELECT COUNT(*) FROM user_racks)           AS rack_slots,
            (SELECT COUNT(*) FROM user_inventory WHERE owned_machine_id IS NULL) AS inv_no_uom,
            (SELECT COUNT(*) FROM user_vault     WHERE owned_machine_id IS NULL) AS vault_no_uom,
            (SELECT COUNT(*) FROM user_miners    WHERE owned_machine_id IS NULL) AS miners_no_uom;
        """,
    ),
]


def main():
    host, user, password = load_secret()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)

    findings = []
    for label, sql in CHECKS:
        out = psql(ssh, sql.replace("\n", " ").strip(), label)
        n = count_from_output(out)
        if n > 0 or "SUMMARY" in label:
            findings.append((label, n))

    print("\n" + "="*60)
    print("AUDIT SUMMARY")
    print("="*60)
    for label, n in findings:
        flag = "OK" if n == 0 else f"*** {n} rows ***"
        print(f"  {flag}  {label}")

    ssh.close()


if __name__ == "__main__":
    main()
