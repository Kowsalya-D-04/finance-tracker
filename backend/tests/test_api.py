"""API tests.  Run from the backend folder:  python -m pytest -v"""
import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from config import TestConfig  # noqa: E402

TODAY = date.today()
THIS_MONTH = TODAY.replace(day=1).isoformat()


@pytest.fixture()
def client():
    app = create_app(TestConfig)
    with app.app_context():
        yield app.test_client()
        db.session.remove()
        db.drop_all()


def register(client, email="asha@example.com", password="Secret@123"):
    r = client.post("/api/auth/register", json={
        "name": "Asha Rao", "email": email, "password": password,
        "confirm_password": password, "currency": "INR"})
    assert r.status_code == 201, r.json
    return {"Authorization": f"Bearer {r.json['token']}"}


def category_id(client, headers, name, ctype):
    cats = client.get(f"/api/categories?type={ctype}", headers=headers).json["categories"]
    return next(c["id"] for c in cats if c["name"] == name)


def add_tx(client, headers, ttype, cat, amount, when=THIS_MONTH, method="UPI", note=""):
    return client.post("/api/transactions", headers=headers, json={
        "type": ttype, "category_id": cat, "amount": amount, "date": when,
        "payment_method": method, "note": note})


# ---------- Authentication ----------

def test_register_creates_default_categories(client):
    h = register(client)
    cats = client.get("/api/categories", headers=h).json["categories"]
    assert len([c for c in cats if c["type"] == "income"]) == 6
    assert len([c for c in cats if c["type"] == "expense"]) == 11


def test_register_validation(client):
    r = client.post("/api/auth/register", json={"name": "A", "email": "bad", "password": "short",
                                                  "confirm_password": "other", "currency": "INR"})
    assert r.status_code == 422
    assert {"name", "email", "password", "confirm_password"} <= set(r.json["errors"])


def test_duplicate_email_rejected(client):
    register(client)
    r = client.post("/api/auth/register", json={"name": "Asha", "email": "ASHA@example.com",
                                                  "password": "Secret@123", "confirm_password": "Secret@123"})
    assert r.status_code == 422 and "email" in r.json["errors"]


def test_login_and_protected_routes(client):
    register(client)
    assert client.post("/api/auth/login", json={"email": "asha@example.com", "password": "Wrong@123"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "asha@example.com", "password": "Secret@123"})
    assert r.status_code == 200 and r.json["token"]
    assert client.get("/api/dashboard/summary").status_code == 401
    assert client.get("/api/transactions", headers={"Authorization": "Bearer nonsense"}).status_code == 401


# ---------- Transactions and balance ----------

def test_balance_is_income_minus_expenses(client):
    h = register(client)
    salary, food = category_id(client, h, "Salary", "income"), category_id(client, h, "Food", "expense")
    add_tx(client, h, "income", salary, 75000)
    add_tx(client, h, "expense", food, 29500)
    cards = client.get("/api/dashboard/summary", headers=h).json["cards"]
    assert cards["income"] == 75000
    assert cards["expense"] == 29500
    assert cards["balance"] == 45500
    assert cards["savings"] == 45500


def test_category_must_match_type(client):
    h = register(client)
    salary = category_id(client, h, "Salary", "income")
    r = add_tx(client, h, "expense", salary, 100)
    assert r.status_code == 422 and "category_id" in r.json["errors"]


def test_amount_must_be_positive(client):
    h = register(client)
    food = category_id(client, h, "Food", "expense")
    assert add_tx(client, h, "expense", food, -5).status_code == 422
    assert add_tx(client, h, "expense", food, 0).status_code == 422
    assert add_tx(client, h, "expense", food, "abc").status_code == 422


def test_update_delete_and_filters(client):
    h = register(client)
    food, transport = category_id(client, h, "Food", "expense"), category_id(client, h, "Transport", "expense")
    tx = add_tx(client, h, "expense", food, 500, note="Swiggy dinner").json["transaction"]
    add_tx(client, h, "expense", transport, 200, method="Cash", note="Auto")

    r = client.get("/api/transactions?search=swiggy", headers=h).json
    assert r["pagination"]["total"] == 1
    r = client.get("/api/transactions?payment_method=Cash", headers=h).json
    assert r["pagination"]["total"] == 1 and r["summary"]["expense"] == 200
    r = client.get("/api/transactions?sort_by=amount&sort_dir=asc", headers=h).json
    assert [t["amount"] for t in r["transactions"]] == [200, 500]

    r = client.put(f"/api/transactions/{tx['id']}", headers=h, json={"amount": 650})
    assert r.status_code == 200 and r.json["transaction"]["amount"] == 650
    assert client.delete(f"/api/transactions/{tx['id']}", headers=h).status_code == 200
    assert client.get("/api/transactions", headers=h).json["pagination"]["total"] == 1


def test_users_cannot_access_each_others_data(client):
    h1 = register(client, "one@example.com")
    h2 = register(client, "two@example.com")
    food = category_id(client, h1, "Food", "expense")
    tx = add_tx(client, h1, "expense", food, 300).json["transaction"]
    assert client.get(f"/api/transactions/{tx['id']}", headers=h2).status_code == 404
    assert client.put(f"/api/transactions/{tx['id']}", headers=h2, json={"amount": 1}).status_code == 404
    assert client.delete(f"/api/transactions/{tx['id']}", headers=h2).status_code == 404
    assert add_tx(client, h2, "expense", food, 50).status_code == 422  # someone else's category
    assert client.get("/api/transactions", headers=h2).json["pagination"]["total"] == 0


# ---------- Budgets and notifications ----------

def test_budget_usage_status_and_alerts(client):
    h = register(client)
    food = category_id(client, h, "Food", "expense")
    r = client.post("/api/budgets", headers=h, json={"category_id": food, "month": TODAY.month,
                                                      "year": TODAY.year, "limit_amount": 8000})
    assert r.status_code == 201

    add_tx(client, h, "expense", food, 4000)
    b = client.get("/api/budgets", headers=h).json["budgets"][0]
    assert b["usage_percentage"] == 50.0 and b["status"] == "Under Budget" and b["remaining"] == 4000

    add_tx(client, h, "expense", food, 2800)  # 85%
    b = client.get("/api/budgets", headers=h).json["budgets"][0]
    assert b["status"] == "Near Limit"
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=h).json["notifications"]]
    assert kinds == ["budget_warning"]

    add_tx(client, h, "expense", food, 1500)  # 103.75%
    b = client.get("/api/budgets", headers=h).json["budgets"][0]
    assert b["status"] == "Exceeded" and b["usage_percentage"] == 103.8
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=h).json["notifications"]]
    assert kinds.count("budget_exceeded") == 1

    add_tx(client, h, "expense", food, 10)  # no duplicate alert
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=h).json["notifications"]]
    assert kinds.count("budget_exceeded") == 1


def test_duplicate_budget_rejected(client):
    h = register(client)
    food = category_id(client, h, "Food", "expense")
    body = {"category_id": food, "month": 9, "year": 2026, "limit_amount": 8000}
    assert client.post("/api/budgets", headers=h, json=body).status_code == 201
    assert client.post("/api/budgets", headers=h, json=body).status_code == 422


def test_budget_requires_expense_category(client):
    h = register(client)
    salary = category_id(client, h, "Salary", "income")
    r = client.post("/api/budgets", headers=h, json={"category_id": salary, "month": 9, "year": 2026,
                                                      "limit_amount": 1000})
    assert r.status_code == 422


# ---------- Savings goals ----------

def test_goal_progress_and_completion(client):
    h = register(client)
    r = client.post("/api/goals", headers=h, json={"title": "Emergency Fund", "goal_type": "Emergency Fund",
                                                    "target_amount": 100000, "saved_amount": 40000})
    goal = r.json["goal"]
    assert goal["progress_percentage"] == 40.0 and goal["remaining"] == 60000

    r = client.post(f"/api/goals/{goal['id']}/contributions", headers=h, json={"amount": 60000})
    goal = r.json["goal"]
    assert goal["status"] == "Completed" and goal["progress_percentage"] == 100.0
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=h).json["notifications"]]
    assert "goal_completed" in kinds

    r = client.post(f"/api/goals/{goal['id']}/contributions", headers=h,
                    json={"amount": 200000, "withdraw": True})
    assert r.status_code == 422


# ---------- Reports ----------

def test_monthly_report_and_exports(client):
    h = register(client)
    salary, food = category_id(client, h, "Salary", "income"), category_id(client, h, "Food", "expense")
    add_tx(client, h, "income", salary, 50000)
    add_tx(client, h, "expense", food, 12000)
    q = f"month={TODAY.month}&year={TODAY.year}"
    report = client.get(f"/api/reports/monthly?{q}", headers=h).json
    assert report["summary"]["balance"] == 38000
    assert report["category_expenses"][0]["category"] == "Food"
    assert report["category_expenses"][0]["percentage"] == 100.0

    csv_r = client.get(f"/api/reports/export/csv?{q}", headers=h)
    assert csv_r.status_code == 200 and b"Food" in csv_r.data
    pdf_r = client.get(f"/api/reports/export/pdf?{q}", headers=h)
    assert pdf_r.status_code == 200 and pdf_r.data[:4] == b"%PDF"


def test_custom_category_rules(client):
    h = register(client)
    r = client.post("/api/categories", headers=h, json={"name": "Pets", "type": "expense", "colour": "#4E9A6B"})
    assert r.status_code == 201
    pets = r.json["category"]["id"]
    assert client.post("/api/categories", headers=h,
                       json={"name": "pets", "type": "expense", "colour": "#000000"}).status_code == 422
    add_tx(client, h, "expense", pets, 900)
    assert client.delete(f"/api/categories/{pets}", headers=h).status_code == 409
    food = category_id(client, h, "Food", "expense")
    assert client.delete(f"/api/categories/{food}", headers=h).status_code == 409
