"""Uploaders: Nightscout and Tidepool."""
from datetime import datetime, timezone

import httpx

from models import AppSettings, Reading, Treatment
from sources import DEXCOM, ns_auth

DEVICE = "xDrip-iOS"


def _iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def upload_nightscout(s: AppSettings, readings: list[Reading], treatments: list[Treatment]) -> None:
    headers, params = ns_auth(s.ns_secret)
    base = s.ns_url.rstrip("/")
    async with httpx.AsyncClient(timeout=30) as c:
        if readings:
            body = [{"type": "sgv", "sgv": r.sgv, "date": int(r.ts.timestamp() * 1000), "dateString": _iso(r.ts),
                     "direction": r.direction, "device": DEVICE} for r in readings]
            resp = await c.post(f"{base}/api/v1/entries", headers=headers, params=params, json=body)
            if resp.status_code >= 400:
                raise RuntimeError(f"Nightscout rejected the upload ({resp.status_code}). Check URL and API secret.")
        if treatments:
            body = []
            for t in treatments:
                if t.kind == "calibration":  # fingerstick check, shows in Nightscout as a BG Check
                    body.append({"eventType": "BG Check", "created_at": _iso(t.ts), "glucose": t.glucose, "glucoseType": "Finger",
                                 "units": "mg/dl", "notes": t.note or "", "enteredBy": DEVICE})
                    continue
                event = {"insulin": "Correction Bolus", "carbs": "Carb Correction", "note": "Note"}[t.kind]
                body.append({"eventType": event, "created_at": _iso(t.ts), "insulin": t.insulin, "carbs": t.carbs,
                             "notes": t.note or "", "enteredBy": DEVICE})
            resp = await c.post(f"{base}/api/v1/treatments", headers=headers, params=params, json=body)
            if resp.status_code >= 400:
                raise RuntimeError(f"Nightscout rejected treatments ({resp.status_code}).")


SHARE_TREND = {"DoubleUp": 1, "SingleUp": 2, "FortyFiveUp": 3, "Flat": 4, "FortyFiveDown": 5, "SingleDown": 6,
               "DoubleDown": 7, "NOT COMPUTABLE": 8, "RATE OUT OF RANGE": 9}


async def upload_dexcom_share(s: AppSettings, readings: list[Reading]) -> None:
    """Uploads readings to Dexcom Share the way xDrip+ does (unofficial API), so Dexcom Follow sees them."""
    base, app_id = DEXCOM[s.dexcom_region]
    sn = s.dx_serial
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": "Dexcom Share/3.0.2.11", "Accept": "application/json"}) as c:
        r = await c.post(f"{base}/General/LoginPublisherAccountByName",
                         json={"accountName": s.dexcom_username, "password": s.dexcom_password, "applicationId": app_id})
        if r.status_code != 200:
            raise RuntimeError("Dexcom login failed. Check username, password and region.")
        session = r.json()
        # Dexcom answers wrong logins with HTTP 200 and an all-zero session id
        if not session or session == "00000000-0000-0000-0000-000000000000":
            raise RuntimeError("Dexcom login failed. Check username, password and region.")
        q = {"sessionId": session, "serialNumber": sn}
        r = await c.post(f"{base}/Publisher/CheckMonitoredReceiverAssignmentStatus", params=q, json={})
        if r.status_code == 200 and r.json() == "AssignedToOther":
            raise RuntimeError(f"Receiver {sn} belongs to another Dexcom account. Change the receiver serial.")
        if r.status_code != 200 or r.json() == "NotAssigned":
            await c.post(f"{base}/Publisher/ReplacePublisherAccountMonitoredReceiver", params=q, json={})
        r = await c.post(f"{base}/Publisher/IsRemoteMonitoringSessionActive", params={"sessionId": session}, json={})
        if r.status_code != 200 or r.json() is not True:
            await c.post(f"{base}/Publisher/StartRemoteMonitoringSession", params=q, json={})
        egvs = []
        for rd in readings:
            ms = int(rd.ts.timestamp() * 1000)
            egvs.append({"Trend": SHARE_TREND.get(rd.direction, 0), "ST": f"/Date({ms})/", "DT": f"/Date({ms})/",
                         "Value": rd.sgv})
        r = await c.post(f"{base}/Publisher/PostReceiverEgvRecords", params={"sessionId": session},
                         json={"SN": sn, "TA": -5, "Egvs": egvs})
        if r.status_code >= 400:
            raise RuntimeError(f"Dexcom Share rejected the upload ({r.status_code}).")


TIDEPOOL = {"production": "https://api.tidepool.org", "integration": "https://external.integration.tidepool.org"}


async def upload_tidepool(s: AppSettings, readings: list[Reading], treatments: list[Treatment]) -> int:
    events = []
    for r in readings:
        events.append({"type": "cbg", "time": _iso(r.ts), "timezoneOffset": 0, "deviceId": DEVICE,
                       "value": r.sgv, "units": "mg/dL", "sampleInterval": 300000})
    for t in treatments:
        if t.kind == "insulin" and t.insulin:
            events.append({"type": "bolus", "subType": "normal", "time": _iso(t.ts), "timezoneOffset": 0,
                           "deviceId": DEVICE, "normal": t.insulin})
        elif t.kind == "carbs" and t.carbs:
            events.append({"type": "food", "time": _iso(t.ts), "timezoneOffset": 0, "deviceId": DEVICE,
                           "nutrition": {"carbohydrate": {"net": t.carbs, "units": "grams"}}})
        elif t.kind == "calibration" and t.glucose:
            events.append({"type": "smbg", "subType": "manual", "time": _iso(t.ts), "timezoneOffset": 0,
                           "deviceId": DEVICE, "value": t.glucose, "units": "mg/dL"})
    if not events:
        return 0
    # Header and path shapes copied from xDrip+'s TidepoolUploader.java (GNU GPL-3.0, jamorham/xDrip+ project),
    # since Tidepool's server is strict about both. Differences we fixed from the previous version: the API
    # paths are under /v1/... not /dataservices/v1/...; a data set is "continuous" (xDrip's term), not "normal";
    # an existing open data set is reused instead of always opening a new one; and three device tags are sent.
    client_name = "org.glucoshadow.app"
    headers_base = {"User-Agent": f"GlucoShadow {DEVICE}", "X-Tidepool-Client-Name": client_name,
                    "X-Tidepool-Client-Version": "1.0.0"}
    async with httpx.AsyncClient(base_url=TIDEPOOL[s.tp_env], timeout=60, headers=headers_base) as c:
        r = await c.post("/auth/login", auth=(s.tp_email, s.tp_password))
        token = r.headers.get("x-tidepool-session-token")
        if r.status_code != 200 or not token:
            raise RuntimeError("Tidepool login failed. Check email and password.")
        user_id = r.json()["userid"]
        h = {"x-tidepool-session-token": token}

        # Reuse an already-open data set for this app if Tidepool still has one, instead of opening a new one
        # every sync (xDrip's startSession does the same check before deciding to open a fresh data set).
        r = await c.get(f"/v1/users/{user_id}/data_sets", headers=h, params={"client.name": client_name, "size": 1})
        existing = r.json() if r.status_code == 200 else []
        dataset = existing[0]["uploadId"] if existing else None

        if not dataset:
            now = datetime.now(timezone.utc)
            meta = {"client": {"name": client_name, "version": "1.0.0"}, "dataSetType": "continuous",
                    "deduplicator": {"name": "org.tidepool.deduplicator.dataset.delete.origin"},
                    "deviceManufacturers": ["xDrip"], "deviceModel": "xDrip-iOS", "deviceSerialNumber": "personal",
                    "deviceTags": ["bgm", "cgm", "insulin-pump"], "timeProcessing": "none", "timezone": "UTC",
                    "deviceId": DEVICE, "time": _iso(now), "timezoneOffset": 0, "version": "1.0.0",
                    "computerTime": now.strftime("%Y-%m-%dT%H:%M:%S"), "deviceTime": now.strftime("%Y-%m-%dT%H:%M:%S")}
            r = await c.post(f"/v1/users/{user_id}/data_sets", headers=h, json=meta)
            if r.status_code not in (200, 201):
                raise RuntimeError(f"Tidepool could not start an upload ({r.status_code}).")
            dataset = r.json()["data"]["uploadId"]

        for i in range(0, len(events), 1000):
            r = await c.post(f"/v1/datasets/{dataset}/data", headers=h, json=events[i:i + 1000])
            if r.status_code not in (200, 201):
                raise RuntimeError(f"Tidepool rejected the data ({r.status_code}).")
        # Left open on purpose, the way xDrip's "continuous" data sets stay open between syncs, so the next
        # sync appends to the same data set instead of creating a new one every time.
    return len(events)
