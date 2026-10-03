"""Application configuration.

Switching databases only requires changing DATABASE_URL:
  SQLite (default):  sqlite:///finance_tracker.db
  MySQL 8.x:         mysql+pymysql://user:password@host:3306/finance_tracker?charset=utf8mb4
"""
import os
from datetime import timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv is optional
    pass


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-key-change-me-please")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv("JWT_EXPIRES_HOURS", "24")))

    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///finance_tracker.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # pool_pre_ping keeps long-lived MySQL connections healthy; harmless for SQLite
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    CORS_ORIGINS = [o.strip() for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

    # Budget usage (%) at which a "near limit" warning is raised (can be overridden per budget)
    DEFAULT_BUDGET_ALERT_THRESHOLD = 80


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {}
    JWT_SECRET_KEY = "test-jwt-secret-key-that-is-long-enough"
