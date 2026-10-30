import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Starting Receipts Server on http://{settings.HOST}:{settings.PORT}")
    print(f"Model: {settings.NEMOTRON_CHAT_MODEL} via Nebius Token Factory")
    # Avoid Windows multiprocessing/reloader failures in the one-command demo.
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=False)
