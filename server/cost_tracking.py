MODEL_RATES = {
    'deepseek/deepseek-chat': 0.001,
}

def log_api_cost(user_id, endpoint, model, prompt_tokens, completion_tokens):
    rate = MODEL_RATES.get(model, 0.002)
    cost = (prompt_tokens + completion_tokens) * rate / 1000.0
    return max(cost, 0.0001)
