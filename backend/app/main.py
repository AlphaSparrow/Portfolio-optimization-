"""
FastAPI Application Entrypoint for Quantitative Portfolio Optimization & Live Paper Trading Platform.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.models.database import init_db
from backend.app.api.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Quant Platform Database & Models...")
    init_db()
    logger.info(f"System started in {'DEBUG' if settings.DEBUG else 'PRODUCTION'} mode.")
    yield
    logger.info("Shutting down Quant Platform Engine.")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Institutional Quantitative Portfolio Optimization, Walk-Forward Backtesting, and Live/Paper Trading with Upstox API v2",
    lifespan=lifespan
)

# CORS configuration for React Vite frontend (running on http://localhost:5173 or other ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "upstox_configured": bool(settings.UPSTOX_API_KEY)
    }

candidate_dirs = [
    Path(__file__).resolve().parent.parent / "static",
    Path(__file__).resolve().parents[2] / "frontend" / "dist",
    Path.cwd() / "backend" / "static",
    Path.cwd() / "frontend" / "dist",
    Path("/opt/render/project/src/backend/static"),
    Path("/opt/render/project/src/frontend/dist"),
]
frontend_dist = None
for d in candidate_dirs:
    if d.exists() and (d / "index.html").exists():
        frontend_dist = d
        break

if frontend_dist:
    logger.info(f"Serving React frontend from: {frontend_dist}")
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    def root():
        return FileResponse(str(frontend_dist / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path in ["health", "docs", "redoc", "openapi.json"]:
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        target_file = frontend_dist / full_path
        if full_path and target_file.is_file():
            return FileResponse(str(target_file))
        return FileResponse(str(frontend_dist / "index.html"))
else:
    logger.warning("No built frontend found; falling back to JSON API mode.")
    @app.get("/")
    def root():
        return {
            "status": "ONLINE",
            "service": settings.APP_NAME,
            "version": settings.VERSION,
            "docs": "/docs",
            "api_endpoints": "/api"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
