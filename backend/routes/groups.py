"""Group chats (training crews), group admin requests, and admin DM threads."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import asyncio

from server import (
    ALLOWED_REACTIONS, MessageReq, _dm_key, _download_button, _member_card,
    _msg_notifs_on, _public_base, _reactions_summary, create_notification, db, esc,
    log, new_id, notify_user, now_utc, require_admin, require_messaging_age, require_user,
)

router = APIRouter()


class GroupCreateReq(BaseModel):
    name: str
    member_ids: List[str] = []


async def _validated_friends(owner_id: str, member_ids) -> list:
    """Return owner_id + only those member_ids that are accepted friends of the owner."""
    valid = {owner_id}
    for mid in set(member_ids or []):
        if mid == owner_id:
            continue
        if await db.friendships.find_one({"key": _dm_key(owner_id, mid), "status": "accepted"}):
            valid.add(mid)
    return list(valid)


async def _create_group(owner_id: str, owner_name: str, name: str, member_ids: list) -> str:
    valid = await _validated_friends(owner_id, member_ids)
    gid = new_id("grp")
    await db.group_chats.insert_one({
        "group_id": gid, "name": name[:60], "owner_id": owner_id,
        "member_ids": valid, "created_at": now_utc(),
    })
    for mid in valid:
        if mid == owner_id:
            continue
        m = await db.users.find_one({"user_id": mid}, {"_id": 0})
        await notify_user(mid, (m or {}).get("email"), f"Added to group: {name[:40]}",
                          f"{owner_name or 'A member'} added you to the group '{name[:40]}'.", "message",
                          email_lines=[f"You've been added to the group <b>{esc(name)}</b> by <b>{esc(owner_name or 'a member')}</b>.", "Open the app → Inbox to chat."],
                          data={"nav": "member_inbox"})
    return gid


def _first_name(full) -> str:
    """First word of a member's name, cleaned. Empty if no usable name."""
    return (str(full or "").strip().split(" ")[0]).strip()


async def _post_group_welcome(group_id: str, group_name: str, names: list) -> None:
    """Post a friendly system welcome message naming the new member(s)."""
    clean = [n for n in (names or []) if n and str(n).strip()]
    if not clean:
        who = "our newest member"
    elif len(clean) == 1:
        who = clean[0]
    elif len(clean) == 2:
        who = f"{clean[0]} and {clean[1]}"
    else:
        who = ", ".join(clean[:-1]) + f" and {clean[-1]}"
    await db.group_messages.insert_one({
        "gmsg_id": new_id("gm"), "group_id": group_id, "from_id": "system",
        "sender_name": "Max Energy",
        "body": f"🥊 Everyone welcome {who} to the {group_name}! Say hi 👋",
        "read_by": [], "created_at": now_utc(),
    })



async def _notify_all_admins(admins: list, title: str, body: str, email_lines: list, nav: str) -> None:
    """Fire-and-forget: notify every admin without blocking the request (avoids 502 on email throttle)."""
    for a in admins:
        try:
            await notify_user(a["user_id"], a.get("email"), title, body, "message", email_lines=email_lines, data={"nav": nav})
        except Exception as e:
            log.warning(f"admin notify failed: {e}")


@router.post("/groups")
async def group_create(body: GroupCreateReq, u: dict = Depends(require_user)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Please name your group.")
    # Admins/staff create groups instantly; members must request staff approval.
    if u.get("is_admin"):
        gid = await _create_group(u["user_id"], u.get("name") or u.get("email"), name, body.member_ids)
        return {"group_id": gid, "pending": False}
    valid = await _validated_friends(u["user_id"], body.member_ids)
    rid = new_id("greq")
    await db.group_requests.insert_one({
        "request_id": rid, "requester_id": u["user_id"], "name": name[:60],
        "member_ids": valid, "status": "pending", "created_at": now_utc(),
    })
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1, "email": 1}).to_list(50)
    asyncio.create_task(_notify_all_admins(
        admins, "New group request",
        f"{u.get('name') or 'A member'} requested a group '{name[:40]}'. Tap to review.",
        [f"<b>{esc(u.get('name') or 'A member')}</b> requested a new group: <b>{esc(name)}</b>.", "Open Admin → Group Requests to approve or decline."],
        "admin_group_requests"))
    return {"group_id": None, "pending": True}


async def _group_or_403(gid: str, uid: str) -> dict:
    g = await db.group_chats.find_one({"group_id": gid}, {"_id": 0})
    if not g or uid not in g.get("member_ids", []):
        raise HTTPException(403, "You're not in this group.")
    return g


@router.get("/groups")
async def groups_list(u: dict = Depends(require_user)):
    gs = await db.group_chats.find({"member_ids": u["user_id"]}, {"_id": 0}).to_list(200)
    out = []
    for g in gs:
        last = await db.group_messages.find_one({"group_id": g["group_id"]}, {"_id": 0}, sort=[("created_at", -1)])
        unread = await db.group_messages.count_documents({"group_id": g["group_id"], "from_id": {"$ne": u["user_id"]}, "read_by": {"$ne": u["user_id"]}})
        out.append({"group_id": g["group_id"], "name": g["name"], "members": len(g.get("member_ids", [])),
                    "slug": g.get("slug"), "is_official": bool(g.get("is_official")),
                    "last_body": (last or {}).get("body"), "last_sender": (last or {}).get("sender_name"),
                    "last_at": (last or {}).get("created_at"), "unread": unread})
    def _sort_key(t):
        la = t.get("last_at")
        if isinstance(la, datetime):
            return la.replace(tzinfo=None)
        return datetime.min
    out.sort(key=_sort_key, reverse=True)
    return {"groups": out}


@router.get("/groups/discover")
async def groups_discover(u: dict = Depends(require_user)):
    """Official/exclusive gym groups a member can request to join."""
    gs = await db.group_chats.find({"is_official": True}, {"_id": 0}).to_list(50)
    out = []
    for g in gs:
        is_member = u["user_id"] in g.get("member_ids", [])
        pending = await db.group_join_requests.find_one(
            {"group_id": g["group_id"], "user_id": u["user_id"], "status": "pending"}, {"_id": 0})
        out.append({
            "group_id": g["group_id"], "name": g["name"], "slug": g.get("slug"),
            "is_official": True, "members": len(g.get("member_ids", [])),
            "description": g.get("description"),
            "is_member": is_member, "join_status": "pending" if pending else ("member" if is_member else "none"),
        })
    return {"groups": out}


@router.post("/groups/{gid}/join")
async def group_join_request(gid: str, u: dict = Depends(require_user)):
    g = await db.group_chats.find_one({"group_id": gid}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found.")
    if not g.get("is_official"):
        raise HTTPException(400, "This group is invite-only.")
    if u["user_id"] in g.get("member_ids", []):
        raise HTTPException(400, "You're already in this group.")
    existing = await db.group_join_requests.find_one({"group_id": gid, "user_id": u["user_id"], "status": "pending"})
    if existing:
        return {"pending": True, "already": True}
    rid = new_id("gjr")
    await db.group_join_requests.insert_one({
        "request_id": rid, "group_id": gid, "user_id": u["user_id"], "status": "pending", "created_at": now_utc(),
    })
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1, "email": 1}).to_list(50)
    asyncio.create_task(_notify_all_admins(
        admins, "New join request",
        f"{u.get('name') or 'A member'} wants to join '{g['name'][:40]}'. Tap to review.",
        [f"<b>{esc(u.get('name') or 'A member')}</b> requested to join <b>{esc(g['name'])}</b>.", "Open Admin → Group Requests to accept or decline."],
        "admin_group_requests"))
    return {"pending": True}


@router.get("/groups/{gid}")
async def group_get(gid: str, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    rows = await db.group_messages.find({"group_id": gid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    await db.group_messages.update_many({"group_id": gid, "read_by": {"$ne": u["user_id"]}}, {"$addToSet": {"read_by": u["user_id"]}})
    mem = await db.users.find({"user_id": {"$in": g.get("member_ids", [])}}, {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "last_active_at": 1}).to_list(100)
    mcount = len(g.get("member_ids", []))
    for r in rows:
        rb = r.get("read_by") or []
        r["seen_count"] = len([x for x in rb if x != r.get("from_id")])
        r["member_count"] = mcount
        r["reaction_summary"] = _reactions_summary(r, u["user_id"])
    return {"group": {"group_id": gid, "name": g["name"], "owner_id": g.get("owner_id"),
                      "slug": g.get("slug"), "is_official": bool(g.get("is_official")),
                      "pinned_note": g.get("pinned_note"), "pinned_msg": g.get("pinned_msg"), "member_count": mcount,
                      "members": [_member_card(m) for m in mem]}, "messages": rows}


class GroupSendReq(BaseModel):
    body: str
    reply_to_id: Optional[str] = None


@router.post("/groups/{gid}/messages")
async def group_send(gid: str, body: GroupSendReq, u: dict = Depends(require_user)):
    require_messaging_age(u)
    g = await _group_or_403(gid, u["user_id"])
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    reply_to = None
    if body.reply_to_id:
        parent = await db.group_messages.find_one({"gmsg_id": body.reply_to_id, "group_id": gid}, {"_id": 0})
        if parent:
            reply_to = {"gmsg_id": parent["gmsg_id"], "sender_name": parent.get("sender_name") or "Member", "body": (parent.get("body") or "")[:120]}
    msg = {"gmsg_id": new_id("gm"), "group_id": gid, "from_id": u["user_id"],
           "sender_name": u.get("name") or u.get("email"), "body": text, "read_by": [u["user_id"]],
           "reply_to": reply_to, "reactions": {}, "created_at": now_utc()}
    await db.group_messages.insert_one(msg)
    # In-app notification only (no email) for group chat messages; respect member's toggle.
    for mid in g.get("member_ids", []):
        if mid == u["user_id"]:
            continue
        if not await _msg_notifs_on(mid):
            continue
        await create_notification(mid, f"{g['name']}: new message",
                                  f"{msg['sender_name']}: {text[:100]}", "message",
                                  data={"nav": "member_inbox"})
    msg.pop("_id", None)
    msg["seen_count"] = 0
    msg["member_count"] = len(g.get("member_ids", []))
    msg["reaction_summary"] = []
    return {"message": msg}


class ReactReq(BaseModel):
    emoji: str


@router.post("/groups/{gid}/messages/{gmsg_id}/react")
async def group_react(gid: str, gmsg_id: str, body: ReactReq, u: dict = Depends(require_user)):
    require_messaging_age(u)
    await _group_or_403(gid, u["user_id"])
    emoji = (body.emoji or "").strip()
    if emoji not in ALLOWED_REACTIONS:
        raise HTTPException(400, "Unsupported reaction.")
    msg = await db.group_messages.find_one({"gmsg_id": gmsg_id, "group_id": gid}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found.")
    users = (msg.get("reactions") or {}).get(emoji) or []
    if u["user_id"] in users:
        await db.group_messages.update_one({"gmsg_id": gmsg_id, "group_id": gid}, {"$pull": {f"reactions.{emoji}": u["user_id"]}})
    else:
        await db.group_messages.update_one({"gmsg_id": gmsg_id, "group_id": gid}, {"$addToSet": {f"reactions.{emoji}": u["user_id"]}})
    fresh = await db.group_messages.find_one({"gmsg_id": gmsg_id, "group_id": gid}, {"_id": 0})
    return {"gmsg_id": gmsg_id, "reaction_summary": _reactions_summary(fresh, u["user_id"])}


class PinReq(BaseModel):
    gmsg_id: str


def _is_group_mod(g: dict, u: dict) -> bool:
    return g.get("owner_id") == u["user_id"] or bool(u.get("is_admin"))


@router.post("/groups/{gid}/pin")
async def group_pin(gid: str, body: PinReq, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    if not _is_group_mod(g, u):
        raise HTTPException(403, "Only a group admin can pin messages.")
    msg = await db.group_messages.find_one({"gmsg_id": body.gmsg_id, "group_id": gid}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found.")
    pin = {"gmsg_id": msg["gmsg_id"], "sender_name": msg.get("sender_name") or "Member", "body": (msg.get("body") or "")[:200]}
    await db.group_chats.update_one({"group_id": gid}, {"$set": {"pinned_msg": pin}})
    return {"pinned_msg": pin}


@router.post("/groups/{gid}/unpin")
async def group_unpin(gid: str, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    if not _is_group_mod(g, u):
        raise HTTPException(403, "Only a group admin can unpin messages.")
    await db.group_chats.update_one({"group_id": gid}, {"$unset": {"pinned_msg": ""}})
    return {"ok": True}


@router.post("/groups/{gid}/typing")
async def group_typing(gid: str, u: dict = Depends(require_user)):
    await _group_or_403(gid, u["user_id"])
    first = (u.get("name") or "Someone").split()[0]
    await db.group_typing.update_one(
        {"group_id": gid, "user_id": u["user_id"]},
        {"$set": {"group_id": gid, "user_id": u["user_id"], "name": first, "updated_at": now_utc()}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/groups/{gid}/typing")
async def group_typing_get(gid: str, u: dict = Depends(require_user)):
    await _group_or_403(gid, u["user_id"])
    cutoff = now_utc() - timedelta(seconds=6)
    rows = await db.group_typing.find(
        {"group_id": gid, "user_id": {"$ne": u["user_id"]}, "updated_at": {"$gte": cutoff}},
        {"_id": 0, "name": 1},
    ).to_list(10)
    return {"typing": [r["name"] for r in rows]}


class GroupEditReq(BaseModel):
    body: str


@router.put("/groups/{gid}/messages/{gmsg_id}")
async def group_edit_message(gid: str, gmsg_id: str, body: GroupEditReq, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    msg = await db.group_messages.find_one({"gmsg_id": gmsg_id, "group_id": gid}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found.")
    if msg.get("from_id") == "system":
        raise HTTPException(403, "Announcements can't be edited.")
    if msg.get("from_id") != u["user_id"]:
        raise HTTPException(403, "You can only edit your own messages.")
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    now = now_utc()
    await db.group_messages.update_one({"gmsg_id": gmsg_id, "group_id": gid}, {"$set": {"body": text, "edited_at": now}})
    msg["body"] = text
    msg["edited_at"] = now
    rb = msg.get("read_by") or []
    msg["seen_count"] = len([x for x in rb if x != msg.get("from_id")])
    msg["member_count"] = len(g.get("member_ids", []))
    msg["reaction_summary"] = _reactions_summary(msg, u["user_id"])
    return {"message": msg}


@router.delete("/groups/{gid}/messages/{gmsg_id}")
async def group_delete_message(gid: str, gmsg_id: str, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    msg = await db.group_messages.find_one({"gmsg_id": gmsg_id, "group_id": gid}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found.")
    is_moderator = g.get("owner_id") == u["user_id"] or bool(u.get("is_admin"))
    # System/announcement messages can only be removed by an owner/admin.
    if msg.get("from_id") == "system" and not is_moderator:
        raise HTTPException(403, "Only a group admin can remove announcements.")
    # Regular members may only unsend their own messages.
    if msg.get("from_id") != u["user_id"] and not is_moderator:
        raise HTTPException(403, "You can only unsend your own messages.")
    await db.group_messages.delete_one({"gmsg_id": gmsg_id, "group_id": gid})
    return {"ok": True, "gmsg_id": gmsg_id}


class GroupRenameReq(BaseModel):
    name: str


class GroupAddReq(BaseModel):
    member_ids: List[str] = []


class GroupPinReq(BaseModel):
    note: str = ""


@router.post("/groups/{gid}/pin-note")
async def group_set_pin(gid: str, body: GroupPinReq, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    if g.get("owner_id") != u["user_id"]:
        raise HTTPException(403, "Only the group owner can edit the pinned note.")
    note = (body.note or "").strip()[:1000]
    await db.group_chats.update_one({"group_id": gid}, {"$set": {"pinned_note": note}})
    return {"group_id": gid, "pinned_note": note}



@router.patch("/groups/{gid}")
async def group_rename(gid: str, body: GroupRenameReq, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    if g.get("owner_id") != u["user_id"]:
        raise HTTPException(403, "Only the group owner can rename this group.")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Please name your group.")
    await db.group_chats.update_one({"group_id": gid}, {"$set": {"name": name[:60]}})
    for mid in g.get("member_ids", []):
        if mid == u["user_id"]:
            continue
        m = await db.users.find_one({"user_id": mid}, {"_id": 0})
        await notify_user(mid, (m or {}).get("email"), "Group renamed",
                          f"{u.get('name') or 'The owner'} renamed a group to '{name[:40]}'.", "message",
                          data={"nav": "member_inbox"})
    return {"group_id": gid, "name": name[:60]}


@router.post("/groups/{gid}/members")
async def group_add_members(gid: str, body: GroupAddReq, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    if g.get("owner_id") != u["user_id"]:
        raise HTTPException(403, "Only the group owner can add members.")
    existing = set(g.get("member_ids", []))
    added = []
    for mid in set(body.member_ids or []):
        if mid in existing:
            continue
        if not await db.friendships.find_one({"key": _dm_key(u["user_id"], mid), "status": "accepted"}):
            continue
        added.append(mid)
    if added:
        await db.group_chats.update_one({"group_id": gid}, {"$addToSet": {"member_ids": {"$each": added}}})
        added_names = []
        for mid in added:
            m = await db.users.find_one({"user_id": mid}, {"_id": 0})
            added_names.append(_first_name((m or {}).get("name")))
            await notify_user(mid, (m or {}).get("email"), f"Added to group: {g['name'][:40]}",
                              f"{u.get('name') or 'A member'} added you to the group '{g['name'][:40]}'.", "message",
                              email_lines=[f"You've been added to the group <b>{esc(g['name'])}</b> by <b>{esc(u.get('name') or 'a member')}</b>.", "Open the app → Inbox to chat."],
                              data={"nav": "member_inbox"})
        await _post_group_welcome(gid, g["name"], added_names)
    return {"group_id": gid, "added": added}


@router.delete("/groups/{gid}/members/{mid}")
async def group_remove_member(gid: str, mid: str, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    if g.get("owner_id") != u["user_id"]:
        raise HTTPException(403, "Only the group owner can remove members.")
    if mid == u["user_id"]:
        raise HTTPException(400, "You can't remove yourself — leave the group instead.")
    if mid not in g.get("member_ids", []):
        raise HTTPException(404, "That member isn't in this group.")
    await db.group_chats.update_one({"group_id": gid}, {"$pull": {"member_ids": mid}})
    m = await db.users.find_one({"user_id": mid}, {"_id": 0})
    await notify_user(mid, (m or {}).get("email"), f"Removed from group: {g['name'][:40]}",
                      f"You were removed from the group '{g['name'][:40]}'.", "message",
                      data={"nav": "member_inbox"})
    return {"group_id": gid, "removed": mid}


@router.post("/groups/{gid}/leave")
async def group_leave(gid: str, u: dict = Depends(require_user)):
    g = await _group_or_403(gid, u["user_id"])
    remaining = [x for x in g.get("member_ids", []) if x != u["user_id"]]
    if not remaining:
        # last person out -> delete the group + its messages
        await db.group_chats.delete_one({"group_id": gid})
        await db.group_messages.delete_many({"group_id": gid})
        return {"group_id": gid, "left": True, "deleted": True}
    update: dict = {"$pull": {"member_ids": u["user_id"]}}
    # if the owner leaves, hand ownership to the next remaining member
    if g.get("owner_id") == u["user_id"]:
        update["$set"] = {"owner_id": remaining[0]}
    await db.group_chats.update_one({"group_id": gid}, update)
    return {"group_id": gid, "left": True, "deleted": False}


# ---- Admin moderation: group creation requests + join requests ----
@router.get("/admin/group-requests")
async def admin_group_requests(u: dict = Depends(require_admin)):
    creqs = await db.group_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    jreqs = await db.group_join_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    uids = list({r["requester_id"] for r in creqs} | {r["user_id"] for r in jreqs})
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(500)
    umap = {x["user_id"]: x for x in users}
    gids = list({r["group_id"] for r in jreqs})
    groups = await db.group_chats.find({"group_id": {"$in": gids}}, {"_id": 0, "group_id": 1, "name": 1}).to_list(200)
    gmap = {x["group_id"]: x for x in groups}
    create_out = []
    for r in creqs:
        m = umap.get(r["requester_id"], {})
        create_out.append({"request_id": r["request_id"], "name": r["name"],
                           "requester_name": m.get("name") or m.get("email") or "Member",
                           "requester_email": m.get("email"), "member_count": len(r.get("member_ids", [])),
                           "created_at": r.get("created_at")})
    join_out = []
    for r in jreqs:
        m = umap.get(r["user_id"], {})
        g = gmap.get(r["group_id"], {})
        join_out.append({"request_id": r["request_id"], "group_id": r["group_id"], "group_name": g.get("name") or "Group",
                         "member_name": m.get("name") or m.get("email") or "Member",
                         "member_email": m.get("email"), "created_at": r.get("created_at")})
    return {"create_requests": create_out, "join_requests": join_out,
            "count": len(create_out) + len(join_out)}


@router.post("/admin/group-requests/{request_id}/approve")
async def admin_group_request_approve(request_id: str, u: dict = Depends(require_admin)):
    r = await db.group_requests.find_one({"request_id": request_id, "status": "pending"}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found or already handled.")
    requester = await db.users.find_one({"user_id": r["requester_id"]}, {"_id": 0})
    rname = (requester or {}).get("name") or (requester or {}).get("email")
    gid = await _create_group(r["requester_id"], rname, r["name"], r.get("member_ids", []))
    await db.group_requests.update_one({"request_id": request_id},
                                       {"$set": {"status": "approved", "decided_at": now_utc(), "decided_by": u.get("name") or "Admin", "group_id": gid}})
    await notify_user(r["requester_id"], (requester or {}).get("email"), "Group approved 🎉",
                      f"Your group '{r['name'][:40]}' was approved — you're the owner. Open Inbox to chat.", "message",
                      email_lines=[f"Good news — your group <b>{esc(r['name'])}</b> was approved!", "You're the group owner. Open the app → Inbox to start chatting."],
                      data={"nav": "member_inbox"})
    return {"ok": True, "group_id": gid}


@router.post("/admin/group-requests/{request_id}/decline")
async def admin_group_request_decline(request_id: str, u: dict = Depends(require_admin)):
    r = await db.group_requests.find_one({"request_id": request_id, "status": "pending"}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found or already handled.")
    await db.group_requests.update_one({"request_id": request_id},
                                       {"$set": {"status": "declined", "decided_at": now_utc(), "decided_by": u.get("name") or "Admin"}})
    requester = await db.users.find_one({"user_id": r["requester_id"]}, {"_id": 0})
    await notify_user(r["requester_id"], (requester or {}).get("email"), "Group request declined",
                      f"Your request for the group '{r['name'][:40]}' wasn't approved this time.", "message",
                      data={"nav": "member_inbox"})
    return {"ok": True}


@router.post("/admin/group-join-requests/{request_id}/approve")
async def admin_group_join_approve(request_id: str, u: dict = Depends(require_admin)):
    r = await db.group_join_requests.find_one({"request_id": request_id, "status": "pending"}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found or already handled.")
    g = await db.group_chats.find_one({"group_id": r["group_id"]}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group no longer exists.")
    await db.group_chats.update_one({"group_id": r["group_id"]}, {"$addToSet": {"member_ids": r["user_id"]}})
    await db.group_join_requests.update_one({"request_id": request_id},
                                            {"$set": {"status": "approved", "decided_at": now_utc(), "decided_by": u.get("name") or "Admin"}})
    member = await db.users.find_one({"user_id": r["user_id"]}, {"_id": 0})
    # Auto-post a friendly welcome message in the group chat (greets by first name).
    await _post_group_welcome(r["group_id"], g["name"], [_first_name((member or {}).get("name"))])
    await notify_user(r["user_id"], (member or {}).get("email"), f"Welcome to {g['name'][:40]} 🥊",
                      f"You've been accepted into '{g['name'][:40]}'. Open Inbox to say hi!", "message",
                      email_lines=[f"You're in! You've been accepted into <b>{esc(g['name'])}</b>.", "Open the app → Inbox to join the conversation."],
                      data={"nav": "member_inbox"})
    return {"ok": True}


@router.post("/admin/group-join-requests/{request_id}/decline")
async def admin_group_join_decline(request_id: str, u: dict = Depends(require_admin)):
    r = await db.group_join_requests.find_one({"request_id": request_id, "status": "pending"}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found or already handled.")
    g = await db.group_chats.find_one({"group_id": r["group_id"]}, {"_id": 0})
    await db.group_join_requests.update_one({"request_id": request_id},
                                            {"$set": {"status": "declined", "decided_at": now_utc(), "decided_by": u.get("name") or "Admin"}})
    member = await db.users.find_one({"user_id": r["user_id"]}, {"_id": 0})
    await notify_user(r["user_id"], (member or {}).get("email"), "Join request declined",
                      f"Your request to join '{(g or {}).get('name', 'the group')[:40]}' wasn't approved this time.", "message",
                      data={"nav": "member_inbox"})
    return {"ok": True}






@router.get("/admin/threads")
async def admin_threads(u: dict = Depends(require_admin)):
    rows = await db.messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    threads: dict = {}
    for m in rows:
        tid = m["thread_user_id"]
        if tid not in threads:
            threads[tid] = {"user_id": tid, "last_body": m["body"], "last_at": m["created_at"], "last_is_admin": m["sender_is_admin"], "unread": 0}
        if not m["sender_is_admin"] and not m.get("read_by_admin"):
            threads[tid]["unread"] += 1
    uids = list(threads.keys())
    users = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(5000)
    umap = {x["user_id"]: x for x in users}
    out = []
    for tid, t in threads.items():
        m = umap.get(tid, {})
        t["name"] = m.get("name") or m.get("email") or "Member"
        t["email"] = m.get("email")
        out.append(t)
    out.sort(key=lambda x: x["last_at"], reverse=True)
    return {"threads": out}


@router.get("/admin/threads/{user_id}")
async def admin_thread_messages(user_id: str, u: dict = Depends(require_admin)):
    rows = await db.messages.find({"thread_user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.messages.update_many(
        {"thread_user_id": user_id, "sender_is_admin": False, "read_by_admin": {"$ne": True}},
        {"$set": {"read_by_admin": True}},
    )
    member = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "email": 1})
    return {"messages": rows, "member": member}


@router.post("/admin/threads/{user_id}")
async def admin_thread_reply(user_id: str, body: MessageReq, request: Request, u: dict = Depends(require_admin)):
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    member = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")
    msg = {
        "message_id": new_id("msg"),
        "thread_user_id": user_id,
        "sender_id": u["user_id"],
        "sender_name": "Maxenergy Team",
        "sender_is_admin": True,
        "body": text,
        "read_by_member": False,
        "read_by_admin": True,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(msg)
    base = _public_base(request)
    open_btn = _download_button(f"{base}/messages", "Open your messages") if base else "Open the app to reply: Profile → Message the Gym."
    if await _msg_notifs_on(user_id):
        await notify_user(
            user_id, member.get("email"),
            "New message from Maxenergy Fitness",
            text[:140],
            "message",
            email_lines=["You have a new message from the Maxenergy Team:", f"\"{text}\"", open_btn],
            data={"nav": "member_inbox"},
        )
    msg.pop("_id", None)
    return {"message": msg}
