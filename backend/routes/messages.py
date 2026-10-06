"""Member <-> gym direct messaging (member side)."""
from fastapi import APIRouter, Depends, HTTPException, Request

from server import (
    db, require_user, require_messaging_age, new_id, now_utc,
    _public_base, esc, _download_button, notify_admins,
)
from models import MessageReq

router = APIRouter()


@router.get("/messages/unread")
async def messages_unread(u: dict = Depends(require_user)):
    count = await db.messages.count_documents(
        {"thread_user_id": u["user_id"], "sender_is_admin": True, "read_by_member": {"$ne": True}}
    )
    return {"count": count}


@router.get("/messages")
async def messages_list(u: dict = Depends(require_user)):
    rows = await db.messages.find({"thread_user_id": u["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many(
        {"thread_user_id": u["user_id"], "sender_is_admin": True, "read_by_member": {"$ne": True}},
        {"$set": {"read_by_member": True}},
    )
    return {"messages": rows}


@router.post("/messages")
async def messages_send(body: MessageReq, request: Request, u: dict = Depends(require_user)):
    require_messaging_age(u)
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    msg = {
        "message_id": new_id("msg"),
        "thread_user_id": u["user_id"],
        "sender_id": u["user_id"],
        "sender_name": u.get("name") or u.get("email"),
        "sender_is_admin": False,
        "body": text,
        "read_by_member": True,
        "read_by_admin": False,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(msg)
    from urllib.parse import quote_plus
    base = _public_base(request)
    thread_url = f"{base}/admin/thread?userId={u['user_id']}&name={quote_plus(msg['sender_name'])}" if base else ""
    email_lines = [
        f"<b>{esc(msg['sender_name'])}</b> ({esc(u.get('email') or '')}) sent you a new message:",
        f"\"{esc(text)}\"",
        _download_button(thread_url, "Open conversation") if thread_url else "Open the app → Admin → Inbox to reply.",
    ]
    await notify_admins(
        f"New message from {msg['sender_name']}",
        f"{msg['sender_name']}: {text[:120]}",
        "message",
        email_lines=email_lines,
        data={"nav": "admin_thread", "user_id": u["user_id"], "name": msg["sender_name"]},
    )
    msg.pop("_id", None)
    return {"message": msg}
