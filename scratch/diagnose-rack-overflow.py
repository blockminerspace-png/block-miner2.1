"""
Diagnose racks reportedly exceeding the 8-machine limit per visual rack.

Each visual rack = 8 slots (4 cols x 2 rows). Position 0-7 = visual rack 1,
8-15 = visual rack 2, ..., 184-191 = visual rack 24.

Hypotheses checked:
  A. UserRoom rows duplicated per (user_id, room_number).
  B. Rooms with more than 192 UserRack rows, or positions outside 0-191.
  C. Visual racks with >8 occupied slots (userMinerId or blockedByMinerId).
  D. 2-slot machines installed at a row-edge position (% 4 == 3) -- pre-check legacy.
  E. UserMiner with slotIndex < 80 that ALSO has a UserRack pointing to it
     (would mean an orphan got linked somehow).
  F. UserRack rows where userMiner is 2-slot but the adjacent rack
     (position+1) is missing blockedByMinerId.
"""

import paramiko
from pathlib import Path
import importlib.util

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


def psql(ssh, sql, label):
    safe = sql.replace('"', '\\"')
    cmd = (
        f'docker exec -e PGPASSWORD=blockminer_password block-miner-db '
        f'psql -U blockminer -d blockminer_db -c "{safe}"'
    )
    print(f"\n{'='*70}\n{label}\n{'='*70}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    print(stdout.read().decode())
    err = stderr.read().decode().strip()
    if err:
        print("STDERR:", err)


CHECKS = [
    (
        "A. Duplicate UserRoom rows per (user_id, room_number)",
        """
        SELECT user_id, room_number, COUNT(*) AS dup_count
        FROM user_rooms
        GROUP BY user_id, room_number
        HAVING COUNT(*) > 1
        ORDER BY dup_count DESC, user_id
        LIMIT 50;
        """,
    ),
    (
        "B1. Rooms with more than 192 UserRack rows",
        """
        SELECT r.id AS room_id, r.user_id, r.room_number, COUNT(ur.id) AS rack_count
        FROM user_rooms r
        JOIN user_racks ur ON ur.room_id = r.id
        GROUP BY r.id, r.user_id, r.room_number
        HAVING COUNT(ur.id) > 192
        ORDER BY rack_count DESC
        LIMIT 50;
        """,
    ),
    (
        "B2. UserRack rows with position outside 0..191",
        """
        SELECT ur.id, ur.user_id, ur.room_id, ur.position
        FROM user_racks ur
        WHERE ur.position < 0 OR ur.position > 191
        ORDER BY ur.user_id, ur.room_id, ur.position
        LIMIT 50;
        """,
    ),
    (
        "C. Visual racks (position/8) with more than 8 occupied slots",
        """
        SELECT
          ur.user_id,
          ur.room_id,
          (ur.position / 8) + 1 AS visual_rack_number,
          COUNT(*) FILTER (WHERE ur.user_miner_id IS NOT NULL) AS installed_count,
          COUNT(*) FILTER (WHERE ur.blocked_by_miner_id IS NOT NULL) AS blocked_count,
          COUNT(*) FILTER (WHERE ur.user_miner_id IS NOT NULL OR ur.blocked_by_miner_id IS NOT NULL) AS occupied_count
        FROM user_racks ur
        GROUP BY ur.user_id, ur.room_id, (ur.position / 8)
        HAVING COUNT(*) FILTER (WHERE ur.user_miner_id IS NOT NULL) > 8
        ORDER BY installed_count DESC
        LIMIT 50;
        """,
    ),
    (
        "D. 2-slot machines installed at row-edge (% 4 = 3) -- bypassed ROW_EDGE check",
        """
        SELECT
          ur.user_id,
          ur.room_id,
          ur.position,
          (ur.position / 8) + 1 AS visual_rack_number,
          um.id AS user_miner_id,
          um.slot_size,
          um.miner_id
        FROM user_racks ur
        JOIN user_miners um ON um.id = ur.user_miner_id
        WHERE um.slot_size >= 2 AND (ur.position % 4) > (4 - um.slot_size)
        ORDER BY ur.user_id, ur.room_id, ur.position
        LIMIT 50;
        """,
    ),
    (
        "E. UserMiners with slotIndex < 80 AND linked to a UserRack (orphan got linked)",
        """
        SELECT um.id, um.user_id, um.slot_index, um.slot_size, ur.id AS user_rack_id, ur.position
        FROM user_miners um
        JOIN user_racks ur ON ur.user_miner_id = um.id
        WHERE um.slot_index < 80
        ORDER BY um.user_id, um.slot_index
        LIMIT 50;
        """,
    ),
    (
        "F. 2-slot installations missing the blockedByMinerId on adjacent rack",
        """
        WITH installed_two_slot AS (
          SELECT ur.id AS rack_id, ur.user_id, ur.room_id, ur.position, um.id AS user_miner_id, um.slot_size
          FROM user_racks ur
          JOIN user_miners um ON um.id = ur.user_miner_id
          WHERE um.slot_size = 2
        )
        SELECT
          its.user_id,
          its.room_id,
          its.position AS primary_position,
          its.user_miner_id,
          adj.id AS adjacent_rack_id,
          adj.position AS adjacent_position,
          adj.user_miner_id AS adjacent_user_miner_id,
          adj.blocked_by_miner_id AS adjacent_blocked_by
        FROM installed_two_slot its
        LEFT JOIN user_racks adj
          ON adj.room_id = its.room_id AND adj.position = its.position + 1
        WHERE adj.id IS NULL
           OR adj.blocked_by_miner_id IS DISTINCT FROM its.user_miner_id
        ORDER BY its.user_id, its.room_id, its.position
        LIMIT 50;
        """,
    ),
    (
        "G. Per-user totals: installed user_miners vs occupied user_rack rows",
        """
        SELECT
          u.id AS user_id,
          u.username,
          COUNT(DISTINCT um.id) AS user_miner_rows,
          COUNT(DISTINCT um.id) FILTER (WHERE um.slot_index < 80) AS legacy_slot_index_under_80,
          COUNT(DISTINCT ur.id) FILTER (WHERE ur.user_miner_id IS NOT NULL) AS racks_with_miner
        FROM users u
        LEFT JOIN user_miners um ON um.user_id = u.id
        LEFT JOIN user_racks ur ON ur.user_id = u.id
        GROUP BY u.id, u.username
        HAVING COUNT(DISTINCT um.id) FILTER (WHERE um.slot_index < 80) > 0
            OR COUNT(DISTINCT um.id) <> COUNT(DISTINCT ur.id) FILTER (WHERE ur.user_miner_id IS NOT NULL)
        ORDER BY user_miner_rows DESC
        LIMIT 50;
        """,
    ),
]


def main():
    host, user, password = load_secret()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    try:
        for label, sql in CHECKS:
            psql(ssh, sql.strip(), label)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
