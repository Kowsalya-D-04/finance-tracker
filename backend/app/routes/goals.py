"""Savings goals and contributions."""
from decimal import Decimal
from datetime import date

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user

from ..extensions import db
from ..models import SavingsGoal, GoalContribution, GOAL_TYPES, money
from ..services.finance import goal_to_dict
from ..services.notifications import check_goal
from ..utils import (ApiError, require_json, clean_str, parse_amount, parse_date, get_owned_or_404,
                     currency_symbol)

bp = Blueprint("goals", __name__, url_prefix="/api/goals")


def _validate(data, existing=None):
    errors = {}
    title = clean_str(data.get("title", existing.title if existing else ""), 100)
    goal_type = clean_str(data.get("goal_type", existing.goal_type if existing else "Other"))
    target = parse_amount(data.get("target_amount", existing.target_amount if existing else None),
                          "target_amount", errors)
    target_date = parse_date(data.get("target_date", existing.target_date if existing else None),
                             "target_date", errors, required=False)
    if len(title) < 2:
        errors["title"] = "Goal title is required."
    if goal_type not in GOAL_TYPES:
        errors["goal_type"] = "Choose a goal type."
    if target_date and not existing and target_date < date.today():
        errors["target_date"] = "Target date must be today or later."
    return title, goal_type, target, target_date, errors


@bp.get("")
@jwt_required()
def list_goals():
    goals = SavingsGoal.query.filter_by(user_id=current_user.id) \
        .order_by(SavingsGoal.status, SavingsGoal.target_date.is_(None), SavingsGoal.target_date).all()
    items = [goal_to_dict(g) for g in goals]
    total_target = sum(g["target_amount"] for g in items)
    total_saved = sum(g["saved_amount"] for g in items)
    return {
        "goals": items,
        "goal_types": list(GOAL_TYPES),
        "summary": {
            "total_target": money(total_target), "total_saved": money(total_saved),
            "total_remaining": money(sum(g["remaining"] for g in items)),
            "overall_progress": round(total_saved / total_target * 100, 1) if total_target else 0,
            "completed": sum(1 for g in items if g["status"] == "Completed"),
            "active": sum(1 for g in items if g["status"] != "Completed"),
        },
    }


@bp.get("/<int:goal_id>")
@jwt_required()
def get_goal(goal_id):
    goal = get_owned_or_404(SavingsGoal, goal_id, current_user.id, "Goal")
    return {"goal": goal_to_dict(goal, include_contributions=True)}


@bp.post("")
@jwt_required()
def create_goal():
    data = require_json(request)
    title, goal_type, target, target_date, errors = _validate(data)
    initial = parse_amount(data.get("saved_amount") or 0, "saved_amount", errors, allow_zero=True)
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)

    goal = SavingsGoal(user_id=current_user.id, title=title, goal_type=goal_type, target_amount=target,
                       saved_amount=initial, target_date=target_date)
    db.session.add(goal)
    db.session.flush()
    if initial > 0:
        db.session.add(GoalContribution(goal_id=goal.id, amount=initial, note="Initial saved amount"))
    check_goal(goal, currency_symbol(current_user))
    db.session.commit()
    return {"message": "Savings goal created.", "goal": goal_to_dict(goal)}, 201


@bp.put("/<int:goal_id>")
@jwt_required()
def update_goal(goal_id):
    goal = get_owned_or_404(SavingsGoal, goal_id, current_user.id, "Goal")
    title, goal_type, target, target_date, errors = _validate(require_json(request), goal)
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)
    goal.title, goal.goal_type, goal.target_amount, goal.target_date = title, goal_type, target, target_date
    db.session.flush()
    check_goal(goal, currency_symbol(current_user))
    db.session.commit()
    return {"message": "Goal updated.", "goal": goal_to_dict(goal)}


@bp.delete("/<int:goal_id>")
@jwt_required()
def delete_goal(goal_id):
    goal = get_owned_or_404(SavingsGoal, goal_id, current_user.id, "Goal")
    db.session.delete(goal)
    db.session.commit()
    return {"message": "Goal deleted."}


@bp.post("/<int:goal_id>/contributions")
@jwt_required()
def add_contribution(goal_id):
    """Add money to a goal. Send "withdraw": true to take money out instead."""
    goal = get_owned_or_404(SavingsGoal, goal_id, current_user.id, "Goal")
    data = require_json(request)
    errors = {}
    amount = parse_amount(data.get("amount"), "amount", errors)
    c_date = parse_date(data.get("date") or date.today().isoformat(), "date", errors)
    note = clean_str(data.get("note"), 255)
    withdraw = bool(data.get("withdraw"))
    if amount is not None and withdraw and amount > Decimal(str(goal.saved_amount)):
        errors["amount"] = "You cannot withdraw more than the saved amount."
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)

    signed = -amount if withdraw else amount
    goal.saved_amount = Decimal(str(goal.saved_amount)) + signed
    db.session.add(GoalContribution(goal_id=goal.id, amount=signed, date=c_date,
                                    note=note or ("Withdrawal" if withdraw else "")))
    db.session.flush()
    check_goal(goal, currency_symbol(current_user))
    db.session.commit()
    verb = "withdrawn from" if withdraw else "added to"
    return {"message": f"Amount {verb} {goal.title}.", "goal": goal_to_dict(goal, include_contributions=True)}


@bp.delete("/<int:goal_id>/contributions/<int:contribution_id>")
@jwt_required()
def delete_contribution(goal_id, contribution_id):
    goal = get_owned_or_404(SavingsGoal, goal_id, current_user.id, "Goal")
    contribution = db.session.get(GoalContribution, contribution_id)
    if contribution is None or contribution.goal_id != goal.id:
        raise ApiError("Contribution not found.", 404)
    new_saved = Decimal(str(goal.saved_amount)) - Decimal(str(contribution.amount))
    if new_saved < 0:
        raise ApiError("Removing this entry would make the saved amount negative.", 409)
    goal.saved_amount = new_saved
    db.session.delete(contribution)
    db.session.flush()
    check_goal(goal, currency_symbol(current_user))
    db.session.commit()
    return {"message": "Entry removed.", "goal": goal_to_dict(goal, include_contributions=True)}
