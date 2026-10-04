"""Flask application factory."""
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from config import Config
from .extensions import db, jwt, cors
from .utils import ApiError


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.json.sort_keys = False

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
                  expose_headers=["Content-Disposition"])

    from .routes.auth import bp as auth_bp
    from .routes.profile import bp as profile_bp
    from .routes.categories import bp as categories_bp
    from .routes.transactions import bp as transactions_bp
    from .routes.budgets import bp as budgets_bp
    from .routes.goals import bp as goals_bp
    from .routes.dashboard import bp as dashboard_bp
    from .routes.reports import bp as reports_bp
    from .routes.notifications import bp as notifications_bp
    from .routes.ml import bp as ml_bp
    from .routes.chatbot import bp as chatbot_bp

    for bp in (auth_bp, profile_bp, categories_bp, transactions_bp, budgets_bp,
               goals_bp, dashboard_bp, reports_bp, notifications_bp, ml_bp, chatbot_bp):
        app.register_blueprint(bp)

    register_error_handlers(app)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "ml_enabled": True, "build": "ml-pure-python-v2"}

    with app.app_context():
        from . import models  # noqa: F401  (register tables)
        db.create_all()

    return app


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return err.to_response()

    @app.errorhandler(HTTPException)
    def handle_http_error(err):
        return jsonify({"message": err.description}), err.code

    @app.errorhandler(Exception)
    def handle_unexpected(err):
        db.session.rollback()
        app.logger.exception(err)
        return jsonify({"message": "Something went wrong on the server. Please try again."}), 500

    # JWT errors -> consistent JSON 401 responses
    @jwt.unauthorized_loader
    def missing_token(reason):
        return jsonify({"message": "Please log in to continue."}), 401

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return jsonify({"message": "Your session is invalid. Please log in again."}), 401

    @jwt.expired_token_loader
    def expired_token(header, payload):
        return jsonify({"message": "Your session has expired. Please log in again."}), 401

    @jwt.user_lookup_loader
    def load_user(header, payload):
        from .models import User
        return db.session.get(User, int(payload["sub"]))

    @jwt.user_lookup_error_loader
    def user_missing(header, payload):
        return jsonify({"message": "Account not found. Please log in again."}), 401
