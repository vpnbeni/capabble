from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from school_intel.api.routes.schools import router as schools_router

app = FastAPI(title="Capabble SCHOL API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schools_router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "schol-api"}
