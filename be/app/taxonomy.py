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
