"""Dashboard summary: cards, charts, budgets, goals, recent transactions and alerts in one call."""
from datetime import date

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user

from ..models import Transaction, SavingsGoal, Notification, money
from ..services.finance import (totals, category_breakdown, monthly_series, daily_trend, budgets_for_month,
                                goal_to_dict, MONTH_NAMES)
from ..utils import month_bounds, shift_month

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


def pct_change(current, previous):
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


@bp.get("/summary")
@jwt_required()
def summary():
    uid = current_user.id
    today = date.today()
    period = request.args.get("period", "month")  # "month" (this month) or "all" (all time)
    try:
        year = int(request.args.get("year", today.year))
        month = int(request.args.get("month", today.month))
        if not 1 <= month <= 12:
            raise ValueError
    except ValueError:
        year, month = today.year, today.month

    start, end = month_bounds(year, month)
    prev_y, prev_m = shift_month(year, month, -1)
    prev_start, prev_end = month_bounds(prev_y, prev_m)

    all_time = totals(uid)
    this_month = totals(uid, start, end)
    last_month = totals(uid, prev_start, prev_end)
    selected = all_time if period == "all" else this_month

    goals = SavingsGoal.query.filter_by(user_id=uid).all()
    goal_items = sorted((goal_to_dict(g) for g in goals),
                        key=lambda g: (g["status"] == "Completed", -g["progress_percentage"]))
    goal_saved = sum(g["saved_amount"] for g in goal_items)

    budgets = budgets_for_month(uid, year, month)
    recent = Transaction.query.filter_by(user_id=uid) \
        .order_by(Transaction.date.desc(), Transaction.id.desc()).limit(6).all()
    alerts = Notification.query.filter_by(user_id=uid, is_dismissed=False) \
        .order_by(Notification.created_at.desc(), Notification.id.desc()).limit(5).all()
    unread = Notification.query.filter_by(user_id=uid, is_dismissed=False, is_read=False).count()

    trend_end = min(end, today) if (year, month) == (today.year, today.month) else end

    return {
        "period": period,
        "month": month,
        "year": year,
        "period_label": "All time" if period == "all" else f"{MONTH_NAMES[month - 1]} {year}",
        "cards": {
            # Balance is always cumulative: everything earned minus everything spent
            "balance": all_time["balance"],
            "income": selected["income"],
            "expense": selected["expense"],
            "savings": selected["savings"],
            "savings_rate": selected["savings_rate"],
            "goal_savings": money(goal_saved),
            "income_change": pct_change(this_month["income"], last_month["income"]) if period != "all" else None,
            "expense_change": pct_change(this_month["expense"], last_month["expense"]) if period != "all" else None,
            "transaction_count": selected["transaction_count"],
        },
        "income_vs_expense": monthly_series(uid, year, month, months=6),
        "category_expenses": category_breakdown(uid, None if period == "all" else start,
                                                None if period == "all" else end, "expense"),
        "spending_trend": daily_trend(uid, start, trend_end, "expense"),
        "budgets": budgets,
        "goals": goal_items[:4],
        "recent_transactions": [t.to_dict() for t in recent],
        "notifications": [n.to_dict() for n in alerts],
        "unread_notifications": unread,
    }
