"""Membership: plans, Vigyr sign-up report, application submit, PDF form
generation/download, and the member's own applications."""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import io
import base64

from server import (
    GYM_ADMIN_EMAIL, MEMBERSHIP_TERMS_TC, MembershipApplyReq, TERMS_DECLARATION_TC,
    _download_button, _email_contact_footer, _membership_terms_html, _public_base,
    booking_ref_no, create_notification, db, esc, get_user_by_token, log, new_id,
    notify_admins, now_utc, require_user, send_email, sign_dl_token, verify_dl_token,
)

router = APIRouter()


@router.get("/membership/plans")
async def membership_plans():
    rows = await db.membership_plans.find({}, {"_id": 0}).sort("sort", 1).to_list(50)
    return {"plans": rows}


class VigyrReportReq(BaseModel):
    completed: bool = True


@router.post("/membership/vigyr-report")
async def membership_vigyr_report(body: VigyrReportReq, u: dict = Depends(require_user)):
    """Member self-reports whether they finished the external Vigyr sign-up.
    We cannot verify Vigyr directly, so this records the claim + alerts the gym to verify."""
    if not body.completed:
        return {"ok": True, "reported": False}
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"vigyr_signup_reported": True, "vigyr_reported_at": now_utc()}},
    )
    name = u.get("name") or u.get("email") or "A member"
    await notify_admins(
        "Vigyr sign-up reported",
        f"{name} says they completed the Vigyr membership sign-up. Please verify in Vigyr.",
        ntype="application",
        email_lines=[
            f"{name} ({u.get('email','')}) reports they finished the online Vigyr sign-up form.",
            "Please confirm their membership in your Vigyr dashboard (keytag / door access).",
        ],
        data={"nav": "admin_members"},
    )
    return {"ok": True, "reported": True}


def build_membership_pdf(doc: dict, plan: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.lib.utils import ImageReader

    d = doc.get("details") or {}
    med = d.get("medical") or {}
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    W, H = A4
    ORANGE = (1, 0.478, 0)
    DARK = (0.10, 0.10, 0.12)
    GREY = (0.42, 0.42, 0.46)
    LIGHT = (0.965, 0.965, 0.972)
    LINE = (0.88, 0.88, 0.90)
    LEFT = 45
    RIGHT = W - 45
    LABEL_X = 55
    VALUE_X = 210
    BOTTOM = 58  # reserve for footer

    ref_no = booking_ref_no(doc.get("application_id", ""))
    submitted = str(d.get("submitted_date", "") or "")

    def draw_footer():
        c.saveState()
        c.setStrokeColorRGB(*LINE); c.setLineWidth(0.8)
        c.line(LEFT, 46, RIGHT, 46)
        c.setFont("Helvetica", 8); c.setFillColorRGB(*GREY)
        c.drawString(LEFT, 34, "Maxenergy Fitness · Membership Registration Form")
        c.drawCentredString(W / 2, 34, "Confidential")
        c.drawRightString(RIGHT, 34, f"Page {c.getPageNumber()}")
        c.restoreState()

    y = H - 118  # first content y (below the header band)

    def page_break(newy=H - 55):
        nonlocal y
        draw_footer()
        c.showPage()
        y = newy

    def ensure(space):
        nonlocal y
        if y < max(space, BOTTOM + 24):
            page_break()

    def section(title):
        nonlocal y
        ensure(96)
        y -= 8
        c.setFillColorRGB(*LIGHT)
        c.roundRect(LEFT, y - 7, RIGHT - LEFT, 24, 4, fill=1, stroke=0)
        c.setFillColorRGB(*ORANGE)
        c.rect(LEFT, y - 7, 4, 24, fill=1, stroke=0)
        c.setFillColorRGB(*DARK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(60, y, title.upper())
        y -= 32

    def field(label, value):
        nonlocal y
        value = "-" if value in (None, "") else str(value)
        max_w = RIGHT - VALUE_X
        words, linesv, cur = value.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if c.stringWidth(t, "Helvetica", 10) <= max_w:
                cur = t
            else:
                if cur:
                    linesv.append(cur)
                cur = w
        if cur:
            linesv.append(cur)
        if not linesv:
            linesv = ["-"]
        ensure(20 + (len(linesv) - 1) * 13)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColorRGB(*GREY)
        c.drawString(LABEL_X, y, label)
        c.setFont("Helvetica", 10)
        c.setFillColorRGB(*DARK)
        for i, lv in enumerate(linesv):
            c.drawString(VALUE_X, y, lv)
            if i < len(linesv) - 1:
                y -= 13
        # subtle row divider
        c.setStrokeColorRGB(0.93, 0.93, 0.95); c.setLineWidth(0.5)
        c.line(LABEL_X, y - 7, RIGHT, y - 7)
        y -= 18

    # ---- Header band (page 1) ----
    c.setFillColorRGB(*ORANGE)
    c.rect(0, H - 92, W, 92, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(LEFT, H - 48, "MAXENERGY FITNESS")
    c.setFont("Helvetica", 11)
    c.drawString(LEFT, H - 66, "Membership Registration Form")
    c.setFont("Helvetica", 8.5)
    c.drawString(LEFT, H - 81, "Shop 38 Campus Village Shopping Centre, Smithfield QLD 4878  ·  Ph 07 4057 9005  ·  ABN 81 213 163 833")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(RIGHT, H - 45, f"Form No. {ref_no}")
    if submitted:
        c.setFont("Helvetica", 9)
        c.drawRightString(RIGHT, H - 61, f"Submitted: {submitted}")

    section("Membership")
    field("Type", d.get("membership_type", "-"))
    _pd = plan.get("price_display")
    field("Plan", f"{plan.get('name')}" + (f" (${_pd})" if _pd else ""))
    field("Category", doc.get("category", "-"))
    field("Term", d.get("term", "-"))
    field("Submitted", submitted or "-")

    section("Member Details")
    field("Name", doc.get("full_name"))
    field("Title / Sex", f"{d.get('title','-')} / {d.get('sex','-')}")
    field("Date of birth", d.get("dob", "-"))
    field("Email", doc.get("email"))
    field("Mobile", doc.get("phone"))
    field("Address", ", ".join([x for x in [d.get("address"), d.get("suburb"), d.get("postcode")] if x]) or "-")
    field("Emergency contact", f"{d.get('emergency_name','-')}  ·  {d.get('emergency_phone','-')}")
    field("Marketing consent", "Yes" if d.get("consent_marketing") else "No")
    field("How found", d.get("how_found", "-"))

    section("Medical")
    flags = []
    for g in ("medications", "conditions"):
        obj = med.get(g) or {}
        flags += [k for k, v in obj.items() if v]
    field("Declared flags", ", ".join(flags) if flags else "None")
    field("Smoker", "Yes" if med.get("smoke") else "No")
    field("Major operations/fractures", "Yes" if med.get("operations") else "No")
    field("Pregnant / recent baby", "Yes" if med.get("pregnant") else "No")
    field("Exercises regularly", "Yes" if med.get("regular_exercise") else "No")
    if med.get("notes"):
        field("Notes", med.get("notes"))

    section("Consent & Waiver")
    field("Media consent", "Yes" if d.get("media_consent") else "No")
    field("Terms & Conditions agreed", "Yes" if d.get("waiver_agreed") else "No")

    # ---- Photo & Signature (side by side, tidy) ----
    # Reserve enough height for the whole block (section header + 120pt boxes +
    # the "Signed" line) so it never collides with the page footer. If there
    # isn't room, ensure() pushes it to a fresh page.
    ensure(270)
    section("Photo & Signature")
    block_top = y
    col_gap = 24
    photo_w = 120
    sig_x = LEFT + photo_w + col_gap
    sig_w = RIGHT - sig_x
    box_h = 120

    # labels
    c.setFont("Helvetica-Bold", 9); c.setFillColorRGB(*GREY)
    c.drawString(LEFT, block_top, "MEMBER PHOTO")
    c.drawString(sig_x, block_top, "SIGNATURE")
    top = block_top - 8

    # photo box (left)
    c.setStrokeColorRGB(*LINE); c.setLineWidth(1)
    c.roundRect(LEFT, top - box_h, photo_w, box_h, 5, fill=0, stroke=1)
    photo = d.get("photo_base64")
    if photo and "," in photo:
        try:
            img = base64.b64decode(photo.split(",", 1)[1])
            c.drawImage(ImageReader(io.BytesIO(img)), LEFT + 4, top - box_h + 4, width=photo_w - 8, height=box_h - 8, preserveAspectRatio=True, mask="auto")
        except Exception as e:
            log.error(f"pdf photo: {e}")

    # signature box (right)
    c.setStrokeColorRGB(*LINE); c.setLineWidth(1)
    c.roundRect(sig_x, top - box_h, sig_w, box_h, 5, fill=0, stroke=1)
    sig = d.get("signature_path")
    if sig:
        try:
            pts = []
            for tok in sig.replace("M", " M").replace("L", " L").split():
                if tok and tok[0] in "ML" and "," in tok[1:]:
                    xs, ys = tok[1:].split(",")
                    pts.append((float(xs), float(ys), tok[0]))
            if pts:
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
                sw = max(maxx - minx, 1); sh = max(maxy - miny, 1)
                pad = 12
                draw_w, draw_h = sig_w - pad * 2, box_h - 40
                scale = min(draw_w / sw, draw_h / sh)
                bx, by = sig_x + pad, top - box_h + 28
                c.setStrokeColorRGB(0.08, 0.08, 0.10); c.setLineWidth(1.6)
                prev = None
                for (px, py, cmd) in pts:
                    X = bx + (px - minx) * scale
                    Y = by + (draw_h - (py - miny) * scale)
                    if cmd == "M" or prev is None:
                        prev = (X, Y)
                    else:
                        c.line(prev[0], prev[1], X, Y)
                        prev = (X, Y)
        except Exception as e:
            log.error(f"pdf sig: {e}")

    # signed-by name + date under the signature box
    c.setFont("Helvetica", 9); c.setFillColorRGB(*DARK)
    c.drawString(sig_x, top - box_h - 14, f"Signed: {d.get('signature','-')}")
    if submitted:
        c.drawRightString(RIGHT, top - box_h - 14, f"Date: {submitted}")
    y = top - box_h - 30

    # ---- Terms & Conditions (full copy appended to the signed form) ----
    def _wrap(text, font, size, max_w):
        words = text.split()
        out, cur = [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if c.stringWidth(trial, font, size) <= max_w:
                cur = trial
            else:
                if cur:
                    out.append(cur)
                cur = w
        if cur:
            out.append(cur)
        return out or [""]

    page_break(H - 50)  # terms start on a fresh page
    c.setFillColorRGB(*ORANGE); c.setFont("Helvetica-Bold", 16)
    c.drawString(LEFT, y, "Membership Terms & Conditions"); y -= 20
    c.setFillColorRGB(0.4, 0.4, 0.4); c.setFont("Helvetica", 9)
    c.drawString(LEFT, y, "Maxenergy Fitness Policies & Terms Agreement"); y -= 20

    def _para(idx, title, body):
        nonlocal y
        if y < 96:
            page_break(H - 50)
        c.setFont("Helvetica-Bold", 11); c.setFillColorRGB(*DARK)
        for tl in _wrap(f"{idx}. {title}", "Helvetica-Bold", 11, RIGHT - LEFT):
            if y < 72:
                page_break(H - 50)
                c.setFont("Helvetica-Bold", 11); c.setFillColorRGB(*DARK)
            c.drawString(LEFT, y, tl); y -= 14
        c.setFont("Helvetica", 9); c.setFillColorRGB(0.25, 0.25, 0.25)
        for seg in body.split("\n"):
            for bl in _wrap(seg, "Helvetica", 9, RIGHT - LEFT):
                if y < 58:
                    page_break(H - 50)
                    c.setFont("Helvetica", 9); c.setFillColorRGB(0.25, 0.25, 0.25)
                c.drawString(LEFT, y, bl); y -= 12
        y -= 10

    for i, (_t, _b) in enumerate(MEMBERSHIP_TERMS_TC, start=1):
        _para(i, _t, _b)

    if y < 96:
        page_break(H - 50)
    c.setFont("Helvetica-Oblique", 9); c.setFillColorRGB(*DARK)
    for bl in _wrap(TERMS_DECLARATION_TC, "Helvetica-Oblique", 9, RIGHT - LEFT):
        if y < 58:
            page_break(H - 50)
            c.setFont("Helvetica-Oblique", 9); c.setFillColorRGB(*DARK)
        c.drawString(LEFT, y, bl); y -= 12
    y -= 8
    c.setFont("Helvetica-Bold", 9); c.setFillColorRGB(*ORANGE)
    _acc = f"Accepted by {doc.get('full_name','the member')} on {submitted}".strip()
    c.drawString(LEFT, y, _acc)

    draw_footer()
    c.save()
    return buf.getvalue()


@router.post("/membership/apply")
async def membership_apply(body: MembershipApplyReq, request: Request, u: dict = Depends(require_user)):
    plan = await db.membership_plans.find_one({"plan_id": body.plan_id}, {"_id": 0})
    plan_name = plan["name"] if plan else "New Membership Form"
    app_id = new_id("app")
    doc = {
        "application_id": app_id,
        "user_id": u["user_id"],
        "full_name": body.full_name,
        "email": u["email"],
        "phone": body.phone,
        "plan_id": body.plan_id,
        "plan_name": plan_name,
        "category": body.category,
        "experience": body.experience,
        "message": body.message,
        "details": body.details or {},
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.membership_applications.insert_one(doc)
    # Mark this member as having completed the membership form (remembered forever).
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"membership_form_completed_at": now_utc(), "membership_form_application_id": app_id}},
    )
    await db.notifications.insert_one(
        {
            "notification_id": new_id("ntf"),
            "user_id": u["user_id"],
            "title": "Membership application received",
            "body": f"We've received your application for {plan_name}. Our team will be in touch soon.",
            "type": "membership",
            "read": False,
            "created_at": now_utc(),
        }
    )
    # notify gym
    def _row(k, v):
        return f"<p style='margin:0 0 8px;color:#333;font-size:15px'><strong>{k}:</strong> {v}</p>"

    details = body.details or {}
    details_html = ""
    if details:
        for section_key in ["membership_type", "term", "membership_types", "how_found", "referred_by"]:
            if details.get(section_key):
                val = details[section_key]
                if isinstance(val, list):
                    val = ", ".join(val)
                details_html += _row(section_key.replace("_", " ").title(), val)
        med = details.get("medical") or {}
        flagged = []
        for group in ["medications", "conditions"]:
            g = med.get(group) or {}
            flagged += [k for k, v in g.items() if v]
        if flagged:
            details_html += _row("Medical flags", ", ".join(flagged))
        if med.get("notes"):
            details_html += _row("Medical notes", med["notes"])
        details_html += _row("Media consent", "Yes" if details.get("media_consent") else "No")
        details_html += _row("Waiver agreed", "Yes" if details.get("waiver_agreed") else "No")

    gym_html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff">
      <div style="background:#FF7A00;padding:20px 24px;border-radius:10px 10px 0 0">
        <h1 style="color:#ffffff;margin:0;font-size:20px">New membership application</h1>
      </div>
      <div style="padding:24px;background:#ffffff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;color:#333;font-size:15px;line-height:1.5">
        <p style="margin:0 0 8px;color:#333"><strong>Name:</strong> {esc(body.full_name)}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Email:</strong> {esc(u['email'])}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Phone:</strong> {esc(body.phone)}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Plan:</strong> {esc(plan_name)}{f" (${esc(plan['price_display'])})" if plan else ""}</p>
        <p style="margin:0 0 8px;color:#333"><strong>Category:</strong> {esc(body.category)}</p>
        {details_html}
        <!--PDFSLOT-->
        {_email_contact_footer()}
        <p style="margin:18px 0 0;color:#999;font-size:12px">Maxenergy Fitness · Smithfield QLD</p>
      </div>
    </div>
    """
    # Generate a PDF copy of the completed membership form
    pdf_link = ""
    try:
        pdf_bytes = build_membership_pdf(doc, plan or {"name": plan_name, "price_display": ""})
        pdf_b64 = base64.b64encode(pdf_bytes).decode()
        safe_name = "".join(ch for ch in body.full_name if ch.isalnum() or ch in (" ", "-", "_")).strip().replace(" ", "_") or "member"
        filename = f"Maxenergy_Membership_{safe_name}.pdf"
        await db.membership_applications.update_one(
            {"application_id": app_id}, {"$set": {"pdf_base64": pdf_b64, "pdf_filename": filename}}
        )
        base = _public_base(request)
        if base:
            pdf_link = f"{base}/api/membership/forms/{app_id}.pdf?t={sign_dl_token('form', app_id)}"
    except Exception as e:
        log.error(f"membership pdf failed: {e}")

    gym_pdf_html = _download_button(pdf_link, "Download the completed membership form (PDF)") if pdf_link else ""
    gym_html = gym_html.replace("<!--PDFSLOT-->", gym_pdf_html, 1)
    await send_email(GYM_ADMIN_EMAIL, f"New membership application – {body.full_name}", gym_html)
    # in-app alert to every admin (tappable -> Admin Applications). Email already sent above.
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "user_id": 1}).to_list(100)
    for a in admins:
        await create_notification(
            a["user_id"],
            "New membership application",
            f"{body.full_name} applied for {plan_name}. Tap to review.",
            "application",
            data={"nav": "admin_applications"},
        )
    # confirmation to applicant (with a link to download a copy of their completed form)
    conf_html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff">
      <div style="background:#FF7A00;padding:20px 24px;border-radius:10px 10px 0 0">
        <h1 style="color:#ffffff;margin:0;font-size:20px">Your membership form</h1>
      </div>
      <div style="padding:24px;background:#ffffff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;color:#333;font-size:15px;line-height:1.5">
        <p style="margin:0 0 12px;color:#333">Hi {esc(body.full_name)}, thanks for completing the <strong>{esc(plan_name)}</strong> membership form at Maxenergy Fitness.</p>
        <p style="margin:0 0 4px;color:#333">You can download a PDF copy of your completed membership form using the button below. Our team will review it and be in touch shortly.</p>
        {_download_button(pdf_link, "Download my membership form (PDF)") if pdf_link else "<p style='color:#333'>Your completed form is saved to your account.</p>"}
        {_membership_terms_html()}
        {_email_contact_footer()}
        <p style="margin:20px 0 0;color:#999;font-size:12px">Maxenergy Fitness · Smithfield QLD</p>
      </div>
    </div>
    """
    await send_email(u["email"], "Your Max Energy membership form & terms (copy)", conf_html)
    doc.pop("_id", None)
    return {"application": doc}


@router.get("/membership/forms/{application_id}.pdf")
async def download_membership_pdf(application_id: str, t: Optional[str] = None, authorization: Optional[str] = Header(None)):
    # Access requires a valid signed link token, OR the owner/admin via bearer auth.
    authorized = verify_dl_token(t, "form", application_id)
    if not authorized:
        u = await get_user_by_token(authorization)
        if u:
            doc0 = await db.membership_applications.find_one({"application_id": application_id}, {"_id": 0, "user_id": 1})
            authorized = bool(u.get("is_admin")) or (doc0 and doc0.get("user_id") == u["user_id"])
    if not authorized:
        raise HTTPException(403, "Not authorised to view this form")
    doc = await db.membership_applications.find_one(
        {"application_id": application_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Membership form not found")
    # Regenerate the PDF fresh from the stored application data so every form
    # (including ones submitted before layout fixes) always uses the latest,
    # correct layout. Fall back to the stored copy if regeneration ever fails.
    pdf_bytes = None
    try:
        plan = await db.membership_plans.find_one({"plan_id": doc.get("plan_id")}, {"_id": 0}) \
            or {"name": doc.get("plan_name") or "Membership", "price_display": ""}
        pdf_bytes = build_membership_pdf(doc, plan)
    except Exception as e:
        log.error(f"membership pdf regen failed, using stored copy: {e}")
    if pdf_bytes is None:
        if not doc.get("pdf_base64"):
            raise HTTPException(404, "Membership form not found")
        try:
            pdf_bytes = base64.b64decode(doc["pdf_base64"])
        except Exception:
            raise HTTPException(500, "Could not read form")
    filename = doc.get("pdf_filename") or "membership_form.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/membership/forms/{application_id}/url")
async def membership_form_url(application_id: str, request: Request, u: dict = Depends(require_user)):
    """Return a tokenised, openable PDF URL for the owner or an admin."""
    doc = await db.membership_applications.find_one({"application_id": application_id}, {"_id": 0, "user_id": 1, "pdf_base64": 1})
    if not doc or not doc.get("pdf_base64"):
        raise HTTPException(404, "Membership form not found")
    if not (u.get("is_admin") or doc.get("user_id") == u["user_id"]):
        raise HTTPException(403, "Not authorised to view this form")
    base = _public_base(request) or ""
    return {"url": f"{base}/api/membership/forms/{application_id}.pdf?t={sign_dl_token('form', application_id)}"}



@router.get("/membership/applications/me")
async def my_applications(u: dict = Depends(require_user)):
    rows = await db.membership_applications.find(
        {"user_id": u["user_id"]}, {"_id": 0, "pdf_base64": 0}
    ).sort("created_at", -1).to_list(50)
    return {"applications": rows}
