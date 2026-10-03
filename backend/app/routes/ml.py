"""Machine-learning API endpoints."""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user

from ..services.ml import forecast_expenses, predict_category, spending_insights

bp = Blueprint("ml", __name__, url_prefix="/api/ml")


@bp.get("/forecast")
@jwt_required()
def forecast():
    return forecast_expenses(current_user.id)


@bp.post("/predict-category")
@jwt_required()
def category_prediction():
    payload = request.get_json(silent=True) or {}
    return predict_category(current_user.id, payload.get("description", ""))


@bp.get("/insights")
@jwt_required()
def insights():
    return spending_insights(current_user.id)
