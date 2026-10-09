// End-to-end through a real browser: the office's panel. Sign in as staff, verify a
// teacher's document, verify an institution and watch its waiting post go live, post
// and publish a vacancy with the notification count, check the push audience, and
// change a brand colour — then confirm the public website picks it up.
//
//   npm install --no-save playwright-core
//   node scripts/e2e-teacher.mjs && node scripts/e2e-school.mjs   # make the data
//   node scripts/e2e-panel.mjs
//
// Writes to whatever database the API is pointed at. Never point it at production.

const pw = await import(new URL("../node_modules/playwright-core/index.js", import.meta.url).href);
const chromium = pw.chromium ?? pw.default?.chromium;
const { execFileSync } = await import("node:child_process");

const PASSWORD = "E2ePass-2026";
const STAFF_PHONE = "9876500000";
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

function check(label, ok, extra = "") {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (!ok && extra ? `  ${extra}` : ""));
  if (!ok) fails.push(label);
}

// A staff account, and an unverified institution with a draft waiting on it.
py(`from user.models import User
u, _ = User.objects.update_or_create(phone="${STAFF_PHONE}", defaults={"name": "Office", "is_staff_member": True})
u.set_password("${PASSWORD}")
u.save(update_fields=["password"])
print("staff ready")`);
const setup = py(`from app import taxonomy
from school.models import School
from vacancy.models import Vacancy, STATUS_DRAFT
s = School.objects.filter(name="Gyanodaya Academy").first()
s.status = taxonomy.VERIFICATION_PENDING
s.save(update_fields=["status"])
v, _ = Vacancy.objects.get_or_create(
    title="PGT Chemistry", school=s, city="Noida",
    defaults=dict(post="pgt", subject="Chemistry", qualification="M.Sc + B.Ed",
                  status=STATUS_DRAFT, school_name=s.name),
)
v.status = STATUS_DRAFT
v.published_at = None
v.save(update_fields=["status", "published_at"])
print(f"{s.id}|{v.id}")`);
const [schoolId, draftId] = setup.split("|");
py(`from app import taxonomy
from teacher.models import TeacherDocument
n = TeacherDocument.objects.filter(teacher__user__phone="${TEACHER_PHONE}", kind="cv").update(
    status=taxonomy.VERIFICATION_PENDING, verified_by=None, verified_at=None, note="")
print(f"reset {n} documents to pending")`);
check("an unverified institution with a waiting draft exists", Boolean(schoolId && draftId), setup);

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  console.log("\n── staff sign-in ──");
  await page.goto("http://localhost:3000/login?as=staff", { waitUntil: "domcontentloaded" });
  const loginBody = await page.textContent("body");
  check("the staff door has no role switch", !loginBody.includes("I am hiring"));
  check("it says office sign-in", loginBody.includes("Office sign-in"));
  await page.fill("#phone", STAFF_PHONE);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/panel/, { timeout: 15000 });
  await page.waitForTimeout(2000);

  const dash = await page.textContent("body");
  check("the dashboard loads", page.url().includes("/panel"));
  check("it leads with what is waiting on the office", dash.includes("Waiting on the office"));
  check("it shows the pipeline", dash.includes("The pipeline"));
  check("sidebar shows the office nav", dash.includes("Institutions") && dash.includes("Push"));

  console.log("\n── verify a teacher's document ──");
  await page.goto("http://localhost:3000/panel/teachers", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  check("the teacher is listed", (await page.textContent("body")).includes("Rohit Mishra"));
  await page.getByText("Rohit Mishra").first().click();
  // Scoped to the dialog: "Verified" is also a filter tab behind the overlay, and
  // without the role the query matched that one.
  const panel = page.getByRole("dialog");
  await panel.getByText("Documents — tick them off").waitFor({ timeout: 15000 });
  check("the drawer is a real dialog", await panel.isVisible());
  check("the drawer lists the CV", (await panel.textContent()).includes("CV / Resume"));

  // A rejection with no reason must not be possible — the teacher is shown it.
  check("Reject is disabled until a reason is typed",
    await panel.getByRole("button", { name: "Reject" }).first().isDisabled());

  await panel.getByRole("button", { name: "Verified", exact: true }).first().click();
  await page.waitForTimeout(1800);
  const docState = py(`from teacher.models import TeacherDocument
d = TeacherDocument.objects.filter(teacher__user__phone="${TEACHER_PHONE}", kind="cv").first()
print(f"{d.status}|{d.verified_by.name if d.verified_by else 'nobody'}" if d else "none")`);
  check("the CV is verified and signed", docState === "verified|Office", docState);

  console.log("\n── verify an institution, and its waiting post goes live ──");
  await page.goto("http://localhost:3000/panel/schools", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.getByText("Gyanodaya Academy").first().click();
  const schoolPanel = page.getByRole("dialog");
  await schoolPanel.getByText("Verify, and publish what is waiting").waitFor({ timeout: 15000 });
  check("rejecting an institution needs a reason too",
    await schoolPanel.getByRole("button", { name: "Not yet" }).isDisabled());
  await schoolPanel.getByRole("button", { name: "Verify, and publish what is waiting" }).click();
  await page.waitForTimeout(2500);

  const published = py(`from vacancy.models import Vacancy
v = Vacancy.objects.get(pk="${draftId}")
print("live" if v.is_open else f"not live ({v.status})")`);
  check("the waiting draft is now on the board", published === "live", published);

  console.log("\n── Escape closes a dialog ──");
  await page.goto("http://localhost:3000/panel/teachers", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByText("Rohit Mishra").first().click();
  await page.getByRole("dialog").waitFor({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check("Escape closes the drawer", (await page.getByRole("dialog").count()) === 0);

  console.log("\n── post a vacancy and notify matching teachers ──");
  await page.goto("http://localhost:3000/panel/vacancies/new", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Which institution?", { timeout: 15000 });
  await page.getByLabel("Or the institution's name").fill("Bright Future Academy");
  await page.getByLabel("Title").fill("PGT Physics — Panel test");
  await page.getByLabel("Post", { exact: true }).selectOption("pgt");
  await page.getByLabel("Subject", { exact: true }).fill("Physics");
  await page.getByLabel("City").fill("Lucknow");
  await page.getByLabel("Qualification, as you would write it").fill("M.Sc + B.Ed");
  await page.waitForTimeout(400);
  const previewBody = await page.textContent("body");
  check("the preview derives initials from the typed name", previewBody.includes("BFA"), "");

  await page.getByRole("button", { name: "Publish and notify teachers" }).click();
  await page.waitForURL(/\/panel\/vacancies$/, { timeout: 25000 });
  await page.waitForTimeout(1500);

  const notified = py(`from notifications.models import PushCampaign
c = PushCampaign.objects.filter(vacancy__title="PGT Physics — Panel test").order_by("-created_at").first()
print(f"{c.recipients}|{c.status}" if c else "none")`);
  check("publishing sent a campaign to matching teachers", notified.endsWith("|sent"), notified);
  check("and it reached at least the test teacher", Number(notified.split("|")[0]) >= 1, notified);

  console.log("\n── the push sender refuses to fire blind ──");
  await page.goto("http://localhost:3000/panel/notifications", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Send a notification", { timeout: 15000 });
  await page.getByLabel("Title").fill("Walk-in day on Saturday");
  await page.getByLabel("Message").fill("Bring your originals. 10am to 2pm.");
  const sendDisabled = await page.getByRole("button", { name: "Send it" }).isDisabled();
  check("Send is disabled before the audience is checked", sendDisabled);

  await page.getByRole("button", { name: "Who will get it?" }).click();
  await page.waitForTimeout(2500);
  const counted = await page.textContent("body");
  check("it says how many it will reach", /This will go to \d+ (person|people)/.test(counted), "");
  const sendEnabled = !(await page.getByRole("button", { name: "Send it" }).isDisabled());
  check("Send becomes available once counted", sendEnabled);

  console.log("\n── change a brand colour, the website takes it ──");
  await page.goto("http://localhost:3000/panel/site", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=The brand", { timeout: 15000 });
  await page.getByLabel("Accent colour, as a hex value").fill("#1d7a4c");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(2000);

  const stored = py(`from cms.models import SiteSetting
print(SiteSetting.load().accent_colour)`);
  check("the colour is stored", stored === "#1d7a4c", stored);

  // The public layout caches /v1/public/site for 5 minutes, so fetch it directly to
  // prove the website is reading the panel's value rather than a hard-coded one.
  const siteResponse = await page.request.get("http://localhost:8000/v1/public/site/");
  const siteJson = await siteResponse.json();
  check("the public site payload carries it", siteJson.data.settings.accent_colour === "#1d7a4c",
    siteJson.data.settings.accent_colour);

  // Put it back, so a later run of the site tests sees the real brand.
  py(`from cms.models import SiteSetting
s = SiteSetting.load(); s.accent_colour = "#F0682B"; s.save(update_fields=["accent_colour"])
print("restored")`);
  check("restored the real accent for later runs", true);

  console.log("\n── the audience gate ──");
  await page.goto("http://localhost:3000/teacher", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("a staff token cannot open the teacher workspace", page.url().includes("/panel"), page.url());

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
