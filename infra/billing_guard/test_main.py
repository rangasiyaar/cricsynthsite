import base64
import json

import main


def event(cost, budget):
    data = {"budgetDisplayName": "cricsynthesis-zero-cost", "costAmount": cost, "budgetAmount": budget,
            "currencyCode": "INR", "alertThresholdExceeded": 1.0}
    return {"message": {"data": base64.b64encode(json.dumps(data).encode()).decode()}}


class FakeBilling:
    def __init__(self, enabled=True):
        self.enabled, self.updates = enabled, []

    def get_project_billing_info(self, name):
        return type("Info", (), {"billing_enabled": self.enabled})()

    def update_project_billing_info(self, name, project_billing_info):
        self.updates.append((name, project_billing_info))
        self.enabled = False


def test_below_budget_does_nothing():
    fake = FakeBilling()
    assert main.handle(event(1.0, 100.0), "p", fake) == "ok"
    assert main.handle(event(0, 100.0), "p", fake) == "ok"
    assert fake.updates == []


def test_reaching_budget_unlinks_billing_once():
    fake = FakeBilling()
    assert main.handle(event(100.0, 100.0), "p", fake) == "disabled"
    assert fake.updates == [("projects/p", {"billing_account_name": ""})]
    assert main.handle(event(140.0, 100.0), "p", fake) == "already-disabled"
    assert len(fake.updates) == 1


def test_malformed_budget_is_ignored():
    assert not main.should_disable({"costAmount": 5})
    assert not main.should_disable({"costAmount": 0, "budgetAmount": 1})
