"""Normalises every API error into {detail, errors, status_code}.

The React client only has to understand one error shape.
"""
from rest_framework.views import exception_handler as drf_exception_handler


def _summarise(data):
    """Turn DRF's varied error payloads into a single human-readable sentence."""
    if isinstance(data, list):
        return str(data[0]) if data else "Request failed."
    if not isinstance(data, dict):
        return str(data)

    detail = data.get("detail")
    if detail is not None and len(data) == 1:
        return str(detail)

    for field, value in data.items():
        if isinstance(value, list) and value:
            first = value[0]
            text = getattr(first, "message", str(first)) if not isinstance(first, str) else first
            if field in ("non_field_errors", "detail"):
                return str(text)
            return f"{field.replace('_', ' ').capitalize()}: {text}"
        if isinstance(value, str):
            return f"{field.replace('_', ' ').capitalize()}: {value}"
    return "Request failed."


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    payload = response.data
    response.data = {
        "detail": _summarise(payload),
        "errors": payload if isinstance(payload, dict) else {"non_field_errors": payload},
        "status_code": response.status_code,
    }
    return response
