MODEL_RATES = {
    'deepseek/deepseek-chat': {'input': 0.0001, 'output': 0.0002},
    'openai/gpt-4o': {'input': 0.005, 'output': 0.01},
}

class CostEngine:
    def log_cost(self, user_id, endpoint, model, prompt_tokens, completion_tokens):
        rates = MODEL_RATES.get(model, {'input': 0.001, 'output': 0.002})
        cost = (prompt_tokens / 1000.0) * rates['input'] + (completion_tokens / 1000.0) * rates['output']
        return max(cost, 0.00001)

cost_engine = CostEngine()

def log_api_cost(user_id, endpoint, model, prompt_tokens, completion_tokens):
    return cost_engine.log_cost(user_id, endpoint, model, prompt_tokens, completion_tokens)
