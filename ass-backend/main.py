"""Compatibility entry point. Run `uvicorn app.main:app --reload`."""
from app.main import app

__all__ = ["app"]
