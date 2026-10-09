"""Grant or revoke panel access.

The only way `is_staff_member` is ever set. No API endpoint writes it, because an
endpoint that can grant panel access is an endpoint that can hand over the panel
— and this product's panel holds every teacher's ID proof.

    python manage.py make_staff 9845637278 --name "Priya Sharma"
    python manage.py make_staff 9845637278 --revoke
"""

from django.core.management.base import BaseCommand, CommandError

from user.models import User
from user.service import is_valid_phone, normalise_phone


class Command(BaseCommand):
    help = "Give (or take away) admin-panel access for a phone number."

    def add_arguments(self, parser):
        parser.add_argument("phone")
        parser.add_argument("--name", default="", help="Set the staff member's name at the same time.")
        parser.add_argument("--revoke", action="store_true", help="Take panel access away.")

    def handle(self, *args, **options):
        phone = normalise_phone(options["phone"])
        if not is_valid_phone(phone):
            raise CommandError(f"{options['phone']!r} is not a 10-digit Indian mobile number.")

        user, created = User.objects.get_or_create(phone=phone)
        if options["name"]:
            user.name = options["name"]
        user.is_staff_member = not options["revoke"]
        user.save(update_fields=["name", "is_staff_member"])

        what = "revoked" if options["revoke"] else "granted"
        made = " (new account)" if created else ""
        self.stdout.write(self.style.SUCCESS(
            f"Panel access {what} for {user.name or phone} — {phone}{made}."
        ))
        if not options["revoke"]:
            self.stdout.write(
                "They sign in at the panel with this number and a one-time code. "
                "No password needs setting."
            )
