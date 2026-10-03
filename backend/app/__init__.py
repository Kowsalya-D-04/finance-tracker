"""Flask application factory."""

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from config import Config
from .extensions import db, jwt, cors
from .utils import ApiError


def create_app(config_class=Config):
    app = Flask(__name__)

    # Load configuration
    app.config.from_object(config_class)
    app.json.sort_keys = False

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)

    cors.init_app(
        app,
        resources={
            r"/api/*": {
                "origins": app.config["CORS_ORIGINS"]
            }
        },
        expose_headers=["Content-Disposition"],
    )

    # Import Blueprints
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

    # Register Blueprints
    blueprints = (
        auth_bp,
        profile_bp,
        categories_bp,
        transactions_bp,
        budgets_bp,
        goals_bp,
        dashboard_bp,
        reports_bp,
        notifications_bp,
        ml_bp,
    )

    for blueprint in blueprints:
        app.register_blueprint(blueprint)

    # Register error handlers
    register_error_handlers(app)

    # -------------------------------------------------
    # Health Check
    # -------------------------------------------------
    @app.get("/api/health")
    def health():
        return jsonify({
            "status": "ok",
            "message": "Finance Tracker Backend is running",
            "ml_enabled": True,
            "build": "ml-pure-python-v2",
        }), 200

    # -------------------------------------------------
    # Optional root route
    # -------------------------------------------------
    @app.get("/")
    def home():
        return jsonify({
            "message": "Finance Tracker API",
            "status": "running",
            "health": "/api/health",
        }), 200

    # -------------------------------------------------
    # Create database tables
    # -------------------------------------------------
    with app.app_context():
        from . import models  # noqa: F401

        db.create_all()

    return app


def register_error_handlers(app):
    """
    Register application-wide error handlers.
    """

    # Custom API errors
    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return err.to_response()

    # Flask / Werkzeug HTTP errors
    @app.errorhandler(HTTPException)
    def handle_http_error(err):
        return jsonify({
            "message": err.description
        }), err.code

    # Unexpected server errors
    @app.errorhandler(Exception)
    def handle_unexpected(err):
        db.session.rollback()

        app.logger.exception(
            "Unhandled server exception: %s",
            err
        )

        return jsonify({
            "message": (
                "Something went wrong on the server. "
                "Please try again."
            )
        }), 500

    # -------------------------------------------------
    # JWT error handlers
    # -------------------------------------------------

    @jwt.unauthorized_loader
    def missing_token(reason):
        return jsonify({
            "message": "Please log in to continue."
        }), 401

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return jsonify({
            "message": (
                "Your session is invalid. "
                "Please log in again."
            )
        }), 401

    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_payload):
        return jsonify({
            "message": (
                "Your session has expired. "
                "Please log in again."
            )
        }), 401

    # -------------------------------------------------
    # Load user from JWT
    # -------------------------------------------------

    @jwt.user_lookup_loader
    def load_user(jwt_header, jwt_payload):
        from .models import User

        try:
            user_id = int(jwt_payload["sub"])
        except (KeyError, TypeError, ValueError):
            return None

        return db.session.get(User, user_id)

    @jwt.user_lookup_error_loader
    def user_missing(jwt_header, jwt_payload):
        return jsonify({
            "message": (
                "Account not found. "
                "Please log in again."
            )
        }), 401