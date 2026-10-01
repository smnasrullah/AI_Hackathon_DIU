from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.enums import UrbanRural


class AgentProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    distributor_id: int
    region: str
    district: str
    upazila: str | None
    urban_rural: UrbanRural
    tier: int
    lat: float
    lng: float
    cash_capacity: float
    emoney_capacity: float
    opened_on: date | None
    is_active: bool
