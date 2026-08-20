import logging

logger = logging.getLogger("helpotron.cost_tracking")

MODEL_RATES = {
    "deepseek/deepseek-chat": {"input_per_1k": 0.0014, "output_per_1k": 0.0028},
    "openai/gpt-4o": {"input_per_1k": 0.005, "output_per_1k": 0.015},
}

def log_api_cost(user_id: str, endpoint: str, model: str, input_tokens: int, output_tokens: int) -> float:
    rates = MODEL_RATES.get(model, {"input_per_1k": 0.001, "output_per_1k": 0.002})
    cost = (input_tokens / 1000.0) * rates["input_per_1k"] + (output_tokens / 1000.0) * rates["output_per_1k"]
    logger.info("API cost for user %s on %s using %s: $%f", user_id, endpoint, model, cost)
    return cost
