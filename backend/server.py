import asyncio
import json
import logging
import os
import secrets
import statistics
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional
from xml.sax.saxutils import escape

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import BulkWriteError, DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import CURRENT_UID, Credentials, Scoped, setup as auth_setup  # noqa: E402
from models import (SECRET_FIELDS, AckIn, AppSettings, CareLinkFinishIn, CareLinkStartIn, EmergencyLog,  # noqa: E402
                    LocationIn, Reading, ReadingBatchIn, ReadingIn, SmsResultIn, SummaryIn, Treatment, TreatmentIn)
from models import PROFILE_FIELDS, blank_profile  # noqa: E402
from sources import CLOUD_SOURCES, demo_readings, direction_from_slope, fetch_source, reset_sessions  # noqa: E402
import cloud_followers  # noqa: E402
from uploads import upload_dexcom_share, upload_nightscout, upload_tidepool  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"], tz_aware=True)
db = client[os.environ["DB_NAME"]]
logger = logging.getLogger("xdrip")
logging.getLogger("twilio.http_client").setLevel(logging.WARNING)  # it logs every request otherwise
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

INDEXES: dict[str, list[IndexModel]] = {
    "readings": [
        IndexModel([("uid", ASCENDING), ("ts", DESCENDING)], name="uid_ts_unique", unique=True),
        IndexModel([("ns_uploaded", ASCENDING), ("ts", DESCENDING)], name="ns_pending"),
        IndexModel([("tp_uploaded", ASCENDING), ("ts", DESCENDING)], name="tp_pending"),
        IndexModel([("source", ASCENDING)], name="source"),
    ],
    "treatments": [IndexModel([("ts", DESCENDING)], name="ts_desc")],
    "emergency_log": [IndexModel([("ts", DESCENDING)], name="ts_desc")],
    "summaries": [IndexModel([("uid", ASCENDING), ("label", ASCENDING)], name="uid_label", unique=True)],
    "users": [IndexModel([("username_normalized", ASCENDING)], name="username_unique", unique=True)],
    "login_attempts": [IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0)],
    "threshold_history": [IndexModel([("uid", ASCENDING), ("ts", ASCENDING)], name="uid_ts")],
}

UPLOAD_WINDOW = timedelta(hours=24)  # never push more history than this to Nightscout / Tidepool
HISTORY_DAYS = 90


async def ensure_indexes() -> None:
    # one-time move to per-user data: drop old global indexes and pre-login sample data
    for coll, name in (("readings", "ts_unique"), ("summaries", "label")):
        with suppress(Exception):
            await db[coll].drop_index(name)
    for coll in ("readings", "treatments", "summaries", "emergency_log"):
        await db[coll].delete_many({"uid": {"$exists": False}})
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


class _UDB:
    def __getattr__(self, name):
        return Scoped(db[name])


udb = _UDB()
current_user, auth_register, auth_login, auth_change_password, auth_me, auth_email, auth_forgot, auth_reset, auth_username, auth_avatar, auth_delete, auth_forgot_username, auth_username_lookup, auth_reset_username = auth_setup(db)
auth_api = APIRouter(prefix="/api/auth")
auth_api.post("/register", status_code=201)(auth_register)
auth_api.post("/login")(auth_login)
auth_api.post("/change-password")(auth_change_password)
auth_api.get("/me")(auth_me)
auth_api.put("/email")(auth_email)
auth_api.put("/username")(auth_username)
auth_api.put("/avatar")(auth_avatar)
auth_api.post("/delete-account")(auth_delete)
auth_api.post("/forgot-username")(auth_forgot_username)
auth_api.post("/username-code")(auth_username_lookup)
auth_api.post("/reset-username")(auth_reset_username)
auth_api.post("/forgot")(auth_forgot)
auth_api.post("/reset")(auth_reset)


api = APIRouter(prefix="/api", dependencies=[Depends(current_user)])
now_utc = lambda: datetime.now(timezone.utc)  # noqa: E731


# ---------------- settings & state ----------------
LEGACY_EM_FIELDS = ("em_sms", "em_call", "em_sms_via", "em_sms_schedule", "em_call_schedule",
                    "em_sms_repeat_minutes", "em_call_repeat_minutes")
# target/tight range and alarm thresholds: when any of these change, we keep a dated record (see
# record_threshold_change) so the History graph can show each day's dots and bands the way they
# actually looked at the time, not the way the ranges happen to be set today.
THRESHOLD_FIELDS = ("urgent_low", "low", "high", "urgent_high", "target_low", "target_high", "tight_low", "tight_high")
EPOCH = datetime(2020, 1, 1, tzinfo=timezone.utc)  # stand-in "since always" for the first saved snapshot


async def record_threshold_change(old: AppSettings, new: AppSettings) -> None:
    if not any(getattr(new, k) != getattr(old, k) for k in THRESHOLD_FIELDS):
        return
    if not await udb.threshold_history.find_one({}):
        # first change ever for this account: record what was in effect before it, from the start
        await udb.threshold_history.insert_one({"ts": EPOCH, **{k: getattr(old, k) for k in THRESHOLD_FIELDS}})
    await udb.threshold_history.insert_one({"ts": now_utc(), **{k: getattr(new, k) for k in THRESHOLD_FIELDS}})


async def get_settings() -> AppSettings:
    doc = await db.settings.find_one({"_id": CURRENT_UID.get()}, {"_id": 0})
    return AppSettings.model_validate(doc or {})


async def get_state(key: str) -> dict:
    return await db.state.find_one({"_id": f"{key}:{CURRENT_UID.get()}"}, {"_id": 0}) or {}


async def set_state(key: str, values: dict) -> None:
    await db.state.update_one({"_id": f"{key}:{CURRENT_UID.get()}"}, {"$set": values}, upsert=True)


async def insert_readings(items: list[dict], source: str) -> int:
    if not items:
        return 0
    docs = [Reading(ts=i["ts"], sgv=i["sgv"], direction=i["direction"], source=source).to_mongo() for i in items]
    try:
        res = await udb.readings.insert_many(docs, ordered=False)
        return len(res.inserted_ids)
    except BulkWriteError as e:
        return e.details.get("nInserted", 0)


async def latest_reading() -> Optional[Reading]:
    return Reading.from_mongo(await udb.readings.find_one({}, sort=[("ts", -1)]))


async def save_settings_fields(**fields) -> None:
    await db.settings.update_one({"_id": CURRENT_UID.get()}, {"$set": fields})


# ---------------- sync loop ----------------
async def sync_once(force: bool = False) -> dict:
    s = await get_settings()
    now = now_utc()
    last = await latest_reading()
    sync = await get_state("sync")
    error = None
    added = 0
    try:
        if s.source == "demo":
            after = last.ts if last else now - timedelta(days=HISTORY_DAYS)
            added = await insert_readings(demo_readings(after, now), "demo")
        elif s.source in CLOUD_SOURCES:
            last_fetch = sync.get("last_fetch")
            fails = sync.get("fails") or 0
            wait = timedelta(minutes=min(30, max(s.pull_minutes, 2 * 2 ** fails if fails else 0)))  # your pull interval; backs off after failed logins: 4, 8 … 30 min
            if force or not last_fetch or now - last_fetch >= wait:
                await set_state("sync", {"last_fetch": now})
                since = last.ts if last else now - timedelta(days=1)
                try:
                    added = await insert_readings(await fetch_source(s, since, save_settings_fields), s.source)
                except Exception:
                    await set_state("sync", {"fails": min(fails + 1, 5)})
                    raise
                if fails:
                    await set_state("sync", {"fails": 0})
    except Exception as exc:
        error = str(exc)[:300]
        logger.warning("source sync failed: %s", error)

    up_last = sync.get("up_last")
    upload_due = force or not up_last or now - up_last >= timedelta(minutes=s.upload_minutes)
    upload_errors = {} if upload_due else dict(sync.get("upload_errors") or {})
    if upload_due and s.ns_upload and s.ns_url and s.source != "nightscout":
        try:
            await push_nightscout(s)
        except Exception as exc:
            upload_errors["nightscout"] = str(exc)[:300]
    if upload_due and s.dx_upload and s.dexcom_username and s.dexcom_password and s.source not in ("dexcom", "demo"):
        try:
            await push_dexcom(s)
        except Exception as exc:
            upload_errors["dexcom"] = str(exc)[:300]
    if s.tp_upload and s.tp_email and s.tp_password:
        tp_last = sync.get("tp_last")
        if force or not tp_last or now - tp_last >= timedelta(minutes=max(15, s.upload_minutes)):
            try:
                await push_tidepool(s)
                await set_state("sync", {"tp_last": now})
            except Exception as exc:
                upload_errors["tidepool"] = str(exc)[:300]

    await set_state("sync", {"last_sync": now, "last_error": error, "added": added, "upload_errors": upload_errors,
                             **({"up_last": now} if upload_due else {})})
    await check_alarms(s)
    return {"added": added, "error": error, "upload_errors": upload_errors}


async def push_nightscout(s: AppSettings) -> int:
    since = now_utc() - UPLOAD_WINDOW
    readings = [Reading.from_mongo(d) async for d in
                udb.readings.find({"ns_uploaded": False, "ts": {"$gte": since}}).sort("ts", 1).limit(1000)]
    treatments = [Treatment.from_mongo(d) async for d in
                  udb.treatments.find({"ns_uploaded": False, "ts": {"$gte": since}})]
    if not readings and not treatments:
        return 0
    await upload_nightscout(s, readings, treatments)
    from bson import ObjectId
    await udb.readings.update_many({"_id": {"$in": [ObjectId(r.id) for r in readings]}}, {"$set": {"ns_uploaded": True}})
    await udb.treatments.update_many({"_id": {"$in": [ObjectId(t.id) for t in treatments]}}, {"$set": {"ns_uploaded": True}})
    return len(readings) + len(treatments)


async def push_dexcom(s: AppSettings) -> int:
    since = now_utc() - UPLOAD_WINDOW
    readings = [Reading.from_mongo(d) async for d in
                udb.readings.find({"dx_uploaded": {"$ne": True}, "source": {"$ne": "demo"}, "ts": {"$gte": since}}).sort("ts", 1).limit(300)]
    if not readings:
        return 0
    await upload_dexcom_share(s, readings)
    from bson import ObjectId
    await udb.readings.update_many({"_id": {"$in": [ObjectId(r.id) for r in readings]}}, {"$set": {"dx_uploaded": True}})
    return len(readings)


async def push_tidepool(s: AppSettings) -> int:
    since = now_utc() - UPLOAD_WINDOW
    readings = [Reading.from_mongo(d) async for d in
                udb.readings.find({"tp_uploaded": False, "ts": {"$gte": since}}).sort("ts", 1).limit(3000)]
    treatments = [Treatment.from_mongo(d) async for d in
                  udb.treatments.find({"tp_uploaded": False, "ts": {"$gte": since}})]
    count = await upload_tidepool(s, readings, treatments)
    from bson import ObjectId
    await udb.readings.update_many({"_id": {"$in": [ObjectId(r.id) for r in readings]}}, {"$set": {"tp_uploaded": True}})
    await udb.treatments.update_many({"_id": {"$in": [ObjectId(t.id) for t in treatments]}}, {"$set": {"tp_uploaded": True}})
    return count


async def sync_loop():
    while True:
        try:
            async for u in db.users.find({}, {"_id": 1}):
                CURRENT_UID.set(str(u["_id"]))
                try:
                    await sync_once()
                except Exception as exc:
                    logger.warning("sync for user %s failed: %s", u["_id"], exc)
        except Exception as exc:
            logger.exception("sync loop error: %s", exc)
        await asyncio.sleep(60)


# ---------------- alarms & emergency ----------------
ALARM_LABELS = {"extreme_low": "URGENT LOW", "urgent_low": "URGENT LOW", "low": "LOW", "high": "HIGH",
                "urgent_high": "URGENT HIGH", "missed": "MISSED READINGS"}
def alarm_label(kind: str, s: AppSettings) -> str:
    if kind.startswith("custom:"):
        ga = next((g for g in s.glucose_alarms if f"custom:{g.id}" == kind), None)
        return ga.title.upper() if ga else "ALARM"
    return ALARM_LABELS.get(kind, kind.upper())


def snooze_for(kind: str, s: AppSettings) -> int:
    if kind.startswith("custom:"):
        ga = next((g for g in s.glucose_alarms if f"custom:{g.id}" == kind), None)
        return ga.snooze_minutes if ga else s.snooze_minutes
    cfg = s.alarm_sounds.get(kind)
    return cfg.snooze_minutes if cfg else s.snooze_minutes


EXTREME_LOW = 50  # mg/dL (2.8 mmol/L)


def classify(sgv: int, s: AppSettings) -> Optional[str]:
    if sgv <= EXTREME_LOW and s.alarm_extreme_low: return "extreme_low"
    if sgv <= s.urgent_low: return "urgent_low"
    if sgv < s.low: return "low"
    if sgv >= s.urgent_high: return "urgent_high"
    if sgv > s.high: return "high"
    return None


def fmt_value(sgv: int, s: AppSettings) -> str:
    return f"{sgv / 18.0182:.1f} mmol/L" if s.unit == "mmol" else f"{sgv} mg/dL"


ARROW_WORDS = {"DoubleUp": "rising fast", "SingleUp": "rising", "FortyFiveUp": "rising slowly", "Flat": "steady",
               "FortyFiveDown": "falling slowly", "SingleDown": "falling", "DoubleDown": "falling fast"}


def alarm_paused(cfg, now_local: datetime) -> bool:
    """True when this alarm is switched off right now: today is one of its off days, or it is inside a pause window."""
    if cfg is None:
        return False
    if now_local.weekday() not in cfg.days:
        return True
    return any(_in_window(w, now_local) for w in cfg.off_windows)


async def check_alarms(s: AppSettings) -> None:
    now = now_utc()
    now_local = local_now(s)
    last = await latest_reading()
    level = None
    if last:
        stale = now - last.ts > timedelta(minutes=s.missed_minutes)
        if stale and s.source != "manual":
            level = "missed" if s.alarm_missed and not alarm_paused(s.alarm_sounds.get("missed"), now_local) else None
        elif not stale:
            level = classify(last.sgv, s)
            if level and not getattr(s, f"alarm_{level}"):
                level = None
            if level and level not in ("extreme_low", "urgent_low") and alarm_paused(s.alarm_sounds.get(level), now_local):
                level = None  # this alarm is off today / at this hour
            if not level:  # user-made glucose alarms, checked after the presets
                for ga in s.glucose_alarms:
                    if ga.enabled and not alarm_paused(ga, now_local) and ((ga.direction == "below" and last.sgv < ga.value) or
                                       (ga.direction == "above" and last.sgv > ga.value)):
                        level = f"custom:{ga.id}"
                        break
    alarm = await get_state("alarm")
    reset = {"emergency_sent_at": None, "em_sent": {}, "em_count": {}}
    if not level:
        if alarm.get("type"):
            await set_state("alarm", {"type": None, "started_at": None, **reset})
        return
    if alarm.get("type") != level:
        alarm = {"type": level, "started_at": now, **reset,
                 "snoozed_until": alarm.get("snoozed_until") if alarm.get("snoozed_type") == level else None,
                 "snoozed_type": alarm.get("snoozed_type")}
        await set_state("alarm", alarm)

    snoozed = alarm.get("snoozed_until") and alarm["snoozed_until"] > now and alarm.get("snoozed_type") == level
    with suppress(Exception):
        await expire_outbox()
    lvl = "urgent_low" if level == "extreme_low" else level  # the preset urgent low alarm
    if s.em_enabled and s.source != "demo" and not snoozed and s.em_contacts:
        # Each contact has its own rule per alarm and channel: how long to wait, how often to resend, how many times.
        sent = dict(alarm.get("em_sent") or {})
        counts = dict(alarm.get("em_count") or {})
        due: dict[str, set] = {}
        for c in s.em_contacts:
            for ch in ("sms", "call"):
                own = getattr(c, ch)
                if lvl not in getattr(c, f"{ch}_triggers") or not own.enabled:
                    continue  # this contact isn't set to get this alarm on this channel
                rule = own.rules.get(lvl)
                wait = 0 if lvl == "urgent_low" else (rule.wait_minutes if rule else s.em_delay_minutes)
                every = rule.repeat_minutes if rule else own.repeat_minutes
                times = rule.times if rule else 0
                key = f"{c.phone}|{ch}"
                if now - alarm["started_at"] < timedelta(minutes=wait):
                    continue
                if rule and not _in_hours(rule, now_local):
                    continue  # this alarm isn't allowed to message this contact on this day / at this hour
                if times and counts.get(key, 0) >= times:
                    continue
                last_at = sent.get(key)
                if not last_at or now - last_at >= timedelta(minutes=every):
                    due.setdefault(c.phone, set()).add(ch)
        if due:
            for phone, chs in due.items():
                for ch in chs:
                    sent[f"{phone}|{ch}"] = now
                    counts[f"{phone}|{ch}"] = counts.get(f"{phone}|{ch}", 0) + 1
            await set_state("alarm", {"emergency_sent_at": now, "em_sent": sent, "em_count": counts})
            try:
                await send_emergency(s, last, test=False, due=due, level=level)
            except Exception as exc:
                logger.error("emergency send failed: %s", getattr(exc, "detail", exc))


LEVEL_WORDS = {"extreme_low": "very low", "urgent_low": "very low", "low": "low", "high": "high", "urgent_high": "very high"}


async def build_message(s: AppSettings, reading: Optional[Reading], test: bool, level: str) -> tuple[str, str]:
    who = s.em_name or "Your contact"
    if reading:
        val = fmt_value(reading.sgv, s)
        trend = ARROW_WORDS.get(reading.direction, "")
        mins = int((now_utc() - reading.ts).total_seconds() // 60)
        glucose = f"glucose is {val}{', ' + trend if trend else ''} ({mins} min ago)"
    else:
        glucose = "glucose is unknown"
    loc_text = loc_speech = ""
    if s.em_location:
        loc = await get_state("location")
        if loc.get("lat") is not None:
            age = int((now_utc() - loc["ts"]).total_seconds() // 60)
            addr = loc.get("address") or ""
            loc_text = (f" Location ({age} min ago): {addr + ' - ' if addr else ''}"
                        f"https://maps.google.com/?q={loc['lat']:.5f},{loc['lon']:.5f}")
            loc_speech = f" Their last known location, {age} minutes ago, was {addr}." if addr else ""
    prefix = "TEST - " if test else "EMERGENCY: "
    word = LEVEL_WORDS.get(level, "glucose")
    if level.startswith("custom:"):
        what = f"{alarm_label(level, s).title()} alarm"
    else:
        what = "lost data connection alarm" if level == "missed" else f"{word} glucose alarm"
    sms = f"{prefix}{who}'s {glucose}. The {what} was not acknowledged.{loc_text}"
    speech = (f"{'This is a test. ' if test else 'Emergency alert. '}{who}'s {glucose}. "
              f"The {what} was not acknowledged.{loc_speech} Please check on them now.")
    speech = speech.replace("mg/dL", "milligrams per deciliter").replace("mmol/L", "millimoles per liter").replace(" min ago", " minutes ago")
    return sms, speech


def _in_window(w, now_local: datetime) -> bool:
    t = now_local.strftime("%H:%M")
    today = now_local.weekday()
    if w.start == w.end:
        return today in w.days
    if w.start < w.end:
        return today in w.days and w.start <= t < w.end
    # overnight, e.g. Fri 22:00 - Sat 07:00 belongs to the day it starts on
    return (today in w.days and t >= w.start) or ((today - 1) % 7 in w.days and t < w.end)


def _in_hours(sched, now_local: datetime) -> bool:
    days = getattr(sched, "days", None)  # EmRule only: which days this applies on at all, before any hours
    if days is not None and now_local.weekday() not in days:
        return False
    return sched.mode != "hours" or any(_in_window(w, now_local) for w in sched.windows)


def channel_active(s: AppSettings, contact, channel: str, now_local: datetime) -> tuple[bool, str]:
    own = getattr(contact, channel)
    if not own.enabled:
        return False, "off for this contact"
    if not _in_hours(own, now_local):
        return False, "outside the set hours"
    return True, ""


def local_now(s: AppSettings) -> datetime:
    from zoneinfo import ZoneInfo
    try:
        return now_utc().astimezone(ZoneInfo(s.tz))
    except Exception:
        return now_utc()


async def telnyx_post(path: str, key: str, body: dict) -> None:
    """One call to the Telnyx API with the user's own key. Raises RuntimeError with a short reason on failure."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post("https://api.telnyx.com/v2" + path, headers={"Authorization": f"Bearer {key}"}, json=body)
    if r.status_code >= 400:
        try:
            detail = r.json()["errors"][0].get("detail") or r.text
        except Exception:
            detail = r.text
        raise RuntimeError(str(detail)[:120])


async def send_emergency(s: AppSettings, reading: Optional[Reading], test: bool,
                         due: Optional[dict[str, set]] = None, level: str = "urgent_low") -> list[str]:
    """due = {contact phone: {"sms", "call"}}; None sends every enabled channel to every contact (test)."""
    if not s.em_contacts:
        raise HTTPException(400, "Add at least one emergency contact first.")
    label = "Telnyx" if s.em_provider == "telnyx" else "Twilio"
    wants = {c.phone: (due.get(c.phone, set()) if due is not None else {"sms", "call"}) for c in s.em_contacts}
    now_local = local_now(s)
    needs_cloud = any((channel_active(s, c, "call", now_local)[0] and "call" in wants[c.phone]) or
                      (channel_active(s, c, "sms", now_local)[0] and c.sms_via == "cloud" and "sms" in wants[c.phone])
                      for c in s.em_contacts)
    # tw = (send_text, place_call) for the user's own provider account, or None. The server owner never pays.
    tw = None
    if s.em_provider == "telnyx":
        if s.telnyx_key and s.telnyx_from:
            async def _text(to, body):
                await telnyx_post("/messages", s.telnyx_key, {"from": s.telnyx_from, "to": to, "text": body})

            async def _call(to, speech_text):
                if not s.telnyx_app_id:
                    raise RuntimeError("add your Telnyx application ID for calls")
                await telnyx_post(f"/texml/calls/{s.telnyx_app_id}", s.telnyx_key, {
                    "From": s.telnyx_from, "To": to,
                    "Texml": f'<Response><Say loop="3">{escape(speech_text)}</Say></Response>'})
            tw = (_text, _call)
    else:
        own = (s.twilio_sid, s.twilio_token, s.twilio_from)
        if all(own):  # half-filled account: don't silently fall back to someone else's
            from twilio.rest import Client
            client = Client(s.twilio_sid, s.twilio_token)

            async def _text(to, body):
                await asyncio.to_thread(client.messages.create, to=to, from_=s.twilio_from, body=body)

            async def _call(to, speech_text):
                twiml = f'<Response><Say loop="3">{escape(speech_text)}</Say></Response>'
                await asyncio.to_thread(client.calls.create, to=to, from_=s.twilio_from, twiml=twiml)
            tw = (_text, _call)
    if not tw and needs_cloud and all(c.sms_via == "cloud" for c in s.em_contacts):
        raise HTTPException(400, f"Add your {label} account in Settings > Emergency messages first.")
    sms, speech = await build_message(s, reading, test, level)
    results = []
    for c in s.em_contacts:
        sms_on, sms_why = channel_active(s, c, "sms", now_local)
        call_on, call_why = channel_active(s, c, "call", now_local)
        want = wants[c.phone]
        sms_on, call_on = sms_on and "sms" in want, call_on and "call" in want
        if sms_on and c.sms_via == "phone":
            # the user's Android phone picks this up and sends it from its own SIM card
            await udb.sms_outbox.insert_one({"to": c.phone, "name": c.name, "body": sms, "ts": now_utc(), "status": "pending"})
            results.append(f"Text to {c.name} handed to your phone")
        elif sms_on and not tw:
            results.append(f"Text to {c.name} failed: add your {label} account first")
        elif sms_on:
            try:
                await tw[0](c.phone, sms)
                results.append(f"Text sent to {c.name}")
            except Exception as exc:
                results.append(f"Text to {c.name} failed: {str(exc)[:120]}")
        elif test and "sms" in want and sms_why != "off for this contact":
            results.append(f"No text to {c.name} ({sms_why})")
        if call_on and not tw:
            results.append(f"Call to {c.name} failed: add your {label} account first")
        elif call_on:
            try:
                await tw[1](c.phone, speech)
                results.append(f"Call placed to {c.name}")
            except Exception as exc:
                results.append(f"Call to {c.name} failed: {str(exc)[:120]}")
        elif test and "call" in want and call_why != "off for this contact":
            results.append(f"No call to {c.name} ({call_why})")
    if results:  # real alarms only log what was actually attempted, so overnight resends don't flood the log
        await udb.emergency_log.insert_one(EmergencyLog(ts=now_utc(), test=test, message=sms, results=results).to_mongo())
    return results


# ---------------- routes ----------------
@api.get("/")
async def root():
    return {"message": "xDrip API"}


@api.get("/settings")
async def read_settings():
    return (await get_settings()).public()


@api.put("/settings")
async def update_settings(patch: dict):
    current = await get_settings()
    data = current.model_dump()
    for k, v in patch.items():
        if k not in data or k in ("shabbat_mode", "other_profile"):
            continue  # the mode only changes through POST /mode
        if k == "cl_refresh_token" or (k in SECRET_FIELDS and not v):
            continue  # server-managed token; empty secret means keep the saved one
        data[k] = v
    if not (data["target_low"] <= data["tight_low"] < data["tight_high"] <= data["target_high"]):
        raise HTTPException(422, "The tight range must sit inside the target range (not below target low or above target high).")
    try:
        new = AppSettings.model_validate(data)
    except Exception as exc:
        raise HTTPException(422, f"Invalid settings: {exc}")
    if not (new.urgent_low < new.low < new.high < new.urgent_high):
        raise HTTPException(422, "Thresholds must go: urgent low < low < high < urgent high.")
    if not (40 <= new.target_low < new.target_high <= 400):
        raise HTTPException(422, "Target range: low must be below high.")
    await record_threshold_change(current, new)
    await db.settings.update_one({"_id": CURRENT_UID.get()},
                                 {"$set": new.model_dump(), "$unset": {k: "" for k in LEGACY_EM_FIELDS}}, upsert=True)
    if new.source != current.source:
        reset_sessions()
        if current.source == "demo":
            await udb.readings.delete_many({"source": "demo"})
        await set_state("sync", {"last_fetch": None, "last_error": None, "fails": 0})
        await set_state("alarm", {"type": None, "started_at": None, "emergency_sent_at": None})
    logins = ("ns_url", "twiist_username", "cl_username", "cl_server", "glooko_email", "glooko_region")
    if new.source != current.source or any(patch.get(k) for k in SECRET_FIELDS) or any(
            getattr(new, k) != getattr(current, k) for k in logins):
        reset_sessions()
        asyncio.create_task(sync_once(force=True))
    return new.public()


@api.post("/mode")
async def set_mode(body: dict):
    """Switches between standard and Shabbat mode. The active alarm + emergency settings are kept for later and the other
    mode's settings are loaded (blank the first time)."""
    shabbat = bool(body.get("shabbat"))
    cur = await get_settings()
    if cur.shabbat_mode == shabbat:
        return cur.public()
    data = cur.model_dump()
    saved = cur.other_profile or blank_profile()
    data["other_profile"] = {f: data[f] for f in PROFILE_FIELDS}
    for f in PROFILE_FIELDS:
        if f in saved:
            data[f] = saved[f]
    data["shabbat_mode"] = shabbat
    try:
        new = AppSettings.model_validate(data)
    except Exception as exc:
        raise HTTPException(422, f"Could not switch mode: {exc}")
    await db.settings.update_one({"_id": CURRENT_UID.get()}, {"$set": new.model_dump()}, upsert=True)
    await set_state("alarm", {"type": None, "started_at": None, "emergency_sent_at": None})  # don't carry a running alarm across modes
    return new.public()


@api.post("/carelink/start")
async def carelink_start(body: CareLinkStartIn):
    """Medtronic sign-in page for the phone (handles the 'not a robot' check); the phone hands the code back."""
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": cloud_followers.CL_UA}) as c:
        try:
            sso = await cloud_followers.cl_sso(c, body.server)
        except Exception:
            raise HTTPException(502, "CareLink sign-in is unavailable right now. Try again in a minute.")
    verifier, challenge = cloud_followers.pkce()
    state = secrets.token_hex(16)
    await set_state("cl_auth", {"state": state, "verifier": verifier, "server": body.server, "at": now_utc()})
    return {"url": cloud_followers.cl_authorize_url(sso, challenge, state), "redirect_uri": sso["redirect_uri"], "state": state}


@api.post("/carelink/finish")
async def carelink_finish(body: CareLinkFinishIn):
    st = await get_state("cl_auth")
    if not st.get("state") or not secrets.compare_digest(st["state"], body.state) or now_utc() - st["at"] > timedelta(minutes=20):
        raise HTTPException(400, "This sign-in has expired. Please start again.")
    await set_state("cl_auth", {"state": None, "verifier": None})
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": cloud_followers.CL_UA}) as c:
        try:
            sso = await cloud_followers.cl_sso(c, st["server"])
            tok = await cloud_followers.cl_exchange(c, sso, body.code, st["verifier"])
        except RuntimeError as exc:
            raise HTTPException(400, str(exc))
        except Exception:
            raise HTTPException(502, "CareLink sign-in is unavailable right now. Try again in a minute.")
        username = ""
        with suppress(Exception):
            r = await c.get(f"https://{cloud_followers.CL_HOST[st['server']]}/patient/users/me",
                            headers={"Authorization": f"Bearer {tok['access_token']}"})
            username = (r.json().get("username") if r.status_code == 200 else "") or ""
    fields = {"cl_refresh_token": tok["refresh_token"], "cl_server": st["server"], "source": "carelink"}
    if username:
        fields["cl_username"] = username
    await save_settings_fields(**fields)
    reset_sessions()
    asyncio.create_task(sync_once(force=True))
    return {"ok": True, "username": username}


@api.delete("/carelink")
async def carelink_sign_out():
    await save_settings_fields(cl_refresh_token="", cl_password="")
    reset_sessions()
    return {"ok": True}


@api.get("/status")
async def status():
    s = await get_settings()
    last = await latest_reading()
    reading, delta = None, None
    if last:
        prev = Reading.from_mongo(await udb.readings.find_one({"ts": {"$lt": last.ts, "$gte": last.ts - timedelta(minutes=16)}},
                                                            sort=[("ts", -1)]))
        if prev:
            minutes = max(1.0, (last.ts - prev.ts).total_seconds() / 60)
            delta = round((last.sgv - prev.sgv) * 5 / minutes, 1)
        reading = {"ts": last.ts, "sgv": last.sgv, "direction": last.direction, "source": last.source}
    sync = await get_state("sync")
    alarm = await get_state("alarm")
    active = None
    if alarm.get("type"):
        snoozed = bool(alarm.get("snoozed_until") and alarm["snoozed_until"] > now_utc()
                       and alarm.get("snoozed_type") == alarm["type"])
        active = {"type": alarm["type"], "label": alarm_label(alarm["type"], s), "started_at": alarm["started_at"],
                  "snooze_minutes": snooze_for(alarm["type"], s),
                  "snoozed": snoozed, "snoozed_until": alarm.get("snoozed_until") if snoozed else None,
                  "emergency_sent_at": alarm.get("emergency_sent_at")}
    sensor = None
    if s.sensor_started_at and s.source not in CLOUD_SOURCES and s.source not in ("companion", "manual"):  # followers, the companion app and manual entry have no sensor session
        sensor = {"started_at": s.sensor_started_at,
                  "ends_at": s.sensor_started_at + timedelta(days=s.sensor_days), "days": s.sensor_days}
    return {"reading": reading, "delta": delta, "source": s.source, "unit": s.unit, "sensor": sensor,
            "last_sync": sync.get("last_sync"), "last_error": sync.get("last_error"),
            "upload_errors": sync.get("upload_errors") or {}, "alarm": active,
            "thresholds": {"urgent_low": s.urgent_low, "low": s.low, "high": s.high, "urgent_high": s.urgent_high,
                           "target_low": s.target_low, "target_high": s.target_high,
                           "tight_low": s.tight_low, "tight_high": s.tight_high}}


@api.get("/thresholds-history")
async def thresholds_history():
    """Every dated change to the target/tight range and alarm thresholds, oldest first, so the app can show
    History the way each day actually looked (its own range and colours), not today's current settings."""
    cur = udb.threshold_history.find({}, {"_id": 0}).sort("ts", 1)
    return await cur.to_list(1000)


@api.get("/readings")
async def list_readings(start: datetime, end: Optional[datetime] = None, bucket: int = Query(0, ge=0, le=240)):
    end = end or now_utc()
    if end - start > timedelta(days=HISTORY_DAYS + 1):
        raise HTTPException(400, "Range too large")
    cur = udb.readings.find({"ts": {"$gte": start, "$lte": end}}, {"_id": 0, "ts": 1, "sgv": 1, "direction": 1, "source": 1}).sort("ts", 1)
    rows = await cur.to_list(None)
    if not bucket:
        return [{"ts": r["ts"], "sgv": r["sgv"], "direction": r.get("direction", "NONE"), "source": r.get("source")} for r in rows]
    size = bucket * 60
    groups: dict[int, list[int]] = {}
    for r in rows:
        groups.setdefault(int(r["ts"].timestamp()) // size, []).append(r["sgv"])
    return [{"ts": datetime.fromtimestamp(k * size + size / 2, timezone.utc), "sgv": round(sum(v) / len(v)),
             "direction": "NONE"} for k, v in sorted(groups.items())]


@api.post("/readings")
async def add_reading(body: ReadingIn):
    ts = (body.ts or now_utc()).astimezone(timezone.utc)
    prev = await udb.readings.find_one({"ts": {"$lt": ts, "$gte": ts - timedelta(minutes=30)}}, sort=[("ts", -1)])
    direction = "NONE"
    if prev:
        minutes = max(1.0, (ts - prev["ts"]).total_seconds() / 60)
        direction = direction_from_slope((body.sgv - prev["sgv"]) / minutes)
    r = Reading(ts=ts, sgv=body.sgv, direction=direction, source="manual")
    try:
        res = await udb.readings.insert_one(r.to_mongo())
    except DuplicateKeyError:
        raise HTTPException(409, "A reading already exists at this time.")
    r.id = str(res.inserted_id)
    asyncio.create_task(check_alarms(await get_settings()))
    return r.model_dump(exclude={"ns_uploaded", "tp_uploaded", "dx_uploaded"})


@api.post("/readings/batch")
async def add_reading_batch(body: ReadingBatchIn):
    """Readings collected by the phone from a Bluetooth sensor (Master mode)."""
    items = [{"ts": r.ts.astimezone(timezone.utc), "sgv": r.sgv, "direction": r.direction} for r in body.readings]
    added = await insert_readings(items, body.source)
    asyncio.create_task(check_alarms(await get_settings()))
    return {"added": added}


@api.get("/treatments")
async def list_treatments(start: datetime, end: Optional[datetime] = None):
    end = end or now_utc()
    docs = await udb.treatments.find({"ts": {"$gte": start, "$lte": end}}).sort("ts", -1).to_list(2000)
    return [Treatment.from_mongo(d).model_dump(exclude={"ns_uploaded", "tp_uploaded"}) for d in docs]


@api.post("/treatments")
async def add_treatment(body: TreatmentIn):
    if body.kind == "insulin" and not body.insulin:
        raise HTTPException(422, "Enter insulin units.")
    if body.kind == "carbs" and not body.carbs:
        raise HTTPException(422, "Enter grams of carbs.")
    if body.kind == "note" and not (body.note or "").strip():
        raise HTTPException(422, "Write a note.")
    if body.kind == "calibration" and not body.glucose:
        raise HTTPException(422, "Enter the fingerstick glucose value.")
    ts = (body.ts or now_utc()).astimezone(timezone.utc)
    if ts > now_utc() + timedelta(minutes=2):
        raise HTTPException(422, "The time can't be in the future.")
    t = Treatment(ts=ts, kind=body.kind,
                  insulin=body.insulin if body.kind == "insulin" else None,
                  carbs=body.carbs if body.kind == "carbs" else None,
                  glucose=body.glucose if body.kind == "calibration" else None,
                  cgm=body.cgm if body.kind == "calibration" else None, note=(body.note or "").strip() or None)
    res = await udb.treatments.insert_one(t.to_mongo())
    t.id = str(res.inserted_id)
    return t.model_dump(exclude={"ns_uploaded", "tp_uploaded"})


@api.delete("/treatments/{tid}")
async def delete_treatment(tid: str):
    from bson import ObjectId
    from bson.errors import InvalidId
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(404, "Not found")
    res = await udb.treatments.delete_one({"_id": oid})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


async def compute_stats(start: datetime, end: datetime, s: AppSettings) -> dict:
    rows = await udb.readings.find({"ts": {"$gte": start, "$lte": end}}, {"_id": 0, "sgv": 1}).to_list(None)
    vals = [r["sgv"] for r in rows]
    if not vals:
        return {"count": 0}
    n = len(vals)
    avg = sum(vals) / n
    sd = statistics.pstdev(vals) if n > 1 else 0.0
    pct = lambda c: round(100 * c / n, 1)  # noqa: E731
    expected = max(1.0, (min(end, now_utc()) - start).total_seconds() / 300)
    # bands never overlap: very low stays <54 and very high >250 even if targets are set beyond them
    lo, hi = min(max(s.target_low, 54), 250), max(min(s.target_high, 250), 54)
    lo = min(lo, hi)
    # Glycemia Risk Index (Klonoff et al. 2022): standard bands, lows weighted most
    p = lambda f: 100 * sum(f(v) for v in vals) / n  # noqa: E731
    vlow, low, high, vhigh = p(lambda v: v < 54), p(lambda v: 54 <= v < 70), p(lambda v: 180 < v <= 250), p(lambda v: v > 250)
    hypo, hyper = vlow + 0.8 * low, vhigh + 0.5 * high
    gri = min(100.0, 3.0 * hypo + 1.6 * hyper)
    return {
        "count": n, "average": round(avg, 1), "median": statistics.median(vals), "sd": round(sd, 1),
        "cv": round(100 * sd / avg, 1) if avg else 0, "gmi": round(3.31 + 0.02392 * avg, 1),
        "a1c": round((avg + 46.7) / 28.7, 1), "min": min(vals), "max": max(vals),
        "capture": min(100.0, round(100 * n / expected, 1)),
        "gri": {"value": round(gri, 1), "zone": "ABCDE"[min(4, int(max(gri - 0.001, 0) // 20))],
                "hypo": round(min(100.0, hypo), 1), "hyper": round(min(100.0, hyper), 1)},
        "bands": {"low": lo, "high": hi},
        "tight": {"value": pct(sum(s.tight_low <= v <= s.tight_high for v in vals)), "low": s.tight_low, "high": s.tight_high},
        "tir": {
            "very_low": pct(sum(v < 54 for v in vals)),
            "low": pct(sum(54 <= v < lo for v in vals)),
            "in_range": pct(sum(lo <= v <= hi for v in vals)),
            "high": pct(sum(hi < v <= 250 for v in vals)),
            "very_high": pct(sum(v > 250 for v in vals)),
        },
    }


@api.get("/stats")
async def stats(start: datetime, end: Optional[datetime] = None):
    s = await get_settings()
    return await compute_stats(start, end or now_utc(), s)


@api.post("/sync")
async def sync_now():
    return await sync_once(force=True)


@api.post("/nightscout/upload")
async def ns_upload_now():
    s = await get_settings()
    if not s.ns_url:
        raise HTTPException(400, "Add your Nightscout URL first.")
    try:
        return {"uploaded": await push_nightscout(s)}
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
    except Exception:
        raise HTTPException(400, "Could not reach your Nightscout site. Check the URL.")


@api.post("/tidepool/upload")
async def tp_upload_now():
    s = await get_settings()
    if not (s.tp_email and s.tp_password):
        raise HTTPException(400, "Add your Tidepool email and password first.")
    try:
        return {"uploaded": await push_tidepool(s)}
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
    except Exception:
        raise HTTPException(400, "Could not reach Tidepool.")


@api.post("/alarm/ack")
async def ack_alarm(body: AckIn):
    s = await get_settings()
    alarm = await get_state("alarm")
    if not alarm.get("type"):
        return {"ok": True}
    until = now_utc() + timedelta(minutes=body.minutes or snooze_for(alarm["type"], s))
    await set_state("alarm", {"snoozed_until": until, "snoozed_type": alarm["type"]})
    return {"ok": True, "snoozed_until": until}


@api.post("/location")
async def report_location(body: LocationIn):
    await set_state("location", {"lat": body.lat, "lon": body.lon, "address": body.address.strip(), "ts": now_utc()})
    return {"ok": True}


@api.post("/emergency/test")
async def emergency_test(phone: Optional[str] = None, channel: Optional[Literal["sms", "call"]] = None):
    """Test everyone, or one contact (phone) and optionally only its text or call."""
    s = await get_settings()
    if phone:
        contact = next((c for c in s.em_contacts if c.phone == phone), None)
        if not contact:
            raise HTTPException(404, "Save this contact first, then send a test.")
        s = s.model_copy(update={"em_contacts": [contact]})
        results = await send_emergency(s, await latest_reading(), test=True,
                                       due={phone: {channel} if channel else {"sms", "call"}})
    else:
        results = await send_emergency(s, await latest_reading(), test=True)
    return {"results": results}


OUTBOX_MAX_AGE = timedelta(minutes=30)  # older texts are dropped, the alarm will queue a fresh one


async def expire_outbox() -> None:
    """Texts the phone never picked up (off, no app running) are logged as failed so the user can see it."""
    cutoff = now_utc() - OUTBOX_MAX_AGE
    async for d in udb.sms_outbox.find({"status": "pending", "ts": {"$lt": cutoff}}):
        await udb.sms_outbox.update_one({"_id": d["_id"]}, {"$set": {"status": "expired", "done_at": now_utc()}})
        await udb.emergency_log.insert_one(EmergencyLog(
            ts=now_utc(), test=d["body"].startswith("TEST"), message=d["body"],
            results=[f"Text to {d['name']} not sent: your phone didn't pick it up within 30 min (app closed or offline)"]).to_mongo())


@api.get("/sms/outbox")
async def sms_outbox():
    await expire_outbox()
    docs = await udb.sms_outbox.find({"status": "pending", "ts": {"$gte": now_utc() - OUTBOX_MAX_AGE}}).sort("ts", 1).to_list(50)
    return [{"id": str(d["_id"]), "to": d["to"], "name": d["name"], "body": d["body"], "ts": d["ts"]} for d in docs]


@api.post("/sms/outbox/{sid}")
async def sms_outbox_result(sid: str, body: SmsResultIn):
    from bson import ObjectId
    from bson.errors import InvalidId
    try:
        oid = ObjectId(sid)
    except InvalidId:
        raise HTTPException(404, "Not found")
    doc = await udb.sms_outbox.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Not found")
    await udb.sms_outbox.update_one({"_id": oid}, {"$set": {"status": "sent" if body.ok else "failed",
                                                            "error": body.error, "done_at": now_utc()}})
    text = f"Phone sent text to {doc['name']}" if body.ok else f"Phone text to {doc['name']} failed: {body.error or 'unknown'}"
    await udb.emergency_log.insert_one(EmergencyLog(ts=now_utc(), test=doc["body"].startswith("TEST"),
                                                    message=doc["body"], results=[text]).to_mongo())
    return {"ok": True}


@api.delete("/twilio")
async def twilio_disconnect():
    """Removes the user's own Twilio account completely."""
    await db.settings.update_one({"_id": CURRENT_UID.get()}, {"$set": {"twilio_sid": "", "twilio_token": "", "twilio_from": ""}})
    return (await get_settings()).public()


@api.delete("/telnyx")
async def telnyx_disconnect():
    """Removes the user's own Telnyx account completely."""
    await db.settings.update_one({"_id": CURRENT_UID.get()}, {"$set": {"telnyx_key": "", "telnyx_from": "", "telnyx_app_id": ""}})
    return (await get_settings()).public()


@api.post("/dexcom/upload")
async def dx_upload_now():
    s = await get_settings()
    if not (s.dexcom_username and s.dexcom_password):
        raise HTTPException(400, "Add your Dexcom username and password first.")
    if s.source == "demo":
        raise HTTPException(400, "Demo readings are never sent to Dexcom. Switch to your real sensor first.")
    try:
        return {"uploaded": await push_dexcom(s)}
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
    except Exception:
        raise HTTPException(400, "Could not reach Dexcom Share.")


@api.get("/emergency/log")
async def emergency_log():
    docs = await udb.emergency_log.find().sort("ts", -1).limit(20).to_list(20)
    return [EmergencyLog.from_mongo(d).model_dump() for d in docs]


@api.get("/ai/summary")
async def get_summary(label: str):
    doc = await udb.summaries.find_one({"label": label}, {"_id": 0})
    return doc or {"label": label, "text": None}


@api.post("/ai/summary")
async def ai_summary(body: SummaryIn):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(503, "AI summary is not set up on this server.")
    s = await get_settings()
    st = await compute_stats(body.start, body.end, s)
    if not st.get("count"):
        raise HTTPException(400, "No glucose readings for this day yet.")
    rows = await udb.readings.find({"ts": {"$gte": body.start, "$lte": body.end}}, {"_id": 0, "ts": 1, "sgv": 1}).to_list(None)
    hourly: dict[int, list[int]] = {}
    for r in rows:
        hourly.setdefault(int((r["ts"] - body.start).total_seconds() // 3600), []).append(r["sgv"])
    hours = ", ".join(f"h{h}:{round(sum(v) / len(v))}" for h, v in sorted(hourly.items()))
    tdocs = await udb.treatments.find({"ts": {"$gte": body.start, "$lte": body.end}}).sort("ts", 1).to_list(200)
    treats = "; ".join(f"+{int((d['ts'] - body.start).total_seconds() // 60)}min {d['kind']} "
                       f"{d.get('insulin') or d.get('carbs') or ''} {d.get('note') or ''}".strip() for d in tdocs) or "none"
    unit = "mmol/L" if s.unit == "mmol" else "mg/dL"
    prompt = (f"Day: {body.label}. Glucose values in mg/dL; reply using {unit} "
              f"(divide by 18 for mmol/L). Target {s.low}-{s.high} mg/dL.\n"
              f"Stats: {json.dumps(st)}\nHourly averages from start of day: {hours}\nTreatments (minutes from start): {treats}")
    system_prompt = ("You write a short, friendly daily glucose recap for a person with diabetes. "
                     "4-6 short sentences, plain words, no markdown, no headings. Mention time in range, "
                     "the highest and lowest periods with approximate times of day, and any pattern around "
                     "meals or insulin. Do not give medical advice or dosing changes; suggest talking to "
                     "their care team if something looks concerning.")
    model = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5")

    uid = CURRENT_UID.get()

    async def gen():
        CURRENT_UID.set(uid)
        text = ""
        try:
            body_json = {"model": model, "max_tokens": 500, "system": system_prompt, "stream": True,
                         "messages": [{"role": "user", "content": prompt}]}
            headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
            async with httpx.AsyncClient(timeout=60) as http:
                async with http.stream("POST", "https://api.anthropic.com/v1/messages",
                                       headers=headers, json=body_json) as resp:
                    if resp.status_code >= 400:
                        raise RuntimeError(f"Anthropic API {resp.status_code}: {(await resp.aread())[:300]!r}")
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        ev = json.loads(line[5:].strip())
                        if ev.get("type") == "content_block_delta" and ev["delta"].get("type") == "text_delta":
                            piece = ev["delta"]["text"]
                            text += piece
                            yield f"data: {json.dumps({'delta': piece})}\n\n"
                        elif ev.get("type") == "error":
                            raise RuntimeError(f"Anthropic stream error: {ev}")
                        elif ev.get("type") == "message_stop":
                            break
            if not text.strip():
                raise RuntimeError("empty summary")
            await udb.summaries.update_one({"label": body.label},
                                          {"$set": {"label": body.label, "text": text, "created_at": now_utc()}},
                                          upsert=True)
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as exc:
            logger.error("ai summary failed: %s", exc)
            yield f"data: {json.dumps({'error': 'The summary could not be written right now. Try again.'})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


app.include_router(auth_api)
app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    app.state.sync_task = asyncio.create_task(sync_loop())


@app.on_event("shutdown")
async def shutdown():
    for t in (app.state.index_task, app.state.sync_task):
        t.cancel()
        with suppress(asyncio.CancelledError):
            await t
    client.close()
