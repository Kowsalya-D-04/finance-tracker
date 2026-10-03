"""Load demo data for presentations.

    python seed.py            # adds the demo user if it does not exist
    python seed.py --reset    # deletes ALL data and recreates the database with demo data

Demo login:  demo@financetracker.com  /  Demo@1234
"""
import random
import sys
from datetime import date, timedelta
from decimal import Decimal

from app import create_app
from app.extensions import db
from app.models import (User, Category, Transaction, Budget, SavingsGoal, GoalContribution,
                        create_default_categories)
from app.services.notifications import check_budget, check_goal
from app.utils import month_bounds, shift_month

DEMO_EMAIL = "demo@financetracker.com"
DEMO_PASSWORD = "Demo@1234"

FOOD_NOTES = ["Groceries - weekly", "Swiggy dinner", "Zomato lunch", "Vegetables and fruits", "Milk and bakery",
              "Team lunch", "Coffee with friends", "Saravana Bhavan", "Weekend biryani", "Supermarket run"]
TRANSPORT_NOTES = ["Metro card recharge", "Uber to office", "Petrol", "Auto fare", "Rapido ride", "Train ticket"]
SHOPPING_NOTES = ["Amazon order", "Clothes - Myntra", "Shoes", "Home essentials", "Flipkart sale", "Gift for friend"]
ENT_NOTES = ["Movie tickets", "Netflix subscription", "Concert", "Spotify", "Bowling night"]


def d(year, month, day):
    _, last = month_bounds(year, month)
    return date(year, month, min(day, last.day))


def seed_demo_user():
    rng = random.Random(2026)
    user = User(name="Arjun Kumar", email=DEMO_EMAIL, currency="INR")
    user.set_password(DEMO_PASSWORD)
    db.session.add(user)
    db.session.flush()
    create_default_categories(user)
    db.session.flush()
    cat = {(c.name, c.type): c for c in Category.query.filter_by(user_id=user.id)}
    db.session.add(Category(user_id=user.id, name="Pets", type="expense", colour="#4E9A6B"))
    db.session.add(Category(user_id=user.id, name="Rental Income", type="income", colour="#2A6F97"))
    db.session.flush()
    cat = {(c.name, c.type): c for c in Category.query.filter_by(user_id=user.id)}

    today = date.today()
    txs = []

    def add(ttype, cname, amount, when, method, note=""):
        if when <= today:
            txs.append(Transaction(user_id=user.id, type=ttype, category_id=cat[(cname, ttype)].id,
                                   amount=Decimal(str(round(amount, 2))), date=when,
                                   payment_method=method, note=note))

    for offset in range(-5, 1):  # last six months including the current one
        y, m = shift_month(today.year, today.month, offset)
        add("income", "Salary", 75000, d(y, m, 1), "Bank Transfer", "Monthly salary - Infosys")
        if offset in (-4, -2, 0):
            add("income", "Freelance", rng.choice([8000, 12000, 15000]), d(y, m, 14), "UPI", "Website project payment")
        if offset in (-3, 0):
            add("income", "Investment", rng.choice([2400, 3100]), d(y, m, 20), "Bank Transfer", "Mutual fund dividend")
        if offset == -3:
            add("income", "Bonus", 20000, d(y, m, 28), "Bank Transfer", "Quarterly performance bonus")
        add("income", "Rental Income", 6000, d(y, m, 5), "UPI", "Room rent from tenant")

        add("expense", "Rent", 18000, d(y, m, 3), "Bank Transfer", "House rent")
        add("expense", "EMI", 6500, d(y, m, 5), "Bank Transfer", "Bike loan EMI")
        add("expense", "Bills", rng.randint(1400, 2300), d(y, m, 8), "UPI", "Electricity bill - TNEB")
        add("expense", "Bills", 799, d(y, m, 10), "Credit Card", "Airtel broadband")
        add("expense", "Bills", 299, d(y, m, 12), "UPI", "Mobile recharge")

        # Current month has heavier food and shopping so the demo shows warnings
        food_count = 14 if offset == 0 else rng.randint(10, 13)
        for _ in range(food_count):
            add("expense", "Food", rng.randint(180, 1100) if offset != 0 else rng.randint(300, 950),
                d(y, m, rng.randint(1, 28)), rng.choice(["UPI", "UPI", "Cash", "Debit Card", "Wallet"]),
                rng.choice(FOOD_NOTES))
        for _ in range(rng.randint(6, 9)):
            add("expense", "Transport", rng.randint(60, 900), d(y, m, rng.randint(1, 28)),
                rng.choice(["UPI", "Cash", "Wallet"]), rng.choice(TRANSPORT_NOTES))
        for _ in range(rng.randint(1, 3) + (2 if offset == 0 else 0)):
            add("expense", "Shopping", rng.randint(700, 3800), d(y, m, rng.randint(1, 27)),
                rng.choice(["Credit Card", "UPI", "Debit Card"]), rng.choice(SHOPPING_NOTES))
        for _ in range(rng.randint(1, 3)):
            add("expense", "Entertainment", rng.randint(199, 1200), d(y, m, rng.randint(1, 28)),
                rng.choice(["Credit Card", "UPI"]), rng.choice(ENT_NOTES))
        if rng.random() < 0.6:
            add("expense", "Healthcare", rng.randint(300, 2500), d(y, m, rng.randint(1, 28)),
                rng.choice(["UPI", "Cash"]), rng.choice(["Pharmacy", "Doctor consultation", "Lab test"]))
        if offset in (-4, -1):
            add("expense", "Travel", rng.randint(6000, 14000), d(y, m, 22), "Credit Card",
                rng.choice(["Pondicherry weekend trip", "Flight to Bengaluru", "Ooty trip"]))
        if offset in (-5, -2):
            add("expense", "Education", rng.choice([2999, 4499]), d(y, m, 16), "Debit Card", "Online course")
        add("expense", "Pets", rng.randint(500, 1500), d(y, m, 18), "UPI", "Pet food and grooming")

    db.session.add_all(txs)
    db.session.flush()

    goals_spec = [
        ("Emergency Fund", "Emergency Fund", 100000, [15000, 10000, 8000, 7000], 300),
        ("New Laptop", "New Laptop", 85000, [30000, 20000, 12000], 75),
        ("Goa Vacation", "Vacation", 40000, [15000, 15000, 10000], 40),
        ("Royal Enfield Bike", "Bike", 220000, [25000, 10000], 540),
    ]
    for title, gtype, target, contributions, days in goals_spec:
        goal = SavingsGoal(user_id=user.id, title=title, goal_type=gtype, target_amount=Decimal(target),
                           saved_amount=Decimal(0), target_date=today + timedelta(days=days))
        db.session.add(goal)
        db.session.flush()
        for i, amount in enumerate(contributions):
            goal.saved_amount = Decimal(goal.saved_amount) + amount
            db.session.add(GoalContribution(goal_id=goal.id, amount=Decimal(amount),
                                            date=today - timedelta(days=30 * (len(contributions) - i)),
                                            note="Initial saved amount" if i == 0 else "Monthly transfer"))
            db.session.flush()
            check_goal(goal, "₹")


    # Budgets for the current and previous month
    limits = {"Food": 8000, "Transport": 3000, "Shopping": 6000, "Entertainment": 2000,
              "Bills": 3500, "Healthcare": 2500, "Rent": 18000}
    budgets = []
    for offset in (-1, 0):
        y, m = shift_month(today.year, today.month, offset)
        for name, limit in limits.items():
            budgets.append(Budget(user_id=user.id, category_id=cat[(name, "expense")].id, month=m, year=y,
                                  limit_amount=Decimal(limit), alert_threshold=80))
    db.session.add_all(budgets)
    db.session.flush()
    for b in budgets:
        check_budget(b, "₹")

    db.session.commit()
    return user, len(txs)


def main():
    app = create_app()
    with app.app_context():
        if "--reset" in sys.argv:
            db.drop_all()
            db.create_all()
            print("Database reset.")
        if User.query.filter_by(email=DEMO_EMAIL).first():
            print(f"Demo user already exists. Log in with {DEMO_EMAIL} / {DEMO_PASSWORD}")
            print("Run 'python seed.py --reset' to rebuild the demo data.")
            return
        user, count = seed_demo_user()
        print(f"Created demo user '{user.name}' with {count} transactions, budgets and savings goals.")
        print(f"Login: {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
