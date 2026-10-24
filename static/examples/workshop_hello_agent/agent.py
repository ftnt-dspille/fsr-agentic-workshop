from typing import Dict, Any

from agents.base_agent import BaseAgent
from utils.logger import get_logger

logger = get_logger("Workshop Hello Agent")


class WorkshopHelloAgent(BaseAgent):
    """A hello agent: no LLM call, returns a fixed structured answer from its input."""

    def __init__(self, config: Dict[str, str]):
        super().__init__(config=config)

    def act(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("Workshop Hello Agent execution started")
        self.initialize()
        entity = input_data.get("entity", "unknown")
        return {
            "answer": "hello from the workshop agent for entity: %s" % entity,
            "confidence": "low",
            "evidence": ["fixed response; this agent makes no LLM call"],
        }
