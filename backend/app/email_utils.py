from datetime import datetime
import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from io import BytesIO
from typing import Any


def get_logo_url():
    """Return Cloudflare image delivery URL for logo"""
    return "https://imagedelivery.net/aXD6F8TpSqFkWdaUpALrGA/fc05a0df-3ad1-4d0d-1990-5c45c51fe000/public"


def send_email(sender_email, sender_password, recipient_email, subject, body, attachments: list[dict[str, Any]] | None = None):
    """Send email using Gmail SMTP"""
    try:
        msg = MIMEMultipart()
        msg.set_unixfrom('author')
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))

        for attachment in attachments or []:
            content = attachment.get("content")
            filename = attachment.get("filename", "attachment.bin")
            mime_type = attachment.get("mime_type", "application/octet-stream")
            if not content:
                continue

            part = MIMEApplication(content, _subtype=mime_type.split("/")[-1])
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        mailserver = smtplib.SMTP('smtp.gmail.com', 587)
        mailserver.starttls()
        mailserver.ehlo()
        mailserver.login(sender_email, sender_password)
        mailserver.sendmail(sender_email, recipient_email, msg.as_string())
        mailserver.quit()
        print(f"Email sent successfully to {recipient_email}")
    except Exception as e:
        print(f"Email send failed: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()


def generate_booking_confirmation_pdf(
    booking_reference: str,
    order_id: str,
    total_amount: str,
    currency: str,
    payment_status: str,
    created_at: str,
    passengers: list[dict] | None = None,
    slices: list[dict] | None = None,
    remaining_balance: float | None = None,
) -> bytes:
    """Generate a lightweight colored PDF summary without external dependencies."""

    def _escape_pdf_text(value: str) -> str:
        return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    lines = [
        "Trips2gether - Booking Confirmation",
        "",
        f"Booking Reference: {booking_reference}",
        f"Order ID: {order_id}",
        f"Total Amount: {currency} {total_amount}",
        f"Payment Status: {payment_status}",
        f"Booked At: {created_at}",
    ]
    if remaining_balance is not None:
        lines.append(f"Wallet Balance Remaining: USD {remaining_balance:.2f}")

    lines.extend(["", "Passengers:"])
    if passengers:
        for idx, pax in enumerate(passengers, start=1):
            full_name = f"{(pax.get('title') or '').strip()} {(pax.get('given_name') or '').strip()} {(pax.get('family_name') or '').strip()}".strip() or "Passenger"
            email = pax.get("email") or "N/A"
            lines.append(f"{idx}. {full_name} - {email}")
    else:
        lines.append("No passenger details available")

    lines.extend(["", "Itinerary:"])
    if slices:
        for idx, slice_item in enumerate(slices, start=1):
            origin = (slice_item.get("origin") or {}).get("iata_code", "N/A")
            destination = (slice_item.get("destination") or {}).get("iata_code", "N/A")
            duration = slice_item.get("duration") or "N/A"
            lines.append(f"{idx}. {origin} -> {destination} ({duration})")
    else:
        lines.append("No itinerary details available")

    content_parts = []
    y = 770
    for idx, line in enumerate(lines):
        font = "/F1 11 Tf"
        color = "0.12 0.16 0.20 rg"
        if idx == 0:
            font = "/F1 20 Tf"
            color = "0.055 0.247 0.18 rg"
        elif line in ("Passengers:", "Itinerary:"):
            font = "/F1 14 Tf"
            color = "0.08 0.32 0.23 rg"

        safe = _escape_pdf_text(line)
        content_parts.append(f"BT {font} {color} 50 {y} Td ({safe}) Tj ET")
        y -= 18
        if y < 40:
            break

    content_stream = "\n".join(content_parts).encode("latin-1", errors="replace")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        b"5 0 obj\n<< /Length " + str(len(content_stream)).encode("ascii") + b" >>\nstream\n" + content_stream + b"\nendstream\nendobj\n",
    ]

    buffer = BytesIO()
    buffer.write(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(buffer.tell())
        buffer.write(obj)

    xref_pos = buffer.tell()
    buffer.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    buffer.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        buffer.write(f"{offset:010d} 00000 n \n".encode("ascii"))

    buffer.write(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n"
        ).encode("ascii")
    )

    return buffer.getvalue()


def get_welcome_email_template(name):
    """Professional welcome email template with logo"""
    logo_url = get_logo_url()
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #f5f5f5 0%, #f0f0f0 100%);
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }}
            .header {{
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                padding: 40px;
                text-align: center;
                color: white;
            }}
            .logo {{
                max-width: 150px;
                height: auto;
                margin-bottom: 16px;
            }}
            .header h1 {{
                margin: 0;
                font-size: 28px;
                font-weight: 700;
                letter-spacing: -0.5px;
            }}
            .header p {{
                margin: 8px 0 0 0;
                font-size: 14px;
                opacity: 0.9;
            }}
            .content {{
                padding: 40px;
                color: #333;
            }}
            .greeting {{
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 16px;
                color: #0E3F2E;
            }}
            .message {{
                font-size: 15px;
                line-height: 1.6;
                color: #555;
                margin: 16px 0;
            }}
            .features {{
                background: #f9fafb;
                padding: 24px;
                border-radius: 8px;
                margin: 24px 0;
            }}
            .feature-item {{
                display: flex;
                margin: 12px 0;
                font-size: 14px;
                color: #555;
            }}
            .feature-icon {{
                margin-right: 12px;
                color: #F2D34F;
                font-weight: bold;
                font-size: 16px;
            }}
            .cta-button {{
                display: inline-block;
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                color: white;
                padding: 14px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 24px 0;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 4px 12px rgba(14, 63, 46, 0.3);
            }}
            .cta-button:hover {{
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(14, 63, 46, 0.4);
            }}
            .footer {{
                background: #f5f5f5;
                padding: 20px 40px;
                text-align: center;
                font-size: 12px;
                color: #999;
                border-top: 1px solid #e0e0e0;
            }}
            .footer p {{
                margin: 4px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="{logo_url}" alt="Trips2gether" class="logo">
                <h1>Trips2gether</h1>
                <p>Your Adventure Awaits</p>
            </div>
            
            <div class="content">
                <div class="greeting">Welcome, {name}!</div>
                
                <div class="message">
                    We're thrilled to have you join our community of adventurers and travel enthusiasts. Your account is ready to go!
                </div>
                
                <div class="features">
                    <div class="feature-item">
                        <span class="feature-icon">✓</span>
                        <span>Plan trips together with friends</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">✓</span>
                        <span>Discover amazing travel destinations</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">✓</span>
                        <span>Share itineraries and real-time locations</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">✓</span>
                        <span>Connect with fellow travelers</span>
                    </div>
                </div>
                
                <div class="message">
                    Start planning your next adventure today!
                </div>
            </div>
            
            <div class="footer">
                <p><strong>Trips2gether</strong> © 2026</p>
                <p>Made with ❤ for travelers, by travelers</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_login_email_template(name):
    """Professional login notification email template with logo"""
    logo_url = get_logo_url()
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #f5f5f5 0%, #f0f0f0 100%);
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }}
            .header {{
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                padding: 30px 40px;
                text-align: center;
                color: white;
            }}
            .logo {{
                max-width: 150px;
                height: auto;
                margin-bottom: 12px;
            }}
            .header h2 {{
                margin: 0 0 0 25px;
                font-size: 18px;
                font-weight: 600;
            }}
            .content {{
                padding: 40px;
                color: #333;
            }}
            .status {{
                display: inline-block;
                background: #d4edda;
                color: #155724;
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 24px;
            }}
            .message {{
                font-size: 15px;
                line-height: 1.6;
                color: #555;
                margin: 16px 0;
            }}
            .info-box {{
                background: #f0f4f8;
                padding: 16px;
                border-left: 4px solid #0E3F2E;
                border-radius: 6px;
                margin: 24px 0;
                font-size: 14px;
            }}
            .info-label {{
                color: #0E3F2E;
                font-weight: 600;
                margin-bottom: 4px;
            }}
            .footer {{
                background: #f5f5f5;
                padding: 20px 40px;
                text-align: center;
                font-size: 12px;
                color: #999;
                border-top: 1px solid #e0e0e0;
            }}
            .footer p {{
                margin: 4px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="{logo_url}" alt="Trips2gether" class="logo">
                <h2>Login Detected</h2>
            </div>
            
            <div class="content">
                <div class="status">✓ Successful Login</div>
                
                <div class="message">
                    Hi {name},
                </div>
                
                <div class="message">
                    We've detected a successful login to your Trips2gether account. If this was you, great! You can safely ignore this email.
                </div>
                
                <div class="info-box">
                    <div class="info-label">Date & Time</div>
                    <div>{datetime.now().strftime('%B %d, %Y at %I:%M %p')}</div>
                </div>
                
                <div class="message">
                    <strong>Didn't log in?</strong> If someone else accessed your account, we recommend changing your password immediately.
                </div>
            </div>
            
            <div class="footer">
                <p><strong>Trips2gether</strong> © 2026</p>
                <p>Keeping your adventures secure</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_password_reset_email_template(email: str, reset_code: str, reset_link: str):
    """Professional password reset email template with code and link"""
    logo_url = get_logo_url()
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #f5f5f5 0%, #f0f0f0 100%);
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }}
            .header {{
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                padding: 40px;
                text-align: center;
                color: white;
            }}
            .logo {{
                max-width: 150px;
                height: auto;
                margin-bottom: 12px;
            }}
            .header h2 {{
                margin: 0;
                font-size: 22px;
                font-weight: 600;
            }}
            .content {{
                padding: 40px;
                color: #333;
            }}
            .message {{
                font-size: 15px;
                line-height: 1.6;
                color: #555;
                margin: 16px 0;
            }}
            .code-box {{
                background: #f9fafb;
                border: 2px solid #186C50;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                margin: 24px 0;
            }}
            .code {{
                font-size: 32px;
                font-weight: 700;
                color: #0E3F2E;
                letter-spacing: 4px;
                font-family: 'Courier New', monospace;
            }}
            .code-label {{
                font-size: 12px;
                color: #999;
                margin-top: 8px;
            }}
            .cta-button {{
                display: inline-block;
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                color: white;
                padding: 14px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 16px 0;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 4px 12px rgba(14, 63, 46, 0.3);
            }}
            .cta-button:hover {{
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(14, 63, 46, 0.4);
            }}
            .divider {{
                text-align: center;
                color: #999;
                margin: 20px 0;
                font-size: 14px;
            }}
            .footer {{
                background: #f5f5f5;
                padding: 20px 40px;
                text-align: center;
                font-size: 12px;
                color: #999;
                border-top: 1px solid #e0e0e0;
            }}
            .footer p {{
                margin: 4px 0;
            }}
            .warning {{
                background: #fffbea;
                border-left: 4px solid #f59e0b;
                padding: 12px;
                border-radius: 4px;
                color: #92400e;
                font-size: 13px;
                margin: 16px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="{logo_url}" alt="Trips2gether" class="logo">
                <h2>Password Reset</h2>
            </div>
            
            <div class="content">
                <div class="message">
                    We received a request to reset the password for your Trips2gether account. Click below or use the code to proceed.
                </div>

                <div class="code-box">
                    <div class="code">{reset_code}</div>
                    <div class="code-label">Your verification code (expires in 1 hour)</div>
                </div>

                <div style="text-align: center;">
                    <a href="{reset_link}" class="cta-button" style="color: white; text-decoration: none;">Reset Password</a>
                </div>

                <div class="divider">Or enter your code manually</div>

                <div class="message">
                    <strong>How to use:</strong>
                    <ul style="margin: 8px 0; padding-left: 20px;">
                        <li>Click the button above, or</li>
                        <li>Visit the password reset link, or</li>
                        <li>Enter the 6-digit code: <strong>{reset_code}</strong></li>
                    </ul>
                </div>

                <div class="warning">
                    <strong>⚠️ Security Notice:</strong> This link and code expire in 1 hour. If you didn't request this, please ignore this email or contact our support team.
                </div>

                <div class="message" style="margin-top: 24px;">
                    Trips2gether Security Team
                </div>
            </div>
            
            <div class="footer">
                <p><strong>Trips2gether</strong> © 2026</p>
                <p>Keep your account secure</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_email_verification_template(name: str, verification_code: str, verification_link: str):
    """Professional email verification template"""
    logo_url = get_logo_url()
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #f5f5f5 0%, #f0f0f0 100%);
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }}
            .header {{
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                padding: 40px;
                text-align: center;
                color: white;
            }}
            .logo {{
                max-width: 150px;
                height: auto;
                margin-bottom: 12px;
            }}
            .header h2 {{
                margin: 0;
                font-size: 22px;
                font-weight: 600;
            }}
            .content {{
                padding: 40px;
                color: #333;
            }}
            .greeting {{
                font-size: 18px;
                font-weight: 600;
                color: #0E3F2E;
                margin-bottom: 16px;
            }}
            .message {{
                font-size: 15px;
                line-height: 1.6;
                color: #555;
                margin: 16px 0;
            }}
            .code-box {{
                background: #f9fafb;
                border: 2px solid #186C50;
                border-radius: 8px;
                padding: 24px;
                text-align: center;
                margin: 24px 0;
            }}
            .code {{
                font-size: 36px;
                font-weight: 700;
                color: #0E3F2E;
                letter-spacing: 6px;
                font-family: 'Courier New', monospace;
            }}
            .code-label {{
                font-size: 12px;
                color: #999;
                margin-top: 12px;
            }}
            .cta-button {{
                display: inline-block;
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                color: white;
                padding: 14px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 16px 0;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 4px 12px rgba(14, 63, 46, 0.3);
            }}
            .cta-button:hover {{
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(14, 63, 46, 0.4);
            }}
            .divider {{
                text-align: center;
                color: #999;
                margin: 20px 0;
                font-size: 14px;
            }}
            .steps {{
                background: #f0f4f8;
                padding: 16px;
                border-radius: 6px;
                margin: 16px 0;
            }}
            .step {{
                margin: 8px 0;
                font-size: 14px;
                color: #555;
            }}
            .step-number {{
                display: inline-block;
                background: #186C50;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                text-align: center;
                line-height: 24px;
                font-weight: 600;
                margin-right: 8px;
            }}
            .warning {{
                background: #fffbea;
                border-left: 4px solid #f59e0b;
                padding: 12px;
                border-radius: 4px;
                color: #92400e;
                font-size: 13px;
                margin: 16px 0;
            }}
            .footer {{
                background: #f5f5f5;
                padding: 20px 40px;
                text-align: center;
                font-size: 12px;
                color: #999;
                border-top: 1px solid #e0e0e0;
            }}
            .footer p {{
                margin: 4px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="{logo_url}" alt="Trips2gether" class="logo">
                <h2>Verify Your Email</h2>
            </div>
            
            <div class="content">
                <div class="greeting">Hi {name},</div>
                
                <div class="message">
                    Welcome to Trips2gether! We're excited to have you on board. To get started, please verify your email address using the code below.
                </div>

                <div class="code-box">
                    <div class="code">{verification_code}</div>
                    <div class="code-label">Your verification code (expires in 1 hour)</div>
                </div>

                <div style="text-align: center;">
                    <a href="{verification_link}" class="cta-button" style="color: white; text-decoration: none;">Verify Email</a>
                </div>

                <div class="divider">Or use the code manually</div>

                <div class="steps">
                    <div class="step"><span class="step-number">1</span> Go to the verification page</div>
                    <div class="step"><span class="step-number">2</span> Enter the code: <strong>{verification_code}</strong></div>
                    <div class="step"><span class="step-number">3</span> Start planning your adventure!</div>
                </div>

                <div class="warning">
                    ⏰ <strong>Code expires in 1 hour.</strong> If you didn't create this account, please contact our support team.
                </div>

                <div class="message" style="margin-top: 24px; color: #999; font-size: 14px;">
                    Happy travels!<br>
                    The Trips2gether Team ✈️
                </div>
            </div>
            
            <div class="footer">
                <p><strong>Trips2gether</strong> © 2026</p>
                <p>Your adventure awaits</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_account_deletion_email_template(name: str, deleted_at: str) -> str:
    """HTML email template sent after permanent account deletion."""
    logo_url = get_logo_url()
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background: #f5f5f5;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }}
            .header {{
                background: linear-gradient(135deg, #7b2d2d 0%, #c53030 100%);
                padding: 40px;
                text-align: center;
                color: white;
            }}
            .logo {{
                max-width: 150px;
                height: auto;
                margin-bottom: 16px;
            }}
            .header h1 {{
                margin: 0;
                font-size: 26px;
                font-weight: 700;
            }}
            .header p {{
                margin: 8px 0 0 0;
                font-size: 14px;
                opacity: 0.9;
            }}
            .content {{
                padding: 40px;
                color: #333;
            }}
            .greeting {{
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 16px;
                color: #7b2d2d;
            }}
            .message {{
                font-size: 15px;
                line-height: 1.6;
                color: #555;
                margin: 16px 0;
            }}
            .info-box {{
                background: #fff5f5;
                border: 1px solid #feb2b2;
                padding: 20px 24px;
                border-radius: 8px;
                margin: 24px 0;
                font-size: 14px;
                color: #742a2a;
            }}
            .info-box strong {{
                display: block;
                margin-bottom: 6px;
                font-size: 15px;
            }}
            .footer {{
                background: #f5f5f5;
                padding: 20px 40px;
                text-align: center;
                font-size: 12px;
                color: #999;
                border-top: 1px solid #e0e0e0;
            }}
            .footer p {{
                margin: 4px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="{logo_url}" alt="Trips2gether" class="logo">
                <h1>Account Deleted</h1>
                <p>We're sorry to see you go</p>
            </div>

            <div class="content">
                <div class="greeting">Goodbye, {name}.</div>

                <div class="message">
                    This email confirms that your Trips2gether account has been <strong>permanently deleted</strong>.
                    All of your data — including your profile, preferences, group memberships, and friendships — has been removed from our systems.
                </div>

                <div class="info-box">
                    <strong>Deletion confirmed</strong>
                    Timestamp: {deleted_at}
                </div>

                <div class="message">
                    If you did <strong>not</strong> request this deletion, please contact our support team immediately.
                </div>

                <div class="message" style="margin-top: 24px; color: #999; font-size: 14px;">
                    You're always welcome to create a new account at trips2gether.com.<br><br>
                    — The Trips2gether Team
                </div>
            </div>

            <div class="footer">
                <p><strong>Trips2gether</strong> © 2026</p>
                <p>Made with ❤ for travelers, by travelers</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_booking_confirmation_email_template(
    name: str,
    booking_reference: str,
    order_id: str,
    total_amount: str,
    currency: str,
    payment_status: str,
    created_at: str,
    passengers: list[dict] | None = None,
    slices: list[dict] | None = None,
    remaining_balance: float | None = None,
) -> str:
    """HTML email template sent after successful booking creation."""
    logo_url = get_logo_url()

    passenger_rows = ""
    for idx, pax in enumerate(passengers or [], start=1):
        full_name = f"{(pax.get('title') or '').strip()} {(pax.get('given_name') or '').strip()} {(pax.get('family_name') or '').strip()}".strip()
        passenger_rows += f"""
            <tr>
                <td style=\"padding: 10px 12px; border-bottom: 1px solid #eef2f7;\">{idx}</td>
                <td style=\"padding: 10px 12px; border-bottom: 1px solid #eef2f7;\">{full_name or 'Passenger'}</td>
                <td style=\"padding: 10px 12px; border-bottom: 1px solid #eef2f7;\">{(pax.get('email') or 'N/A')}</td>
            </tr>
        """

    slice_rows = ""
    for slice_item in slices or []:
        origin = (slice_item.get("origin") or {}).get("iata_code", "N/A")
        destination = (slice_item.get("destination") or {}).get("iata_code", "N/A")
        duration = slice_item.get("duration") or "N/A"
        slice_rows += f"""
            <tr>
                <td style=\"padding: 10px 12px; border-bottom: 1px solid #eef2f7;\">{origin} → {destination}</td>
                <td style=\"padding: 10px 12px; border-bottom: 1px solid #eef2f7;\">{duration}</td>
            </tr>
        """

    balance_row = ""
    if remaining_balance is not None:
        balance_row = f"""
            <div class=\"meta-item\">
                <div class=\"meta-label\">Wallet Balance Remaining</div>
                <div class=\"meta-value\">USD {remaining_balance:.2f}</div>
            </div>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset=\"UTF-8\">
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background: #f3f5f7;
                color: #2a2f36;
            }}
            .container {{
                max-width: 680px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 6px 24px rgba(0,0,0,0.08);
            }}
            .header {{
                background: linear-gradient(135deg, #0E3F2E 0%, #186C50 100%);
                color: #ffffff;
                text-align: center;
                padding: 28px 24px;
            }}
            .logo {{
                max-width: 140px;
                height: auto;
                margin-bottom: 10px;
            }}
            .header h1 {{
                margin: 0;
                font-size: 26px;
            }}
            .header p {{
                margin: 8px 0 0;
                opacity: 0.95;
            }}
            .content {{
                padding: 28px 24px;
            }}
            .meta-grid {{
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
                margin: 18px 0 22px;
            }}
            .meta-item {{
                border: 1px solid #d8e2dc;
                border-radius: 8px;
                padding: 12px;
                background: #f8fbf9;
            }}
            .meta-label {{
                color: #6b7280;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                margin-bottom: 4px;
            }}
            .meta-value {{
                color: #14523b;
                font-weight: 700;
                font-size: 15px;
                word-break: break-word;
            }}
            .section-title {{
                margin: 20px 0 10px;
                font-size: 18px;
                color: #14523b;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                margin-top: 8px;
            }}
            th {{
                text-align: left;
                background: #f0f5f2;
                color: #374151;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                padding: 10px 12px;
            }}
            .footer {{
                text-align: center;
                color: #8a8f98;
                background: #f8fafb;
                padding: 16px 24px;
                font-size: 12px;
                border-top: 1px solid #eaedf0;
            }}
        </style>
    </head>
    <body>
        <div class=\"container\">
            <div class=\"header\">
                <img src=\"{logo_url}\" alt=\"Trips2gether\" class=\"logo\">
                <h1>Booking Confirmed</h1>
                <p>Your trip booking details are ready</p>
            </div>

            <div class=\"content\">
                <p>Hi {name},</p>
                <p>Your booking has been successfully created. Keep this email for your records.</p>

                <div class=\"meta-grid\">
                    <div class=\"meta-item\">
                        <div class=\"meta-label\">Booking Reference</div>
                        <div class=\"meta-value\">{booking_reference}</div>
                    </div>
                    <div class=\"meta-item\">
                        <div class=\"meta-label\">Order ID</div>
                        <div class=\"meta-value\">{order_id}</div>
                    </div>
                    <div class=\"meta-item\">
                        <div class=\"meta-label\">Total Amount</div>
                        <div class=\"meta-value\">{currency} {total_amount}</div>
                    </div>
                    <div class=\"meta-item\">
                        <div class=\"meta-label\">Payment Status</div>
                        <div class=\"meta-value\">{payment_status}</div>
                    </div>
                    <div class=\"meta-item\">
                        <div class=\"meta-label\">Booked At</div>
                        <div class=\"meta-value\">{created_at}</div>
                    </div>
                    {balance_row}
                </div>

                <h3 class=\"section-title\">Passengers</h3>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Name</th>
                            <th>Email</th>
                        </tr>
                    </thead>
                    <tbody>
                        {passenger_rows or '<tr><td colspan=\"3\" style=\"padding: 10px 12px;\">No passenger details available.</td></tr>'}
                    </tbody>
                </table>

                <h3 class=\"section-title\">Itinerary</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Route</th>
                            <th>Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slice_rows or '<tr><td colspan=\"2\" style=\"padding: 10px 12px;\">No itinerary details available.</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div class=\"footer\">
                <p><strong>Trips2gether</strong> © 2026</p>
                <p>Have a great trip.</p>
            </div>
        </div>
    </body>
    </html>
    """
