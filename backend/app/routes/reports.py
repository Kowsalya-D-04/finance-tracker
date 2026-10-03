"""Monthly / date-range reports with CSV and PDF export."""
import csv
import io
from datetime import date, datetime

from flask import Blueprint, request, Response
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy import func

from ..extensions import db
from ..models import Transaction, Category, money
from ..services.finance import (totals, category_breakdown, monthly_series, daily_trend, budgets_for_month,
                                MONTH_NAMES, apply_filters)
from ..utils import ApiError, month_bounds, parse_date, parse_int
from .transactions import filtered_query

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def resolve_period(args):
    """Monthly mode uses month + year; range mode uses start_date + end_date."""
    errors = {}
    today = date.today()
    if args.get("start_date") or args.get("end_date"):
        start = parse_date(args.get("start_date"), "start_date", errors)
        end = parse_date(args.get("end_date"), "end_date", errors)
        if start and end and start > end:
            errors["end_date"] = "End date must be on or after the start date."
        if errors:
            raise ApiError("Please choose a valid date range.", 422, errors)
        label = f"{start.strftime('%d %b %Y')} to {end.strftime('%d %b %Y')}"
        return start, end, label, None
    month = parse_int(args.get("month", today.month), "month", errors, 1, 12)
    year = parse_int(args.get("year", today.year), "year", errors, 2000, 2100)
    if errors:
        raise ApiError("Please choose a valid month and year.", 422, errors)
    start, end = month_bounds(year, month)
    return start, end, f"{MONTH_NAMES[month - 1]} {year}", (year, month)


def build_report(user, args):
    uid = user.id
    start, end, label, month_key = resolve_period(args)
    tx_type = args.get("type") if args.get("type") in ("income", "expense") else None
    category_id = None
    if args.get("category_id"):
        try:
            category_id = int(args["category_id"])
        except ValueError:
            raise ApiError("Invalid category.", 422)
        cat = db.session.get(Category, category_id)
        if cat is None or cat.user_id != uid:
            raise ApiError("Category not found.", 404)

    summary = totals(uid, start, end, tx_type, category_id)
    query_args = {"start_date": start.isoformat(), "end_date": end.isoformat(),
                  "type": tx_type or "", "category_id": category_id or ""}
    query, _, _ = filtered_query(uid, query_args)
    transactions = query.order_by(Transaction.date.asc(), Transaction.id.asc()).all()

    # Payment-method breakdown
    pm_rows = apply_filters(db.session.query(Transaction.payment_method, Transaction.type,
                                             func.sum(Transaction.amount), func.count(Transaction.id)),
                            uid, start, end, tx_type, category_id) \
        .group_by(Transaction.payment_method, Transaction.type).all()
    payment_methods = {}
    for method, ttype, amount, count in pm_rows:
        entry = payment_methods.setdefault(method, {"payment_method": method, "income": 0.0, "expense": 0.0, "count": 0})
        entry[ttype] = money(amount)
        entry["count"] += int(count)

    days = max((end - start).days + 1, 1)
    top_expenses = sorted((t for t in transactions if t.type == "expense"),
                          key=lambda t: -float(t.amount))[:5]

    comparison_end = (end.year, end.month)
    report = {
        "period_label": label,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "filters": {"type": tx_type, "category_id": category_id},
        "summary": {**summary, "days": days,
                    "average_daily_expense": money(summary["expense"] / days)},
        "category_expenses": category_breakdown(uid, start, end, "expense", category_id) if tx_type != "income" else [],
        "category_income": category_breakdown(uid, start, end, "income", category_id) if tx_type != "expense" else [],
        "monthly_comparison": monthly_series(uid, *comparison_end, months=6, tx_type=tx_type, category_id=category_id),
        # Trend stops at today so the current month does not show a flat line into the future
        "spending_trend": daily_trend(uid, start, min(end, max(start, date.today())), "expense", category_id)
        if tx_type != "income" else [],
        "payment_methods": sorted(payment_methods.values(), key=lambda p: -(p["expense"] + p["income"])),
        "top_expenses": [t.to_dict() for t in top_expenses],
        "budgets": budgets_for_month(uid, *month_key) if month_key else [],
        "transactions": [t.to_dict() for t in transactions],
        "generated_at": datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "currency": user.currency,
        "user_name": user.name,
    }
    return report


@bp.get("/monthly")
@jwt_required()
def monthly_report():
    return build_report(current_user, request.args)


@bp.get("/export/csv")
@jwt_required()
def export_csv():
    report = build_report(current_user, request.args)
    out = io.StringIO()
    w = csv.writer(out)
    s = report["summary"]
    w.writerow(["Digital Personal Finance Management and Expense Tracker"])
    w.writerow(["Financial report", report["period_label"]])
    w.writerow(["Prepared for", report["user_name"]])
    w.writerow(["Currency", report["currency"]])
    w.writerow(["Generated", report["generated_at"]])
    w.writerow([])
    w.writerow(["Summary"])
    for label, key in (("Total income", "income"), ("Total expenses", "expense"),
                       ("Balance", "balance"), ("Savings", "savings")):
        w.writerow([label, f"{s[key]:.2f}"])
    w.writerow(["Savings rate (%)", s["savings_rate"]])
    w.writerow(["Transactions", s["transaction_count"]])
    w.writerow([])
    if report["category_expenses"]:
        w.writerow(["Category-wise expenses"])
        w.writerow(["Category", "Amount", "Share (%)", "Transactions"])
        for c in report["category_expenses"]:
            w.writerow([c["category"], f"{c['amount']:.2f}", c["percentage"], c["count"]])
        w.writerow([])
    if report["budgets"]:
        w.writerow(["Budgets"])
        w.writerow(["Category", "Limit", "Spent", "Remaining", "Usage (%)", "Status"])
        for b in report["budgets"]:
            w.writerow([b["category"], f"{b['limit_amount']:.2f}", f"{b['spent']:.2f}",
                        f"{b['remaining']:.2f}", b["usage_percentage"], b["status"]])
        w.writerow([])
    w.writerow(["Transactions"])
    w.writerow(["Date", "Type", "Category", "Amount", "Payment method", "Note"])
    for t in report["transactions"]:
        w.writerow([t["date"], t["type"].capitalize(), t["category"], f"{t['amount']:.2f}",
                    t["payment_method"], t["note"]])

    filename = f"finance-report-{report['start_date']}-to-{report['end_date']}.csv"
    # utf-8-sig BOM so Excel opens the file with the correct encoding
    return Response(out.getvalue().encode("utf-8-sig"), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@bp.get("/export/pdf")
@jwt_required()
def export_pdf():
    from ..services.pdf_report import render_pdf
    report = build_report(current_user, request.args)
    pdf_bytes = render_pdf(report)
    filename = f"finance-report-{report['start_date']}-to-{report['end_date']}.pdf"
    return Response(pdf_bytes, mimetype="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
