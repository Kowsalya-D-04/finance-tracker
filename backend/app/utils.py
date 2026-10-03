"""Shared helpers: error handling, input validation and ownership lookups."""
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import jsonify
from flask_jwt_extended import get_jwt_identity

from .extensions import db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
HEX_COLOUR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
SUPPORTED_CURRENCIES = ("INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY")
MAX_AMOUNT = Decimal("9999999999.99")


class ApiError(Exception):
    """Raise anywhere in a request to return a JSON error response."""

    def __init__(self, message, status=400, errors=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.errors = errors or {}

    def to_response(self):
        body = {"message": self.message}
        if self.errors:
            body["errors"] = self.errors
        return jsonify(body), self.status


def current_user_id():
    return int(get_jwt_identity())


def get_owned_or_404(model, record_id, user_id, label="Record"):
    """Fetch a record only if it belongs to the user (enforces data isolation)."""
    record = db.session.get(model, record_id)
    if record is None or record.user_id != user_id:
        raise ApiError(f"{label} not found.", 404)
    return record


def require_json(request):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Request body must be a JSON object.")
    return data


def clean_str(value, max_len=None):
    if value is None:
        return ""
    text = str(value).strip()
    return text[:max_len] if max_len else text


def parse_amount(value, field, errors, allow_zero=False):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        errors[field] = "Enter a valid number."
        return None
    if amount.is_nan() or amount < 0 or (amount == 0 and not allow_zero):
        errors[field] = "Amount must be greater than zero." if not allow_zero else "Amount cannot be negative."
        return None
    if amount > MAX_AMOUNT:
        errors[field] = "Amount is too large."
        return None
    return amount


def parse_date(value, field, errors, required=True):
    if value in (None, ""):
        if required:
            errors[field] = "Date is required."
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        errors[field] = "Use the date format YYYY-MM-DD."
        return None


def parse_int(value, field, errors, minimum=None, maximum=None):
    try:
        number = int(value)
    except (TypeError, ValueError):
        errors[field] = "Enter a whole number."
        return None
    if (minimum is not None and number < minimum) or (maximum is not None and number > maximum):
        errors[field] = f"Must be between {minimum} and {maximum}."
        return None
    return number


def validate_password(password):
    """Minimum 8 characters with at least one uppercase letter, one lowercase letter and one digit."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return "Password must contain an uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must contain a lowercase letter."
    if not re.search(r"\d", password):
        return "Password must contain a number."
    return None


def month_bounds(year, month):
    """Return (first_day, last_day) of a month."""
    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1)
    from datetime import timedelta
    return start, end - timedelta(days=1)


def shift_month(year, month, delta):
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


CURRENCY_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "AED ", "SGD": "S$",
                    "AUD": "A$", "CAD": "C$", "JPY": "¥"}


def currency_symbol(user):
    return CURRENCY_SYMBOLS.get(user.currency, user.currency + " ") if user else ""
