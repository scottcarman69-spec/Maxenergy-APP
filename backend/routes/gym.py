"""OUR GYM gallery — admin-managed photos shown on Home & About (no redeploy)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from server import db, require_admin, _process_gallery_image, new_id, now_utc, log

router = APIRouter()


@router.get("/gym/photos")
async def gym_photos_list():
    """Public: the OUR GYM gallery photos, ordered. Empty list => app shows bundled defaults."""
    rows = await db.gym_photos.find({}, {"_id": 0, "photo_id": 1, "image": 1, "sort": 1, "caption": 1, "featured": 1}).sort([("sort", 1), ("created_at", 1)]).to_list(200)
    return {"photos": [{"photo_id": r["photo_id"], "image": r["image"], "caption": r.get("caption", ""), "featured": bool(r.get("featured"))} for r in rows]}


class GymPhotoReq(BaseModel):
    image: str
    caption: Optional[str] = ""


@router.post("/admin/gym/photos")
async def gym_photo_add(body: GymPhotoReq, u: dict = Depends(require_admin)):
    img = (body.image or "").strip()
    if not img.startswith("data:image"):
        raise HTTPException(400, "Invalid image.")
    if len(img) > 12_000_000:
        raise HTTPException(400, "Image is too large. Please choose a smaller photo.")
    try:
        processed = _process_gallery_image(img)
    except Exception as e:
        log.error(f"gym photo process error: {e}")
        raise HTTPException(400, "Could not process that image. Please try another photo.")
    last = await db.gym_photos.find_one({}, {"_id": 0, "sort": 1}, sort=[("sort", -1)])
    nxt = int((last or {}).get("sort", 0)) + 1
    photo_id = new_id("gph")
    await db.gym_photos.insert_one({
        "photo_id": photo_id, "image": processed, "sort": nxt,
        "caption": (body.caption or "").strip()[:120],
        "created_by": u["user_id"], "created_at": now_utc(),
    })
    return {"ok": True, "photo_id": photo_id}


class GymCaptionReq(BaseModel):
    caption: str


@router.patch("/admin/gym/photos/{photo_id}")
async def gym_photo_caption(photo_id: str, body: GymCaptionReq, u: dict = Depends(require_admin)):
    r = await db.gym_photos.update_one({"photo_id": photo_id}, {"$set": {"caption": (body.caption or "").strip()[:120]}})
    if r.matched_count == 0:
        raise HTTPException(404, "Photo not found.")
    return {"ok": True}


@router.delete("/admin/gym/photos/{photo_id}")
async def gym_photo_delete(photo_id: str, u: dict = Depends(require_admin)):
    r = await db.gym_photos.delete_one({"photo_id": photo_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Photo not found.")
    return {"ok": True}


class GymReorderReq(BaseModel):
    order: list[str]


@router.post("/admin/gym/photos/reorder")
async def gym_photo_reorder(body: GymReorderReq, u: dict = Depends(require_admin)):
    for i, pid in enumerate(body.order):
        await db.gym_photos.update_one({"photo_id": pid}, {"$set": {"sort": i + 1}})
    return {"ok": True}


class GymFeatureReq(BaseModel):
    featured: bool


@router.post("/admin/gym/photos/{photo_id}/feature")
async def gym_photo_feature(photo_id: str, body: GymFeatureReq, u: dict = Depends(require_admin)):
    """Mark one gallery photo as the featured hero (only one can be featured)."""
    target = await db.gym_photos.find_one({"photo_id": photo_id}, {"_id": 0, "photo_id": 1})
    if not target:
        raise HTTPException(404, "Photo not found.")
    # Only one featured photo at a time — clear any existing feature first.
    await db.gym_photos.update_many({"featured": True}, {"$set": {"featured": False}})
    if body.featured:
        await db.gym_photos.update_one({"photo_id": photo_id}, {"$set": {"featured": True}})
    return {"ok": True, "featured": body.featured}
