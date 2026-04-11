from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://autobook:autobook@localhost:5432/autobook"
    DB_SECRET_ARN: str | None = None
    REDIS_URL: str = "redis://localhost:6379/0"
    AWS_REGION: str | None = None
    AWS_DEFAULT_REGION: str = "ca-central-1"
    ENV: str = "local"
    # Cognito is required in every environment — no default pool id. The dev
    # pool's values are supplied via env vars in both local docker-compose
    # (from a gitignored .env) and deployed task/function configs.
    COGNITO_USER_POOL_ID: str = Field(
        validation_alias=AliasChoices("COGNITO_USER_POOL_ID", "COGNITO_POOL_ID"),
    )
    COGNITO_CLIENT_ID: str
    COGNITO_DOMAIN: str | None = None
    COGNITO_JWKS_JSON: str | None = None
    COGNITO_JWT_ALGORITHM: str = "RS256"
    COGNITO_ROLE_CLAIM_SOURCE: str = "cognito:groups"
    COGNITO_SCOPES: str = "openid email profile"
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "https://autobook.tech",
        "https://www.autobook.tech",
        "https://autobooktech.netlify.app",
    ]
    AUTO_POST_THRESHOLD: float = 0.95  # confidence >= this → auto-post
    ML_INFERENCE_PROVIDER: str = "heuristic"
    ML_CLASSIFIER_MODEL_PATH: str | None = None
    ML_ENTITY_MODEL_PATH: str | None = None
    SAGEMAKER_ENDPOINT_NAME: str | None = None
    SQS_ENDPOINT_URL: str | None = None
    SQS_QUEUE_FAST_PATH: str = "http://elasticmq:9324/queue/fast-path"
    SQS_QUEUE_NORMALIZATION: str = "http://elasticmq:9324/queue/normalization"
    SQS_QUEUE_PRECEDENT: str = "http://elasticmq:9324/queue/precedent"
    SQS_QUEUE_ML_INFERENCE: str = "http://elasticmq:9324/queue/ml-inference"
    SQS_QUEUE_AGENT: str = "http://elasticmq:9324/queue/agent"
    SQS_QUEUE_RESOLUTION: str = "http://elasticmq:9324/queue/resolution"
    SQS_QUEUE_POSTING: str = "http://elasticmq:9324/queue/posting"
    SQS_QUEUE_FLYWHEEL: str = "http://elasticmq:9324/queue/flywheel"
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str | None = None
    BEDROCK_MODEL_ROUTING: dict[str, str] = {
        "normalization":     "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "decision_maker":   "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "debit_classifier":  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "credit_classifier": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "tax_specialist":    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "entry_drafter":     "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    }
    BEDROCK_THINKING_EFFORT: dict[str, str] = {}  # empty = no thinking; post-ablation: set per agent

    model_config = {"case_sensitive": False}

    @property
    def cognito_region(self) -> str:
        return self.AWS_REGION or self.AWS_DEFAULT_REGION

    @property
    def cognito_issuer(self) -> str:
        return f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.COGNITO_USER_POOL_ID}"

    @property
    def cognito_jwks_url(self) -> str:
        return f"{self.cognito_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()

