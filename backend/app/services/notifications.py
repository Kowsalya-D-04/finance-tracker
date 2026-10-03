"""Creates in-app notifications for budget thresholds and savings-goal milestones.

Each alert has a ref_key (for example "budget:4:exceeded") so it is raised only once.
If spending later drops back below a level (a transaction was edited or deleted),
the key is released so the alert is raised again if that level is crossed again.
"""
from decimal import Decimal

from ..extensions import db
from ..models import Budget, Notification, money
from .finance import budget_status, MONTH_NAMES

GOAL_MILESTONES = (25, 50, 75)


def _exists(user_id, ref_key):
    return Notification.query.filter_by(user_id=user_id, ref_key=ref_key).first() is not None


def _release(user_id, ref_key):
    for n in Notification.query.filter_by(user_id=user_id, ref_key=ref_key).all():
        n.ref_key = None


def _notify(user_id, kind, title, message, ref_key, is_read=False):
    db.session.add(Notification(user_id=user_id, kind=kind, title=title, message=message,
                                ref_key=ref_key, is_read=is_read))


def fmt(symbol, value):
    return f"{symbol}{value:,.2f}"


def check_budget(budget, symbol=""):
    db.session.flush()  # make sure pending transaction changes are included in the totals
    info = budget_status(budget)
    uid = budget.user_id
    warn_key, over_key = f"budget:{budget.id}:warning", f"budget:{budget.id}:exceeded"
    period = f"{MONTH_NAMES[budget.month - 1]} {budget.year}"
    name = info["category"]

    if info["status"] == "Exceeded":
        if not _exists(uid, warn_key):  # record that the warning level was passed, silently
            _notify(uid, "budget_warning", f"{name} budget near limit ({period})",
                    f"{name} spending passed {budget.alert_threshold}% of the {period} budget.",
                    warn_key, is_read=True)
        if not _exists(uid, over_key):
            _notify(uid, "budget_exceeded", f"{name} budget exceeded ({period})",
                    f"{period}: spent {fmt(symbol, info['spent'])} of a {fmt(symbol, info['limit_amount'])} "
                    f"limit ({info['usage_percentage']:.0f}%). Over by {fmt(symbol, -info['remaining'])}.",
                    over_key)
    elif info["status"] == "Near Limit":
        _release(uid, over_key)
        if not _exists(uid, warn_key):
            _notify(uid, "budget_warning", f"{name} budget near limit ({period})",
                    f"{period}: {info['usage_percentage']:.0f}% of your {name} budget is used. "
                    f"{fmt(symbol, info['remaining'])} left.", warn_key)
    else:
        _release(uid, over_key)
        _release(uid, warn_key)
    return info


def check_budgets_for(user_id, category_id, dates, symbol=""):
    """Re-check the budgets affected by a transaction change on the given date(s)."""
    seen = set()
    for d in dates:
        if d is None or (d.year, d.month) in seen:
            continue
        seen.add((d.year, d.month))
        budget = Budget.query.filter_by(user_id=user_id, category_id=category_id,
                                        year=d.year, month=d.month).first()
        if budget:
            check_budget(budget, symbol)


def check_goal(goal, symbol=""):
    target, saved = Decimal(str(goal.target_amount)), Decimal(str(goal.saved_amount))
    progress = float(saved / target * 100) if target > 0 else 0
    uid, gid = goal.user_id, goal.id
    done_key = f"goal:{gid}:100"

    if saved >= target:
        goal.status = "completed"
        if not _exists(uid, done_key):
            _notify(uid, "goal_completed", f"Goal reached: {goal.title}",
                    f"You saved {fmt(symbol, money(saved))} and completed your {goal.title} goal.", done_key)
        return
    goal.status = "active"
    _release(uid, done_key)

    reached = [m for m in GOAL_MILESTONES if progress >= m]
    for m in GOAL_MILESTONES:
        if m not in reached:
            _release(uid, f"goal:{gid}:{m}")
    if not reached:
        return
    top = reached[-1]
    if _exists(uid, f"goal:{gid}:{top}"):
        return
    # Lower milestones passed in the same step are recorded as already read, to avoid a burst of alerts
    for m in reached[:-1]:
        if not _exists(uid, f"goal:{gid}:{m}"):
            _notify(uid, "goal_progress", f"{goal.title}: {m}% saved",
                    f"{goal.title} passed {m}% of its target.", f"goal:{gid}:{m}", is_read=True)
    _notify(uid, "goal_progress", f"{goal.title}: {top}% saved",
            f"Saved {fmt(symbol, money(saved))} of {fmt(symbol, money(target))}. "
            f"{fmt(symbol, money(target - saved))} to go.", f"goal:{gid}:{top}")
