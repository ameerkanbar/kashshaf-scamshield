"""Settings from .env (no extra packages needed)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


# KASHSHAF_ENV_FILE points at another settings file (a second instance, a deployment); default .env here
ENV_FILE = Path(os.environ.get("KASHSHAF_ENV_FILE") or ROOT / ".env")
_load_env(ENV_FILE)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Empty = Anthropic directly. Set only when the key comes from a compatible gateway.
AGENT_BASE_URL = os.environ.get("AGENT_BASE_URL", "")
SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "")
AGENT_COUNT = int(os.environ.get("AGENT_COUNT", "50"))
AGENT_MIN_RULE_SCORE = int(os.environ.get("AGENT_MIN_RULE_SCORE", "0"))
DISCOVERY_INTERVAL_MIN = float(os.environ.get("DISCOVERY_INTERVAL_MIN", "0"))
# Spending caps (per rolling hour). Past a cap, Google search pauses and links are judged by rules only.
SERP_MAX_PER_HOUR = int(os.environ.get("SERP_MAX_PER_HOUR", "20"))
AI_MAX_PER_HOUR = int(os.environ.get("AI_MAX_PER_HOUR", "60"))
PATROL_INTERVAL_SEC = int(os.environ.get("PATROL_INTERVAL_SEC", "90"))
# Memory: don't repeat a search, or re-check a link, within these windows.
SEARCH_COOLDOWN_HOURS = float(os.environ.get("SEARCH_COOLDOWN_HOURS", "24"))
AGENT_SEARCH_CACHE_HOURS = float(os.environ.get("AGENT_SEARCH_CACHE_HOURS", "168"))
RECHECK_AFTER_HOURS = float(os.environ.get("RECHECK_AFTER_HOURS", "24"))


def missing() -> list[str]:
    """Settings the server cannot start without."""
    return [k for k in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY") if not os.environ.get(k)]
