"""Distributor territories: upazila clusters with real Bangladesh coordinates (approximate)."""

from dataclasses import dataclass

from app.models.enums import UrbanRural


@dataclass(frozen=True)
class Cluster:
    distributor_code: str
    district: str
    upazila: str
    area: UrbanRural
    lat: float
    lng: float
    spread_km: float
    weight: float


U, P, R = UrbanRural.urban, UrbanRural.peri_urban, UrbanRural.rural

CLUSTERS: tuple[Cluster, ...] = (
    # Dhaka North: mostly urban, peri-urban industrial belt in Gazipur.
    Cluster("DST-DHK", "Dhaka", "Mirpur", U, 23.8069, 90.3687, 1.2, 20),
    Cluster("DST-DHK", "Dhaka", "Uttara", U, 23.8759, 90.3795, 1.5, 16),
    Cluster("DST-DHK", "Dhaka", "Mohammadpur", U, 23.7662, 90.3589, 1.0, 16),
    Cluster("DST-DHK", "Dhaka", "Badda", U, 23.7806, 90.4261, 1.2, 14),
    Cluster("DST-DHK", "Dhaka", "Jatrabari", U, 23.7104, 90.4349, 1.2, 12),
    Cluster("DST-DHK", "Gazipur", "Tongi", P, 23.8915, 90.4023, 1.5, 12),
    Cluster("DST-DHK", "Gazipur", "Gazipur Sadar", P, 23.9999, 90.4203, 2.0, 10),
    Cluster("DST-DHK", "Gazipur", "Kaliakair", P, 24.0700, 90.2250, 2.5, 10),
    # Chattogram South: port city core, peri-urban south bank, rural coast.
    Cluster("DST-CTG", "Chattogram", "Panchlaish", U, 22.3637, 91.8317, 1.0, 12),
    Cluster("DST-CTG", "Chattogram", "Double Mooring", U, 22.3260, 91.8100, 1.0, 10),
    Cluster("DST-CTG", "Chattogram", "Patiya", P, 22.2950, 91.9790, 2.0, 22),
    Cluster("DST-CTG", "Chattogram", "Boalkhali", P, 22.3800, 91.9200, 2.0, 16),
    Cluster("DST-CTG", "Chattogram", "Anwara", P, 22.2100, 91.8900, 2.5, 16),
    Cluster("DST-CTG", "Chattogram", "Banshkhali", R, 22.0300, 91.9500, 3.0, 14),
    Cluster("DST-CTG", "Chattogram", "Satkania", R, 22.0800, 92.0500, 3.0, 10),
    # Sylhet Haor: rural wetlands, one peri-urban town.
    Cluster("DST-SYL", "Sylhet", "Sylhet Sadar", P, 24.8949, 91.8687, 2.0, 10),
    Cluster("DST-SYL", "Sunamganj", "Sunamganj Sadar", R, 25.0658, 91.3950, 2.5, 16),
    Cluster("DST-SYL", "Sunamganj", "Tahirpur", R, 25.0870, 91.1830, 3.0, 18),
    Cluster("DST-SYL", "Sunamganj", "Jamalganj", R, 24.9500, 91.2300, 3.0, 14),
    Cluster("DST-SYL", "Sunamganj", "Derai", R, 24.7900, 91.3500, 3.0, 14),
    Cluster("DST-SYL", "Sylhet", "Companiganj", R, 25.0700, 91.7500, 3.0, 10),
    Cluster("DST-SYL", "Sylhet", "Gowainghat", R, 25.1000, 91.9400, 3.0, 8),
)

# Share of agents per distributor (110 / 100 / 90 of 300).
DISTRIBUTOR_SHARE: dict[str, float] = {"DST-DHK": 110 / 300, "DST-CTG": 100 / 300,
                                       "DST-SYL": 90 / 300}
REGION_OF: dict[str, str] = {"DST-DHK": "Dhaka", "DST-CTG": "Chattogram", "DST-SYL": "Sylhet"}

DISTRICTS: tuple[str, ...] = tuple(sorted({c.district for c in CLUSTERS}))

# Weekly hat-bazar day per district (Python weekday). Dhaka city has no weekly hat.
HAT_WEEKDAY: dict[str, int] = {"Gazipur": 1, "Chattogram": 2, "Sylhet": 3, "Sunamganj": 5}

# Rain climate multiplier per district (haor region is the wettest).
RAIN_FACTOR: dict[str, float] = {"Dhaka": 1.0, "Gazipur": 1.0, "Chattogram": 1.15,
                                 "Sylhet": 1.5, "Sunamganj": 1.6}


def cluster_for(upazila: str) -> Cluster:
    return next(c for c in CLUSTERS if c.upazila == upazila)
