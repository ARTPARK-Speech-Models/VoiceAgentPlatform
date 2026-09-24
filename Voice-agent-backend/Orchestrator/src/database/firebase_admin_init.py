"""Initializes the firebase-admin SDK exactly once, as an import-time side
effect -- mirrors DATABASE_URL/JWT_KEY's "read straight from env at module
load" pattern elsewhere in this package. Import this module (not any of its
non-existent symbols) from anywhere that needs firebase_admin.auth/app_check
ready, before using them -- src/main.py does this first.

FIREBASE_SERVICE_ACCOUNT_JSON holds the *contents* of the service account
key file as a single-line JSON string env var, not a mounted file path --
passed in through docker-compose's environment block, so no volume mount
is needed."""
import json
import os

import firebase_admin
from firebase_admin import credentials

if not firebase_admin._apps:
    service_account_info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    firebase_admin.initialize_app(credentials.Certificate(service_account_info))
