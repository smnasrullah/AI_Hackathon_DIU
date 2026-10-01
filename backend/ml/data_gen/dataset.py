"""Build the full synthetic dataset in memory (deterministic for a given seed)."""

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ml.data_gen import demo_scenario
from ml.data_gen.agents import AgentSpec, build_agents
from ml.data_gen.anomalies import AnomalyLabel, inject_anomalies
from ml.data_gen.demand import Demand, generate_demand
from ml.data_gen.events import EventRow, build_events
from ml.data_gen.simulate import Floats, simulate
from ml.data_gen.weather import WeatherDay, generate_weather, temperatures, weather_rows

N_AGENTS = 300


@dataclass
class Dataset:
    seed: int
    agents: list[AgentSpec]
    rain: dict[str, np.ndarray]
    weather: list[WeatherDay]
    events: list[EventRow]
    demand: Demand
    floats: Floats
    anomalies: list[AnomalyLabel]
    demo: dict[str, Any] = field(default_factory=dict)

    def index(self, code: str) -> int:
        return next(i for i, a in enumerate(self.agents) if a.code == code)


def build_dataset(seed: int, n_agents: int = N_AGENTS) -> Dataset:
    r_world, r_weather, r_demand, r_anomaly, r_sim = (
        np.random.default_rng(s) for s in np.random.SeedSequence(seed).spawn(5)
    )
    agents = build_agents(n_agents, r_world)
    rain = generate_weather(r_weather)
    weather = weather_rows(rain, temperatures(rain, r_weather))
    demand = generate_demand(agents, rain, r_demand)
    anomalies = inject_anomalies(agents, demand, r_anomaly)
    floats = simulate(agents, demand, r_sim)
    ds = Dataset(seed, agents, rain, weather, build_events(weather), demand, floats, anomalies)
    ds.demo = demo_scenario.apply(ds)
    return ds
