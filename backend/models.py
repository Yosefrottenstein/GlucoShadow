import re
from datetime import datetime
from typing import Annotated, Literal, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        return cls.model_validate(doc) if doc else None

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True)
        if data.get("_id") is None:
            data.pop("_id", None)
        else:
            data["_id"] = ObjectId(data["_id"])
        return data


class Reading(BaseDocument):
    ts: datetime
    sgv: int  # always mg/dL
    direction: str = "NONE"
    source: str
    ns_uploaded: bool = False
    tp_uploaded: bool = False
    dx_uploaded: bool = False


class Treatment(BaseDocument):
    ts: datetime
    kind: Literal["insulin", "carbs", "note", "calibration"]
    insulin: Optional[float] = None
    carbs: Optional[float] = None
    glucose: Optional[int] = None  # mg/dL, fingerstick value for kind "calibration"
    cgm: Optional[int] = None  # mg/dL, the CGM reading at that moment (calibration only)
    note: Optional[str] = None
    ns_uploaded: bool = False
    tp_uploaded: bool = False


class EmergencyLog(BaseDocument):
    ts: datetime
    test: bool
    message: str
    results: list[str]


HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]  # Monday = 0


class TimeWindow(BaseModel):
    days: list[int] = Field(default_factory=lambda: list(ALL_DAYS), min_length=1, max_length=7)
    start: str = Field(default="00:00", pattern=HHMM)
    end: str = Field(default="07:00", pattern=HHMM)

    @model_validator(mode="after")
    def _days(self):
        if any(d < 0 or d > 6 for d in self.days):
            raise ValueError("days must be 0 (Monday) to 6 (Sunday)")
        self.days = sorted(set(self.days))
        return self


class StyleWindow(TimeWindow):
    """Hours when an alarm uses a different style (e.g. vibrate only at night)."""
    style: Literal["sound", "vibrate", "both"] = "vibrate"


TRIGGER_PATTERN = r"^(urgent_low|low|high|urgent_high|missed|custom:[A-Za-z0-9_-]{1,40})$"


class EmRule(BaseModel):
    """How one contact gets one alarm on one channel (text or call)."""
    wait_minutes: int = Field(default=0, ge=0, le=240)   # how long the alarm must stay unacknowledged before the first message
    repeat_minutes: int = Field(default=5, ge=1, le=720)  # resend every
    times: int = Field(default=0, ge=0, le=50)             # total messages; 0 = keep sending until the alarm ends
    # which days this contact may get this alarm at all, before any hours below are even checked
    days: list[int] = Field(default_factory=lambda: list(ALL_DAYS))
    # when this contact may get this alarm: any time, or only on certain days / hours
    mode: Literal["always", "hours"] = "always"
    windows: list[TimeWindow] = Field(default=[], max_length=10)

    @model_validator(mode="after")
    def _need_window(self):
        if self.mode == "hours" and not self.windows:
            self.windows = [TimeWindow()]
        if any(d < 0 or d > 6 for d in self.days):
            raise ValueError("days must be 0 (Monday) to 6 (Sunday)")
        self.days = sorted(set(self.days))
        return self


class ChannelSchedule(BaseModel):
    rules: dict[str, EmRule] = Field(default_factory=dict)  # key = alarm ("low", "custom:<id>", ...)
    enabled: bool = True
    # "default" is from older saves and follows the global hours; the app now always saves always/hours per contact
    mode: Literal["default", "always", "hours"] = "always"
    windows: list[TimeWindow] = Field(default=[], max_length=10)
    repeat_minutes: int = Field(default=5, ge=1, le=720)  # resend while glucose stays at the same alarm level

    @model_validator(mode="before")
    @classmethod
    def _migrate(cls, data):
        # older saves had a single start/end every day
        if isinstance(data, dict) and not data.get("windows") and data.get("start"):
            data = {**data, "windows": [{"days": ALL_DAYS, "start": data["start"], "end": data.get("end", "07:00")}]}
        return data

    @model_validator(mode="after")
    def _rules_ok(self):
        for k in list(self.rules):
            if not re.fullmatch(TRIGGER_PATTERN, k):
                del self.rules[k]
        if "urgent_low" in self.rules:
            self.rules["urgent_low"].wait_minutes = 0  # an urgent low is never held back
        return self

    @model_validator(mode="after")
    def _need_window(self):
        if self.mode == "hours" and not self.windows:
            self.windows = [TimeWindow()]
        return self


EMTrigger = Annotated[str, Field(pattern=TRIGGER_PATTERN)]  # "missed" = lost data connection; "custom:<id>" = one of your own alarms


class Contact(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    phone: str = Field(pattern=r"^\+\d{7,15}$")
    sms: ChannelSchedule = ChannelSchedule()
    call: ChannelSchedule = ChannelSchedule()
    # "cloud" = Twilio; "phone" = the user's Android phone sends it from its own SIM card
    sms_via: Literal["cloud", "phone"] = "cloud"
    # which alarms make this contact get a text / a call (each contact is set separately)
    sms_triggers: list[EMTrigger] = Field(default_factory=lambda: ["urgent_low"])
    call_triggers: list[EMTrigger] = Field(default_factory=lambda: ["urgent_low"])


class AlarmSound(BaseModel):
    style: Literal["sound", "vibrate", "both"] = "both"
    sound: Literal["classic", "chime", "siren", "pulse", "gentle", "alert"] = "classic"
    repeat_minutes: int = Field(default=1, ge=1, le=120)  # re-alert interval while the alarm is active
    snooze_minutes: int = Field(default=30, ge=1, le=720)
    windows: list[StyleWindow] = Field(default_factory=list, max_length=10)  # different style at certain hours
    # when the alarm is active: only on these days (Monday = 0) and not during the pause hours
    days: list[int] = Field(default_factory=lambda: list(ALL_DAYS), max_length=7)
    off_windows: list[TimeWindow] = Field(default_factory=list, max_length=10)


class GlucoseAlarm(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=60)
    direction: Literal["below", "above"] = "below"
    value: int = Field(ge=40, le=400)  # mg/dL
    enabled: bool = True
    style: Literal["sound", "vibrate", "both"] = "both"
    sound: Literal["classic", "chime", "siren", "pulse", "gentle", "alert"] = "classic"
    repeat_minutes: int = Field(default=5, ge=1, le=120)
    snooze_minutes: int = Field(default=30, ge=1, le=720)
    windows: list[StyleWindow] = Field(default_factory=list, max_length=10)
    days: list[int] = Field(default_factory=lambda: list(ALL_DAYS), max_length=7)
    off_windows: list[TimeWindow] = Field(default_factory=list, max_length=10)


class Reminder(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=80)
    time: str = Field(pattern=HHMM)
    repeat: Literal["daily", "once"] = "daily"
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    enabled: bool = True
    style: Literal["sound", "vibrate", "both"] = "both"
    sound: Literal["classic", "chime", "siren", "pulse", "gentle", "alert"] = "chime"


def default_alarm_sounds() -> dict:
    return {
        "extreme_low": AlarmSound(style="sound", sound="siren"),
        "urgent_low": AlarmSound(style="both", sound="siren"),
        "low": AlarmSound(style="both", sound="classic"),
        "high": AlarmSound(style="both", sound="chime"),
        "urgent_high": AlarmSound(style="both", sound="alert"),
        "missed": AlarmSound(style="vibrate", sound="gentle"),
    }


SECRET_FIELDS = ("ns_secret", "dexcom_password", "libre_password", "tp_password", "twilio_token",
                 "twiist_password", "cl_password", "cl_refresh_token", "glooko_password", "telnyx_key",
                 "g7_pairing_code")


class AppSettings(BaseModel):
    unit: Literal["mgdl", "mmol"] = "mgdl"
    source: Literal["demo", "manual", "bluetooth", "companion", "health", "nightscout", "dexcom", "libre",
                    "twiist", "carelink", "glooko"] = "demo"
    # Master mode: direct Bluetooth sensor
    bt_sensor: Literal["dexcom_g6", "dexcom_g7"] = "dexcom_g6"
    bt_transmitter_id: str = ""
    bt_device_id: str = ""
    bt_device_name: str = ""
    # sensor session
    sensor_started_at: Optional[datetime] = None
    sensor_stopped_at: Optional[datetime] = None  # when the user stopped a session early (a G7 that is still active isn't restarted by mistake)
    sensor_days: float = Field(default=10.5, gt=0, le=30)
    sensor_warn_enabled: bool = True
    sensor_warn_offsets: list[int] = [1440, 720, 360, 60, 30]  # minutes before the end
    sensor_warn_style: Literal["sound", "vibrate", "both"] = "both"
    sensor_warn_sound: Literal["classic", "chime", "siren", "pulse", "gentle", "alert"] = "chime"
    # alarm sounds per level; extreme low (< 50 mg/dL) is always sound only
    alarm_extreme_low: bool = True
    alarm_sounds: dict[str, AlarmSound] = Field(default_factory=default_alarm_sounds)
    reminders: list[Reminder] = Field(default=[], max_length=50)
    glucose_alarms: list[GlucoseAlarm] = Field(default=[], max_length=30)

    @model_validator(mode="after")
    def _fill_sounds(self):
        merged = {**default_alarm_sounds(), **self.alarm_sounds}
        merged["extreme_low"] = merged["extreme_low"].model_copy(update={"style": "sound", "windows": []})
        self.alarm_sounds = merged
        # "Urgent low" (50 mg/dL, 2.8 mmol/L) is preset: always on, sound only, not adjustable. The old adjustable 55 level is retired.
        self.alarm_extreme_low = True
        self.alarm_urgent_low = False
        self.urgent_low = 50
        return self
    # target range for graph colours and time-in-range, always mg/dL
    target_low: int = 70
    target_high: int = 180
    # tight range, always inside the target range: time in tight range and the chain line on the graph
    tight_low: int = 70
    tight_high: int = 140
    # top of the graph in mg/dL: 300 or 400
    graph_max: int = 400
    # how often the server pulls new readings (follower modes) and uploads (Nightscout, Dexcom Share), in minutes
    pull_minutes: int = Field(default=2, ge=1, le=30)
    upload_minutes: int = Field(default=1, ge=1, le=60)
    # alarm thresholds, always mg/dL
    urgent_low: int = 55
    low: int = 70
    high: int = 180
    urgent_high: int = 250
    alarm_urgent_low: bool = True
    alarm_low: bool = True
    alarm_high: bool = True
    alarm_urgent_high: bool = True
    alarm_missed: bool = True
    missed_minutes: int = 20
    snooze_minutes: int = 30
    # Nightscout
    ns_url: str = ""
    ns_secret: str = ""
    ns_upload: bool = False
    # Dexcom Share
    dexcom_username: str = ""
    dexcom_password: str = ""
    dexcom_region: Literal["us", "ous", "jp"] = "us"
    # Dexcom Share upload (Master mode), uses the Dexcom login above
    dx_upload: bool = False
    dx_serial: str = Field(default="SM00000000", pattern=r"^[A-Z0-9]{4,16}$")
    # LibreLinkUp
    libre_email: str = ""
    libre_password: str = ""
    # twiist Insight follower login (made at mytwiistportal.com)
    twiist_username: str = ""
    twiist_password: str = ""
    # Medtronic CareLink (care partner or patient); refresh token is kept by the server after sign-in
    cl_username: str = ""
    cl_password: str = ""
    cl_server: Literal["EU", "US"] = "EU"
    cl_country: str = Field(default="gb", pattern=r"^[a-z]{2}$")
    cl_patient: str = ""
    cl_refresh_token: str = ""
    # Glooko / Omnipod DISCOVER
    glooko_email: str = ""
    glooko_password: str = ""
    glooko_region: Literal["US", "EU", "CA", "DE-FR"] = "US"
    # Tidepool
    tp_email: str = ""
    tp_password: str = ""
    tp_upload: bool = False
    tp_env: Literal["production", "integration"] = "production"
    # Emergency messages: texts and calls are set up per contact (on/off, hours, resend interval, how texts go)
    em_enabled: bool = False
    em_name: str = ""
    em_contacts: list[Contact] = []
    tz: str = "UTC"
    em_triggers: list[Literal["urgent_low", "low", "high", "urgent_high"]] = ["urgent_low"]
    em_delay_minutes: int = Field(default=15, ge=0, le=240)
    em_location: bool = True
    # Shabbat mode: alarms + emergency messages have a second, separate set of settings (see PROFILE_FIELDS)
    shabbat_mode: bool = False
    other_profile: dict = Field(default_factory=dict)  # the settings of the mode that is not active
    # The user's own Twilio account (iPhone texts + calls, Android calls)
    twilio_sid: str = Field(default="", pattern=r"^(AC[0-9a-fA-F]{32})?$")
    twilio_token: str = Field(default="", max_length=64)
    twilio_from: str = Field(default="", pattern=r"^(\+\d{7,15})?$")
    # Alternative provider (usually cheaper): the user's own Telnyx account. em_provider picks which one is used.
    em_provider: Literal["twilio", "telnyx"] = "twilio"
    telnyx_key: str = Field(default="", max_length=200)
    telnyx_from: str = Field(default="", pattern=r"^(\+\d{7,15})?$")
    telnyx_app_id: str = Field(default="", pattern=r"^[0-9A-Za-z_-]{0,64}$")  # TeXML application ID, only for voice calls
    # One-time G7/ONE+/Stelo pairing setup code (pasted once per phone; not needed again for later sensors on that phone)
    g7_pairing_code: str = Field(default="", max_length=4096)
    @model_validator(mode="after")
    def _tight_inside_target(self):
        lo, hi = max(self.tight_low, self.target_low), min(self.tight_high, self.target_high)
        self.tight_low, self.tight_high = (lo, hi) if lo < hi else (self.target_low, self.target_high)
        return self

    @model_validator(mode="before")
    @classmethod
    def _missed_range(cls, data):
        # "lost connection" alarm: 20 to 60 minutes in steps of 10 (older saves may hold any number, so fix it quietly)
        if isinstance(data, dict) and data.get("missed_minutes") is not None:
            try:
                m = int(data["missed_minutes"])
            except (TypeError, ValueError):
                m = 20
            data = {**data, "missed_minutes": min(60, max(20, int(round(m / 10.0)) * 10))}
        return data

    @model_validator(mode="before")
    @classmethod
    def _contact_triggers(cls, data):
        # older saves had one global list of alarms for everyone; each contact starts with a copy of it
        if not isinstance(data, dict) or not data.get("em_contacts"):
            return data
        base = list(data.get("em_triggers") or ["urgent_low"])
        fixed = []
        for c in data["em_contacts"]:
            if isinstance(c, dict):
                c = dict(c)
                c.setdefault("sms_triggers", list(base))
                c.setdefault("call_triggers", list(base))
            fixed.append(c)
        return {**data, "em_contacts": fixed}

    @model_validator(mode="before")
    @classmethod
    def _dexcom_only(cls, data):
        # Live Bluetooth is Dexcom only; older saves that picked a Libre sensor fall back to G6
        if isinstance(data, dict) and data.get("bt_sensor") not in (None, "dexcom_g6", "dexcom_g7"):
            data = {**data, "bt_sensor": "dexcom_g6"}
        return data

    @model_validator(mode="after")
    def _unique_contacts(self):
        phones = [c.phone for c in self.em_contacts]
        if len(phones) != len(set(phones)):
            raise ValueError("Each emergency contact needs a different phone number")
        return self
    @model_validator(mode="before")
    @classmethod
    def _contacts_own_channels(cls, data):
        # Older saves kept on/off, hours and resend for texts/calls globally; move them into each contact.
        if not isinstance(data, dict) or "em_sms_schedule" not in data:
            return data
        data = dict(data)
        contacts = []
        for c in data.get("em_contacts") or []:
            c = dict(c)
            for ch in ("sms", "call"):
                own = dict(c.get(ch) or {})
                glob = dict(data.get(f"em_{ch}_schedule") or {})
                if own.get("mode", "default") == "default":
                    own.update({k: glob[k] for k in ("mode", "windows", "start", "end") if k in glob})
                    if own.get("mode") == "default":
                        own["mode"] = "always"
                if data.get(f"em_{ch}") is False:
                    own["enabled"] = False
                own.setdefault("repeat_minutes", data.get(f"em_{ch}_repeat_minutes", 5))
                c[ch] = own
            c.setdefault("sms_via", data.get("em_sms_via", "cloud"))
            contacts.append(c)
        data["em_contacts"] = contacts
        for k in ("em_sms", "em_call", "em_sms_via", "em_sms_schedule", "em_call_schedule", "em_sms_repeat_minutes", "em_call_repeat_minutes"):
            data.pop(k, None)
        return data

    def public(self) -> dict:
        data = self.model_dump()
        for f in SECRET_FIELDS:
            data[f + "_set"] = bool(data[f])
            data[f] = ""
        data.pop("other_profile", None)
        return data


# Settings that belong to a mode (standard or Shabbat): alarm settings and emergency message settings.
# Accounts, sensors, units and the Twilio/Telnyx logins are shared by both modes.
PROFILE_FIELDS = (
    "urgent_low", "low", "high", "urgent_high", "alarm_urgent_low", "alarm_low", "alarm_high", "alarm_urgent_high",
    "alarm_extreme_low", "alarm_missed", "missed_minutes", "snooze_minutes", "alarm_sounds", "glucose_alarms", "reminders",
    "sensor_warn_enabled", "sensor_warn_offsets", "sensor_warn_style", "sensor_warn_sound",
    "em_enabled", "em_name", "em_contacts", "em_triggers", "em_delay_minutes", "em_location",
)


def blank_profile() -> dict:
    """What Shabbat mode starts as the first time: every alarm and emergency message off, no contacts, no custom alarms."""
    d = AppSettings().model_dump()
    out = {f: d[f] for f in PROFILE_FIELDS}
    out.update(alarm_urgent_low=False, alarm_low=False, alarm_high=False, alarm_urgent_high=False, alarm_extreme_low=False,
               alarm_missed=False, sensor_warn_enabled=False, em_enabled=False, em_name="", em_contacts=[],
               glucose_alarms=[], reminders=[])
    return out


class ReadingIn(BaseModel):
    sgv: int = Field(ge=20, le=600)
    ts: Optional[datetime] = None


class ReadingBatchItem(BaseModel):
    ts: datetime
    sgv: int = Field(ge=20, le=600)
    direction: str = "NONE"


class ReadingBatchIn(BaseModel):
    readings: list[ReadingBatchItem] = Field(max_length=2000)
    source: Literal["bluetooth", "companion", "health"] = "bluetooth"


class TreatmentIn(BaseModel):
    kind: Literal["insulin", "carbs", "note", "calibration"]
    insulin: Optional[float] = Field(default=None, ge=0, le=100)
    carbs: Optional[float] = Field(default=None, ge=0, le=500)
    glucose: Optional[int] = Field(default=None, ge=20, le=600)
    cgm: Optional[int] = Field(default=None, ge=20, le=600)
    note: Optional[str] = Field(default=None, max_length=500)
    ts: Optional[datetime] = None


class LocationIn(BaseModel):
    lat: float
    lon: float
    address: str = Field(default="", max_length=200)


class SmsResultIn(BaseModel):
    ok: bool
    error: Optional[str] = Field(default=None, max_length=200)


class AckIn(BaseModel):
    minutes: Optional[int] = Field(default=None, ge=5, le=720)


class CareLinkStartIn(BaseModel):
    server: Literal["EU", "US"] = "EU"


class CareLinkFinishIn(BaseModel):
    code: str = Field(min_length=4, max_length=4000)
    state: str = Field(min_length=8, max_length=64)


class SummaryIn(BaseModel):
    start: datetime
    end: datetime
    label: str
