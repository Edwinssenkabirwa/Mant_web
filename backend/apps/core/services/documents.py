"""PDF rendering for receipts and rent invoices using ReportLab.

Both documents share the Mant Bridges letterhead and brand colours so the
output looks consistent whether it is a receipt, an invoice or a demand notice.
Callers pass plain dictionaries (see billing.models.build_document_data) which
keeps this module free of model imports and easy to unit test.
"""
import os
from io import BytesIO
from xml.sax.saxutils import escape as _escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

DARK_BLUE = colors.HexColor("#0B2545")
MID_BLUE = colors.HexColor("#13315C")
RED = colors.HexColor("#D7263D")
LIGHT_BLUE = colors.HexColor("#EEF2F7")
GREY = colors.HexColor("#5A6B7F")
LINE_GREY = colors.HexColor("#D3DCE6")

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 16 * mm
CONTENT_WIDTH = PAGE_WIDTH - (2 * MARGIN)


def esc(value):
    return _escape("" if value is None else str(value))


def _styles():
    return {
        "company": ParagraphStyle("company", fontName="Helvetica-Bold", fontSize=17,
                                  textColor=DARK_BLUE, leading=20),
        "company_sub": ParagraphStyle("company_sub", fontName="Helvetica", fontSize=8.5,
                                      textColor=GREY, leading=11),
        "doc_title": ParagraphStyle("doc_title", fontName="Helvetica-Bold", fontSize=18,
                                    textColor=RED, leading=20, alignment=TA_RIGHT),
        "doc_number": ParagraphStyle("doc_number", fontName="Helvetica", fontSize=9,
                                     textColor=MID_BLUE, leading=12, alignment=TA_RIGHT),
        "section": ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=9,
                                  textColor=RED, leading=12, spaceBefore=2),
        "label": ParagraphStyle("label", fontName="Helvetica", fontSize=8,
                                textColor=GREY, leading=11),
        "value": ParagraphStyle("value", fontName="Helvetica-Bold", fontSize=9.5,
                                textColor=DARK_BLUE, leading=13),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9,
                               textColor=DARK_BLUE, leading=13),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9,
                               textColor=DARK_BLUE, leading=12),
        "cell_right": ParagraphStyle("cell_right", fontName="Helvetica", fontSize=9,
                                     textColor=DARK_BLUE, leading=12, alignment=TA_RIGHT),
        "cell_head": ParagraphStyle("cell_head", fontName="Helvetica-Bold", fontSize=8.5,
                                    textColor=colors.white, leading=11),
        "cell_head_right": ParagraphStyle("cell_head_right", fontName="Helvetica-Bold",
                                          fontSize=8.5, textColor=colors.white, leading=11,
                                          alignment=TA_RIGHT),
        "total_label": ParagraphStyle("total_label", fontName="Helvetica-Bold", fontSize=10,
                                      textColor=DARK_BLUE, leading=14, alignment=TA_RIGHT),
        "total_value": ParagraphStyle("total_value", fontName="Helvetica-Bold", fontSize=10,
                                      textColor=DARK_BLUE, leading=14, alignment=TA_RIGHT),
        "grand_label": ParagraphStyle("grand_label", fontName="Helvetica-Bold", fontSize=11,
                                      textColor=colors.white, leading=15, alignment=TA_RIGHT),
        "grand_value": ParagraphStyle("grand_value", fontName="Helvetica-Bold", fontSize=11,
                                      textColor=colors.white, leading=15, alignment=TA_RIGHT),
        "note": ParagraphStyle("note", fontName="Helvetica", fontSize=8,
                               textColor=GREY, leading=11),
        "footer": ParagraphStyle("footer", fontName="Helvetica", fontSize=7.5,
                                 textColor=GREY, leading=10, alignment=TA_CENTER),
        "status": ParagraphStyle("status", fontName="Helvetica-Bold", fontSize=10,
                                 textColor=colors.white, leading=13, alignment=TA_CENTER),
    }


def _logo_flowable(company, styles):
    path = getattr(company, "logo", None)
    if path:
        try:
            if hasattr(path, "path") and os.path.exists(path.path):
                image = RLImage(path.path, width=34 * mm, height=14 * mm)
                image.hAlign = "LEFT"
                return image
        except Exception:  # a corrupt or oversized logo must never block a receipt
            pass
    return Paragraph(esc(company.name), styles["company"])


def _letterhead(company, doc_title, doc_number, styles):
    contact_bits = [
        company.address,
        company.city,
        company.country,
        company.phone,
        company.email,
        company.website,
    ]
    contact_line = "  |  ".join(esc(bit) for bit in contact_bits if bit)
    logo = _logo_flowable(company, styles)
    left = [logo]
    if isinstance(logo, RLImage):
        left.append(Spacer(1, 1.5 * mm))
        left.append(Paragraph(esc(company.name), styles["company"]))
    if contact_line:
        left.append(Spacer(1, 1.5 * mm))
        left.append(Paragraph(contact_line, styles["company_sub"]))

    right = [
        Paragraph(esc(doc_title).upper(), styles["doc_title"]),
        Spacer(1, 1.5 * mm),
        Paragraph(esc(doc_number), styles["doc_number"]),
    ]
    table = Table([[left, right]], colWidths=[CONTENT_WIDTH * 0.58, CONTENT_WIDTH * 0.42])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [table, Spacer(1, 3 * mm),
            HRFlowable(width="100%", thickness=1.6, color=DARK_BLUE, spaceAfter=1 * mm),
            HRFlowable(width="100%", thickness=0.6, color=RED, spaceAfter=5 * mm)]


def _meta_block(meta, styles, columns=2):
    """meta is a list of (heading, [(label, value), ...]) groups."""
    cells = []
    for heading, rows in meta:
        inner = [[Paragraph(f"<b>{esc(heading).upper()}</b>", styles["section"])]]
        for label, value in rows:
            if value in (None, ""):
                continue
            inner.append([Paragraph(f"{esc(label)}: <b>{esc(value)}</b>", styles["body"])])
        box = Table(inner, colWidths=[CONTENT_WIDTH / columns - 6 * mm])
        box.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        cells.append(box)

    rows = []
    for start in range(0, len(cells), columns):
        chunk = cells[start:start + columns]
        while len(chunk) < columns:
            chunk.append("")
        rows.append(chunk)

    table = Table(rows, colWidths=[CONTENT_WIDTH / columns] * columns)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE_GREY),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE_GREY),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5 * mm),
    ]))
    return table


def _lines_table(line_items, styles, headers=("Description", "Period", "Amount")):
    data = [[
        Paragraph(esc(headers[0]), styles["cell_head"]),
        Paragraph(esc(headers[1]), styles["cell_head"]),
        Paragraph(esc(headers[2]), styles["cell_head_right"]),
    ]]
    for item in line_items:
        data.append([
            Paragraph(esc(item.get("description", "")), styles["cell"]),
            Paragraph(esc(item.get("period", "")), styles["cell"]),
            Paragraph(esc(item.get("amount", "")), styles["cell_right"]),
        ])
    table = Table(
        data,
        colWidths=[CONTENT_WIDTH * 0.46, CONTENT_WIDTH * 0.26, CONTENT_WIDTH * 0.28],
        repeatRows=1,
    )
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), DARK_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE_GREY),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BLUE]),
    ]
    table.setStyle(TableStyle(style))
    return table


def _totals_table(totals, styles):
    """totals is a list of (label, value, is_grand_total)."""
    rows = []
    for label, value, grand in totals:
        if grand:
            rows.append([Paragraph(esc(label), styles["grand_label"]),
                         Paragraph(esc(value), styles["grand_value"])])
        else:
            rows.append([Paragraph(esc(label), styles["total_label"]),
                         Paragraph(esc(value), styles["total_value"])])
    table = Table(rows, colWidths=[CONTENT_WIDTH * 0.30, CONTENT_WIDTH * 0.30],
                  hAlign="RIGHT")
    grand_rows = [i for i, t in enumerate(totals) if t[2]]
    style = [
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.6 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6 * mm),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    for index in grand_rows:
        style += [
            ("BACKGROUND", (0, index), (-1, index), RED),
            ("TOPPADDING", (0, index), (-1, index), 2.6 * mm),
            ("BOTTOMPADDING", (0, index), (-1, index), 2.6 * mm),
        ]
    table.setStyle(TableStyle(style))
    return table


def _status_stamp(text, styles, colour=DARK_BLUE):
    table = Table([[Paragraph(esc(text).upper(), styles["status"])]],
                  colWidths=[CONTENT_WIDTH * 0.34], hAlign="RIGHT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colour),
        ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
    ]))
    return table


def _signature_block(styles, signer_name):
    left = Paragraph(
        "<b>For and on behalf of Mant Bridges LTD</b><br/><br/><br/>"
        "_______________________________<br/>"
        f"{esc(signer_name or 'Authorised Officer')}<br/>Authorised Signatory",
        styles["note"],
    )
    right = Paragraph(
        "<b>Received and acknowledged by</b><br/><br/><br/>"
        "_______________________________<br/>Signature &amp; date",
        styles["note"],
    )
    table = Table([[left, right]], colWidths=[CONTENT_WIDTH * 0.5, CONTENT_WIDTH * 0.5])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 6 * mm),
    ]))
    return table


def _on_page(canvas, doc, company, doc_title):
    canvas.saveState()
    canvas.setStrokeColor(DARK_BLUE)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 22 * mm, PAGE_WIDTH - MARGIN, 22 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GREY)
    footer_left = f"{company.name}  |  {company.email}  |  {company.phone}"
    canvas.drawString(MARGIN, 17 * mm, footer_left)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 17 * mm, f"{doc_title} - Page {doc.page}")
    canvas.setFont("Helvetica-Oblique", 7)
    canvas.drawCentredString(
        PAGE_WIDTH / 2, 12 * mm,
        "This is a computer-generated document and is valid without a physical seal.",
    )
    canvas.restoreState()


def _build(filename, story, company, doc_title):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=26 * mm,
        title=doc_title,
        author=company.name,
        subject=doc_title,
        creator=f"{company.name} Platform",
    )
    doc.build(story, onFirstPage=lambda c, d: _on_page(c, d, company, doc_title),
              onLaterPages=lambda c, d: _on_page(c, d, company, doc_title))
    buffer.seek(0)
    buffer.name = filename
    return buffer


def render_receipt_pdf(data):
    """data keys: number, issued_on, company, payer, meta_groups, line_items,
    totals, payment_details, notes, signer."""
    from apps.core.models import Company

    company = data.get("company") or Company.load()
    styles = _styles()
    story = _letterhead(company, "Payment Receipt", data["number"], styles)
    story.append(Spacer(1, 2 * mm))

    amount_row = [[
        Paragraph("<b>AMOUNT RECEIVED</b><br/><font size=8>Payment confirmed</font>",
                  ParagraphStyle("al", parent=styles["body"], textColor=colors.white)),
        Paragraph(esc(data.get("amount_display", "")),
                  ParagraphStyle("av", parent=styles["doc_title"], textColor=colors.white,
                                 fontSize=16)),
    ]]
    banner = Table(amount_row, colWidths=[CONTENT_WIDTH * 0.62, CONTENT_WIDTH * 0.38])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), DARK_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm),
    ]))
    story.append(banner)
    story.append(Spacer(1, 5 * mm))

    story.append(_meta_block(data.get("meta_groups", []), styles))
    story.append(Spacer(1, 5 * mm))

    if data.get("line_items"):
        story.append(Paragraph("<b>PAYMENT BREAKDOWN</b>", styles["section"]))
        story.append(Spacer(1, 2 * mm))
        story.append(_lines_table(data["line_items"], styles))
        story.append(Spacer(1, 4 * mm))

    if data.get("totals"):
        story.append(_totals_table(data["totals"], styles))
        story.append(Spacer(1, 4 * mm))

    if data.get("payment_details"):
        story.append(_meta_block(
            [("Payment details", data["payment_details"])], styles, columns=1
        ))
        story.append(Spacer(1, 4 * mm))

    if data.get("notes"):
        story.append(Paragraph(esc(data["notes"]), styles["note"]))
        story.append(Spacer(1, 3 * mm))

    story.append(_signature_block(styles, data.get("signer")))
    return _build(f"receipt-{data['number']}.pdf", story, company, "Payment Receipt")


def render_invoice_pdf(data):
    """data keys: number, company, status_text, meta_groups, line_items, totals,
    payment_instructions, notes."""
    from apps.core.models import Company

    company = data.get("company") or Company.load()
    styles = _styles()
    story = _letterhead(company, data.get("doc_title", "Rent Invoice"), data["number"], styles)

    if data.get("status_text"):
        colour = {"PAID": colors.HexColor("#1B7F4B"), "OVERDUE": RED}.get(
            data.get("status"), DARK_BLUE
        )
        story.append(_status_stamp(data["status_text"], styles, colour))
        story.append(Spacer(1, 4 * mm))

    story.append(_meta_block(data.get("meta_groups", []), styles))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("<b>CHARGES</b>", styles["section"]))
    story.append(Spacer(1, 2 * mm))
    story.append(_lines_table(data["line_items"], styles))
    story.append(Spacer(1, 4 * mm))
    story.append(_totals_table(data["totals"], styles))
    story.append(Spacer(1, 6 * mm))

    if data.get("payment_instructions"):
        instructions = [[Paragraph("<b>HOW TO PAY</b>", styles["section"])]]
        for line in data["payment_instructions"]:
            instructions.append([Paragraph(esc(line), styles["body"])])
        box = Table(instructions, colWidths=[CONTENT_WIDTH])
        box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BLUE),
            ("BOX", (0, 0), (-1, -1), 0.6, LINE_GREY),
            ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 1.2 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2 * mm),
        ]))
        story.append(box)
        story.append(Spacer(1, 4 * mm))

    if data.get("notes"):
        story.append(Paragraph(esc(data["notes"]), styles["note"]))

    return _build(f"invoice-{data['number']}.pdf", story, company,
                  data.get("doc_title", "Rent Invoice"))
