"""Registration, login and current-user endpoints."""
from flask import Blueprint, request
from flask_jwt_extended import create_access_token, jwt_required, current_user

from ..extensions import db
from ..models import User, create_default_categories
from ..utils import (ApiError, require_json, clean_str, validate_password, EMAIL_RE,
                     SUPPORTED_CURRENCIES)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/register")
def register():
    data = require_json(request)
    name = clean_str(data.get("name"), 100)
    email = clean_str(data.get("email"), 150).lower()
    password = data.get("password") or ""
    confirm = data.get("confirm_password") or ""
    currency = clean_str(data.get("currency") or "INR").upper()

    errors = {}
    if len(name) < 2:
        errors["name"] = "Full name is required."
    if not EMAIL_RE.match(email):
        errors["email"] = "Enter a valid email address."
    elif User.query.filter_by(email=email).first():
        errors["email"] = "An account with this email already exists."
    pw_error = validate_password(password)
    if pw_error:
        errors["password"] = pw_error
    if password != confirm:
        errors["confirm_password"] = "Passwords do not match."
    if currency not in SUPPORTED_CURRENCIES:
        errors["currency"] = "Choose a supported currency."
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)

    user = User(name=name, email=email, currency=currency)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()  # get user.id
    create_default_categories(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return {"message": "Account created successfully.", "token": token, "user": user.to_dict()}, 201


@bp.post("/login")
def login():
    data = require_json(request)
    email = clean_str(data.get("email")).lower()
    password = data.get("password") or ""
    if not email or not password:
        raise ApiError("Email and password are required.", 422)

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        raise ApiError("Incorrect email or password.", 401)

    token = create_access_token(identity=str(user.id))
    return {"message": "Logged in successfully.", "token": token, "user": user.to_dict()}


@bp.get("/me")
@jwt_required()
def me():
    return {"user": current_user.to_dict()}


@bp.post("/logout")
@jwt_required()
def logout():
    # Tokens are stateless; the client deletes its stored token. Endpoint kept for a clear API contract.
    return {"message": "Logged out."}
