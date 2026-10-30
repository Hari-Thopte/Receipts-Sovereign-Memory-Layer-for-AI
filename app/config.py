import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    NEBIUS_API_KEY: str = os.getenv("NEBIUS_API_KEY", "").strip()
    # Inference is pinned to Nebius Token Factory. Keys never select a provider.
    NEBIUS_BASE_URL: str = "https://api.tokenfactory.nebius.com/v1"
    NEMOTRON_CHAT_MODEL: str = os.getenv("NEMOTRON_CHAT_MODEL", "nvidia/nemotron-3-super-120b-a12b").strip()
    NEMOTRON_EXTRACT_MODEL: str = os.getenv("NEMOTRON_EXTRACT_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning").strip()
    NEMOTRON_FALLBACK_MODEL: str = os.getenv("NEMOTRON_FALLBACK_MODEL", os.getenv("NEMOTRON_EXTRACT_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")).strip()
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "").strip()
    VAULT_DB_PATH: str = os.getenv("VAULT_DB_PATH", str(BASE_DIR / "data" / "vault.db")).strip()
    HOST: str = os.getenv("HOST", "127.0.0.1").strip()
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")
    # If True, never fall back to simulation — raise HTTP 503 instead so the demo
    # always shows live Nemotron and never silently substitutes keyword matching.
    STRICT_LIVE_MODE: bool = os.getenv("STRICT_LIVE_MODE", "False").lower() in ("true", "1", "yes")
    ALLOW_NVIDIA_NIM: bool = os.getenv("ALLOW_NVIDIA_NIM", "True").lower() in ("true", "1", "yes")
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"

    @classmethod
    def resolve_base_url(cls, check_override: bool = False) -> str:
        """Return the required Nebius Token Factory OpenAI-compatible endpoint."""
        if check_override and getattr(cls, "ALLOW_NVIDIA_NIM", False) and cls.NEBIUS_API_KEY.startswith("nvapi-"):
            return "https://integrate.api.nvidia.com/v1"
        return "https://api.tokenfactory.nebius.com/v1"

    @classmethod
    def update_keys(cls, nebius_key: str | None = None, tavily_key: str | None = None, model: str | None = None):
        if nebius_key is not None:
            cls.NEBIUS_API_KEY = nebius_key.strip()
        if tavily_key is not None:
            cls.TAVILY_API_KEY = tavily_key.strip()
        if model is not None:
            cls.NEMOTRON_CHAT_MODEL = model.strip()

settings = Settings()
