"""Daily rain/temperature per district (dry winter -> pre-monsoon Kalbaishakhi storms)."""

from dataclasses import dataclass
from datetime import date

import numpy as np

from app.models.enums import UrbanRural
from ml.data_gen import demo_spec
from ml.data_gen.geography import DISTRICTS, RAIN_FACTOR
from ml.data_gen.timeline import day_index, days

# Chance of a rainy day by calendar month, before the district factor.
RAIN_PROB: dict[int, float] = {1: 0.03, 2: 0.05, 3: 0.10, 4: 0.25, 5: 0.40}
MEAN_TEMP: dict[int, float] = {1: 18.5, 2: 22.0, 3: 26.5, 4: 28.5, 5: 29.5}
SEVERE_RAIN_MM = 50.0
# Demand drop at RAIN_CAP_MM (linear from 0); rural foot traffic suffers most.
RAIN_CAP_MM = 80.0
RAIN_DROP: dict[UrbanRural, float] = {UrbanRural.urban: 0.25, UrbanRural.peri_urban: 0.35,
                                      UrbanRural.rural: 0.45}


@dataclass(frozen=True)
class WeatherDay:
    district: str
    date: date
    rain_mm: float
    temp_c: float
    severe: bool


def generate_weather(rng: np.random.Generator) -> dict[str, np.ndarray]:
    """rain_mm per district per day, with the demo dry days pinned."""
    rain: dict[str, np.ndarray] = {}
    all_days = days()
    for district in DISTRICTS:
        f = RAIN_FACTOR[district]
        p = np.array([min(RAIN_PROB[d.month] * f, 0.9) for d in all_days])
        scale = np.array([(8.0 + 6.0 * d.month) * f for d in all_days])
        wet = rng.random(len(all_days)) < p
        amount = rng.gamma(shape=0.9, scale=scale)
        rain[district] = np.round(np.where(wet, amount, 0.0), 1)
    for district, iso in demo_spec.DRY_DAYS:
        rain[district][day_index(date.fromisoformat(iso))] = 0.0
    return rain


def temperatures(rain: dict[str, np.ndarray], rng: np.random.Generator) -> dict[str, np.ndarray]:
    base = np.array([MEAN_TEMP[d.month] for d in days()])
    return {k: np.round(base + rng.normal(0, 1.5, len(base)) - np.where(r > 5, 3.0, 0.0), 1)
            for k, r in rain.items()}


def rain_multiplier(rain_mm: np.ndarray, area: UrbanRural) -> np.ndarray:
    return 1.0 - RAIN_DROP[area] * np.minimum(rain_mm, RAIN_CAP_MM) / RAIN_CAP_MM


def weather_rows(rain: dict[str, np.ndarray], temp: dict[str, np.ndarray]) -> list[WeatherDay]:
    all_days = days()
    return [
        WeatherDay(d, all_days[i], float(rain[d][i]), float(temp[d][i]),
                   bool(rain[d][i] >= SEVERE_RAIN_MM))
        for d in sorted(rain) for i in range(len(all_days))
    ]
