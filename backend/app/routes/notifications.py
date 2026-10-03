"""In-app notifications."""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, current_user

from ..extensions import db
from ..models import Notification
from ..utils import get_owned_or_404

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def visible(user_id):
    return Notification.query.filter_by(user_id=user_id, is_dismissed=False)


def unread_count(user_id):
    return visible(user_id).filter_by(is_read=False).count()


@bp.get("")
@jwt_required()
def list_notifications():
    query = visible(current_user.id)
    if request.args.get("unread") == "true":
        query = query.filter_by(is_read=False)
    kind = request.args.get("kind")  # "budget" or "goal"
    if kind in ("budget", "goal"):
        query = query.filter(Notification.kind.like(f"{kind}%"))
    try:
        limit = min(int(request.args.get("limit", 100)), 500)
    except ValueError:
        limit = 100
    items = query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    return {"notifications": [n.to_dict() for n in items], "unread_count": unread_count(current_user.id)}


@bp.get("/unread-count")
@jwt_required()
def get_unread_count():
    return {"unread_count": unread_count(current_user.id)}


@bp.put("/<int:notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    n = get_owned_or_404(Notification, notification_id, current_user.id, "Notification")
    n.is_read = True
    db.session.commit()
    return {"message": "Marked as read.", "unread_count": unread_count(current_user.id)}


@bp.put("/read-all")
@jwt_required()
def mark_all_read():
    visible(current_user.id).filter_by(is_read=False).update({"is_read": True})
    db.session.commit()
    return {"message": "All notifications marked as read.", "unread_count": 0}


@bp.delete("/<int:notification_id>")
@jwt_required()
def dismiss(notification_id):
    n = get_owned_or_404(Notification, notification_id, current_user.id, "Notification")
    n.is_dismissed, n.is_read = True, True
    db.session.commit()
    return {"message": "Notification removed.", "unread_count": unread_count(current_user.id)}


@bp.delete("")
@jwt_required()
def dismiss_all():
    visible(current_user.id).update({"is_dismissed": True, "is_read": True})
    db.session.commit()
    return {"message": "All notifications cleared.", "unread_count": 0}
