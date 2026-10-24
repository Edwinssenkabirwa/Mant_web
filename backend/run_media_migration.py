
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from migrate_supabase_media import main

if __name__ == "__main__":
    main()
