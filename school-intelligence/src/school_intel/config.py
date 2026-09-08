from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel",
        validation_alias=AliasChoices("SCHOOL_INTEL_DATABASE_URL", "database_url"),
    )
    http_timeout_seconds: float = Field(
        default=30.0,
        validation_alias=AliasChoices(
            "SCHOOL_INTEL_HTTP_TIMEOUT_SECONDS",
            "KYS_TIMEOUT_SECONDS",
            "http_timeout_seconds",
        ),
    )
    http_max_retries: int = Field(
        default=3,
        validation_alias=AliasChoices(
            "SCHOOL_INTEL_HTTP_MAX_RETRIES",
            "KYS_MAX_RETRIES",
            "http_max_retries",
        ),
    )
    kys_request_delay_seconds: float = Field(
        default=1.0,
        validation_alias=AliasChoices("KYS_REQUEST_DELAY_SECONDS", "kys_request_delay_seconds"),
    )
    kys_base_url: str = Field(
        default="https://kys.udiseplus.gov.in",
        validation_alias=AliasChoices("KYS_BASE_URL", "kys_base_url"),
    )
    saras_base_url: str = Field(
        default="https://saras.cbse.gov.in",
        validation_alias=AliasChoices("SARAS_BASE_URL", "saras_base_url"),
    )
    identity_fuzzy_threshold: int = Field(
        default=90,
        validation_alias=AliasChoices("SCHOOL_INTEL_FUZZY_THRESHOLD", "identity_fuzzy_threshold"),
    )
    identity_auto_merge_threshold: int = Field(
        default=98,
        validation_alias=AliasChoices("SCHOOL_INTEL_AUTO_MERGE_THRESHOLD", "identity_auto_merge_threshold"),
    )
    preserve_retrieval_history: bool = Field(
        default=False,
        validation_alias=AliasChoices("SCHOOL_INTEL_PRESERVE_RETRIEVAL_HISTORY", "preserve_retrieval_history"),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
