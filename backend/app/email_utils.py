from datetime import datetime
import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def get_logo_url():
    """Return Cloudflare image delivery URL for logo"""
    return "https://imagedelivery.net/aXD6F8TpSqFkWdaUpALrGA/fc05a0df-3ad1-4d0d-1990-5c45c51fe000/public"


def send_email(sender_email, sender_password, recipient_email, subject, body):
    """Send email using Gmail SMTP"""
    try:
        msg = MIMEMultipart()
        msg.set_unixfrom('author')
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))

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
                <img src="{logo_url}" alt="Trips2Gether" class="logo">
                <h1>Trips2Gether</h1>
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
                <p><strong>Trips2Gether</strong> © 2026</p>
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
                <img src="{logo_url}" alt="Trips2Gether" class="logo">
                <h2>Login Detected</h2>
            </div>
            
            <div class="content">
                <div class="status">✓ Successful Login</div>
                
                <div class="message">
                    Hi {name},
                </div>
                
                <div class="message">
                    We've detected a successful login to your Trips2Gether account. If this was you, great! You can safely ignore this email.
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
                <p><strong>Trips2Gether</strong> © 2026</p>
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
                <img src="{logo_url}" alt="Trips2Gether" class="logo">
                <h2>Password Reset</h2>
            </div>
            
            <div class="content">
                <div class="message">
                    We received a request to reset the password for your Trips2Gether account. Click below or use the code to proceed.
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
                    Trips2Gether Security Team
                </div>
            </div>
            
            <div class="footer">
                <p><strong>Trips2Gether</strong> © 2026</p>
                <p>Keep your account secure</p>
            </div>
        </div>
    </body>
    </html>
    """
