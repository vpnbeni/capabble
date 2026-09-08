from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from school_intel.api.routes.collection import router as collection_router
from school_intel.api.routes.geography import router as geography_router
from school_intel.api.routes.kys_mapping import router as kys_mapping_router
from school_intel.api.routes.match_candidates import router as match_candidates_router
from school_intel.api.routes.schools import router as schools_router
from school_intel.api.routes.setup import router as setup_router
from school_intel.db.session import session_scope

app = FastAPI(title="Capabble SCHOL API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schools_router)
app.include_router(setup_router)
app.include_router(geography_router)
app.include_router(collection_router)
app.include_router(kys_mapping_router)
app.include_router(match_candidates_router)


@app.exception_handler(OperationalError)
async def database_unavailable_handler(_request, exc: OperationalError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": "School intelligence database is unavailable. Configure SCHOOL_INTEL_DATABASE_URL and run migrations.",
            "error": str(exc.orig) if getattr(exc, "orig", None) else str(exc),
        },
    )


@app.get("/api/health")
def health() -> dict:
    try:
        with session_scope() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok", "service": "schol-api", "database": "connected"}
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "service": "schol-api",
                "database": "disconnected",
                "detail": str(exc),
            },
        )
