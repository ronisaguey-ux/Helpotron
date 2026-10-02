import numpy as np

class DrawdownRule:
    def __init__(self, limit=0.20, wait_bars=10, trailing=0.10, rebound=0.05):
        self.limit = float(limit)
        self.wait_bars = int(wait_bars)
        self.trailing = float(trailing)
        self.rebound = float(rebound)

    @classmethod
    def from_genome(cls, genome):
        limit = float(np.clip(genome[321], 0.0, 1.0))
        wait_bars = int(np.clip(genome[322], 0, 100))
        trailing = float(np.clip(genome[323], 0.0, 1.0))
        rebound = float(np.clip(genome[324], 0.0, 1.0))
        return cls(limit=limit, wait_bars=wait_bars, trailing=trailing, rebound=rebound)


class PortfolioOptimizer:
    def __init__(self, initial_equity=100000.0, drawdown_rule=None, max_position_pct=0.2, risk_per_trade_pct=0.02, genome=None):
        self.initial_equity = float(initial_equity)
        self.current_equity = self.initial_equity
        self.peak_equity = self.initial_equity
        self.drawdown_rule = drawdown_rule or (DrawdownRule.from_genome(genome) if genome is not None else DrawdownRule())
        self.max_position_pct = float(max_position_pct)
        self.risk_per_trade_pct = float(risk_per_trade_pct)
        self.exit_triggered = False
        self.trough_equity = self.initial_equity

    @property
    def drawdown(self):
        if self.peak_equity <= 0:
            return 0.0
        return max(0.0, (self.peak_equity - self.current_equity) / self.peak_equity)

    def can_trade(self):
        return not self.exit_triggered

    def should_exit(self):
        return self.exit_triggered

    def update_equity(self, equity):
        self.current_equity = float(equity)
        if self.current_equity < 0.0:
            self.current_equity = 0.0

        if self.current_equity > self.peak_equity:
            self.peak_equity = self.current_equity
            self.trough_equity = self.current_equity
            # Check rebound recovery
            if self.exit_triggered:
                # If we made a new peak, check if rebound condition is met or just clear it
                self.exit_triggered = False
        else:
            if self.current_equity < self.trough_equity:
                self.trough_equity = self.current_equity

        # Check drawdown limit
        if self.drawdown >= self.drawdown_rule.limit:
            self.exit_triggered = True

        # Check rebound if exit triggered
        if self.exit_triggered and self.trough_equity > 0:
            rebound_val = (self.current_equity - self.trough_equity) / self.trough_equity
            if rebound_val >= self.drawdown_rule.rebound and self.current_equity >= self.peak_equity * (1.0 - self.drawdown_rule.limit + self.drawdown_rule.rebound):
                # recovery logic
                pass

    def compute_position_size(self, price, atr=None):
        if price <= 0:
            return 0.0
        max_pos_val = self.current_equity * self.max_position_pct
        max_units_by_pct = max_pos_val / price

        risk_amount = self.current_equity * self.risk_per_trade_pct
        if atr is not None and atr > 0:
            stop_distance = 2.0 * atr
            if stop_distance > 0:
                max_units_by_risk = risk_amount / stop_distance
                return min(max_units_by_pct, max_units_by_risk)
        return max_units_by_pct

    def get_drawdown_status(self):
        return {
            "current_equity": self.current_equity,
            "peak_equity": self.peak_equity,
            "drawdown": self.drawdown,
            "exit_triggered": self.exit_triggered
        }
