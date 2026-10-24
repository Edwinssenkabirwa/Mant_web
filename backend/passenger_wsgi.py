"""Passenger entry point for cPanel's "Setup Python App".

The control panel calls the file named in "Application startup file" and looks for a
module-level callable named ``application``. Everything real lives in ``config.wsgi``;
this file only makes sure the app directory is importable and the settings module is set
before Django is loaded.

Upload this file with the rest of ``backend/`` and point "Application root" at that
directory, so ``.env`` sits next to ``config/`` where settings.py looks for it.
"""
import os
import sys

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from config.wsgi import application  # noqa: E402,F401  (name required by Passenger)
