"""
Fix user_miners rows that have no user_rack entry (Check E).

Two strategies:
  1. Users with empty rack slots → assign orphan miners to empty slots
  2. Users with full rack (no empty slots) → move orphan miners to inventory

Dry run by default. Pass --apply to execute.
"""

import paramiko, importlib.util, sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
SECRET = SCRIPT_DIR / "vm_config_secret.py"
DRY_RUN = "--apply" not in sys.argv


def load_secret():
    spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.IP, getattr(mod, "LOGIN", "root"), mod.ROOT_PASSWORD


def psql(ssh, sql, label=""):
    safe = sql.replace('"', '\\"').replace("\n", " ")
    cmd = (
        f'docker exec -e PGPASSWORD=blockminer_password block-miner-db '
        f'psql -U blockminer -d blockminer_db -c "{safe}"'
    )
    _, out, err = ssh.exec_command(cmd)
    out.channel.recv_exit_status()
    o = out.read().decode()
    e = err.read().decode().strip()
    if label:
        print(f"\n{'='*60}\n{label}\n{'='*60}")
        print(o)
        if e:
            print("ERR:", e)
    return o


def parse_rows(output):
    lines = output.strip().splitlines()
    if len(lines) < 3:
        return []
    cols = [c.strip() for c in lines[0].split("|")]
    rows = []
    for line in lines[2:]:
        if not line.strip() or line.startswith("("):
            break
        vals = [v.strip() for v in line.split("|")]
        if len(vals) == len(cols):
            rows.append(dict(zip(cols, vals)))
    return rows


def get_orphan_miners(ssh, uid):
    """Returns list of {id, owned_machine_id, miner_id, miner_name, level, hash_rate, slot_size, image_url}"""
    sql = f"""
    SELECT um.id, um.owned_machine_id, um.miner_id, um.slot_size
    FROM user_miners um
    LEFT JOIN user_racks ur ON ur.user_miner_id = um.id
    WHERE um.user_id = {uid}
      AND um.is_active = true
      AND ur.id IS NULL
      AND um.owned_machine_id IS NOT NULL
    ORDER BY um.id;
    """
    return parse_rows(psql(ssh, sql))


def get_empty_rack_slots(ssh, uid):
    """Returns list of {id, room_id, position} for empty rack slots."""
    sql = f"""
    SELECT id, room_id, position
    FROM user_racks
    WHERE user_id = {uid} AND user_miner_id IS NULL
    ORDER BY room_id, position;
    """
    return parse_rows(psql(ssh, sql))


def get_uom_for_machine(ssh, owned_machine_id):
    sql = f"""
    SELECT miner_id, miner_name, level, hash_rate, slot_size, image_url
    FROM user_owned_machines WHERE id = {owned_machine_id};
    """
    rows = parse_rows(psql(ssh, sql))
    return rows[0] if rows else None


def fix_assign_to_slots(orphans, empty_slots):
    """Pair orphan miners with empty rack slots, return SQL statements."""
    stmts = []
    for miner, slot in zip(orphans, empty_slots):
        stmts.append(
            f"UPDATE user_racks SET user_miner_id = {miner['id']} "
            f"WHERE id = {slot['id']} AND user_miner_id IS NULL;"
        )
    return stmts


def fix_move_to_inventory(ssh, uid, orphans):
    """Move orphan rack miners to inventory (rack full scenario)."""
    stmts = []
    for m in orphans:
        oid = m["owned_machine_id"]
        uom = get_uom_for_machine(ssh, oid)
        if not uom:
            print(f"  WARN: no UOM for owned_machine_id={oid}, skip")
            continue
        miner_id = uom["miner_id"] if uom["miner_id"] else "NULL"
        miner_name = uom["miner_name"].replace("'", "''")
        level = uom["level"] or "1"
        hr = uom["hash_rate"] or "0"
        ss = uom["slot_size"] or "1"
        img = uom["image_url"]
        img_sql = f"'{img.replace(chr(39), chr(39)*2)}'" if img else "NULL"

        stmts.append(
            f"INSERT INTO user_inventory "
            f"(user_id, miner_id, miner_name, level, hash_rate, slot_size, image_url, owned_machine_id, acquired_at, updated_at) "
            f"VALUES ({uid}, {miner_id}, '{miner_name}', {level}, {hr}, {ss}, {img_sql}, {oid}, NOW(), NOW()) "
            f"ON CONFLICT (owned_machine_id) DO NOTHING;"
        )
        stmts.append(
            f"UPDATE user_owned_machines SET location = 'INVENTORY', updated_at = NOW() "
            f"WHERE id = {oid} AND location = 'RACK';"
        )
        stmts.append(
            f"UPDATE user_miners SET is_active = false "
            f"WHERE id = {m['id']} AND owned_machine_id = {oid};"
        )
    return stmts


def main():
    print(f"Mode: {'DRY RUN (--apply to execute)' if DRY_RUN else 'APPLY'}\n")

    host, user, pw = load_secret()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=pw)

    AFFECTED_USERS = [276, 412, 406, 423, 409]
    all_stmts = []

    for uid in AFFECTED_USERS:
        orphans = get_orphan_miners(ssh, uid)
        if not orphans:
            print(f"User {uid}: no orphans (already fixed?)")
            continue

        empty_slots = get_empty_rack_slots(ssh, uid)
        print(f"User {uid}: {len(orphans)} orphan miners, {len(empty_slots)} empty rack slots")

        if len(empty_slots) >= len(orphans):
            print(f"  → Strategy: assign to existing empty slots")
            stmts = fix_assign_to_slots(orphans, empty_slots)
        elif len(empty_slots) > 0:
            # Partial: fill what we can, move rest to inventory
            print(f"  → Strategy: fill {len(empty_slots)} slots, move {len(orphans)-len(empty_slots)} to inventory")
            stmts = fix_assign_to_slots(orphans[:len(empty_slots)], empty_slots)
            stmts += fix_move_to_inventory(ssh, uid, orphans[len(empty_slots):])
        else:
            print(f"  → Strategy: rack full, move all to inventory")
            stmts = fix_move_to_inventory(ssh, uid, orphans)

        for s in stmts:
            print(f"    {s}")
        all_stmts.extend(stmts)

    print(f"\nTotal statements: {len(all_stmts)}")

    if DRY_RUN:
        print("\nDRY RUN — nothing changed.")
        ssh.close()
        return

    if not all_stmts:
        print("Nothing to fix.")
        ssh.close()
        return

    tx = "BEGIN; " + " ".join(all_stmts) + " COMMIT;"
    psql(ssh, tx, "Applying fixes")

    # Verify
    print("\n--- Verification ---")
    for uid in AFFECTED_USERS:
        orphans = get_orphan_miners(ssh, uid)
        print(f"User {uid}: {len(orphans)} orphan miners remaining")

    ssh.close()


if __name__ == "__main__":
    main()
