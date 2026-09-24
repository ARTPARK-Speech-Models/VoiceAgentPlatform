from fastapi import WebSocket, WebSocketException, status
from firebase_admin import auth as firebase_auth
from src.database.engine import SessionLocal
from src.database.utils import BANNED_MESSAGE, get_user_by_firebase_uid, is_banned


async def get_ws_auth(websocket: WebSocket) -> dict:
    """WebSocket dependency authenticating via the same httpOnly session
    cookie REST calls use -- it rides along on the WS upgrade handshake
    automatically, same mechanism as the old JWT cookie, so no explicit
    token handshake is needed after connect. An invalid/expired/missing
    cookie denies the upgrade outright (WebSocketException, raised from a
    Depends, closes the connection before accept())."""
    session_cookie = websocket.cookies.get("session")

    if not session_cookie:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Session expired. Login required."
        )

    try:
        decoded = firebase_auth.verify_session_cookie(session_cookie, check_revoked=True)

    except (
        firebase_auth.ExpiredSessionCookieError,
        firebase_auth.RevokedSessionCookieError,
        firebase_auth.InvalidSessionCookieError,
    ):
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Session expired. Please login again."
        ) from None

    db = SessionLocal()
    try:
        user = get_user_by_firebase_uid(db, decoded["uid"])
    finally:
        db.close()

    if not user:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="No local account for this session. Please register."
        )

    if is_banned(user):
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason=BANNED_MESSAGE)

    return {
        "user_payload": {
            "username": user.username,
            "firebase_uid": decoded["uid"],
            "email": decoded.get("email"),
        }
    }
