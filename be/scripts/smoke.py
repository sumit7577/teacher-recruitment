"""End-to-end smoke test over the real URL tree, permissions and serializers."""
import os, json, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "recruit.settings")
os.environ["DJANGO_ALLOWED_HOSTS"] = "testserver,localhost"
django.setup()

from django.test import Client
from user.models import User

c = Client()
fails = []

def check(label, cond, extra=""):
    print(("  ok   " if cond else "  FAIL ") + label + (f"  {extra}" if extra and not cond else ""))
    if not cond:
        fails.append(label)

def body(r):
    try:
        return r.json()
    except Exception:
        return {"<non-json>": r.content[:200].decode("utf-8", "replace")}

print("\n── public website (anonymous) ──")
r = c.get("/healthz/")
check("healthz 200", r.status_code == 200, body(r))

r = c.get("/v1/public/site/")
d = body(r).get("data", {})
check("site payload", r.status_code == 200 and d.get("settings", {}).get("brand_name") == "Jeewan Sir", body(r))
check("live vacancy count is 12", d.get("live_vacancies") == 12, d.get("live_vacancies"))
check("4 services published", len(d.get("services", [])) == 4)

r = c.get("/v1/public/vacancies/")
d = body(r)
check("board lists 10 (page 1 of 12)", d.get("count") == 12 and len(d.get("results", [])) == 10, d.get("count"))
first = (d.get("results") or [{}])[0]
check("card has salary label", first.get("salary", "").startswith("₹"), first.get("salary"))
check("card has initials", bool(first.get("initials")), first)
check("card hides internal_note", "internal_note" not in first)

r = c.get("/v1/public/vacancies/?city=Lucknow&post=pgt")
check("filters narrow the board", body(r).get("count") == 1, body(r).get("count"))

r = c.get("/v1/public/vacancies/?sort=salary")
top = (body(r).get("results") or [{}])[0]
check("salary sort puts Vice Principal first", top.get("title") == "Vice Principal", top.get("title"))

r = c.get("/v1/public/vacancies/filters/")
d = body(r).get("data", {})
check("facets include cities with counts", any(x["value"] == "Lucknow" for x in d.get("city", [])), d.get("city"))
check("facets carry the taxonomy", len(d.get("taxonomy", {}).get("posts", [])) == 7)

vac_id = first["id"]
r = c.get(f"/v1/public/vacancies/{vac_id}/")
d = body(r)
check("detail has duties + requirements + demo", len(d.get("duties", [])) == 4 and bool(d.get("demo_class")), d)

print("\n── a draft must not be public ──")
from vacancy.models import Vacancy, STATUS_DRAFT
draft = Vacancy.objects.create(title="Hidden draft", post="tgt", city="Nowhere", status=STATUS_DRAFT)
r = c.get("/v1/public/vacancies/")
check("draft absent from the board", body(r).get("count") == 12, body(r).get("count"))
r = c.get(f"/v1/public/vacancies/{draft.id}/")
check("draft 404s by id", r.status_code == 404, r.status_code)

print("\n── the firm's API refuses anonymous ──")
for path in ("/v1/panel/dashboard/", "/v1/teacher/profile/", "/v1/school/dashboard/"):
    r = c.get(path)
    check(f"{path} refused", r.status_code in (401, 403), r.status_code)

print("\n── teacher: sign in, profile, apply ──")
User.objects.filter(phone="9845637278").delete()
r = c.post("/v1/auth/signup", {"phone": "9845637278", "password": "ChalkDust-2026", "role": "teacher"})
d = body(r).get("data", {})
check("signed up", r.status_code == 200 and bool(d.get("key")), body(r))

r = c.post("/v1/auth/signup", {"phone": "9845637278", "password": "ChalkDust-2026", "role": "teacher"})
check("the same number cannot sign up twice", r.status_code == 400, body(r))

r = c.post("/v1/auth/password", {"phone": "9845637278", "password": "wrong-one", "role": "teacher"})
check("a wrong password is refused", r.status_code == 401, r.status_code)

r = c.post("/v1/auth/password", {"phone": "9845637278", "password": "ChalkDust-2026", "role": "teacher"})
d = body(r).get("data", {})
check("signed in with the password", r.status_code == 200 and bool(d.get("key")), body(r))
check("needs_profile on a new teacher", d.get("needs_profile") is True, d)
th = {"HTTP_AUTHORIZATION": f"Token {d.get('key')}"}

r = c.get("/v1/teacher/vacancies/", **th)
check("no profile → teacher API refused", r.status_code == 403, r.status_code)

r = c.post("/v1/teacher/profile/", json.dumps({
    "post": "pgt", "subjects": ["Physics"], "qualifications": ["post_graduate", "bed"],
    "city": "Lucknow", "experience_years": "4.0", "headline": "PGT Physics, 4 years CBSE",
    "about": "Board results for XII since 2022.", "name": "Rohit Mishra",
}), content_type="application/json", **th)
d = body(r).get("data", {})
check("profile created", r.status_code == 200 and d.get("post") == "pgt", body(r))
check("experience band derived from years", d.get("experience_band") == "3_6", d.get("experience_band"))
check("completeness computed", 0 < d.get("completeness", 0) < 100, d.get("completeness"))
check("cv listed as missing", "cv" in d.get("missing_documents", []), d.get("missing_documents"))

r = c.patch("/v1/teacher/profile/", json.dumps({"verification": "verified"}),
            content_type="application/json", **th)
from teacher.models import TeacherProfile
check("teacher cannot verify themselves",
      TeacherProfile.objects.get(user__phone="9845637278").verification == "pending")

r = c.get("/v1/teacher/vacancies/", **th)
d = body(r)
titles = [x["title"] for x in d.get("results", [])]
check("matching = PGT Physics in Lucknow only", titles == ["PGT Physics"], titles)
r = c.get("/v1/teacher/vacancies/?all=1", **th)
check("?all=1 shows the whole board", body(r).get("count") == 12, body(r).get("count"))

pgt = Vacancy.objects.get(title="PGT Physics")
r = c.post(f"/v1/teacher/applications/{pgt.id}/", **th)
check("apply refused with no CV", r.status_code == 400 and body(r).get("code") == "cv_missing", body(r))

from django.core.files.uploadedfile import SimpleUploadedFile
r = c.post("/v1/teacher/profile/documents/",
           {"kind": "cv", "file": SimpleUploadedFile("cv.pdf", b"%PDF-1.4 fake", content_type="application/pdf")},
           **th)
check("cv uploaded", r.status_code == 200 and body(r)["data"]["status"] == "pending", body(r))

r = c.post("/v1/teacher/profile/documents/",
           {"kind": "cv", "file": SimpleUploadedFile("evil.svg", b"<svg onload=alert(1)>", content_type="image/svg+xml")},
           **th)
check("svg rejected as a document", r.status_code == 400, body(r))

r = c.post(f"/v1/teacher/applications/{pgt.id}/", {"cover_note": "Available from April."}, **th)
d = body(r).get("data", {})
check("applied", r.status_code == 200 and d.get("stage") == "applied", body(r))
app_id = d.get("id")
r = c.post(f"/v1/teacher/applications/{pgt.id}/", **th)
check("double apply refused", r.status_code == 409, r.status_code)

print("\n── school: register, post, work the pipeline ──")
User.objects.filter(phone="9811122233").delete()
r = c.post("/v1/auth/signup", {"phone": "9811122233", "password": "Blackboard-2026", "role": "school"})
d = body(r).get("data", {})
sh = {"HTTP_AUTHORIZATION": f"Token {d.get('key')}"}
check("school needs_profile", d.get("needs_profile") is True, d)

r = c.post("/v1/school/", json.dumps({
    "name": "Saraswati Vidya Mandir", "institution_type": "school", "board": "icse",
    "city": "Lucknow", "contact_person": "Mrs. Anjali Verma", "designation": "Principal",
}), content_type="application/json", **sh)
d = body(r).get("data", {})
check("school registered", r.status_code == 200 and d.get("status") == "pending", body(r))
check("initials derived (SVM)", d.get("initials") == "SVM", d.get("initials"))
check("outstanding names the certificate",
      "affiliation certificate" in d.get("outstanding", []), d.get("outstanding"))

# An unverified school CAN save a draft — blocking that made the verification
# queue a dead end. What it cannot do is put the post on the board.
r = c.post("/v1/school/vacancies/", json.dumps({
    "title": "TGT English", "post": "tgt", "subject": "English", "city": "Lucknow",
}), content_type="application/json", **sh)
check("unverified school can save a draft", r.status_code == 200, body(r))
draft_id = body(r).get("data", {}).get("id")
r = c.post(f"/v1/school/vacancies/{draft_id}/publish", **sh)
check("but cannot publish it", r.status_code == 400 and body(r).get("code") == "cannot_publish", body(r))
check("and it is not on the board", not Vacancy.objects.get(pk=draft_id).is_open)

r = c.get("/v1/school/dashboard/", **sh)
check("unverified school can still read its dashboard", r.status_code == 200, body(r))

print("\n── staff: panel ──")
User.objects.filter(phone="9999988888").delete()
staff = User.objects.create(phone="9999988888", name="Office", is_staff_member=True)
r = c.post("/v1/auth/signup", {"phone": "9999988888", "password": "Staffroom-2026", "role": "staff"})
check("signing up as staff is refused", r.status_code == 403, body(r))

staff.set_password("Staffroom-2026")
staff.save(update_fields=["password"])
r = c.post("/v1/auth/password", {"phone": "9999988888", "password": "Staffroom-2026", "role": "staff"})
d = body(r).get("data", {})
ph = {"HTTP_AUTHORIZATION": f"Token {d.get('key')}"}
check("staff signed in", bool(d.get("key")), body(r))

r = c.get("/v1/teacher/profile/", **ph)
check("a staff token does not open the teacher API", r.status_code == 403, r.status_code)

r = c.get("/v1/panel/dashboard/", **ph)
d = body(r).get("data", {})
check("dashboard loads", r.status_code == 200, body(r))
check("counts live vacancies", d.get("counts", {}).get("live_vacancies") == 12, d.get("counts"))
check("counts the new application", d.get("counts", {}).get("new_applications") == 1, d.get("counts"))
check("pipeline has 8 stages in order", [x["stage"] for x in d.get("pipeline", [])][:2] == ["applied", "screening"], d.get("pipeline"))
check("documents_pending counted (name-mangling bug)", d.get("counts", {}).get("documents_pending") == 1, d.get("counts"))

r = c.get("/v1/panel/teachers/", **ph)
check("teacher list", body(r).get("count") == 1, body(r))

tch = TeacherProfile.objects.get(user__phone="9845637278")
doc = tch.documents.get(kind="cv")
r = c.post(f"/v1/panel/teachers/{tch.id}/documents/{doc.id}/", {"status": "rejected"}, **ph)
check("rejection without a reason refused", r.status_code == 400, body(r))
r = c.post(f"/v1/panel/teachers/{tch.id}/documents/{doc.id}/", {"status": "verified"}, **ph)
d = body(r).get("data", {})
check("document verified, signed", d.get("status") == "verified" and d.get("verified_by_name") == "Office", d)

r = c.post(f"/v1/panel/applications/{app_id}/stage", {"stage": "shortlisted"}, **ph)
check("staff shortlisted", r.status_code == 200 and body(r)["data"]["stage"] == "shortlisted", body(r))

r = c.get("/v1/teacher/applications/", **th)
check("teacher sees the shortlist", (body(r).get("results") or [{}])[0].get("stage") == "shortlisted")

r = c.post(f"/v1/panel/applications/{app_id}/demo", json.dumps({
    "scheduled_at": "2026-11-20T10:30:00+05:30", "topic": "Electrostatics", "grade": "Class XII",
}), content_type="application/json", **ph)
check("demo booked", r.status_code == 200 and body(r)["data"]["topic"] == "Electrostatics", body(r))

r = c.post(f"/v1/panel/applications/{app_id}/demo", json.dumps({
    "scheduled_at": "2026-11-21T10:30:00+05:30", "topic": "", "grade": "",
}), content_type="application/json", **ph)
check("demo without topic/grade refused", r.status_code == 400, body(r))

r = c.get("/v1/teacher/applications/", **th)
d = (body(r).get("results") or [{}])[0]
check("booking a demo advanced the stage", d.get("stage") == "demo_scheduled", d.get("stage"))
check("teacher sees the demo date and topic",
      (d.get("demo_class") or {}).get("topic") == "Electrostatics", d.get("demo_class"))
check("progress bar advanced", d.get("progress", 0) > 12, d.get("progress"))

print("\n── school may not mark a placement ──")
from school.models import School
from app import taxonomy
svm = School.objects.get(name="Saraswati Vidya Mandir")
svm.status = taxonomy.VERIFICATION_VERIFIED
svm.save(update_fields=["status"])
own = Vacancy.objects.get(pk=draft_id)
check("the draft is still not live", not own.is_open)
r = c.post(f"/v1/school/vacancies/{own.id}/publish", **sh)
check("once verified, the school can publish it", r.status_code == 200, body(r))
r = c.get("/v1/public/vacancies/")
check("board now shows 13", body(r).get("count") == 13, body(r).get("count"))

r = c.get(f"/v1/school/applicants/", **sh)
check("other schools' applicants are invisible", body(r).get("count") == 0, body(r))

print("\n── enquiry form ──")
for i in range(4):
    r = c.post("/v1/public/enquiry/", {
        "side": "institution", "name": "Mrs. Verma", "phone": "+91 98111 22244",
        "institution_name": "Saraswati Vidya Mandir", "message": "Need 2 TGTs.",
    })
from cms.models import Enquiry
check("enquiry saved and rate-limited to 3", Enquiry.objects.count() == 3, Enquiry.objects.count())
check("phone normalised to 10 digits", Enquiry.objects.first().phone == "9811122244", Enquiry.objects.first().phone)
from django.core.cache import cache
cache.clear()  # the rate limit was masking the honeypot
r = c.post("/v1/public/enquiry/", {"side": "teacher", "name": "Bot", "phone": "9811122255", "website": "http://spam"})
check("honeypot rejected", r.status_code == 400, body(r))

print("\n── the office resets a locked-out teacher ──")
r = c.post("/v1/panel/dashboard/password-reset/", {"phone": "9845637278"}, **ph)
d = body(r).get("data", {})
temporary = d.get("temporary_password", "")
check("office issued a temporary password", r.status_code == 200 and len(temporary) == 9, body(r))

r = c.post("/v1/auth/password", {"phone": "9845637278", "password": "ChalkDust-2026", "role": "teacher"})
check("the old password stops working", r.status_code == 401, r.status_code)

r = c.post("/v1/auth/password", {"phone": "9845637278", "password": temporary, "role": "teacher"})
check("the temporary one works", r.status_code == 200 and bool(body(r).get("data", {}).get("key")), body(r))

r = c.post("/v1/panel/dashboard/password-reset/", {"phone": "9999988888"}, **ph)
check("a panel account cannot be reset from the panel", r.status_code == 403, body(r))

r = c.post("/v1/panel/dashboard/password-reset/", {"phone": "9845637278"}, **th)
check("a teacher cannot reset anyone", r.status_code in (401, 403), r.status_code)


print()
if fails:
    print(f"✗ {len(fails)} failed: " + "; ".join(fails))
else:
    print("✓ all checks passed")
