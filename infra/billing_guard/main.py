"""Budget kill-switch: unlink billing from the project once spend reaches the budget.

Google Cloud has no hard spending cap; budgets only send notifications. This
function listens to the budget's Pub/Sub topic and, when actual (not
forecast) cost reaches the budget amount, removes the billing account from
the project. Paid services then stop — which is the point: the bill can't
grow. Re-link billing in the console after investigating.
"""
from __future__ import annotations

import base64
import json
import logging
import os

log = logging.getLogger("billing-guard")
logging.basicConfig(level=logging.INFO)

KILL_RATIO = float(os.getenv("KILL_RATIO", "1.0"))   # fraction of the budget that triggers the stop


def should_disable(alert: dict) -> bool:
    """True when actual spend has reached KILL_RATIO × budget."""
    cost = float(alert.get("costAmount", 0) or 0)
    budget = float(alert.get("budgetAmount", 0) or 0)
    if cost <= 0 or budget <= 0:
        return False
    return cost >= budget * KILL_RATIO


def parse(event_data: dict) -> dict:
    """Pub/Sub CloudEvent payload → budget notification dict."""
    raw = event_data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode())


def disable_billing(project_id: str, client=None) -> bool:
    """Returns True if billing was on and has now been removed."""
    if client is None:
        from google.cloud import billing_v1
        client = billing_v1.CloudBillingClient()
    name = f"projects/{project_id}"
    info = client.get_project_billing_info(name=name)
    if not info.billing_enabled:
        log.info("Billing already disabled for %s", project_id)
        return False
    client.update_project_billing_info(name=name, project_billing_info={"billing_account_name": ""})
    log.warning("Billing DISABLED for %s — budget reached", project_id)
    return True


def handle(event_data: dict, project_id: str, client=None) -> str:
    alert = parse(event_data)
    log.info("Budget %s: cost %s of %s %s", alert.get("budgetDisplayName"), alert.get("costAmount"),
             alert.get("budgetAmount"), alert.get("currencyCode"))
    if not should_disable(alert):
        return "ok"
    return "disabled" if disable_billing(project_id, client) else "already-disabled"


try:  # functions-framework is present in the Cloud Run functions runtime
    import functions_framework

    @functions_framework.cloud_event
    def on_budget_message(cloud_event):
        handle(cloud_event.data, os.environ["PROJECT_ID"])
except ImportError:  # local tests
    pass
