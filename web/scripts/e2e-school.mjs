// End-to-end through a real browser: register an institution, post a vacancy, see
// it held back until the office verifies, publish it, then shortlist a teacher and
// book the demo class — and check the teacher sees the date.
//
//   npm install --no-save playwright-core
//   node scripts/e2e-school.mjs     # with the API on :8000 and the site on :3000
//
// Writes to whatever database the API is pointed at. Never point it at production.

const pw = await import(new URL("../node_modules/playwright-core/index.js", import.meta.url).href);
const chromium = pw.chromium ?? pw.default?.chromium;
const { execFileSync } = await import("node:child_process");

const SCHOOL_PHONE = "9123400002";
const TEACHER_PHONE = "9123400001";
const BE = new URL("../../be/", import.meta.url).pathname;
const fails = [];

function py(code) {
  return execFileSync(`${BE}.venv/bin/python`, ["-c", `
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE","recruit.settings")
django.setup()
${code}
`], { cwd: BE, encoding: "utf-8" }).trim();
}

const otpFor = (phone, kind) =>
  py(`from user.models import Otp
row = Otp.objects.filter(phone="${phone}", kind="${kind}").first()
print(row.otp if row else "")`);

function check(label, ok, extra = "") {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (!ok && extra ? `  ${extra}` : ""));
  if (!ok) fails.push(label);
}

// A clean slate, and a teacher with a verified CV to apply with.
py(`from user.models import User
User.objects.filter(phone="${SCHOOL_PHONE}").delete()
print("school reset")`);
const teacherReady = py(`from teacher.models import TeacherProfile
t = TeacherProfile.objects.filter(user__phone="${TEACHER_PHONE}").first()
print("yes" if t and (t.cv or t.documents.filter(kind="cv").exists()) else "no")`);
check("a teacher with a CV exists to apply with (run e2e-teacher.mjs first)", teacherReady === "yes", teacherReady);
if (teacherReady !== "yes") {
  console.log("\n✗ cannot continue without that teacher");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  console.log("\n── register the institution ──");
  await page.goto("http://localhost:3000/register?as=school", { waitUntil: "domcontentloaded" });
  check("the promise panel is the school one",
    (await page.textContent("body")).includes("Screened teachers, not a stack of CVs"));
  await page.fill("#phone", SCHOOL_PHONE);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.waitForSelector("#otp", { timeout: 15000 });
  await page.fill("#otp", otpFor(SCHOOL_PHONE, "school"));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await page.waitForSelector("text=About your institution", { timeout: 15000 });
  await page.getByLabel("Institution name").fill("Saraswati Vidya Mandir");
  await page.getByLabel("Type").selectOption("school");
  await page.getByLabel("Board or affiliation").selectOption("icse");
  await page.getByLabel("City").fill("Lucknow");
  await page.getByLabel("Contact person").fill("Mrs. Anjali Verma");
  await page.getByLabel("Their designation").fill("Principal");
  await page.getByRole("button", { name: "Register our institution" }).click();

  await page.waitForURL(/\/school/, { timeout: 15000 });
  await page.waitForSelector("text=being verified", { timeout: 15000 });
  const dash = await page.textContent("body");
  check("landed in the school workspace", page.url().includes("/school"));
  check("banner names the outstanding certificate", dash.includes("affiliation certificate"));
  check("sidebar shows the school nav", dash.includes("Our vacancies"));

  console.log("\n── post a vacancy, with the live card preview ──");
  await page.goto("http://localhost:3000/school/vacancies/new", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=What teachers will see", { timeout: 15000 });
  await page.getByLabel("Title").fill("TGT English");
  await page.getByLabel("Post", { exact: true }).selectOption("tgt");
  await page.getByLabel("Subject", { exact: true }).fill("English");
  await page.getByLabel("Classes").fill("VI–X");
  await page.getByLabel("Qualification, as you would write it").fill("M.A + B.Ed");
  await page.getByRole("button", { name: "B.Ed", exact: true }).click();
  await page.getByLabel("From (LPA)").fill("3");
  await page.getByLabel("To (LPA)").fill("4.5");
  await page.getByLabel("Note").fill("ICSE");
  await page.waitForTimeout(400);

  const preview = await page.textContent("body");
  check("the preview shows the title", preview.includes("TGT English"));
  check("the preview shows the salary range", preview.includes("₹3 – 4.5 LPA"), "");
  check("the preview shows the qualification", preview.includes("M.A + B.Ed"));

  // "Not disclosed" the moment the box is ticked, before any save.
  await page.getByText("Do not show the salary", { exact: false }).click();
  await page.waitForTimeout(300);
  check("ticking hide-salary updates the preview immediately",
    (await page.textContent("body")).includes("Not disclosed"));
  await page.getByText("Do not show the salary", { exact: false }).click();
  await page.waitForTimeout(300);

  console.log("\n── an unverified institution cannot publish ──");
  await page.getByRole("button", { name: "Publish it" }).click();
  await page.waitForURL(/\/school\/vacancies$/, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const list = await page.textContent("body");
  check("the vacancy was kept as a draft", list.includes("TGT English") && list.includes("Draft"), "");

  const isLive = py(`from vacancy.models import Vacancy
v = Vacancy.objects.filter(title="TGT English", school__user__phone="${SCHOOL_PHONE}").first()
print("live" if (v and v.is_open) else "not live")`);
  check("and it really is not on the board", isLive === "not live", isLive);

  console.log("\n── the office verifies, then it publishes ──");
  py(`from app import taxonomy
from school.models import School
s = School.objects.get(user__phone="${SCHOOL_PHONE}")
s.status = taxonomy.VERIFICATION_VERIFIED
s.save(update_fields=["status"])
print("verified")`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Publish", exact: true }).first().click();
  await page.waitForTimeout(2000);
  const afterPublish = py(`from vacancy.models import Vacancy
v = Vacancy.objects.filter(title="TGT English", school__user__phone="${SCHOOL_PHONE}").first()
print("live" if (v and v.is_open) else "not live")`);
  check("now it is on the board", afterPublish === "live", afterPublish);

  console.log("\n── a teacher applies, the school works the pipeline ──");
  const applied = py(`from application.models import Application
from teacher.models import TeacherProfile
from vacancy.models import Vacancy
t = TeacherProfile.objects.get(user__phone="${TEACHER_PHONE}")
v = Vacancy.objects.get(title="TGT English", school__user__phone="${SCHOOL_PHONE}")
a, made = Application.objects.get_or_create(vacancy=v, teacher=t)
print(a.id)`);
  check("application created for the test", /^app_/.test(applied), applied);

  await page.goto("http://localhost:3000/school/applicants", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const applicants = await page.textContent("body");
  check("the applicant is listed", applicants.includes("Rohit Mishra"), "");

  await page.getByText("Rohit Mishra").first().click();
  await page.waitForSelector("text=Book the demo class", { timeout: 15000 });
  const panel = await page.textContent("body");
  check("the panel shows the documents section", panel.includes("Documents"));
  check("the panel does NOT offer a placement", !panel.includes("Mark as joined"));
  check("it says placements are confirmed by the office",
    panel.includes("Placements are confirmed by the office"));

  await page.getByRole("button", { name: "Shortlist", exact: true }).click();
  await page.waitForTimeout(1800);
  const stage = py(`from application.models import Application
print(Application.objects.get(pk="${applied}").stage)`);
  check("shortlisted", stage === "shortlisted", stage);

  console.log("\n── book the demo class ──");
  await page.getByRole("button", { name: "Book the demo class" }).click();
  await page.waitForSelector('input[type="datetime-local"]', { timeout: 15000 });
  await page.fill('input[type="datetime-local"]', "2026-11-24T10:30");
  await page.getByLabel("Topic").fill("Tenses and voice");
  await page.getByLabel("Class", { exact: true }).fill("Class VIII");
  await page.getByRole("button", { name: "Book it" }).click();
  await page.waitForTimeout(2200);

  const demo = py(`from application.models import DemoClass
d = DemoClass.objects.filter(application__pk="${applied}").order_by("-scheduled_at").first()
print(f"{d.topic}|{d.grade}|{d.status}|{d.application.stage}" if d else "none")`);
  check("demo booked with topic and class", demo.startsWith("Tenses and voice|Class VIII|scheduled|"), demo);
  check("booking advanced the stage", demo.endsWith("|demo_scheduled"), demo);

  const told = py(`from notifications.models import Notification
n = Notification.objects.filter(user__phone="${TEACHER_PHONE}", kind="demo_class").order_by("-created_at").first()
print(n.body if n else "none")`);
  check("the teacher was told, with the topic in it", told.includes("Tenses and voice"), told);

  console.log("\n── no unhandled JS errors ──");
  const real = errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  check("no unhandled JS errors", real.length === 0, real.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

console.log();
if (fails.length) {
  console.log(`✗ ${fails.length} failed: ${fails.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log("✓ all checks passed");
}
