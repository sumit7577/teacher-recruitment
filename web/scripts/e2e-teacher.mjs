// End-to-end through a real browser: register as a teacher, verify the code, fill
// the profile, upload a CV, apply to a vacancy, and see the application.
//
// Needs the API on :8000 and the site on :3000, and drives the system Chrome
// rather than downloading a browser:
//
//   npm install --no-save playwright-core
//   cd ../be && DJANGO_DEBUG=true .venv/bin/python manage.py runserver 8000 &
//   npm run build && npm run start &
//   node scripts/e2e-teacher.mjs
//
// It writes to whatever database the API is pointed at, and deletes the test
// teacher (9123400001) before each run. Never point it at production.
const pw = await import(new URL("../node_modules/playwright-core/index.js", import.meta.url).href);
// playwright-core is CJS, so a dynamic import wraps it in `default`.
const chromium = pw.chromium ?? pw.default?.chromium;
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PHONE = "9123400001";
const PASSWORD = "E2ePass-2026";
const BE = new URL("../../be/", import.meta.url).pathname;
const fails = [];

function reset(phone) {
  execFileSync(`${BE}/.venv/bin/python`, ["-c", `
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE","recruit.settings")
django.setup()
from user.models import User
User.objects.filter(phone="${phone}").delete()
print("reset")
`], { cwd: BE, encoding: "utf-8" });
}

function check(label, ok, extra = "") {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (!ok && extra ? `  ${extra}` : ""));
  if (!ok) fails.push(label);
}

reset(PHONE);

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  console.log("\n── register as a teacher ──");
  await page.goto("http://localhost:3000/register?as=teacher", { waitUntil: "domcontentloaded" });
  check("register page shows the switch", await page.getByRole("tab", { name: "I am a teacher" }).isVisible());
  check("the promise panel is the teacher one",
    (await page.textContent("body")).includes("Your next post, without the cold calling"));

  await page.fill("#phone", PHONE);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForSelector("text=A little about your teaching", { timeout: 15000 });
  check("profile step reached", true);

  console.log("\n── the four matching questions ──");
  await page.getByLabel("Your full name").fill("Rohit Mishra");
  await page.getByLabel("The post you are looking for").selectOption("pgt");
  const subjectBox = page.locator('input[placeholder="Physics, Mathematics…"]');
  await subjectBox.fill("Physics");
  await subjectBox.press("Enter");
  check("subject became a chip", await page.getByRole("button", { name: /^Physics ×$/ }).isVisible());
  await page.getByRole("button", { name: "Post Graduate", exact: false }).first().isVisible().catch(() => {});
  await page.getByRole("button", { name: "B.Ed", exact: true }).click();
  await page.getByLabel("Your city").fill("Lucknow");
  await page.getByLabel("Years of experience").fill("4");
  await page.getByRole("button", { name: "Finish" }).click();

  await page.waitForURL(/\/teacher/, { timeout: 15000 });
  check("landed in the teacher workspace", page.url().includes("/teacher"));
  await page.waitForSelector("text=Finish your profile", { timeout: 15000 });
  const body1 = await page.textContent("body");
  check("dashboard prompts for the CV", body1.includes("cv") || body1.includes("Still to upload"));
  check("sidebar shows the teacher nav", body1.includes("My applications"));

  console.log("\n── matching works ──");
  await page.goto("http://localhost:3000/teacher/vacancies", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Matched on your post", { timeout: 15000 });
  await page.waitForTimeout(1200);
  const board = await page.textContent("body");
  check("PGT Physics is matched", board.includes("PGT Physics"), "");
  check("an unrelated post is NOT matched", !board.includes("Special Educator"));
  await page.getByRole("button", { name: "Every vacancy" }).click();
  await page.waitForTimeout(1500);
  const all = await page.textContent("body");
  check("Every vacancy shows other posts", all.includes("Special Educator"), "");

  console.log("\n── applying is gated on the CV ──");
  await page.goto("http://localhost:3000/teacher/vacancies", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByText("PGT Physics").first().click();
  await page.waitForSelector("text=Apply —", { timeout: 15000 });
  await page.getByRole("button", { name: /^Apply —/ }).click();
  await page.waitForURL(/\/teacher\/profile/, { timeout: 15000 });
  check("no CV → sent to the documents section", page.url().includes("/teacher/profile"));

  console.log("\n── upload the CV, then apply ──");
  const cv = "/tmp/e2e-cv.pdf";
  writeFileSync(cv, "%PDF-1.4\n% a one-page CV\n");
  await page.waitForSelector("text=Your documents", { timeout: 15000 });
  await page.setInputFiles('input[type="file"]', cv);
  await page.waitForSelector('a:has-text("View")', { timeout: 20000 });
  const docs = await page.textContent("body");
  check("CV listed after upload", docs.includes("CV / Resume"));
  check("CV starts as pending, not verified", docs.includes("Pending"));

  await page.goto("http://localhost:3000/teacher/vacancies", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByText("PGT Physics").first().click();
  await page.waitForSelector("text=Apply —", { timeout: 15000 });
  await page.getByPlaceholder("Available from April", { exact: false }).fill("Available from April.");
  await page.getByRole("button", { name: /^Apply —/ }).click();
  await page.waitForURL(/\/teacher\/applications/, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const apps = await page.textContent("body");
  check("application appears", apps.includes("PGT Physics"));
  check("stage shown as Applied", apps.includes("Applied"));

  console.log("\n── the same vacancy now says so ──");
  await page.goto("http://localhost:3000/teacher/vacancies", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByText("PGT Physics").first().click();
  await page.waitForTimeout(1500);
  const again = await page.textContent("body");
  check("no second Apply button", again.includes("You have applied for this post"));

  console.log("\n── the guard ──");
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto("http://localhost:3000/teacher", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 15000 });
  check("signed out → redirected to login", page.url().includes("/login"));
  check("login remembers where they were going", page.url().includes("next="), page.url());

  console.log("\n── no console errors ──");
  // Chrome logs "Failed to load resource" for every non-2xx response, and this run
  // deliberately provokes one: applying with no CV is a 400 the app handles by
  // redirecting to the documents section. Those are filtered; real JS exceptions
  // and React warnings are not.
  const real = errors.filter(
    (e) => !/favicon|Failed to load resource/i.test(e),
  );
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
