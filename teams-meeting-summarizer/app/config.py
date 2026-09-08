from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    database_url: str = "sqlite+aiosqlite:///./meetings.db"

    # IBM watsonx.ai (plan Lite — gratuito con cuenta corporativa IBM)
    ibm_api_key: str = ""
    ibm_project_id: str = ""
    ibm_region: str = "us-south"          # us-south | eu-de | jp-tok | au-syd
    ibm_model_id: str = "ibm/granite-13b-instruct-v2"

    # Monday.com API (gratuito con cuenta existente)
    monday_api_key: str = ""
    monday_workspace_id: str = ""


settings = Settings()
