"""Scoped throttling for the public newsletter endpoints.

An IP-based rate is used instead of ``AnonRateThrottle`` so a signed-in visitor cannot
skip the limit by attaching a JWT to a sign-up request.
"""
from rest_framework.throttling import SimpleRateThrottle


def _client_ip(request):
    return request.META.get("REMOTE_ADDR") or "unknown"


class NewsletterSubscribeThrottle(SimpleRateThrottle):
    scope = "newsletter_subscribe"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": _client_ip(request)}


class NewsletterTokenThrottle(SimpleRateThrottle):
    scope = "newsletter_token"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": _client_ip(request)}
