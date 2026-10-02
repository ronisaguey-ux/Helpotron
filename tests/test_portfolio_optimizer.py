"""Tests for live.portfolio_optimizer module."""

import pytest
import numpy as np
from live.portfolio_optimizer import DrawdownRule, PortfolioOptimizer


class TestDrawdownRule:
    def test_default_values(self):
        rule = DrawdownRule()
        assert rule.limit == 0.20
        assert rule.wait_bars == 10
        assert rule.trailing == 0.10
        assert rule.rebound == 0.05

    def test_from_genome(self):
        genome = [0.0] * 360
        genome[321] = 0.30
        genome[322] = 20
        genome[323] = 0.15
        genome[324] = 0.08
        rule = DrawdownRule.from_genome(genome)
        assert rule.limit == 0.30
        assert rule.wait_bars == 20
        assert rule.trailing == 0.15
        assert rule.rebound == 0.08

    def test_from_genome_clamps(self):
        genome = [0.0] * 360
        genome[321] = 1.5
        genome[322] = -5
        genome[323] = -0.1
        genome[324] = 1.2
        rule = DrawdownRule.from_genome(genome)
        assert rule.limit == 1.0
        assert rule.wait_bars == 0
        assert rule.trailing == 0.0
        assert rule.rebound == 1.0


class TestPortfolioOptimizer:
    def test_initial_state(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        assert opt.current_equity == 100000.0
        assert opt.peak_equity == 100000.0
        assert opt.drawdown == 0.0
        assert opt.exit_triggered is False
        assert opt.can_trade() is True

    def test_update_equity_peak(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        opt.update_equity(110000.0)
        assert opt.peak_equity == 110000.0
        assert opt.drawdown == 0.0
        assert opt.should_exit() is False

    def test_update_equity_drawdown(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        opt.update_equity(100000.0)
        opt.update_equity(80000.0)
        assert opt.drawdown == 0.20
        assert opt.should_exit() is True
        assert opt.can_trade() is False

    def test_update_equity_recovery(self):
        opt = PortfolioOptimizer(initial_equity=100000.0, drawdown_rule=DrawdownRule(limit=0.20, rebound=0.05))
        opt.update_equity(100000.0)
        opt.update_equity(80000.0)  # exit triggered
        assert opt.should_exit() is True
        # Simulate recovery: new peak above old peak, rebound from low is 25% (101-80)/80=0.2625 > 0.05
        opt.update_equity(101000.0)  # new peak, rebound check should clear exit_triggered
        assert opt.should_exit() is False
        assert opt.can_trade() is True

    def test_compute_position_size_without_atr(self):
        opt = PortfolioOptimizer(initial_equity=100000.0, max_position_pct=0.2, risk_per_trade_pct=0.02)
        opt.update_equity(100000.0)
        size = opt.compute_position_size(price=100.0)
        # max_position_value = 20000, price=100 => max_units=200
        assert size == 200.0

    def test_compute_position_size_with_atr(self):
        opt = PortfolioOptimizer(initial_equity=100000.0, max_position_pct=0.2, risk_per_trade_pct=0.02)
        opt.update_equity(100000.0)
        # risk_amount = 2000, stop_distance = 2 * 5 = 10, size = 2000/10 = 200
        size = opt.compute_position_size(price=100.0, atr=5.0)
        assert size == 200.0
        # with larger ATR, size smaller
        size2 = opt.compute_position_size(price=100.0, atr=10.0)
        assert size2 == 100.0  # 2000 / 20 = 100

    def test_compute_position_size_zero_price(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        opt.update_equity(100000.0)
        size = opt.compute_position_size(price=0.0)
        assert size == 0.0

    def test_can_trade_after_exit(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        opt.update_equity(100000.0)
        opt.update_equity(80000.0)
        assert opt.can_trade() is False
        # Recover
        opt.update_equity(110000.0)
        # Should still be in exit mode until rebound threshold met
        # With default rebound=0.05, recovery from 80k to 110k is 37.5% > 5%, so it should clear
        assert opt.can_trade() is True

    def test_get_drawdown_status(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        opt.update_equity(90000.0)
        status = opt.get_drawdown_status()
        assert status["current_equity"] == 90000.0
        assert status["peak_equity"] == 100000.0
        assert status["drawdown"] == 0.10
        assert status["exit_triggered"] is False

    def test_genome_integration(self):
        genome = [0.0] * 360
        genome[321] = 0.25
        genome[322] = 15
        genome[323] = 0.12
        genome[324] = 0.06
        opt = PortfolioOptimizer(genome=genome, initial_equity=50000.0)
        assert opt.drawdown_rule.limit == 0.25
        assert opt.drawdown_rule.wait_bars == 15
        assert opt.drawdown_rule.trailing == 0.12
        assert opt.drawdown_rule.rebound == 0.06

    def test_adversarial_extreme_equity(self):
        opt = PortfolioOptimizer(initial_equity=1e15)
        opt.update_equity(1e-5)
        assert opt.drawdown >= 0.0

    def test_adversarial_zero_or_negative_atr(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        opt.update_equity(100000.0)
        assert opt.compute_position_size(price=100.0, atr=0.0) >= 0.0
        assert opt.compute_position_size(price=100.0, atr=-5.0) >= 0.0

    def test_adversarial_negative_prices(self):
        opt = PortfolioOptimizer(initial_equity=100000.0)
        opt.update_equity(100000.0)
        assert opt.compute_position_size(price=-50.0) == 0.0
