from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://autobook:autobook@localhost:5432/autobook"
    REDIS_URL: str = "redis://localhost:6379/0"
    AWS_DEFAULT_REGION: str = "ca-central-1"
    ENV: str = "local"

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    return Settings()
