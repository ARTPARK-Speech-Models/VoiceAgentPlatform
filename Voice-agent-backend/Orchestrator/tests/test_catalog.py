"""Tests for GET /api/catalog and the seed_catalog.py upsert logic behind it."""
from src.database.models import (
    CatalogLanguage,
    CatalogModel,
    CatalogPrompt,
    CatalogProvider,
    CatalogVoice,
)


def test_catalog_endpoint_returns_200(client):
    res = client.get("/api/catalog")
    assert res.status_code == 200


def test_catalog_top_level_keys(client):
    data = client.get("/api/catalog").json()
    assert set(data.keys()) == {"asr", "llm", "tts"}


def test_asr_sravaani_label_survives(client):
    data = client.get("/api/catalog").json()
    vaani = next(p for p in data["asr"]["providers"] if p["name"] == "Vaani")
    assert {"value": "sravaani", "label": "Sravaani(CPU)"} in vaani["models"]


def test_sarvam_bulbul_v2_v3_voices_differ_and_are_model_scoped(client):
    data = client.get("/api/catalog").json()
    sarvam = next(p for p in data["tts"]["providers"] if p["name"] == "Sarvam")

    # Sarvam has no provider-level voices -- voices are attached per model.
    assert sarvam["voices"] == []

    models_by_value = {m["value"]: m for m in sarvam["models"]}
    assert set(models_by_value) == {"Bulbul:v2", "Bulbul:v3"}

    v2_voices = models_by_value["Bulbul:v2"]["voices"]
    v3_voices = models_by_value["Bulbul:v3"]["voices"]

    assert len(v2_voices) == 6
    assert v2_voices[0] == {"name": "Anushka", "gender": "female"}
    assert len(v3_voices) == 38

    v2_names = {v["name"] for v in v2_voices}
    v3_names = {v["name"] for v in v3_voices}
    assert v2_names.isdisjoint(v3_names)


def test_llm_prompts_exact_three_seeded_names(client):
    data = client.get("/api/catalog").json()
    prompts = data["llm"]["prompts"]
    assert {p["name"] for p in prompts} == {"Healthcare", "Customer Care", "Sales"}
    assert all(p["prompt"].strip() for p in prompts)


def test_seed_catalog_is_idempotent(db_session, seeded_catalog):
    def counts():
        return (
            db_session.query(CatalogProvider).count(),
            db_session.query(CatalogModel).count(),
            db_session.query(CatalogLanguage).count(),
            db_session.query(CatalogVoice).count(),
            db_session.query(CatalogPrompt).count(),
        )

    before = counts()
    seeded_catalog.seed()
    after = counts()
    assert before == after
