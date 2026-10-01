from pydantic import BaseModel, ConfigDict

from app.models.enums import Lang


class PreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lang: Lang
