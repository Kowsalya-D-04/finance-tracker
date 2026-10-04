"""Rule-based personal finance assistant grounded in the signed-in user's data.

No external AI key is required. The assistant recognizes common finance questions and
answers from transactions, budgets, savings goals, and the existing ML forecast.
"""
from datetime import date
import re

from ..models import Transaction, SavingsGoal
from ..services.finance import totals, category_breakdown, budgets_for_month, goal_to_dict, MONTH_NAMES
from ..services.ml import forecast_expenses
from ..utils import month_bounds


def _money(value):
    return f"₹{float(value or 0):,.2f}"


def _normalise(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _monthly_context(user_id):
    today = date.today()
    start, end = month_bounds(today.year, today.month)
    month = totals(user_id, start, end)
    all_time = totals(user_id)
    categories = category_breakdown(user_id, start, end, "expense")
    budgets = budgets_for_month(user_id, today.year, today.month)
    goals = SavingsGoal.query.filter_by(user_id=user_id).all()
    recent = (Transaction.query.filter_by(user_id=user_id)
              .order_by(Transaction.date.desc(), Transaction.id.desc())
              .limit(5).all())
    return today, month, all_time, categories, budgets, goals, recent


def answer_finance_question(user_id, message):
    q = _normalise(message)
    if not q:
        return {
            "reply": "Ask me about your balance, this month's spending, income, budgets, savings goals, recent transactions, or next-month expense forecast.",
            "intent": "help",
        }

    today, month, all_time, categories, budgets, goals, recent = _monthly_context(user_id)
    month_name = MONTH_NAMES[today.month - 1]

    # Greetings / help
    if q in {"hi", "hello", "hey", "hai", "vanakkam"} or any(x in q for x in ["what can you do", "help me", "help"]):
        return {
            "reply": (
                "Hi! I’m your Personal Finance Assistant. You can ask: “How much did I spend this month?”, "
                "“What is my balance?”, “Which category costs the most?”, “How are my budgets?”, "
                "“Show my savings goals”, or “Predict next month’s expenses”."
            ),
            "intent": "help",
        }

    # Balance / savings
    if any(x in q for x in ["balance", "money left", "how much left", "available money"]):
        return {
            "reply": (
                f"Your current all-time balance is {_money(all_time['balance'])}. "
                f"This month you earned {_money(month['income'])} and spent {_money(month['expense'])}, "
                f"leaving monthly savings of {_money(month['savings'])}."
            ),
            "intent": "balance",
            "data": {"balance": all_time["balance"], "income": month["income"], "expense": month["expense"], "savings": month["savings"]},
        }

    # Income
    if any(x in q for x in ["income", "earned", "salary", "money received"]):
        return {
            "reply": f"Your total income for {month_name} {today.year} is {_money(month['income'])} from this month's recorded income transactions.",
            "intent": "income",
            "data": {"income": month["income"]},
        }

    # Spending / expenses
    if any(x in q for x in ["spend", "spent", "expense", "expenses", "cost"]):
        if categories:
            top = categories[0]
            top_name = top.get("name") or top.get("category") or "your top category"
            top_amount = top.get("amount", 0)
            extra = f" Your highest spending category is {top_name} at {_money(top_amount)}."
        else:
            extra = " You do not have categorized expenses recorded for this month yet."
        return {
            "reply": f"You have spent {_money(month['expense'])} in {month_name} {today.year}.{extra}",
            "intent": "spending",
            "data": {"expense": month["expense"], "categories": categories[:5]},
        }

    # Category / highest spending
    if any(x in q for x in ["category", "categories", "highest", "most spending", "top spending"]):
        if not categories:
            return {"reply": "There are no expense categories with spending recorded for this month yet.", "intent": "categories"}
        lines = []
        for idx, item in enumerate(categories[:5], 1):
            name = item.get("name") or item.get("category") or "Other"
            lines.append(f"{idx}. {name}: {_money(item.get('amount', 0))}")
        return {
            "reply": "Your top expense categories this month are:\n" + "\n".join(lines),
            "intent": "categories",
            "data": {"categories": categories[:5]},
        }

    # Budgets
    if any(x in q for x in ["budget", "budgets", "limit", "over budget"]):
        if not budgets:
            return {
                "reply": "You have not created any budgets for this month yet. Open Budgets to set category limits and receive warnings.",
                "intent": "budgets",
            }
        exceeded = [b for b in budgets if b.get("status") == "Exceeded" or b.get("percentage", 0) >= 100]
        warning = [b for b in budgets if b not in exceeded and b.get("percentage", 0) >= b.get("alert_threshold", 80)]
        if exceeded:
            names = ", ".join((b.get("category") or "category") for b in exceeded[:4])
            msg = f"You are over budget in {len(exceeded)} categor{'y' if len(exceeded) == 1 else 'ies'}: {names}."
        elif warning:
            names = ", ".join((b.get("category") or "category") for b in warning[:4])
            msg = f"No budget is exceeded, but {names} {'is' if len(warning) == 1 else 'are'} close to the alert limit."
        else:
            msg = f"All {len(budgets)} budgets are currently within their limits."
        return {"reply": msg, "intent": "budgets", "data": {"budgets": budgets}}

    # Goals
    if any(x in q for x in ["goal", "goals", "saving goal", "savings goal", "target"]):
        if not goals:
            return {"reply": "You do not have any savings goals yet. Create one from the Savings goals page.", "intent": "goals"}
        items = [goal_to_dict(g) for g in goals]
        active = [g for g in items if str(g.get("status", "")).lower() != "completed"]
        chosen = active[:3] if active else items[:3]
        lines = [f"• {g['title']}: {_money(g['saved_amount'])} of {_money(g['target_amount'])} ({g['progress_percentage']:.0f}%)" for g in chosen]
        return {"reply": "Here are your savings goals:\n" + "\n".join(lines), "intent": "goals", "data": {"goals": chosen}}

    # Recent transactions
    if any(x in q for x in ["recent", "latest transaction", "last transaction", "transactions"]):
        if not recent:
            return {"reply": "You do not have any transactions recorded yet.", "intent": "transactions"}
        lines = []
        for t in recent:
            sign = "+" if t.type == "income" else "-"
            label = t.note or (t.category.name if t.category else t.type.title())
            lines.append(f"• {t.date.isoformat()} — {label}: {sign}{_money(t.amount)}")
        return {"reply": "Your latest transactions are:\n" + "\n".join(lines), "intent": "transactions"}

    # Forecast
    if any(x in q for x in ["forecast", "predict", "prediction", "next month", "future expense"]):
        forecast = forecast_expenses(user_id)
        predicted = forecast.get("predicted_expense")
        if predicted is None:
            return {
                "reply": forecast.get("message", "I need more monthly expense history before I can produce a useful forecast."),
                "intent": "forecast",
                "data": forecast,
            }
        return {
            "reply": (
                f"Based on your recorded monthly expense trend, the ML forecast for next month is {_money(predicted)}. "
                "Treat this as an estimate, not a guaranteed amount."
            ),
            "intent": "forecast",
            "data": forecast,
        }

    # Saving advice, grounded in current values
    if any(x in q for x in ["save more", "saving advice", "advice", "improve savings", "reduce expense"]):
        rate = month.get("savings_rate", 0) or 0
        if categories:
            top = categories[0]
            top_name = top.get("name") or top.get("category") or "your highest category"
            suggestion = f"Start by reviewing {top_name}, currently your biggest expense category this month."
        else:
            suggestion = "Start recording expenses by category so I can identify where reductions are most useful."
        return {
            "reply": f"Your savings rate this month is {rate:.1f}%. {suggestion} Set a realistic category budget rather than cutting every category equally.",
            "intent": "advice",
        }

    return {
        "reply": (
            "I can answer questions about the finance data stored in this app. Try asking: “What is my balance?”, "
            "“How much did I spend this month?”, “Show my budgets”, “Show my goals”, “Recent transactions”, "
            "or “Predict next month’s expenses”."
        ),
        "intent": "fallback",
    }
