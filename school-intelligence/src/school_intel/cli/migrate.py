from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def run_migrate() -> int:
    root = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=root,
        check=False,
    )
    return result.returncode
