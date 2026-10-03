"""Default and custom categories."""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy import func

from ..extensions import db
from ..models import Category, Transaction, Budget, TRANSACTION_TYPES
from ..utils import ApiError, require_json, clean_str, get_owned_or_404, HEX_COLOUR_RE

bp = Blueprint("categories", __name__, url_prefix="/api/categories")


def _validate(data, user_id, existing=None):
    errors = {}
    name = clean_str(data.get("name", existing.name if existing else ""), 50)
    ctype = clean_str(data.get("type", existing.type if existing else "")).lower()
    colour = clean_str(data.get("colour", existing.colour if existing else "#8C9590"))
    if len(name) < 2:
        errors["name"] = "Category name must be at least 2 characters."
    if ctype not in TRANSACTION_TYPES:
        errors["type"] = "Type must be income or expense."
    if not HEX_COLOUR_RE.match(colour):
        errors["colour"] = "Colour must be a hex value such as #1F7A5C."
    if not errors:
        dup = Category.query.filter(Category.user_id == user_id, func.lower(Category.name) == name.lower(),
                                    Category.type == ctype)
        if existing:
            dup = dup.filter(Category.id != existing.id)
        if dup.first():
            errors["name"] = f"You already have an {ctype} category called {name}."
    if errors:
        raise ApiError("Please correct the highlighted fields.", 422, errors)
    return name, ctype, colour


@bp.get("")
@jwt_required()
def list_categories():
    uid = current_user.id
    ctype = request.args.get("type")
    query = Category.query.filter_by(user_id=uid)
    if ctype in TRANSACTION_TYPES:
        query = query.filter_by(type=ctype)
    usage = dict(db.session.query(Transaction.category_id, func.count(Transaction.id))
                 .filter_by(user_id=uid).group_by(Transaction.category_id).all())
    cats = query.order_by(Category.type.desc(), Category.is_default.desc(), Category.name).all()
    return {"categories": [c.to_dict(usage.get(c.id, 0)) for c in cats]}


@bp.post("")
@jwt_required()
def create_category():
    data = require_json(request)
    name, ctype, colour = _validate(data, current_user.id)
    cat = Category(user_id=current_user.id, name=name, type=ctype, colour=colour, is_default=False)
    db.session.add(cat)
    db.session.commit()
    return {"message": "Category created.", "category": cat.to_dict(0)}, 201


@bp.put("/<int:cat_id>")
@jwt_required()
def update_category(cat_id):
    cat = get_owned_or_404(Category, cat_id, current_user.id, "Category")
    data = require_json(request)
    name, ctype, colour = _validate(data, current_user.id, cat)
    in_use = Transaction.query.filter_by(category_id=cat.id).first() is not None
    if ctype != cat.type and in_use:
        raise ApiError("This category has transactions, so its type cannot be changed.", 409)
    if cat.is_default and (name != cat.name or ctype != cat.type):
        raise ApiError("Default categories can only have their colour changed.", 409)
    cat.name, cat.type, cat.colour = name, ctype, colour
    db.session.commit()
    return {"message": "Category updated.", "category": cat.to_dict()}


@bp.delete("/<int:cat_id>")
@jwt_required()
def delete_category(cat_id):
    cat = get_owned_or_404(Category, cat_id, current_user.id, "Category")
    if cat.is_default:
        raise ApiError("Default categories cannot be deleted.", 409)
    tx_count = Transaction.query.filter_by(category_id=cat.id).count()
    if tx_count:
        raise ApiError(f"This category is used by {tx_count} transaction(s). "
                       "Move or delete those transactions first.", 409)
    Budget.query.filter_by(category_id=cat.id).delete()
    db.session.delete(cat)
    db.session.commit()
    return {"message": "Category deleted."}
