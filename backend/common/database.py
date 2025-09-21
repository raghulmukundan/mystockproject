"""Shared helpers for building database connection strings."""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

DEFAULT_DB_USER = os.getenv("DATABASE_USER", "stockuser")
DEFAULT_DB_PASSWORD = os.getenv("DATABASE_PASSWORD", "stockpass123")
DEFAULT_DB_HOST = os.getenv("DATABASE_HOST", "host.docker.internal")
DEFAULT_DB_PORT = os.getenv("DATABASE_PORT", "5432")
DEFAULT_DB_NAME = os.getenv("DATABASE_NAME", "stockwatchlist")

def build_database_url(
    user: str | None = None,
    password: str | None = None,
    host: str | None = None,
    port: str | None = None,
    database: str | None = None,
) -> str:
    """Assemble a PostgreSQL connection URL from individual components."""
    return (
        f"postgresql://{user or DEFAULT_DB_USER}:{password or DEFAULT_DB_PASSWORD}"
        f"@{host or DEFAULT_DB_HOST}:{port or DEFAULT_DB_PORT}/{database or DEFAULT_DB_NAME}"
    )

def get_database_url() -> str:
    """Read DATABASE_URL from the environment, falling back to component defaults."""
    env_value = os.getenv("DATABASE_URL")
    if env_value:
        return env_value
    return build_database_url()

DATABASE_URL = get_database_url()
