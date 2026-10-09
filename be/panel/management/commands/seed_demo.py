"""Load the content the site needs to look like itself.

Two jobs, and both are in the proposal:

  * "Loading the first 10–15 vacancies" — day 16-18 of the timeline. These twelve
    are the ones from the demo, so the live site opens looking exactly like what
    the client signed off, and each is replaced as real vacancies arrive.
  * The editable text — services, process steps, testimonials, the brand — so the
    panel opens with rows to edit rather than an empty table, which is what makes
    a CMS feel broken on day one.

Idempotent: matches on a natural key and updates, so running it twice does not
double the board. Safe to re-run after the client's real content is in — it only
touches the rows it created.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from cms.models import ProcessStep, Service, SiteSetting, Testimonial
from school.models import School
from user.models import User
from vacancy.models import STATUS_LIVE, Vacancy

SCHOOLS = [
    ("Nalanda Public School", "school", "cbse", "Lucknow", "Uttar Pradesh", 1998, 1400),
    ("Gyanodaya Academy", "school", "cbse", "Noida", "Uttar Pradesh", 2004, 1100),
    ("Vivek Institute of Technology", "college", "aicte", "Ghaziabad", "Uttar Pradesh", 2008, 2200),
    ("Little Scholars Pre-School", "pre_school", "other", "Lucknow", "Uttar Pradesh", 2014, 180),
    ("Chandra Degree College", "college", "ugc", "Lucknow", "Uttar Pradesh", 1986, 3000),
]

# The twelve from the demo. Tuple order: title, school, city, post, subject,
# qualification, qualification codes, experience (min, max, band), salary (min,
# max, note), grades, board, description, duties, requirements, demo.
VACANCIES = [
    dict(
        title="PGT Physics", school="Nalanda Public School", city="Lucknow", post="pgt",
        subject="Physics", qualification="M.Sc + B.Ed", qualification_codes=["post_graduate", "bed"],
        experience_min=3, experience_max=6, salary_min_lpa="4.80", salary_max_lpa="7.20",
        salary_note="CBSE", grades="XI–XII", board="cbse", featured=True,
        description="Two sections each of Class XI and XII, with practicals. Board result responsibility from the second year onwards.",
        duties=["Physics for Classes XI and XII, CBSE", "Practical sessions and lab records",
                "Doubt classes before the board exams", "One house or club responsibility"],
        requirements=["M.Sc Physics with B.Ed", "3+ years at a CBSE senior secondary school",
                      "Comfortable with the current NCERT pattern", "Board evaluation experience is a plus"],
        demo_class="Demo class: 30 minutes, Class XII, topic given one day in advance.",
    ),
    dict(
        title="TGT Mathematics", school="Gyanodaya Academy", city="Noida", post="tgt",
        subject="Mathematics", qualification="B.Ed + CTET", qualification_codes=["bed", "ctet"],
        experience_min=1, experience_max=3, salary_min_lpa="3.60", salary_max_lpa="5.40",
        salary_note="CBSE", grades="VI–X", board="cbse", featured=True,
        description="Mathematics for Classes VI to X across three sections, with one period a week of remedial teaching.",
        duties=["Mathematics for Classes VI to X", "Weekly remedial period for weak students",
                "Set and check unit tests", "Parent-teacher meetings each term"],
        requirements=["B.Sc / B.A with Mathematics, plus B.Ed", "CTET Paper II cleared",
                      "1+ year of school teaching", "Patient with students who fall behind"],
        demo_class="Demo class: 25 minutes, Class IX, before the HOD and Vice Principal.",
    ),
    dict(
        title="PRT — Primary Teacher", school="Nalanda Public School", city="Kanpur", post="prt",
        subject="All subjects", qualification="D.El.Ed / B.Ed", qualification_codes=["deled", "bed"],
        experience_min=0, experience_max=1, salary_min_lpa="2.40", salary_max_lpa="3.00",
        grades="I–V", board="cbse",
        description="Class teacher for a primary section of thirty-five, teaching all core subjects with subject teachers for music and sport.",
        duties=["All core subjects for one primary section", "Class-teacher duties and attendance",
                "Activity-based learning periods", "Daily diary and parent communication"],
        requirements=["Graduate with D.El.Ed or B.Ed", "CTET Paper I cleared",
                      "Freshers welcome — we place many each session", "Warm with young children, firm on routine"],
        demo_class="Demo class: 20 minutes with a live primary section.",
    ),
    dict(
        title="Assistant Professor — Computer Science", school="Vivek Institute of Technology",
        city="Ghaziabad", post="faculty", subject="Computer Science",
        qualification="PhD or NET", qualification_codes=["phd", "net"],
        experience_min=3, experience_max=6, salary_min_lpa="6.00", salary_max_lpa="9.00",
        salary_note="AICTE norms", grades="B.Tech", board="aicte", featured=True,
        description="Core CSE subjects for B.Tech, with project guidance for final-year students and a research-output expectation.",
        duties=["Teach core CSE subjects to B.Tech classes", "Guide final-year projects",
                "Publish at least one paper a year", "Contribute to NBA accreditation work"],
        requirements=["M.Tech in CSE with NET, or PhD", "3+ years of college teaching",
                      "Publications in UGC-CARE listed journals", "Meets AICTE norms for the post"],
        demo_class="Selection: subject presentation before the departmental committee, then the management round.",
    ),
    dict(
        title="Pre-primary Teacher", school="Little Scholars Pre-School", city="Lucknow",
        post="pre_primary", subject="Early years", qualification="NTT / Montessori",
        qualification_codes=["ntt"], experience_min=1, experience_max=3,
        salary_min_lpa="1.80", salary_max_lpa="2.40", grades="Nursery–KG",
        description="Nursery and KG sections of twenty, run on a play-and-phonics method with one helper per class.",
        duties=["Nursery and KG classes, play-based", "Phonics and early number work",
                "Daily observation notes for parents", "Annual day and activity preparation"],
        requirements=["NTT, Montessori or B.Ed (Nursery)", "1+ year in a pre-school",
                      "Patient, cheerful, high energy", "Basic English for parent communication"],
        demo_class="Demo: one 20-minute activity with a live nursery class.",
    ),
    dict(
        title="Vice Principal", school="Gyanodaya Academy", city="Varanasi", post="leadership",
        subject="Academic leadership", qualification="M.Ed + B.Ed", qualification_codes=["med", "bed"],
        experience_min=6, experience_max=20, salary_min_lpa="9.00", salary_max_lpa="12.00",
        salary_note="+ accommodation", grades="I–XII", board="cbse",
        description="Academic leadership for a CBSE school of 1,400 students, reporting to the Principal and the trust.",
        duties=["Academic planning and timetable", "Supervise and appraise 60 teachers",
                "Discipline, and parent escalations", "CBSE affiliation and inspection compliance"],
        requirements=["Post-graduate with B.Ed; M.Ed preferred", "6+ years, at least 2 in a coordinator role",
                      "Knows CBSE affiliation bye-laws", "Firm, calm and good with parents"],
        demo_class="Selection: presentation to the trust on a 3-year academic plan, then an interview.",
    ),
    dict(
        title="TGT Hindi", school="Nalanda Public School", city="Lucknow", post="tgt",
        subject="Hindi", qualification="M.A + B.Ed", qualification_codes=["post_graduate", "bed"],
        experience_min=1, experience_max=3, salary_min_lpa="3.00", salary_max_lpa="4.20",
        salary_note="CBSE", grades="VI–X", board="cbse",
        description="Hindi for Classes VI to X, with responsibility for the Hindi literary society and annual-day scripts.",
        duties=["Hindi for Classes VI to X", "Run the Hindi literary society",
                "Prepare students for elocution and debate", "Term assessments and answer-script evaluation"],
        requirements=["M.A Hindi with B.Ed", "CTET Paper II cleared", "1+ year of school teaching",
                      "Strong on Vyakaran and prose analysis"],
        demo_class="Demo class: 25 minutes, Class VIII.",
    ),
    dict(
        title="Assistant Professor — Commerce", school="Chandra Degree College", city="Lucknow",
        post="faculty", subject="Commerce", qualification="NET / SET", qualification_codes=["net", "set"],
        experience_min=1, experience_max=3, salary_min_lpa="4.80", salary_max_lpa="6.60",
        salary_note="UGC norms", grades="B.Com–M.Com", board="ugc",
        description="B.Com and M.Com classes in Accountancy and Business Law, with tutorial groups twice a week.",
        duties=["Accountancy and Business Law for B.Com", "Tutorial groups and internal assessment",
                "Guide M.Com dissertations", "Department seminars and college events"],
        requirements=["M.Com with NET or SET", "1+ year of college teaching",
                      "Comfortable with the CBCS syllabus", "PhD registration is a plus"],
        demo_class="Selection: subject presentation before the selection committee.",
    ),
    dict(
        title="Physical Education Teacher", school="Gyanodaya Academy", city="Noida", post="tgt",
        subject="Physical Education", qualification="B.P.Ed", qualification_codes=["bped"],
        experience_min=1, experience_max=3, salary_min_lpa="2.40", salary_max_lpa="3.60",
        grades="VI–XII", board="cbse",
        description="PE periods across the middle and senior school, with responsibility for inter-house sports and the school teams.",
        duties=["PE periods for Classes VI to XII", "Coach school teams for inter-school meets",
                "Organise inter-house sports and sports day", "Basic first aid on the field"],
        requirements=["B.P.Ed or M.P.Ed", "1+ year at a school",
                      "Played or coached at district level or above", "First-aid certified, or willing to be"],
        demo_class="Demo: one 30-minute games period with a live section.",
    ),
    dict(
        title="Librarian", school="Vivek Institute of Technology", city="Ghaziabad",
        post="non_teaching", subject="Library science", qualification="B.Lib / M.Lib",
        qualification_codes=["blib"], experience_min=1, experience_max=3,
        salary_min_lpa="2.40", salary_max_lpa="3.60", board="aicte",
        description="Run a 12,000-volume engineering library with a digital catalogue and e-journal subscriptions.",
        duties=["Cataloguing and circulation", "Manage e-journal and database access",
                "Prepare accreditation documentation", "Orientation sessions for first-year students"],
        requirements=["B.Lib.I.Sc or M.Lib.I.Sc", "1+ year in an institutional library",
                      "Knows SOUL or KOHA", "Comfortable with NBA documentation"],
        demo_class="Selection: interview with the Principal and the accreditation coordinator.",
    ),
    dict(
        title="Lab Assistant — Chemistry", school="Nalanda Public School", city="Kanpur",
        post="non_teaching", subject="Chemistry", qualification="B.Sc",
        qualification_codes=["graduate"], experience_min=0, experience_max=1,
        salary_min_lpa="1.80", salary_max_lpa="2.40", grades="XI–XII", board="cbse",
        description="Prepare and maintain the senior chemistry lab for classes XI and XII practicals.",
        duties=["Set up apparatus before each practical", "Maintain chemical stock and the register",
                "Basic lab safety and waste disposal", "Assist the teacher during practical exams"],
        requirements=["B.Sc with Chemistry", "Freshers welcome", "Careful with handling and labelling",
                      "Available on practical-exam days"],
        demo_class="Selection: practical task in the lab, then an interview.",
    ),
    dict(
        title="Special Educator", school="Little Scholars Pre-School", city="Gurugram",
        post="non_teaching", subject="Special Education",
        qualification="B.Ed (Special Ed) + RCI", qualification_codes=["special_ed", "rci"],
        experience_min=3, experience_max=6, salary_min_lpa="3.60", salary_max_lpa="5.40",
        grades="Nursery–V", featured=True,
        description="Support eleven children with learning needs across pre-primary and primary, working alongside class teachers.",
        duties=["Individual education plans for each child", "Pull-out and in-class support sessions",
                "Guide class teachers on accommodations", "Meet parents each month with progress notes"],
        requirements=["B.Ed in Special Education", "Valid RCI registration", "3+ years with young children",
                      "Patient, and clear with parents"],
        demo_class="Selection: case discussion with the head and a session observation.",
    ),
]

SERVICES = [
    ("Teacher sourcing", "We find, screen and shortlist candidates for your post — pre-primary to principal, across subjects and boards.", "UserGroupIcon"),
    ("Document verification", "Degrees, B.Ed, CTET and experience letters checked against originals before you meet anyone.", "DocumentCheckIcon"),
    ("Demo class coordination", "We fix the date, the topic and the grade, brief the teacher, and make sure they turn up.", "PresentationChartBarIcon"),
    ("Replacement within the session", "If a placement does not work out, we replace them within the same academic session at no extra fee.", "ArrowPathIcon"),
]

PROCESS = [
    ("Tell us the post", "Subject, grades, board, salary band and when you need them by. A ten-minute phone call.", "Day 1", "institution"),
    ("We shortlist", "Candidates matched on qualification first, then experience and location.", "Days 2–5", "institution"),
    ("Documents verified", "Degrees, certificates and experience letters checked before you see the shortlist.", "Days 3–6", "institution"),
    ("Demo class and interview", "We fix the demo with the topic and grade agreed in advance, and coordinate the interview.", "Days 7–12", "institution"),
    ("Joining, and after", "Offer, joining formalities, and a replacement guarantee for the rest of the session.", "Days 13+", "institution"),
    ("Register and upload", "One profile — your CV, degree, B.Ed and CTET. Fifteen minutes, once.", "", "teacher"),
    ("We match you", "You only see vacancies you actually qualify for, in cities you said you would work in.", "", "teacher"),
    ("Apply in one tap", "Everything goes with it. No re-typing your details for every school.", "", "teacher"),
    ("Demo class, prepared", "You get the topic and the grade in advance, in the app, the moment it is fixed.", "", "teacher"),
    ("Joined", "We stay with it through the offer and the joining formalities.", "", "teacher"),
]

TESTIMONIALS = [
    ("We needed a PGT Physics teacher three weeks before the session. They sent four, all with documents already checked, and the second one is still with us.",
     "Mrs. Anjali Verma", "Principal", "Nalanda Public School", "institution"),
    ("I had applied to eleven schools myself and heard back from one. Here the demo class date came with the topic, a week in advance. I joined in April.",
     "Rohit Mishra", "TGT Mathematics", "Placed at Gyanodaya Academy", "teacher"),
]


class Command(BaseCommand):
    help = "Load the demo vacancies and the editable site content. Idempotent."

    def add_arguments(self, parser):
        parser.add_argument(
            "--vacancies-only", action="store_true",
            help="Skip the site content — for topping the board back up.",
        )

    def handle(self, *args, **options):
        if not options["vacancies_only"]:
            self._settings()
            self._content()
        schools = self._schools()
        self._vacancies(schools)
        self.stdout.write(self.style.SUCCESS("Seeded."))
        self.stdout.write(
            "Give someone panel access next:  python manage.py make_staff <phone> --name \"...\""
        )

    def _settings(self):
        row = SiteSetting.load()
        # Only fills what is empty. Re-running after the client's real brand is in
        # must not put the stand-in back.
        defaults = {
            "tagline": "Teachers for schools, colleges and universities — before the session starts.",
            "about_heading": "Placing teachers since 2016",
            "about_body": (
                "We work with schools, colleges and universities across Uttar Pradesh and the NCR, "
                "placing teachers from pre-primary to principal. Every candidate's qualification and "
                "experience is verified before an institution meets them."
            ),
            "office_hours": "Monday to Saturday, 10am – 6pm",
            "seo_title": "Teacher & faculty recruitment — PRT, TGT, PGT, Assistant Professor",
            "seo_description": (
                "Teaching jobs in schools, colleges and universities. Verified vacancies, "
                "demo class coordination, and placement before the session starts."
            ),
        }
        changed = []
        for field, value in defaults.items():
            if not getattr(row, field, ""):
                setattr(row, field, value)
                changed.append(field)
        if not row.stats:
            row.stats = [
                {"label": "Teachers placed", "value": "1,200+", "note": "since 2016"},
                {"label": "Institutions served", "value": "140+", "note": "schools and colleges"},
                {"label": "Average time to shortlist", "value": "5 days", "note": "from the brief"},
                {"label": "Replaced within the session", "value": "100%", "note": "guaranteed"},
            ]
            changed.append("stats")
        if changed:
            row.save(update_fields=changed)
        self.stdout.write(f"  settings: {len(changed)} fields filled")

    def _content(self):
        for order, (title, description, icon) in enumerate(SERVICES):
            Service.objects.update_or_create(
                title=title, defaults={"description": description, "icon": icon, "order": order},
            )
        for order, (title, description, timing, audience) in enumerate(PROCESS):
            ProcessStep.objects.update_or_create(
                title=title, audience=audience,
                defaults={"description": description, "timing": timing, "order": order},
            )
        for order, (quote, author, role, institution, side) in enumerate(TESTIMONIALS):
            Testimonial.objects.update_or_create(
                author=author,
                defaults={
                    "quote": quote, "author_role": role, "institution": institution,
                    "side": side, "order": order,
                },
            )
        self.stdout.write(
            f"  content: {len(SERVICES)} services, {len(PROCESS)} process steps, "
            f"{len(TESTIMONIALS)} testimonials"
        )

    def _schools(self) -> dict:
        """The five institutions from the demo, verified — these are the firm's
        own clients, so there is no verification queue for them."""
        from app import taxonomy

        made = {}
        for index, (name, kind, board, city, state, year, students) in enumerate(SCHOOLS):
            # A placeholder login per school so the school workspace is
            # demonstrable. 9000000001.. are not real numbers and cannot receive
            # an SMS, so they cannot be signed into by accident in production.
            phone = f"90000000{index + 1:02d}"
            user, _ = User.objects.get_or_create(phone=phone, defaults={"name": f"{name} office"})
            school, _ = School.objects.update_or_create(
                user=user,
                defaults={
                    "name": name, "institution_type": kind, "board": board,
                    "city": city, "state": state, "established_year": year,
                    "student_count": students, "status": taxonomy.VERIFICATION_VERIFIED,
                    "verified_at": timezone.now(),
                },
            )
            made[name] = school
        self.stdout.write(f"  schools: {len(made)}")
        return made

    def _vacancies(self, schools: dict):
        created = updated = 0
        for row in VACANCIES:
            data = dict(row)
            school = schools.get(data.pop("school"))
            featured = data.pop("featured", False)
            vacancy, was_created = Vacancy.objects.update_or_create(
                title=data["title"], school=school, city=data["city"],
                defaults={
                    **data,
                    "school_name": school.name if school else "",
                    "institution_type": school.institution_type if school else "school",
                    "state": school.state if school else "",
                    "is_featured": featured,
                    "status": STATUS_LIVE,
                    "published_at": timezone.now(),
                },
            )
            created += 1 if was_created else 0
            updated += 0 if was_created else 1
        self.stdout.write(f"  vacancies: {created} created, {updated} updated")
