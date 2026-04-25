from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import KeepInFrame, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path("/Users/jannatuladny/cat-6.1")
OUTPUT = ROOT / "output" / "pdf" / "studiestalk-app-summary.pdf"


def p(text, style):
    return Paragraph(text, style)


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        leftMargin=0.48 * inch,
        rightMargin=0.48 * inch,
        topMargin=0.42 * inch,
        bottomMargin=0.42 * inch,
        title="StudiesTalk App Summary",
        author="Codex",
    )

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=20,
        textColor=colors.HexColor("#143A52"),
        spaceAfter=4,
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=10.2,
        textColor=colors.HexColor("#5B6770"),
        spaceAfter=8,
    )
    h = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10.2,
        leading=12,
        textColor=colors.HexColor("#143A52"),
        spaceBefore=3,
        spaceAfter=3,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.25,
        leading=9.8,
        textColor=colors.black,
        spaceAfter=2,
    )
    bullet = ParagraphStyle(
        "Bullet",
        parent=body,
        leftIndent=10,
        firstLineIndent=-7,
        bulletIndent=0,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=8.25,
        spaceAfter=1.5,
    )
    small = ParagraphStyle(
        "Small",
        parent=body,
        fontSize=7.8,
        leading=9.2,
        textColor=colors.HexColor("#3F4A54"),
        spaceAfter=1.5,
    )

    story = [
        p("StudiesTalk App Summary", title),
        p(
            "Repo-backed one-page overview generated from code, package metadata, and docs in this workspace.",
            subtitle,
        ),
        p("What It Is", h),
        p(
            "StudiesTalk is a full-stack, multi-tenant workspace app for language schools. "
            "Repo evidence shows chat, class operations, analytics, email, AI voice practice, and admin tooling in one web application.",
            body,
        ),
        p("Who It's For", h),
        p(
            "Primary persona: a language school administrator or teacher running a school workspace; student-facing flows also exist in the repo.",
            body,
        ),
        p("What It Does", h),
    ]

    feature_bullets = [
        "Multi-tenant workspaces with role handling for <b>student</b>, <b>teacher</b>, <b>admin</b>, and <b>super_admin</b>.",
        "Channels, direct messages, threaded replies, reactions, typing indicators, search, and file sharing.",
        "Tasks, comments, homework/class planning hooks, announcements, calendar events, and attendance endpoints.",
        "Live classes with Jitsi token issuance, room scheduling, session join flow, and slide state streaming/sync.",
        "Analytics dashboards with school, teacher, and student overview endpoints.",
        "AI features including chat, streaming chat, realtime voice practice, runtime tracking, and workspace budget controls.",
        "Workspace email settings, templates, inbox/reply flows, plus OTP, password reset, and admin security controls.",
    ]
    for item in feature_bullets:
        story.append(Paragraph(item, bullet, bulletText="-"))

    story.extend(
        [
            p("How It Works", h),
            p(
                "<b>Frontend:</b> Static assets in <font name='Helvetica-Oblique'>public/</font> provide the main shell "
                "(<font name='Helvetica-Oblique'>index.html</font>, <font name='Helvetica-Oblique'>app.js</font>) and feature modules for analytics, calendar, announcements, live classes, and AI voice practice.",
                small,
            ),
            p(
                "<b>Backend:</b> <font name='Helvetica-Oblique'>server.js</font> runs an Express app with JSON/form parsing, static hosting, cookies, Helmet, CORS, rate limits, CSRF checks, uploads, and many REST endpoints; "
                "the DB-backed live-class flows now live directly in <font name='Helvetica-Oblique'>server.js</font> and use the shared Jitsi config/token services under <font name='Helvetica-Oblique'>server/config/</font> and <font name='Helvetica-Oblique'>server/services/</font>.",
                small,
            ),
            p(
                "<b>Data + services:</b> SQLite via <font name='Helvetica-Oblique'>better-sqlite3</font> defaults to <font name='Helvetica-Oblique'>worknest.db</font>; uploads live in <font name='Helvetica-Oblique'>uploads/</font>; "
                "email attachments live in <font name='Helvetica-Oblique'>storage/email_attachments/</font>. Optional integrations in code include Jitsi, OpenAI realtime, Google Translate, Twilio OTP, and SMTP/IMAP email.",
                small,
            ),
            p(
                "<b>Data flow:</b> Browser UI -> Express REST endpoints -> SQLite / local file storage -> optional external services when configured.",
                small,
            ),
            p("How To Run", h),
        ]
    )

    run_bullets = [
        "Install dependencies: <b>npm install</b>",
        "Create a <b>.env</b> file. Exact example: <b>Not found in repo</b>. Minimum local defaults visible in code include <b>PORT</b> (3000 by default), JWT secrets, DB/upload paths, and optional service keys.",
        "Start the app: <b>npm start</b> or <b>npm run dev</b>",
        "Open <b>http://localhost:3000</b> for the main app; <b>/admin</b> is also served.",
    ]
    for item in run_bullets:
        story.append(Paragraph(item, bullet, bulletText="-"))

    story.append(Spacer(1, 2))
    story.append(
        p(
            "Notes: Database migrations/setup instructions for a full production environment are partial across repo docs; a single authoritative local setup guide was not found.",
            subtitle,
        )
    )

    usable_height = letter[1] - doc.topMargin - doc.bottomMargin
    frame = KeepInFrame(doc.width, usable_height, story, mode="shrink")
    doc.build([frame])


if __name__ == "__main__":
    build_pdf()
