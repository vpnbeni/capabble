from __future__ import annotations

from fastapi import APIRouter, HTTPException

from school_intel.collectors.saras_collector import SarasCollector

router = APIRouter(prefix="/api/geography", tags=["geography"])


@router.get("/states")
def list_states() -> dict:
    collector = SarasCollector()
    try:
        states = collector.fetch_state_options()
        return {"states": states}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        collector.close()


@router.get("/states/{state_id}/districts")
def list_districts(state_id: str) -> dict:
    collector = SarasCollector()
    try:
        districts = collector.fetch_district_options(state_id)
        return {"state_id": state_id, "districts": districts}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        collector.close()
