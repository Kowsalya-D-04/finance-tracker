"""Monthly category budgets."""
from datetime import date

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user

from ..extensions import db
from ..models import Budget, Category, money
from ..services.finance import budget_status, budgets_for_month
from ..services.notifications import check_budget
from ..utils import (ApiError, require_json, parse_amount, parse_int, get_owned_or_404, currency_symbol,
                     shift_month)

bp = Blueprint("budgets", __name__, url_prefix="/api/budgets")


def _validate(data, user_id, existing=None):
    errors = {}
    get = lambda key: data.get(key, getattr(existing, key) if existing else None)
    month = parse_int(get("month"), "month", errors, 1, 12)
    year = parse_int(get("year"), "year", errors, 2000, 2100)
    limit = parse_amount(get("limit_amount"), "limit_amount", errors)
    threshold = parse_int(get("alert_threshold") or 80, "alert_threshold", errors, 50, 100)

    category = None
    try:
        category = db.session.get(Category, int(get("category_id")))
    except (TypeError, ValueError):
        pass
    if category is None or category.user_id != user_id:
        errors["category_id"] = "Choose a category."
    elif category.type != "expense":
        errors["category_id"] = "Budgets can only be set for expense categories."

    if not errors:
        dup = Budget.query.filter_by(user_id=user_id, category_id=category.id, month=month, year=year)
        if existing:
            dup = dup.filter(Budget.id != existing.id)
        if dup.first():
            errors["category_id"] = f"A {category.name} budget already exists for this month."
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)
    return dict(category_id=category.id, month=month, year=year, limit_amount=limit, alert_threshold=threshold)


def _summary(items):
    total_limit = sum(b["limit_amount"] for b in items)
    total_spent = sum(b["spent"] for b in items)
    return {
        "total_limit": money(total_limit),
        "total_spent": money(total_spent),
        "total_remaining": money(total_limit - total_spent),
        "usage_percentage": round(total_spent / total_limit * 100, 1) if total_limit else 0,
        "exceeded": sum(1 for b in items if b["status"] == "Exceeded"),
        "near_limit": sum(1 for b in items if b["status"] == "Near Limit"),
    }


@bp.get("")
@jwt_required()
def list_budgets():
    today = date.today()
    errors = {}
    month = parse_int(request.args.get("month", today.month), "month", errors, 1, 12)
    year = parse_int(request.args.get("year", today.year), "year", errors, 2000, 2100)
    if errors:
        raise ApiError("Invalid month or year.", 422, errors)
    items = budgets_for_month(current_user.id, year, month)
    return {"budgets": items, "summary": _summary(items), "month": month, "year": year}


@bp.post("")
@jwt_required()
def create_budget():
    values = _validate(require_json(request), current_user.id)
    budget = Budget(user_id=current_user.id, **values)
    db.session.add(budget)
    db.session.flush()
    check_budget(budget, currency_symbol(current_user))  # spending may already be near/over the new limit
    db.session.commit()
    return {"message": "Budget created.", "budget": budget_status(budget)}, 201


@bp.put("/<int:budget_id>")
@jwt_required()
def update_budget(budget_id):
    budget = get_owned_or_404(Budget, budget_id, current_user.id, "Budget")
    values = _validate(require_json(request), current_user.id, budget)
    for key, value in values.items():
        setattr(budget, key, value)
    db.session.flush()
    check_budget(budget, currency_symbol(current_user))
    db.session.commit()
    return {"message": "Budget updated.", "budget": budget_status(budget)}


@bp.delete("/<int:budget_id>")
@jwt_required()
def delete_budget(budget_id):
    budget = get_owned_or_404(Budget, budget_id, current_user.id, "Budget")
    db.session.delete(budget)
    db.session.commit()
    return {"message": "Budget deleted."}


@bp.post("/copy-previous")
@jwt_required()
def copy_previous():
    """Copy last month's budgets into the selected month (skips categories that already have one)."""
    data = require_json(request)
    errors = {}
    month = parse_int(data.get("month"), "month", errors, 1, 12)
    year = parse_int(data.get("year"), "year", errors, 2000, 2100)
    if errors:
        raise ApiError("Invalid month or year.", 422, errors)
    py, pm = shift_month(year, month, -1)
    previous = Budget.query.filter_by(user_id=current_user.id, year=py, month=pm).all()
    if not previous:
        raise ApiError("There are no budgets in the previous month to copy.", 404)
    existing = {b.category_id for b in Budget.query.filter_by(user_id=current_user.id, year=year, month=month)}
    created = 0
    for b in previous:
        if b.category_id not in existing:
            nb = Budget(user_id=current_user.id, category_id=b.category_id, month=month, year=year,
                        limit_amount=b.limit_amount, alert_threshold=b.alert_threshold)
            db.session.add(nb)
            db.session.flush()
            check_budget(nb, currency_symbol(current_user))
            created += 1
    db.session.commit()
    return {"message": f"Copied {created} budget(s) from the previous month.", "created": created}
