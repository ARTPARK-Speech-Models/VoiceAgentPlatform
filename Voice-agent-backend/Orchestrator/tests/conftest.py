"""Shared fixtures for the catalog test suite.

Everything here is scoped to keep tests off the real `voice_agent` database:
DATABASE_URL is redirected to TEST_DATABASE_URL before any src.*/scripts.*
module is imported, so src/database/engine.py's module-level engine and
scripts/seed_catalog.py's create_all() both bind to the test DB only.
"""
import os

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://user:password@localhost:5432/voice_agent_test"
)
# Must happen before any src.*/scripts.* import -- load_dotenv() (called at
# src/database/engine.py import time) never overrides an already-set env var,
# so setting this first guarantees the test DB is used even if a .env file
# defines the real DATABASE_URL.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

import psycopg2
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ORCH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _maintenance_conn():
    # CREATE/DROP DATABASE can't run inside a transaction block.
    parts = TEST_DATABASE_URL.rsplit("/", 1)
    maintenance_url = parts[0] + "/postgres"
    conn = psycopg2.connect(maintenance_url)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    return conn


@pytest.fixture(scope="session", autouse=True)
def migrated_test_db():
    """Drop + recreate voice_agent_test, then run real Alembic migrations
    against it -- this is what actually exercises the migration path,
    rather than a bare Base.metadata.create_all()."""
    test_db_name = TEST_DATABASE_URL.rsplit("/", 1)[-1]

    conn = _maintenance_conn()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid();",
            (test_db_name,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{test_db_name}";')
        cur.execute(f'CREATE DATABASE "{test_db_name}";')
    conn.close()

    alembic_cfg = Config(os.path.join(ORCH_DIR, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(ORCH_DIR, "alembic"))
    command.upgrade(alembic_cfg, "head")

    yield


@pytest.fixture(scope="session", autouse=True)
def seeded_catalog(migrated_test_db):
    """Seed the test DB using the exact same logic that seeds production --
    reused, not duplicated, so tests can't drift from real seeding behavior."""
    import scripts.seed_catalog as seed_catalog
    seed_catalog.seed()
    return seed_catalog


@pytest.fixture(scope="session")
def TestSessionLocal():
    engine = create_engine(TEST_DATABASE_URL)
    return sessionmaker(autoflush=False, autocommit=False, bind=engine)


@pytest.fixture()
def db_session(TestSessionLocal, seeded_catalog):
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session")
def client(TestSessionLocal, seeded_catalog):
    # A minimal app mounting only the catalog route -- deliberately not
    # importing src.main, whose top-level imports pull in torch/kokoro/
    # silero-vad/mcp, irrelevant to this feature and expensive.
    from src.crud import router as crud_router
    from src.database.engine import get_db

    app = FastAPI()
    app.include_router(crud_router)

    def _override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app) as c:
        yield c
