"""Receipts - Sovereign Personal AI Memory Layer Launcher.
Runs the FastAPI server with local SQLite vault and NVIDIA Nemotron integration.
"""
import sys
import uvicorn
from app.config import settings

# Ensure utf-8 output if possible
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

if __name__ == "__main__":
    print("=" * 65)
    print("RECEIPTS - Sovereign Personal AI Companion with Memory Receipts")
    print(f"Server URL: http://{settings.HOST}:{settings.PORT}")
    print(f"Model: {settings.NEMOTRON_CHAT_MODEL} via {settings.NEBIUS_BASE_URL}")
    print(f"Local Vault: {settings.VAULT_DB_PATH}")
    print("=" * 65)
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
