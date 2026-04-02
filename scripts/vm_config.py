"""
Configuração da VM (IP, utilizador, senha root).

Prioridade:
1. Ficheiro `vm_config_secret.py` na mesma pasta (copia o .example; não vai para o git).
2. Variáveis de ambiente: VM_IP, VM_USER, VM_PASSWORD.
"""

from __future__ import annotations

import os
import runpy
from pathlib import Path

_dir = Path(__file__).resolve().parent
_secret = _dir / "vm_config_secret.py"

if _secret.exists():
    _d = runpy.run_path(str(_secret))
    IP: str = str(_d.get("IP", "") or "")
    LOGIN: str = str(_d.get("LOGIN", "root") or "root")
    ROOT_PASSWORD: str = str(_d.get("ROOT_PASSWORD", "") or "")
else:
    IP = os.environ.get("VM_IP", "") or ""
    LOGIN = os.environ.get("VM_USER", "root") or "root"
    ROOT_PASSWORD = os.environ.get("VM_PASSWORD", "") or ""


def as_dict() -> dict[str, str]:
    return {"ip": IP, "login": LOGIN, "root_password": ROOT_PASSWORD}


if __name__ == "__main__":
    # Não imprime a senha por defeito (evita leaks no histórico do terminal).
    import sys

    if "--show-secret" in sys.argv:
        print(as_dict())
    else:
        print({"ip": IP, "login": LOGIN, "root_password": "***" if ROOT_PASSWORD else ""})
