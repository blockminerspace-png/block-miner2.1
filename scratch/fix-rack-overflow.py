"""
Fix rack overflow issues found by diagnose-rack-overflow.py.

Actions taken (all idempotent, run multiple times safely):

  1. BLOCK_FIX: For each 2-slot UserMiner in user_racks, if the adjacent rack
     (position+1, same room) is completely free (no userMinerId, no blockedByMinerId),
     set its blockedByMinerId to this miner's id.

  2. REPORT_DOUBLE_BOOKED: Cases where the adjacent slot has its own userMinerId
     (real double-booking) — reported only, not auto-fixed.

  3. SLOT_INDEX_REPORT: UserMiners with slotIndex < 80 linked to UserRack rows —
     reported for manual review (these are legacy migration artifacts).

Run with --fix to actually apply the block fix. Without --fix, runs in dry-run mode.
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
        raise SystemExit("vm_config_secret.py missing IP or ROOT_PASSWORD")
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
        print(f"\n{'='*70}\n{label}\n{'='*70}")
        print(out)
        if err:
            print("STDERR:", err)
    return out, err


def psql_rows(ssh, sql):
    """Run query, return list of dicts for tab-separated output."""
    out, _ = psql(ssh, sql)
    lines = [l for l in out.splitlines() if "|" in l]
    if len(lines) < 2:
        return []
    headers = [h.strip() for h in lines[0].split("|")]
    rows = []
    for line in lines[2:]:  # skip header and separator
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == len(headers):
            rows.append(dict(zip(headers, parts)))
    return rows


def main():
    host, user, password = load_secret()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)

    mode = "DRY-RUN" if DRY_RUN else "LIVE FIX"
    print(f"\n{'#'*70}\nRack Overflow Repair — {mode}\n{'#'*70}")
    if DRY_RUN:
        print("Pass --fix to actually apply changes.\n")

    # ── 1. Find all 2-slot miners and check their adjacent slot ──
    two_slot_query = """
        SELECT
          ur.id AS rack_id,
          ur.room_id,
          ur.position,
          ur.user_miner_id,
          adj.id AS adj_rack_id,
          adj.position AS adj_position,
          adj.user_miner_id AS adj_user_miner_id,
          adj.blocked_by_miner_id AS adj_blocked_by
        FROM user_racks ur
        JOIN user_miners um ON um.id = ur.user_miner_id AND um.slot_size = 2
        LEFT JOIN user_racks adj
          ON adj.room_id = ur.room_id AND adj.position = ur.position + 1
        WHERE adj.blocked_by_miner_id IS DISTINCT FROM ur.user_miner_id
        ORDER BY ur.room_id, ur.position;
    """
    rows = psql_rows(ssh, two_slot_query)

    can_fix = []
    double_booked = []
    missing_adj = []

    for r in rows:
        adj_rack_id = r["adj_rack_id"]
        adj_user_miner_id = r["adj_user_miner_id"]
        adj_blocked_by = r["adj_blocked_by"]

        if not adj_rack_id:
            missing_adj.append(r)
        elif adj_user_miner_id and adj_user_miner_id != r["user_miner_id"]:
            double_booked.append(r)
        elif not adj_blocked_by:
            can_fix.append(r)

    print(f"\nSummary:")
    print(f"  2-slot miners missing correct blockedByMinerId: {len(rows)}")
    print(f"    → fixable (adjacent slot is free):            {len(can_fix)}")
    print(f"    → double-booked (adjacent has own miner):     {len(double_booked)}")
    print(f"    → adjacent rack missing entirely:             {len(missing_adj)}")

    # ── 2. Apply fix: set blockedByMinerId on free adjacent slots ──
    fixed = 0
    skipped = 0
    for r in can_fix:
        adj_rack_id = r["adj_rack_id"]
        user_miner_id = r["user_miner_id"]
        if DRY_RUN:
            print(f"  [DRY] Would set user_racks.id={adj_rack_id}.blocked_by_miner_id = {user_miner_id}")
            fixed += 1
        else:
            fix_sql = (
                f"UPDATE user_racks SET blocked_by_miner_id = {user_miner_id} "
                f"WHERE id = {adj_rack_id} "
                f"AND blocked_by_miner_id IS NULL AND user_miner_id IS NULL;"
            )
            out, err = psql(ssh, fix_sql)
            if "UPDATE 1" in out:
                fixed += 1
            else:
                skipped += 1
                print(f"  [SKIP] adj_rack_id={adj_rack_id}: {out.strip()}")

    print(f"\n{'[DRY] Would fix' if DRY_RUN else 'Fixed'} {fixed} adjacent slots.")
    if skipped:
        print(f"Skipped (already changed or occupied): {skipped}")

    # ── 3. Report double-booked slots (need manual decision) ──
    if double_booked:
        print(f"\n{'='*70}")
        print(f"DOUBLE-BOOKED SLOTS (need manual review) — {len(double_booked)} cases")
        print("These have a 2-slot miner AND the adjacent slot has its own miner.")
        print("The 2-slot miner will visually overlap the neighbour in the grid.")
        print(f"{'='*70}")
        for r in double_booked[:30]:
            print(
                f"  room={r['room_id']} pos={r['position']} "
                f"user_miner={r['user_miner_id']} | "
                f"adj_rack={r['adj_rack_id']} pos={r['adj_position']} "
                f"adj_miner={r['adj_user_miner_id']}"
            )
        if len(double_booked) > 30:
            print(f"  ... and {len(double_booked) - 30} more")

    # ── 4. Report legacy slotIndex < 80 miners ──
    legacy_query = """
        SELECT um.id, um.user_id, um.slot_index, um.slot_size, ur.id AS user_rack_id, ur.position
        FROM user_miners um
        JOIN user_racks ur ON ur.user_miner_id = um.id
        WHERE um.slot_index < 80
        ORDER BY um.user_id, um.slot_index;
    """
    legacy_rows = psql_rows(ssh, legacy_query)
    if legacy_rows:
        print(f"\n{'='*70}")
        print(f"LEGACY slotIndex < 80 miners linked to UserRack — {len(legacy_rows)} rows")
        print("These are old-style miners. Their slotIndex doesn't match rack position.")
        print("Visually they render fine (rack reads position from UserRack.position,")
        print("not from UserMiner.slotIndex). No urgent action needed.")
        print(f"{'='*70}")
        for r in legacy_rows[:20]:
            print(
                f"  user={r['user_id']} miner_id={r['id']} "
                f"slotIndex={r['slot_index']} → rack_pos={r['position']}"
            )

    # ── 5. Post-fix verification ──
    if not DRY_RUN:
        print(f"\n{'='*70}\nPost-fix: remaining 2-slot miners with bad adjacent blocking\n{'='*70}")
        psql(ssh, two_slot_query.strip(), label="Remaining issues (should be 0 fixable)")

    ssh.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
