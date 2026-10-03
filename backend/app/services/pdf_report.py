"""Builds the downloadable PDF report with ReportLab."""
import io

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

INK = colors.HexColor("#16302B")
GREEN = colors.HexColor("#1F7A5C")
RED = colors.HexColor("#B4412F")
MUTED = colors.HexColor("#5F6F69")
LINE = colors.HexColor("#D9E2DE")
TINT = colors.HexColor("#EEF4F1")


def fmt_money(value, currency):
    """Indian digit grouping (12,34,567.00) for INR; western grouping for others."""
    negative = value < 0
    value = abs(value)
    whole, frac = f"{value:.2f}".split(".")
    if currency == "INR" and len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    else:
        whole = f"{int(whole):,}"
    # The rupee sign is not in ReportLab's built-in fonts, so the currency code is used
    return f"{'-' if negative else ''}{currency} {whole}.{frac}"


def _table(rows, widths, align_right_cols=(), header_bg=INK):
    table = Table(rows, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    for col in align_right_cols:
        style.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
    for i in range(1, len(rows)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), TINT))
    table.setStyle(TableStyle(style))
    return table


def _monthly_chart(series, width):
    drawing = Drawing(width, 170)
    chart = VerticalBarChart()
    chart.x, chart.y, chart.width, chart.height = 45, 30, width - 60, 115
    chart.data = [[m["income"] for m in series], [m["expense"] for m in series]]
    chart.categoryAxis.categoryNames = [m["label"] for m in series]
    chart.categoryAxis.labels.fontSize = 7
    chart.valueAxis.labels.fontSize = 7
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labelTextFormat = lambda v: f"{v/1000:.0f}k" if v >= 1000 else f"{v:.0f}"
    chart.bars[0].fillColor = GREEN
    chart.bars[1].fillColor = RED
    chart.bars.strokeColor = None
    chart.barSpacing = 2
    chart.groupSpacing = 10
    drawing.add(chart)
    drawing.add(String(45, 155, "Income", fontSize=8, fillColor=GREEN, fontName="Helvetica-Bold"))
    drawing.add(String(85, 155, "Expenses", fontSize=8, fillColor=RED, fontName="Helvetica-Bold"))
    return drawing


def _category_pie(categories):
    drawing = Drawing(170, 150)
    pie = Pie()
    pie.x, pie.y, pie.width, pie.height = 15, 5, 140, 140
    top = categories[:8]
    pie.data = [c["amount"] for c in top] or [1]
    pie.labels = None
    pie.slices.strokeColor = colors.white
    pie.slices.strokeWidth = 1
    for i, c in enumerate(top):
        pie.slices[i].fillColor = colors.HexColor(c["colour"] or "#8C9590")
    drawing.add(pie)
    return drawing


def render_pdf(report):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"Financial report {report['period_label']}")
    width = A4[0] - 32 * mm
    cur = report["currency"]
    m = lambda v: fmt_money(v, cur)

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], alignment=0, fontSize=18, textColor=INK, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, textColor=INK, spaceBefore=12, spaceAfter=6)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8.5, textColor=MUTED)
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=8.5, leading=10)

    story = [
        Paragraph("Financial report", h1),
        Paragraph(f"{report['period_label']} &nbsp;|&nbsp; Prepared for {report['user_name']} "
                  f"&nbsp;|&nbsp; Generated {report['generated_at']}", small),
        Spacer(1, 10),
    ]

    s = report["summary"]
    cards = [
        ["Total income", "Total expenses", "Balance", "Savings rate"],
        [m(s["income"]), m(s["expense"]), m(s["balance"]), f"{s['savings_rate']}%"],
    ]
    card_table = Table(cards, colWidths=[width / 4] * 4)
    card_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, 0), 8), ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"), ("FONTSIZE", (0, 1), (-1, 1), 12),
        ("TEXTCOLOR", (0, 1), (0, 1), GREEN), ("TEXTCOLOR", (1, 1), (1, 1), RED),
        ("TEXTCOLOR", (2, 1), (-1, 1), INK),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("LINEBEFORE", (1, 0), (-1, -1), 0.6, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), TINT),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [card_table, Spacer(1, 4),
              Paragraph(f"{s['transaction_count']} transactions over {s['days']} days. "
                        f"Average daily spending {m(s['average_daily_expense'])}. "
                        f"Net savings {m(s['savings'])}.", small)]

    story += [Paragraph("Monthly income and expenses (last 6 months)", h2),
              _monthly_chart(report["monthly_comparison"], width)]

    cats = report["category_expenses"]
    if cats:
        rows = [["Category", "Amount", "Share", "Count"]] + [
            [c["category"], m(c["amount"]), f"{c['percentage']}%", str(c["count"])] for c in cats]
        side_by_side = Table([[_category_pie(cats), _table(rows, [width * 0.26, width * 0.2, width * 0.1, width * 0.1],
                                                             (1, 2, 3))]],
                             colWidths=[width * 0.32, width * 0.68])
        side_by_side.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story += [KeepTogether([Paragraph("Category-wise expenses", h2), side_by_side])]

    if report["budgets"]:
        rows = [["Category", "Limit", "Spent", "Remaining", "Used", "Status"]] + [
            [b["category"], m(b["limit_amount"]), m(b["spent"]), m(b["remaining"]),
             f"{b['usage_percentage']}%", b["status"]] for b in report["budgets"]]
        t = _table(rows, [width * 0.2, width * 0.17, width * 0.17, width * 0.17, width * 0.1, width * 0.19],
                   (1, 2, 3, 4))
        for i, b in enumerate(report["budgets"], start=1):
            if b["status"] == "Exceeded":
                t.setStyle(TableStyle([("TEXTCOLOR", (5, i), (5, i), RED)]))
        story += [KeepTogether([Paragraph("Budgets", h2), t])]

    if report["payment_methods"]:
        rows = [["Payment method", "Income", "Expenses", "Count"]] + [
            [p["payment_method"], m(p["income"]), m(p["expense"]), str(p["count"])]
            for p in report["payment_methods"]]
        story += [KeepTogether([Paragraph("Payment methods", h2),
                                _table(rows, [width * 0.3, width * 0.25, width * 0.25, width * 0.2], (1, 2, 3))])]

    story.append(Paragraph("Transactions", h2))
    txs = report["transactions"]
    if txs:
        rows = [["Date", "Type", "Category", "Payment", "Note", "Amount"]]
        for t in txs:
            sign = "+" if t["type"] == "income" else "-"
            rows.append([t["date"], t["type"].capitalize(), t["category"], t["payment_method"],
                         Paragraph(t["note"] or "", cell), f"{sign} {m(t['amount'])}"])
        story.append(_table(rows, [width * 0.13, width * 0.1, width * 0.15, width * 0.14, width * 0.28, width * 0.2],
                            (5,)))
    else:
        story.append(Paragraph("No transactions match the selected filters.", small))

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 9 * mm, "Digital Personal Finance Management and Expense Tracker")
        canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
