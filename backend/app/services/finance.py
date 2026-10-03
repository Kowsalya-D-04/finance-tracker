"""Financial calculations used by the dashboard, budgets, goals and reports.

Core formulas (from the project specification):
  Balance         = Total income - Total expenses
  Savings         = Income - Expenses for the period (net savings)
  Savings rate %  = Savings / Income x 100
  Budget usage %  = Category expenses for the selected month / Budget limit x 100
  Goal progress % = Saved amount / Target amount x 100
"""
from collections import OrderedDict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, case

from ..extensions import db
from ..models import Transaction, Category, Budget, money
from ..utils import month_bounds, shift_month

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def apply_filters(query, user_id, start=None, end=None, tx_type=None, category_id=None):
    query = query.filter(Transaction.user_id == user_id)
    if start:
        query = query.filter(Transaction.date >= start)
    if end:
        query = query.filter(Transaction.date <= end)
    if tx_type in ("income", "expense"):
        query = query.filter(Transaction.type == tx_type)
    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    return query


def totals(user_id, start=None, end=None, tx_type=None, category_id=None):
    income_sum = func.coalesce(func.sum(case((Transaction.type == "income", Transaction.amount), else_=0)), 0)
    expense_sum = func.coalesce(func.sum(case((Transaction.type == "expense", Transaction.amount), else_=0)), 0)
    query = apply_filters(db.session.query(income_sum, expense_sum, func.count(Transaction.id)),
                          user_id, start, end, tx_type, category_id)
    income, expense, count = query.one()
    income, expense = Decimal(str(income or 0)), Decimal(str(expense or 0))
    savings = income - expense
    return {
        "income": money(income),
        "expense": money(expense),
        "balance": money(income - expense),
        "savings": money(savings),
        "savings_rate": round(float(savings / income * 100), 1) if income > 0 else 0.0,
        "transaction_count": int(count or 0),
    }


def category_breakdown(user_id, start=None, end=None, tx_type="expense", category_id=None):
    query = db.session.query(Category.id, Category.name, Category.colour,
                             func.sum(Transaction.amount), func.count(Transaction.id)) \
        .join(Category, Transaction.category_id == Category.id)
    query = apply_filters(query, user_id, start, end, tx_type, category_id) \
        .group_by(Category.id, Category.name, Category.colour) \
        .order_by(func.sum(Transaction.amount).desc())
    rows = query.all()
    grand_total = sum((Decimal(str(r[3] or 0)) for r in rows), Decimal(0))
    return [
        {
            "category_id": cid, "category": name, "colour": colour,
            "amount": money(amount), "count": int(count),
            "percentage": round(float(Decimal(str(amount)) / grand_total * 100), 1) if grand_total else 0.0,
        }
        for cid, name, colour, amount, count in rows
    ]


def monthly_series(user_id, end_year, end_month, months=6, tx_type=None, category_id=None):
    """Income, expense and savings for each of the last `months` months (oldest first)."""
    start_year, start_month = shift_month(end_year, end_month, -(months - 1))
    start, _ = month_bounds(start_year, start_month)
    _, end = month_bounds(end_year, end_month)

    buckets = OrderedDict()
    for i in range(months):
        y, m = shift_month(start_year, start_month, i)
        buckets[(y, m)] = {"year": y, "month": m, "label": f"{MONTH_NAMES[m - 1]} {str(y)[2:]}",
                           "income": Decimal(0), "expense": Decimal(0)}

    # Aggregated in Python so the same code runs on SQLite and MySQL (their date functions differ)
    rows = apply_filters(db.session.query(Transaction.date, Transaction.type, Transaction.amount),
                         user_id, start, end, tx_type, category_id).all()
    for tx_date, ttype, amount in rows:
        bucket = buckets.get((tx_date.year, tx_date.month))
        if bucket:
            bucket[ttype] += Decimal(str(amount))

    return [{**b, "income": money(b["income"]), "expense": money(b["expense"]),
             "savings": money(b["income"] - b["expense"])} for b in buckets.values()]


def daily_trend(user_id, start, end, tx_type="expense", category_id=None):
    """Daily totals plus a running cumulative total between two dates (max ~1 year)."""
    if (end - start).days > 400:
        start = end - timedelta(days=400)
    rows = apply_filters(db.session.query(Transaction.date, func.sum(Transaction.amount)),
                         user_id, start, end, tx_type, category_id) \
        .group_by(Transaction.date).order_by(Transaction.date).all()
    by_day = {d: Decimal(str(a)) for d, a in rows}
    series, running, day = [], Decimal(0), start
    while day <= end:
        amount = by_day.get(day, Decimal(0))
        running += amount
        series.append({"date": day.isoformat(), "label": day.strftime("%d %b"),
                       "amount": money(amount), "cumulative": money(running)})
        day += timedelta(days=1)
    return series


def budget_status(budget):
    start, end = month_bounds(budget.year, budget.month)
    spent = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == budget.user_id,
        Transaction.category_id == budget.category_id,
        Transaction.type == "expense",
        Transaction.date >= start, Transaction.date <= end,
    ).scalar()
    spent = Decimal(str(spent or 0))
    limit = Decimal(str(budget.limit_amount))
    usage = float(spent / limit * 100) if limit > 0 else 0.0
    if spent > limit:
        status = "Exceeded"
    elif usage >= budget.alert_threshold:
        status = "Near Limit"
    else:
        status = "Under Budget"
    return {
        "id": budget.id,
        "category_id": budget.category_id,
        "category": budget.category.name,
        "colour": budget.category.colour,
        "month": budget.month,
        "year": budget.year,
        "period": f"{MONTH_NAMES[budget.month - 1]} {budget.year}",
        "limit_amount": money(limit),
        "spent": money(spent),
        "remaining": money(limit - spent),
        "usage_percentage": round(usage, 1),
        "alert_threshold": budget.alert_threshold,
        "status": status,
    }


def budgets_for_month(user_id, year, month):
    budgets = Budget.query.filter_by(user_id=user_id, year=year, month=month).all()
    result = [budget_status(b) for b in budgets]
    return sorted(result, key=lambda b: -b["usage_percentage"])


def goal_to_dict(goal, include_contributions=False):
    target, saved = Decimal(str(goal.target_amount)), Decimal(str(goal.saved_amount))
    progress = float(saved / target * 100) if target > 0 else 0.0
    days_left = (goal.target_date - date.today()).days if goal.target_date else None
    if goal.status == "completed":
        status = "Completed"
    elif days_left is not None and days_left < 0:
        status = "Overdue"
    else:
        status = "In Progress"
    data = {
        "id": goal.id,
        "title": goal.title,
        "goal_type": goal.goal_type,
        "target_amount": money(target),
        "saved_amount": money(saved),
        "remaining": money(max(target - saved, Decimal(0))),
        "progress_percentage": round(min(progress, 100.0), 1),
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "days_left": days_left,
        "status": status,
        "monthly_needed": None,
        "created_at": goal.created_at.isoformat() + "Z",
    }
    # Amount to save per month to reach the target by the target date
    if status == "In Progress" and days_left is not None and days_left > 0 and saved < target:
        months_left = max(days_left / 30.44, 1)
        data["monthly_needed"] = money((target - saved) / Decimal(str(round(months_left, 4))))
    if include_contributions:
        data["contributions"] = [c.to_dict() for c in goal.contributions]
    return data
