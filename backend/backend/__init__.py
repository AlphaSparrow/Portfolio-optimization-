import sys
from pathlib import Path

# Ensure paths are available
_current = Path(__file__).resolve().parent
_backend_dir = _current.parent
_project_root = _backend_dir.parent

for p in [str(_backend_dir), str(_project_root)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    import app
    sys.modules["backend.app"] = app
except Exception:
    pass
