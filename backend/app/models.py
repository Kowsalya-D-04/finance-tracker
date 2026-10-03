"""Database models.

Every financial record carries a user_id foreign key so that data is isolated per user.
Money is stored as Numeric(12, 2) (DECIMAL in MySQL) to avoid floating-point rounding errors.
"""
from datetime import datetime, date, timezone

from werkzeug.security import generate_password_hash, check_password_hash

from .extensions import db

TRANSACTION_TYPES = ("income", "expense")
PAYMENT_METHODS = ("Cash", "UPI", "Credit Card", "Debit Card", "Bank Transfer", "Wallet", "Other")
GOAL_TYPES = ("Emergency Fund", "New Laptop", "Bike", "Vacation", "Education", "House", "Other")

DEFAULT_CATEGORIES = {
    "income": [
        ("Salary", "#1F7A5C"), ("Freelance", "#2F9E78"), ("Business", "#3D8B9E"),
        ("Investment", "#5B7FC7"), ("Bonus", "#8A6FC2"), ("Other Income", "#7C8B84"),
    ],
    "expense": [
        ("Food", "#E07A2E"), ("Rent", "#B5473A"), ("Transport", "#D9A21B"),
        ("Shopping", "#C2528B"), ("Bills", "#6D5BD0"), ("Healthcare", "#D2455A"),
        ("Education", "#2E86C1"), ("Entertainment", "#9B59B6"), ("Travel", "#17A2A2"),
        ("EMI", "#7A5230"), ("Other", "#8C9590"),
    ],
}


def utcnow():
    """Naive UTC timestamp (works the same on SQLite and MySQL DATETIME columns)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_utc(value):
    return value.isoformat() + "Z" if value else None


def money(value):
    """Convert a Decimal/None to a float rounded to 2 places for JSON output."""
    return round(float(value or 0), 2)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="INR")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    categories = db.relationship("Category", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    transactions = db.relationship("Transaction", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    budgets = db.relationship("Budget", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    goals = db.relationship("SavingsGoal", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    notifications = db.relationship("Notification", backref="user", cascade="all, delete-orphan", lazy="dynamic")

    def set_password(self, password):
        # Werkzeug uses a salted scrypt/pbkdf2 hash; the plain password is never stored
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "currency": self.currency,
            "created_at": iso_utc(self.created_at),
        }


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (db.UniqueConstraint("user_id", "name", "type", name="uq_category_user_name_type"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(50), nullable=False)
    type = db.Column(db.String(10), nullable=False)  # income | expense
    colour = db.Column(db.String(7), nullable=False, default="#8C9590")
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_dict(self, usage_count=None):
        data = {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "colour": self.colour,
            "is_default": self.is_default,
        }
        if usage_count is not None:
            data["usage_count"] = usage_count
        return data


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False, index=True)
    type = db.Column(db.String(10), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    payment_method = db.Column(db.String(20), nullable=False, default="Cash")
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    category = db.relationship("Category")

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "amount": money(self.amount),
            "date": self.date.isoformat(),
            "payment_method": self.payment_method,
            "note": self.note or "",
            "category_id": self.category_id,
            "category": self.category.name if self.category else None,
            "category_colour": self.category.colour if self.category else None,
        }


class Budget(db.Model):
    __tablename__ = "budgets"
    # One budget per user + category + month + year (prevents duplicates at database level)
    __table_args__ = (
        db.UniqueConstraint("user_id", "category_id", "month", "year", name="uq_budget_user_cat_month_year"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    month = db.Column(db.Integer, nullable=False)  # 1-12
    year = db.Column(db.Integer, nullable=False)
    limit_amount = db.Column(db.Numeric(12, 2), nullable=False)
    alert_threshold = db.Column(db.Integer, nullable=False, default=80)  # % of limit that triggers a warning
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    category = db.relationship("Category")


class SavingsGoal(db.Model):
    __tablename__ = "savings_goals"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = db.Column(db.String(100), nullable=False)
    goal_type = db.Column(db.String(30), nullable=False, default="Other")
    target_amount = db.Column(db.Numeric(12, 2), nullable=False)
    saved_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    target_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(12), nullable=False, default="active")  # active | completed
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    contributions = db.relationship("GoalContribution", backref="goal", cascade="all, delete-orphan",
                                    order_by="GoalContribution.date.desc()", lazy="select")


class GoalContribution(db.Model):
    """History of amounts added to a savings goal."""
    __tablename__ = "goal_contributions"

    id = db.Column(db.Integer, primary_key=True)
    goal_id = db.Column(db.Integer, db.ForeignKey("savings_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    date = db.Column(db.Date, nullable=False, default=date.today)
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        return {"id": self.id, "amount": money(self.amount), "date": self.date.isoformat(), "note": self.note or ""}


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(30), nullable=False)  # budget_warning | budget_exceeded | goal_progress | goal_completed
    title = db.Column(db.String(120), nullable=False)
    message = db.Column(db.String(255), nullable=False)
    # Unique key for the event (e.g. "budget:12:exceeded") so the same alert is not raised twice
    ref_key = db.Column(db.String(80), nullable=True, index=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    # Dismissed alerts are hidden but kept, so their ref_key still prevents duplicate alerts
    is_dismissed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "message": self.message,
            "is_read": self.is_read,
            "created_at": iso_utc(self.created_at),
        }


def create_default_categories(user):
    """Give every new user their own copy of the default categories."""
    for ctype, items in DEFAULT_CATEGORIES.items():
        for name, colour in items:
            db.session.add(Category(user_id=user.id, name=name, type=ctype, colour=colour, is_default=True))
