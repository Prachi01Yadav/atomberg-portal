from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AtomQuest Goal Portal"
    environment: str = "development"
    debug: bool = True
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    jwt_algorithm: str = "HS256"
    cors_origins: str = "http://localhost:5173,http://localhost:80"

    database_url: str = "sqlite+aiosqlite:///./atomquest.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    ai_cache_ttl_seconds: int = 3600

    blockchain_mode: str = "mock"
    polygon_rpc_url: str = "https://rpc-amoy.polygon.technology/"
    polygon_contract_address: str = ""
    polygon_private_key: str = ""
    polygon_scan_base_url: str = "https://amoy.polygonscan.com/tx/"

    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = "noreply@atomquest.demo"
    mail_port: int = 587
    mail_server: str = "smtp.sendgrid.net"
    mail_starttls: bool = True
    mail_ssl_tls: bool = False
    mail_from_name: str = "AtomQuest"

    teams_webhook_url: str = ""

    azure_tenant_id: str = ""
    azure_client_id: str = ""
    azure_client_secret: str = ""
    azure_redirect_uri: str = "http://localhost:5173/auth/callback"
    sso_mode: str = "mock"  # mock | live
    # Object IDs of Azure AD groups used for role mapping (optional)
    azure_admin_group_id: str = ""
    azure_manager_group_id: str = ""
    azure_employee_group_id: str = ""

    # Frontend base URL used to build deep-links in email + Teams cards
    app_base_url: str = "http://localhost:5174"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors(cls, v: str | List[str]) -> str:
        if isinstance(v, list):
            return ",".join(v)
        return v

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
