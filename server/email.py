"""Email notification utilities."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .config import config

logger = logging.getLogger("helpotron")


async def send_email(
    to: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
) -> bool:
    """Send an email asynchronously."""
    if not config.smtp_enabled:
        logger.info(f"Email disabled. Would send to {to}: {subject}")
        return True

    # Placeholder — actual SMTP implementation can be added later
    # For now, just log
    logger.info(f"Sending email to {to}: {subject}")
    logger.debug(f"Body: {body}")
    return True


def send_notification(
    to: str,
    notification_type: str,
    data: dict,
) -> None:
    """Schedule a notification email."""
    # Simple in-memory queue or just log
    subject = f"Helpotron: {notification_type.replace('_', ' ').title()}"
    body = f"You have a new notification: {notification_type}\n\nDetails: {data}"
    asyncio.create_task(send_email(to, subject, body))


def send_welcome_email(user_public_id: str, email: Optional[str] = None) -> None:
    """Send a welcome email to a new user."""
    if not email:
        return
    subject = "Welcome to Helpotron! 🚀"
    body = f"""Hello {user_public_id},

Welcome to Helpotron! You've successfully created an account.

Get started by:
1. Installing the browser extension
2. Recording your first lecture
3. Generating study materials

You have 10 free credits to explore.

Happy studying!
— The Helpotron Team"""
    asyncio.create_task(send_email(email, subject, body))


def send_materials_ready_email(public_id: str, email: str, assignment_title: str) -> None:
    """Notify user that materials are ready."""
    subject = f"Study materials ready for {assignment_title}"
    body = f"""Hello {public_id},

Your study materials for "{assignment_title}" are ready!

Log in to helpotron to view them.

Happy studying!
— Helpotron"""
    asyncio.create_task(send_email(email, subject, body))


def send_low_credits_email(public_id: str, email: str, credits: float) -> None:
    """Warn user about low credits."""
    subject = f"Your credits are running low ({credits} remaining)"
    body = f"""Hello {public_id},

You have only {credits} credits remaining.

Top up now to keep generating study materials!

— Helpotron"""
    asyncio.create_task(send_email(email, subject, body))
