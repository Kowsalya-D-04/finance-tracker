"""View and update the logged-in user's profile and password."""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy import func

from ..extensions import db
from ..models import User, Transaction, Budget, SavingsGoal, Category
from ..utils import ApiError, require_json, clean_str, validate_password, EMAIL_RE, SUPPORTED_CURRENCIES

bp = Blueprint("profile", __name__, url_prefix="/api/profile")


@bp.get("")
@jwt_required()
def get_profile():
    uid = current_user.id
    stats = {
        "transactions": db.session.query(func.count(Transaction.id)).filter_by(user_id=uid).scalar(),
        "budgets": db.session.query(func.count(Budget.id)).filter_by(user_id=uid).scalar(),
        "goals": db.session.query(func.count(SavingsGoal.id)).filter_by(user_id=uid).scalar(),
        "categories": db.session.query(func.count(Category.id)).filter_by(user_id=uid).scalar(),
    }
    return {"user": current_user.to_dict(), "stats": stats}


@bp.put("")
@jwt_required()
def update_profile():
    data = require_json(request)
    errors = {}
    name = clean_str(data.get("name", current_user.name), 100)
    email = clean_str(data.get("email", current_user.email), 150).lower()
    currency = clean_str(data.get("currency", current_user.currency)).upper()

    if len(name) < 2:
        errors["name"] = "Full name is required."
    if not EMAIL_RE.match(email):
        errors["email"] = "Enter a valid email address."
    elif email != current_user.email and User.query.filter_by(email=email).first():
        errors["email"] = "Another account already uses this email."
    if currency not in SUPPORTED_CURRENCIES:
        errors["currency"] = "Choose a supported currency."
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)

    current_user.name, current_user.email, current_user.currency = name, email, currency
    db.session.commit()
    return {"message": "Profile updated.", "user": current_user.to_dict()}


@bp.put("/password")
@jwt_required()
def change_password():
    data = require_json(request)
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    confirm = data.get("confirm_password") or ""
    errors = {}
    if not current_user.check_password(current):
        errors["current_password"] = "Current password is incorrect."
    pw_error = validate_password(new)
    if pw_error:
        errors["new_password"] = pw_error
    elif new == current:
        errors["new_password"] = "New password must be different from the current one."
    if new != confirm:
        errors["confirm_password"] = "Passwords do not match."
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)

    current_user.set_password(new)
    db.session.commit()
    return {"message": "Password changed."}
