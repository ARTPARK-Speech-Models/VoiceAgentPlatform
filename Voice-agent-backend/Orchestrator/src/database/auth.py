import inspect
from functools import wraps

from fastapi import HTTPException, Request, Response, status
from firebase_admin import app_check
from firebase_admin import auth as firebase_auth
from sqlalchemy.orm import Session
from src.constants import APP_CHECK_ENFORCE
from src.database import firebase_admin_init  # noqa: F401 -- import-time init, see that module
from src.database.engine import SessionLocal
from src.database.utils import BANNED_MESSAGE, get_user_by_firebase_uid, is_banned


def _user_payload_from_session_cookie(session_cookie: str) -> dict:
    """Verifies a Firebase session cookie and returns the same-shaped payload
    dict the old JWT-based get_current_user used to -- downstream call sites
    (crud.py's 7 Depends(get_current_user) routes, main.py's activate_agent)
    read user_payload["username"] and don't need to change."""
    decoded = firebase_auth.verify_session_cookie(session_cookie, check_revoked=True)

    db: Session = SessionLocal()
    try:
        user = get_user_by_firebase_uid(db, decoded["uid"])
    finally:
        db.close()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No local account for this session. Please register."
        )

    if is_banned(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=BANNED_MESSAGE)

    return {
        "username": user.username,
        "firebase_uid": decoded["uid"],
        "email": decoded.get("email"),
    }


async def get_current_user(request: Request):
    session_cookie = request.cookies.get("session")

    if not session_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Login required."
        )

    try:
        return _user_payload_from_session_cookie(session_cookie)

    except HTTPException:
        raise

    except (
        firebase_auth.ExpiredSessionCookieError,
        firebase_auth.RevokedSessionCookieError,
        firebase_auth.InvalidSessionCookieError,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please login again."
        ) from None


def auth_required(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        request: Request = kwargs.get("request") or next((arg for arg in args if isinstance(arg, Request)), None)
        response: Response = kwargs.get("response") or next((arg for arg in args if isinstance(arg, Response)), None)

        if not request or not response:
            raise ValueError("The decorated function must accept 'request: Request' and 'response: Response' as arguments.")

        session_cookie = request.cookies.get("session")
        if not session_cookie:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Login required."
            )

        try:
            kwargs["user_payload"] = _user_payload_from_session_cookie(session_cookie)
            return await func(*args, **kwargs)

        except HTTPException:
            raise

        except (
            firebase_auth.ExpiredSessionCookieError,
            firebase_auth.RevokedSessionCookieError,
            firebase_auth.InvalidSessionCookieError,
            # check_revoked=True makes verify_session_cookie look the user
            # up on Firebase's side too -- if the underlying Firebase
            # account itself is gone (deleted, not just our local DB row)
            # while a stale session cookie is still sitting in the
            # browser, that lookup raises this instead of one of the three
            # above, and it's just as much a "please log in again" case,
            # not a real server error.
            firebase_auth.UserNotFoundError,
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please login again."
            ) from None
    wrapper.__signature__ = inspect.signature(func)
    return wrapper


async def verify_app_check(request: Request):
    """Firebase App Check (reCAPTCHA v3 provider) replaces the old
    Cloudflare Turnstile check -- wired into the register/login endpoints
    only for this pass. The client attaches the App Check token as
    X-Firebase-AppCheck (App Check doesn't auto-attach this header for a
    custom, non-Firebase-native backend -- the frontend does it manually,
    see AuthModal.jsx). A no-op unless APP_CHECK_ENFORCE is set."""
    if not APP_CHECK_ENFORCE:
        return

    token = request.headers.get("X-Firebase-AppCheck")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing App Check token."
        )

    try:
        app_check.verify_token(token)
    except Exception as e:  # noqa: BLE001 -- app_check.verify_token's failure modes aren't all documented as one exception type
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid App Check token."
        ) from e
