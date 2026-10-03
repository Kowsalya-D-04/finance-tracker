"""Transaction CRUD with search, filter, sort and pagination."""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy import or_, func

from ..extensions import db
from ..models import Transaction, Category, TRANSACTION_TYPES, PAYMENT_METHODS
from ..services.notifications import check_budgets_for
from ..services.finance import totals
from ..utils import (ApiError, require_json, clean_str, parse_amount, parse_date, get_owned_or_404,
                     currency_symbol)

bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")

SORT_FIELDS = {
    "date": Transaction.date,
    "amount": Transaction.amount,
    "type": Transaction.type,
    "category": Category.name,
    "payment_method": Transaction.payment_method,
}


def filtered_query(user_id, args):
    """Build a transaction query from request filters. Shared with the reports module."""
    errors = {}
    query = Transaction.query.join(Category, Transaction.category_id == Category.id) \
        .filter(Transaction.user_id == user_id)

    tx_type = (args.get("type") or "").lower()
    if tx_type in TRANSACTION_TYPES:
        query = query.filter(Transaction.type == tx_type)
    if args.get("category_id"):
        try:
            query = query.filter(Transaction.category_id == int(args["category_id"]))
        except ValueError:
            errors["category_id"] = "Invalid category."
    if args.get("payment_method") in PAYMENT_METHODS:
        query = query.filter(Transaction.payment_method == args["payment_method"])
    start = parse_date(args.get("start_date"), "start_date", errors, required=False)
    end = parse_date(args.get("end_date"), "end_date", errors, required=False)
    if start:
        query = query.filter(Transaction.date >= start)
    if end:
        query = query.filter(Transaction.date <= end)
    if start and end and start > end:
        errors["end_date"] = "End date must be on or after the start date."
    for key in ("min_amount", "max_amount"):
        if args.get(key):
            value = parse_amount(args[key], key, errors, allow_zero=True)
            if value is not None:
                query = query.filter(Transaction.amount >= value if key == "min_amount" else Transaction.amount <= value)
    search = clean_str(args.get("search"), 100)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(or_(func.lower(Transaction.note).like(like), func.lower(Category.name).like(like),
                                 func.lower(Transaction.payment_method).like(like)))
    if errors:
        raise ApiError("Invalid filters.", 422, errors)
    return query, start, end


def _validate(data, user_id, existing=None):
    errors = {}
    get = lambda key: data.get(key, getattr(existing, key) if existing else None)

    tx_type = clean_str(get("type")).lower()
    if tx_type not in TRANSACTION_TYPES:
        errors["type"] = "Choose Income or Expense."
    amount = parse_amount(get("amount"), "amount", errors)
    tx_date = parse_date(get("date"), "date", errors)
    method = clean_str(get("payment_method") or "Cash")
    if method not in PAYMENT_METHODS:
        errors["payment_method"] = "Choose a valid payment method."
    note = clean_str(get("note"), 255)

    category = None
    try:
        category = db.session.get(Category, int(get("category_id")))
    except (TypeError, ValueError):
        pass
    if category is None or category.user_id != user_id:
        errors["category_id"] = "Choose a category."
    elif tx_type in TRANSACTION_TYPES and category.type != tx_type:
        # Business rule: category type must match transaction type
        errors["category_id"] = f"{category.name} is an {category.type} category and cannot be used for {tx_type}."

    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)
    return dict(type=tx_type, amount=amount, date=tx_date, payment_method=method, note=note,
                category_id=category.id)


@bp.get("")
@jwt_required()
def list_transactions():
    uid = current_user.id
    query, start, end = filtered_query(uid, request.args)

    sort_by = request.args.get("sort_by", "date")
    sort_col = SORT_FIELDS.get(sort_by, Transaction.date)
    descending = request.args.get("sort_dir", "desc") != "asc"
    query = query.order_by(sort_col.desc() if descending else sort_col.asc(), Transaction.id.desc())

    try:
        page = max(int(request.args.get("page", 1)), 1)
        per_page = min(max(int(request.args.get("per_page", 20)), 1), 200)
    except ValueError:
        page, per_page = 1, 20

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    # Summary of everything matching the filters (not just this page)
    ids_subq = query.with_entities(Transaction.id).subquery()
    inc = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.id.in_(db.select(ids_subq.c.id)), Transaction.type == "income").scalar()
    exp = db.session.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.id.in_(db.select(ids_subq.c.id)), Transaction.type == "expense").scalar()

    return {
        "transactions": [t.to_dict() for t in items],
        "pagination": {"page": page, "per_page": per_page, "total": total,
                       "pages": max((total + per_page - 1) // per_page, 1)},
        "summary": {"income": round(float(inc), 2), "expense": round(float(exp), 2),
                    "net": round(float(inc) - float(exp), 2), "count": total},
        "payment_methods": list(PAYMENT_METHODS),
    }


@bp.get("/<int:tx_id>")
@jwt_required()
def get_transaction(tx_id):
    tx = get_owned_or_404(Transaction, tx_id, current_user.id, "Transaction")
    return {"transaction": tx.to_dict()}


@bp.post("")
@jwt_required()
def create_transaction():
    uid = current_user.id
    values = _validate(require_json(request), uid)
    tx = Transaction(user_id=uid, **values)
    db.session.add(tx)
    db.session.flush()
    if tx.type == "expense":
        check_budgets_for(uid, tx.category_id, [tx.date], currency_symbol(current_user))
    db.session.commit()
    return {"message": f"{tx.type.capitalize()} saved.", "transaction": tx.to_dict(),
            "totals": totals(uid)}, 201


@bp.put("/<int:tx_id>")
@jwt_required()
def update_transaction(tx_id):
    uid = current_user.id
    tx = get_owned_or_404(Transaction, tx_id, uid, "Transaction")
    old = (tx.type, tx.category_id, tx.date)
    values = _validate(require_json(request), uid, tx)
    for key, value in values.items():
        setattr(tx, key, value)
    db.session.flush()
    symbol = currency_symbol(current_user)
    if old[0] == "expense":
        check_budgets_for(uid, old[1], [old[2]], symbol)
    if tx.type == "expense":
        check_budgets_for(uid, tx.category_id, [tx.date], symbol)
    db.session.commit()
    return {"message": "Transaction updated.", "transaction": tx.to_dict(), "totals": totals(uid)}


@bp.delete("/<int:tx_id>")
@jwt_required()
def delete_transaction(tx_id):
    uid = current_user.id
    tx = get_owned_or_404(Transaction, tx_id, uid, "Transaction")
    was_expense, cat_id, tx_date = tx.type == "expense", tx.category_id, tx.date
    db.session.delete(tx)
    db.session.flush()
    if was_expense:
        check_budgets_for(uid, cat_id, [tx_date], currency_symbol(current_user))
    db.session.commit()
    return {"message": "Transaction deleted.", "totals": totals(uid)}
