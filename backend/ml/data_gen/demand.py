"""Hourly cash-in / cash-out demand per agent (before float limits turn customers away)."""

from dataclasses import dataclass
from functools import cache

import numpy as np

from app.models.enums import UrbanRural
from ml.data_gen import calendar_effects as cal
from ml.data_gen.agents import AgentSpec
from ml.data_gen.timeline import FRI, N_DAYS, N_HOURS, THU, hour_of_day, weekday_of_day
from ml.data_gen.weather import rain_multiplier

U, P, R = UrbanRural.urban, UrbanRural.peri_urban, UrbanRural.rural

# Typical daily cash-out (BDT) by tier and area; cash-in = cash-out * IN_RATIO.
BASE_OUT: dict[int, dict[UrbanRural, float]] = {
    1: {U: 260_000, P: 200_000, R: 150_000},
    2: {U: 130_000, P: 100_000, R: 70_000},
    3: {U: 50_000, P: 40_000, R: 30_000},
}
# Cities send money home (net cash-in); villages receive it (net cash-out).
IN_RATIO: dict[UrbanRural, float] = {U: 1.10, P: 0.85, R: 0.55}
TICKET_OUT: dict[UrbanRural, float] = {U: 1800, P: 1500, R: 1200}
TICKET_IN: dict[UrbanRural, float] = {U: 2200, P: 1800, R: 1500}

_HOUR_WEIGHTS: dict[UrbanRural, list[float]] = {
    U: [0, 0, 0, 0, 0, 0, 0, .2, .5, .8, 1, 1.1, 1, .9, .9, 1, 1.1, 1.3, 1.5, 1.6, 1.5, 1.2, .7,
        .2],
    P: [0, 0, 0, 0, 0, 0, 0, .3, .7, 1, 1.2, 1.2, 1.1, 1, 1, 1, 1.1, 1.2, 1.3, 1.2, 1, .6, .2, 0],
    R: [0, 0, 0, 0, 0, 0, 0, .4, .9, 1.3, 1.5, 1.5, 1.3, 1.1, 1, 1, 1, 1, .9, .7, .4, .1, 0, 0],
}
# Mon..Sun. Friday is the weekend (Jumu'ah), Saturday half-weekend, Thursday pay-home evening.
WEEKDAY_MULT: dict[UrbanRural, list[float]] = {
    U: [1.0, 1.0, 1.02, 1.12, 0.80, 0.90, 1.0],
    P: [1.0, 1.0, 1.01, 1.08, 0.85, 0.94, 1.0],
    R: [1.0, 1.0, 1.00, 1.05, 0.90, 0.97, 1.0],
}
THURSDAY_IN_EXTRA: dict[UrbanRural, float] = {U: 1.10, P: 1.05, R: 1.0}
JUMUAH_HOURS = (12, 13)
JUMUAH_MULT = 0.35
TREND_PER_DAY = 0.0008
DAILY_NOISE_PHI, DAILY_NOISE_SIGMA = 0.6, 0.12
TICKET_SIGMA = 0.5


@dataclass
class Demand:
    """Arrays shaped (agents, hours). lam_* = noise-free expectation; amt_*/cnt_* = realised."""

    lam_in: np.ndarray
    lam_out: np.ndarray
    amt_in: np.ndarray
    amt_out: np.ndarray
    cnt_in: np.ndarray
    cnt_out: np.ndarray
    ticket_in: np.ndarray
    ticket_out: np.ndarray


def hour_share(area: UrbanRural) -> np.ndarray:
    w = np.array(_HOUR_WEIGHTS[area])
    return w / w.sum()


@cache
def _calendar(area: UrbanRural, district: str) -> tuple[np.ndarray, np.ndarray]:
    """Hourly (out, in) multipliers that depend only on area + district (not weather)."""
    wd = np.repeat(weekday_of_day(), 24)
    hod = hour_of_day()
    base = np.tile(hour_share(area), N_DAYS) * np.array(WEEKDAY_MULT[area])[wd]
    base[(wd == FRI) & np.isin(hod, JUMUAH_HOURS)] *= JUMUAH_MULT
    base *= 1.0 + TREND_PER_DAY * (np.arange(N_HOURS) // 24)
    d_out, d_in = cal.daily_multipliers(area, district)
    h_out, h_in = cal.hat_multipliers(area, district)
    thu_in = np.where(wd == THU, THURSDAY_IN_EXTRA[area], 1.0)
    return base * np.repeat(d_out, 24) * h_out, base * np.repeat(d_in, 24) * h_in * thu_in


def expected(a: AgentSpec, rain_mm: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Noise-free hourly (cash_in, cash_out) BDT for one agent."""
    c_out, c_in = _calendar(a.area, a.district)
    rain = np.repeat(rain_multiplier(rain_mm, a.area), 24)
    daily_out = BASE_OUT[a.tier][a.area] * a.scale * a.out_bias
    daily_in = BASE_OUT[a.tier][a.area] * IN_RATIO[a.area] * a.scale * a.in_bias
    return daily_in * c_in * rain, daily_out * c_out * rain


def _daily_noise(rng: np.random.Generator) -> np.ndarray:
    eps = rng.normal(0.0, DAILY_NOISE_SIGMA, N_DAYS)
    x = np.empty(N_DAYS)
    x[0] = eps[0]
    for i in range(1, N_DAYS):
        x[i] = DAILY_NOISE_PHI * x[i - 1] + eps[i]
    return np.repeat(np.exp(x - DAILY_NOISE_SIGMA**2 / 2), 24)


def _realise(lam: np.ndarray, ticket: float, rng: np.random.Generator
             ) -> tuple[np.ndarray, np.ndarray]:
    cnt = rng.poisson(lam / ticket)
    sigma = TICKET_SIGMA / np.sqrt(np.maximum(cnt, 1))
    amt = cnt * ticket * np.exp(rng.normal(0.0, 1.0, lam.shape) * sigma - sigma**2 / 2)
    return np.round(amt), cnt


def generate_demand(agents: list[AgentSpec], rain: dict[str, np.ndarray],
                    rng: np.random.Generator) -> Demand:
    n = len(agents)
    arrays = {k: np.zeros((n, N_HOURS)) for k in ("lam_in", "lam_out", "amt_in", "amt_out")}
    cnt_in = np.zeros((n, N_HOURS), dtype=np.int64)
    cnt_out = np.zeros((n, N_HOURS), dtype=np.int64)
    t_in = np.array([TICKET_IN[a.area] for a in agents])
    t_out = np.array([TICKET_OUT[a.area] for a in agents])
    for i, a in enumerate(agents):
        lam_in, lam_out = expected(a, rain[a.district])
        noise = _daily_noise(rng)
        arrays["lam_in"][i], arrays["lam_out"][i] = lam_in, lam_out
        arrays["amt_in"][i], cnt_in[i] = _realise(lam_in * noise, t_in[i], rng)
        arrays["amt_out"][i], cnt_out[i] = _realise(lam_out * noise, t_out[i], rng)
    return Demand(cnt_in=cnt_in, cnt_out=cnt_out, ticket_in=t_in, ticket_out=t_out, **arrays)
