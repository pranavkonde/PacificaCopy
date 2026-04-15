from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""

    privy_app_id: str = ""
    privy_app_secret: str = ""
    privy_verification_key: str | None = None

    pacifica_api_base: str = "https://api.pacifica.fi/api/v1"

    copy_poll_interval_seconds: float = 4.0

    cors_origins: str = "http://localhost:3000"

    dev_skip_privy: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
