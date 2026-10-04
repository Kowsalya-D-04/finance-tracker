"""Personal finance chatbot API."""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user

from ..services.chatbot import answer_finance_question
from ..utils import ApiError

bp = Blueprint("chatbot", __name__, url_prefix="/api/chatbot")


@bp.post("/message")
@jwt_required()
def message():
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("message", "")).strip()
    if not text:
        raise ApiError("Please enter a message.", 400)
    if len(text) > 500:
        raise ApiError("Message is too long. Please keep it under 500 characters.", 400)
    return answer_finance_question(current_user.id, text)


@bp.get("/suggestions")
@jwt_required()
def suggestions():
    return {
        "suggestions": [
            "What is my current balance?",
            "How much did I spend this month?",
            "Which category costs the most?",
            "How are my budgets?",
            "Show my savings goals",
            "Show recent transactions",
            "Predict next month's expenses",
            "How can I save more?",
        ]
    }
