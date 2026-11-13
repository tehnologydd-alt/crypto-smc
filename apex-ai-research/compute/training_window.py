"""Guard heavy CPU retraining by the same Europe/Kyiv day/night policy as the edge."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TIMEZONE = ZoneInfo("Europe/Kyiv")
DAY_START = 8
DAY_END = 23


def research_mode(at: datetime | None = None) -> str:
    stamp = at or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        raise ValueError("Timezone-aware datetime required")
    hour = stamp.astimezone(TIMEZONE).hour
    return "ACTIVE" if DAY_START <= hour < DAY_END else "ECO"


def training_permitted(at: datetime | None = None) -> bool:
    return research_mode(at) == "ACTIVE"
