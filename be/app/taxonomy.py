"""The product's vocabulary, in one module.

This is the file that makes it a teacher-recruitment platform rather than a job
board with the words changed, and it is shared by three apps that must agree:
a teacher says what they are qualified for, a vacancy says what it needs, and
the match between them is the whole product. Two separate copies of these lists
would drift, and the day they drift is the day a PGT Physics vacancy stops
reaching the PGT Physics teachers.

Ordering is deliberate everywhere — POSTS runs youngest to most senior because
that is how a school's own org chart reads, and it is the order the website
prints them in.
"""

# ── Posts ───────────────────────────────────────────────────────────────────
#
# How a principal thinks about a vacancy. Not "job categories".
POST_PRE_PRIMARY = "pre_primary"
POST_PRT = "prt"
POST_TGT = "tgt"
POST_PGT = "pgt"
POST_FACULTY = "faculty"
POST_LEADERSHIP = "leadership"
POST_NON_TEACHING = "non_teaching"

POST_CHOICES = (
    (POST_PRE_PRIMARY, "Pre-primary"),
    (POST_PRT, "PRT — Primary Teacher"),
    (POST_TGT, "TGT — Trained Graduate Teacher"),
    (POST_PGT, "PGT — Post Graduate Teacher"),
    (POST_FACULTY, "College / University Faculty"),
    (POST_LEADERSHIP, "Leadership — Principal, Vice Principal, Coordinator"),
    (POST_NON_TEACHING, "Non-teaching"),
)

# ── Qualifications ──────────────────────────────────────────────────────────
#
# The first thing on every vacancy card, because it is the first thing that
# disqualifies someone. RCI is here because a special educator cannot legally
# practise without it, which makes it a hard filter and not a nice-to-have.
QUALIFICATION_CHOICES = (
    ("bed", "B.Ed"),
    ("med", "M.Ed"),
    ("deled", "D.El.Ed"),
    ("ntt", "NTT / Montessori"),
    ("ctet", "CTET"),
    ("tet", "State TET"),
    ("net", "UGC NET"),
    ("set", "SET / SLET"),
    ("phd", "PhD"),
    ("rci", "RCI registration"),
    ("bped", "B.P.Ed / M.P.Ed"),
    ("blib", "B.Lib / M.Lib"),
    ("special_ed", "B.Ed (Special Education)"),
    ("graduate", "Graduate"),
    ("post_graduate", "Post Graduate"),
)

# ── Institution types ───────────────────────────────────────────────────────
INSTITUTION_CHOICES = (
    ("pre_school", "Pre-school"),
    ("school", "School"),
    ("college", "College"),
    ("university", "University"),
    ("coaching", "Coaching institute"),
)

# ── Boards and affiliations ─────────────────────────────────────────────────
BOARD_CHOICES = (
    ("cbse", "CBSE"),
    ("icse", "ICSE / ISC"),
    ("state", "State board"),
    ("ib", "IB"),
    ("cambridge", "Cambridge / IGCSE"),
    ("aicte", "AICTE"),
    ("ugc", "UGC"),
    ("other", "Other"),
)

# ── Experience bands ────────────────────────────────────────────────────────
#
# Stored as a band rather than computed from a number, because that is how both
# sides actually speak: a vacancy says "3–6 yrs" and a teacher says "fresher".
# `EXPERIENCE_YEARS` gives each band its numeric range so a match can still be
# computed without asking anyone to type a number they will get wrong.
EXPERIENCE_FRESHER = "fresher"
EXPERIENCE_CHOICES = (
    (EXPERIENCE_FRESHER, "Fresher"),
    ("1_3", "1–3 yrs"),
    ("3_6", "3–6 yrs"),
    ("6_plus", "6+ yrs"),
)
EXPERIENCE_YEARS = {
    EXPERIENCE_FRESHER: (0, 1),
    "1_3": (1, 3),
    "3_6": (3, 6),
    "6_plus": (6, 50),
}


def experience_band(years) -> str:
    """The band a number of years falls into. Used when a teacher types a number
    and when the app filters vacancies for them."""
    try:
        years = float(years or 0)
    except (TypeError, ValueError):
        years = 0
    for key, (low, high) in EXPERIENCE_YEARS.items():
        if low <= years < high:
            return key
    return "6_plus"


# ── Document kinds ──────────────────────────────────────────────────────────
#
# What gets ticked off before an institution meets anyone. Police verification
# is on this list because the proposal offers it and because these people will
# be around children.
DOCUMENT_CHOICES = (
    ("cv", "CV / Resume"),
    ("photo", "Photograph"),
    ("id_proof", "ID proof"),
    ("graduation", "Graduation certificate"),
    ("post_graduation", "Post-graduation certificate"),
    ("bed", "B.Ed certificate"),
    ("deled", "D.El.Ed / NTT certificate"),
    ("ctet", "CTET / TET scorecard"),
    ("net", "NET / SET certificate"),
    ("phd", "PhD certificate"),
    ("rci", "RCI registration"),
    ("experience", "Experience letter"),
    ("salary_slip", "Salary slip"),
    ("police", "Police verification"),
    ("other", "Other"),
)

# The ones an application is not considered complete without. The rest are
# asked for when the post needs them.
REQUIRED_DOCUMENTS = ("cv", "id_proof", "graduation")

VERIFICATION_PENDING = "pending"
VERIFICATION_VERIFIED = "verified"
VERIFICATION_REJECTED = "rejected"
VERIFICATION_CHOICES = (
    (VERIFICATION_PENDING, "Pending"),
    (VERIFICATION_VERIFIED, "Verified"),
    (VERIFICATION_REJECTED, "Rejected"),
)


# ── Designations ────────────────────────────────────────────────────────────
#
# The requirements document names twenty-one roles. `POST_CHOICES` above has
# seven, and they are not a worse version of this list — they are a different
# question. A post is the *band* a vacancy sits in and what a salary is
# benchmarked against; a designation is the job title on the appointment
# letter. "PGT" is a band. "Music Teacher" is a title, and it is a PGT.
#
# Both are kept because both are asked. A teacher picks a designation because
# that is what they call themselves; the board filters on post because that is
# what a principal searches. `DESIGNATION_POST` maps one to the other so a
# teacher who says "Librarian" is filed under non-teaching without being asked
# a second question they would get wrong.
DESIGNATION_CHOICES = (
    ("pgt", "PGT — Post Graduate Teacher"),
    ("tgt", "TGT — Trained Graduate Teacher"),
    ("prt", "PRT — Primary Teacher"),
    ("pre_primary", "Pre-primary / NTT"),
    ("principal", "Principal"),
    ("vice_principal", "Vice-Principal"),
    ("academic_coordinator", "Academic Coordinator"),
    ("sports", "Sports Teacher"),
    ("music", "Music Teacher"),
    ("fine_arts", "Fine Arts Teacher"),
    ("dance", "Dance Teacher"),
    ("counsellor", "Counsellor"),
    ("wellness", "Wellness Teacher"),
    ("special_educator", "Special Educator"),
    ("librarian", "Librarian"),
    ("lab_assistant", "Lab Assistant"),
    ("it", "IT / Computer"),
    ("accounts", "Accounts"),
    ("cashier", "Cashier"),
    ("front_office", "Front Office (PRO)"),
    ("office_incharge", "Office Incharge"),
    ("hr_head", "HR Head"),
    ("hostel_warden", "Hostel Warden / Superintendent"),
    ("housekeeping", "Housekeeping Supervisor"),
    ("transport", "Transport Incharge"),
    ("other", "Any other"),
)

# Which band each designation belongs to, so the existing vacancy board and
# every match already written keep working unchanged.
DESIGNATION_POST = {
    "pgt": POST_PGT,
    "tgt": POST_TGT,
    "prt": POST_PRT,
    "pre_primary": POST_PRE_PRIMARY,
    "principal": POST_LEADERSHIP,
    "vice_principal": POST_LEADERSHIP,
    "academic_coordinator": POST_LEADERSHIP,
    "sports": POST_TGT,
    "music": POST_TGT,
    "fine_arts": POST_TGT,
    "dance": POST_TGT,
    "counsellor": POST_NON_TEACHING,
    "wellness": POST_NON_TEACHING,
    "special_educator": POST_TGT,
    "librarian": POST_NON_TEACHING,
    "lab_assistant": POST_NON_TEACHING,
    "it": POST_NON_TEACHING,
    "accounts": POST_NON_TEACHING,
    "cashier": POST_NON_TEACHING,
    "front_office": POST_NON_TEACHING,
    "office_incharge": POST_NON_TEACHING,
    "hr_head": POST_NON_TEACHING,
    "hostel_warden": POST_NON_TEACHING,
    "housekeeping": POST_NON_TEACHING,
    "transport": POST_NON_TEACHING,
    "other": POST_NON_TEACHING,
}


def post_for_designation(designation: str) -> str:
    """The band a designation falls into. Used when a teacher picks a title and
    when a vacancy is filed, so neither side has to answer the same question
    twice."""
    return DESIGNATION_POST.get(designation or "", POST_NON_TEACHING)


# ── Teaching preference ─────────────────────────────────────────────────────
#
# Where a teacher is willing to work. Not the same as institution type: a
# teacher may want school work AND home tuition, which is two of these and one
# of those. Stored as a list on the profile.
TEACHING_PREFERENCE_SCHOOL = "school"
TEACHING_PREFERENCE_COACHING = "coaching"
TEACHING_PREFERENCE_TUITION = "home_tuition"
TEACHING_PREFERENCE_CHOICES = (
    (TEACHING_PREFERENCE_SCHOOL, "School teaching"),
    (TEACHING_PREFERENCE_COACHING, "Coaching institute"),
    (TEACHING_PREFERENCE_TUITION, "Home tuition"),
)

# ── Teaching medium ─────────────────────────────────────────────────────────
#
# Asked of a teacher, a vacancy, a coaching institute and a tuition
# requirement, so it lives here rather than being redefined four times.
MEDIUM_CHOICES = (
    ("english", "English"),
    ("hindi", "Hindi"),
    ("both", "English and Hindi"),
    ("regional", "Regional language"),
)

# ── Competitive-exam specialisation ─────────────────────────────────────────
EXAM_CHOICES = (
    ("jee", "JEE"),
    ("neet", "NEET"),
    ("olympiad", "Olympiad"),
    ("ntse", "NTSE"),
    ("boards", "Board exams"),
    ("foundation", "Foundation / 9th–10th"),
)

# ── Residential terms ───────────────────────────────────────────────────────
#
# A residential post is a different job, and these are the questions that
# decide whether someone will take it. Asked symmetrically — a teacher says
# what they want, a vacancy says what it offers.
ACCOMMODATION_CHOICES = (
    ("separate_room", "Separate room"),
    ("shared_room", "Shared room"),
    ("dormitory", "Dormitory"),
    ("family_quarter", "Family quarter"),
    ("none", "No accommodation"),
)

FOOD_CHOICES = (
    ("veg", "Vegetarian"),
    ("non_veg", "Non-vegetarian"),
    ("both", "Both"),
)

FACILITY_CHOICES = (
    ("meals", "Meals provided"),
    ("laundry", "Laundry"),
    ("wifi", "Wi-Fi"),
    ("transport", "Transport"),
    ("medical", "Medical"),
    ("gym", "Gym"),
    ("ac", "Air conditioning"),
)

# ── Classes, Nursery to 12 ──────────────────────────────────────────────────
#
# For a student/parent posting a tuition requirement, and for a teacher saying
# which classes they take. Ordered as a school prospectus orders them.
CLASS_CHOICES = (
    ("nursery", "Nursery"),
    ("lkg", "LKG"),
    ("ukg", "UKG"),
    *((str(n), f"Class {n}") for n in range(1, 13)),
)
