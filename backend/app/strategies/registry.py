"""
Strategy Registry and Discovery.
"""

from typing import Dict, List, Type
from backend.app.strategies.base import BaseStrategy
from backend.app.strategies.custom_strategies import (
    RMTMomentumStrategy,
    CrossSectionalMomentumStrategy,
    MovingAverageTrendStrategy,
    MeanReversionRSIStrategy,
    MyCustomStrategy
)

STRATEGY_REGISTRY: Dict[str, BaseStrategy] = {
    RMTMomentumStrategy.id: RMTMomentumStrategy(),
    CrossSectionalMomentumStrategy.id: CrossSectionalMomentumStrategy(),
    MovingAverageTrendStrategy.id: MovingAverageTrendStrategy(),
    MeanReversionRSIStrategy.id: MeanReversionRSIStrategy(),
    MyCustomStrategy.id: MyCustomStrategy()
}

def get_strategy(strategy_id: str) -> BaseStrategy:
    return STRATEGY_REGISTRY.get(strategy_id, STRATEGY_REGISTRY[RMTMomentumStrategy.id])

def list_strategies() -> List[Dict[str, str]]:
    return [
        {
            "id": strat.id,
            "name": strat.name,
            "description": strat.description,
            "category": strat.category
        }
        for strat in STRATEGY_REGISTRY.values()
    ]
