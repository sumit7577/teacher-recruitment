import { API_BASE, client, readSession, writeSession } from "./interceptor";
import type {
  ApplicantDetail,
  ApplicantPanel,
  ApplicantCard,
  CampaignResp,
  DashboardResp,
  DemoClassResp,
  Envelope,
  EnquiryResp,
  GoogleNeedsPhoneResp,
  MyApplication,
  NotificationResp,
  OfferResp,
  PageResp,
  Paginated,
  PublicSiteResp,
  Role,
  SchoolDashboardResp,
  SchoolPanelResp,
  SchoolResp,
  SignInResp,
  SiteSettings,
  PasswordReset,
  StaffMember,
  TeacherDocumentResp,
  TeacherExperienceResp,
  TeacherPanelResp,
  TeacherProfileResp,
  UserResp,
  VacancyCard,
  VacancyDetail,
  VacancyFacets,
  VacancyPanel,
  VacancyQuery,
  Plan,
  CheckoutIntent,
  Order,
  OrderPanel,
  StudentProfileResp,
  TuitionRequirementResp,
  TuitionCardResp,
  TeacherCard,
  InterestResp,
  ThreadResp,
  MessageResp,
  Counterparty,
  StateResp,
  DistrictResp,
  BlockResp,
  FaqResp,
  SuccessStoryResp,
} from "./types";

/**
 * Every call to the API, in one object. Mirrors
 * allcoaching-educator/src/networking/controller.ts — components never build a
 * URL or touch axios, so a backend route change is one edit here.
 *
 * Grouped by audience, matching the backend's own mount
 * (`be/app/urls.py`): public, auth, teacher, school, panel. The grouping is not
 * cosmetic — a `panel*` method on a teacher screen is a bug you can see.
 */

type Params = Record<string, string | number | undefined>;

/** Strip empties so `?city=&post=pgt` never reaches Django, where an empty
 *  string is a filter for the empty string rather than "no filter". */
function clean(params: Params = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = String(value);
  }
  return out;
}

const unwrap = <T,>(body: Envelope<T> | T): T =>
  (body as Envelope<T>)?.data !== undefined ? (body as Envelope<T>).data : (body as T);

// ── public website ──────────────────────────────────────────────────────────

const getSite = async (): Promise<PublicSiteResp> =>
  unwrap((await client.get(`${API_BASE}/v1/public/site/`)).data);

const getPage = async (slug: string): Promise<PageResp> =>
  unwrap((await client.get(`${API_BASE}/v1/public/site/pages/${slug}/`)).data);

const getVacancies = async (query: VacancyQuery = {}): Promise<Paginated<VacancyCard>> =>
  (await client.get(`${API_BASE}/v1/public/vacancies/`, { params: clean(query as Params) })).data;

const getVacancy = async (id: string): Promise<VacancyDetail> =>
  (await client.get(`${API_BASE}/v1/public/vacancies/${id}/`)).data;

const getVacancyFacets = async (): Promise<VacancyFacets> =>
  unwrap((await client.get(`${API_BASE}/v1/public/vacancies/filters/`)).data);

/** The contact form. `website` is the honeypot — a hidden input a human never
 *  fills in. Always send it (empty) so the field exists on every submission. */
const sendEnquiry = async (form: FormData): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/public/enquiry/`, form)).data;

// ── auth ────────────────────────────────────────────────────────────────────

/** Creates the account AND stores the session — the two are one step on purpose.
 *  A caller that forgets the second half leaves the app holding a token it never
 *  sends, which presents as "signed in, but everything 403s". */
const signUp = async (
  phone: string, password: string, role: Role, name = "", device = "",
): Promise<SignInResp> => {
  const body = (await client.post(`${API_BASE}/v1/auth/signup`, { phone, password, role, name, device })).data;
  const data = unwrap<SignInResp>(body);
  writeSession({ key: data.key, role: data.role, user: data.user, needs_profile: data.needs_profile });
  return data;
};

const signInWithPassword = async (
  phone: string, password: string, role: Role, device = "",
): Promise<SignInResp> => {
  const body = (await client.post(`${API_BASE}/v1/auth/password`, { phone, password, role, device })).data;
  const data = unwrap<SignInResp>(body);
  writeSession({ key: data.key, role: data.role, user: data.user, needs_profile: data.needs_profile });
  return data;
};

const setPassword = async (newPassword: string, currentPassword?: string): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/auth/password/set`, {
    new_password: newPassword,
    ...(currentPassword ? { current_password: currentPassword } : {}),
  })).data;

/** Resolves to a session OR to `needs_phone` — a Google account we have never
 *  seen cannot be signed in, because without a number we cannot ring them. */
const signInWithGoogle = async (
  idToken: string, role: Role, device = "",
): Promise<SignInResp | GoogleNeedsPhoneResp> => {
  const body = (await client.post(`${API_BASE}/v1/auth/google`, { id_token: idToken, role, device })).data;
  const data = unwrap<SignInResp | GoogleNeedsPhoneResp>(body);
  if ("key" in data) {
    writeSession({ key: data.key, role: data.role, user: data.user, needs_profile: data.needs_profile });
  }
  return data;
};

const linkGoogle = async (idToken: string): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/auth/google/link`, { id_token: idToken })).data;

const getMe = async (): Promise<UserResp & { role: Role; needs_profile: boolean }> =>
  unwrap((await client.get(`${API_BASE}/v1/auth/me`)).data);

const updateMe = async (patch: Partial<UserResp> | FormData): Promise<UserResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/auth/me`, patch)).data);

const signOut = async (everywhere = false): Promise<void> => {
  try {
    await client.post(`${API_BASE}/v1/auth/logout`, everywhere ? { all: true } : {});
  } finally {
    // In `finally`, deliberately. A token the server has already forgotten still
    // has to leave this browser — otherwise the user clicks Sign out, sees an
    // error, and stays signed in.
    writeSession(null);
  }
};

// ── teacher ─────────────────────────────────────────────────────────────────

const getTeacherProfile = async (): Promise<TeacherProfileResp> =>
  unwrap((await client.get(`${API_BASE}/v1/teacher/profile/`)).data);

const createTeacherProfile = async (body: Record<string, unknown>): Promise<TeacherProfileResp> =>
  unwrap((await client.post(`${API_BASE}/v1/teacher/profile/`, body)).data);

const updateTeacherProfile = async (
  body: Record<string, unknown> | FormData,
): Promise<TeacherProfileResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/teacher/profile/`, body)).data);

const getTeacherDocuments = async (): Promise<{
  documents: TeacherDocumentResp[];
  required: { kind: string; label: string }[];
  missing: string[];
}> => unwrap((await client.get(`${API_BASE}/v1/teacher/profile/documents/`)).data);

const uploadTeacherDocument = async (form: FormData): Promise<TeacherDocumentResp> =>
  unwrap((await client.post(`${API_BASE}/v1/teacher/profile/documents/`, form)).data);

const deleteTeacherDocument = async (id: string): Promise<void> => {
  await client.delete(`${API_BASE}/v1/teacher/profile/documents/${id}/`);
};

const getTeacherExperience = async (): Promise<TeacherExperienceResp[]> =>
  unwrap((await client.get(`${API_BASE}/v1/teacher/profile/experience/`)).data);

const addTeacherExperience = async (body: Record<string, unknown>): Promise<TeacherExperienceResp> =>
  (await client.post(`${API_BASE}/v1/teacher/profile/experience/`, body)).data;

const updateTeacherExperience = async (
  id: string, body: Record<string, unknown>,
): Promise<TeacherExperienceResp> =>
  (await client.patch(`${API_BASE}/v1/teacher/profile/experience/${id}/`, body)).data;

const deleteTeacherExperience = async (id: string): Promise<void> => {
  await client.delete(`${API_BASE}/v1/teacher/profile/experience/${id}/`);
};

/** Matching by default — "only posts they qualify for". `all: "1"` shows the
 *  whole board, because a teacher who wants to look beyond our match should be
 *  able to. */
const getMatchingVacancies = async (query: VacancyQuery = {}): Promise<Paginated<VacancyCard>> =>
  (await client.get(`${API_BASE}/v1/teacher/vacancies/`, { params: clean(query as Params) })).data;

const getTeacherVacancy = async (id: string): Promise<VacancyDetail> =>
  unwrap((await client.get(`${API_BASE}/v1/teacher/vacancies/${id}/`)).data);

const apply = async (vacancyId: string, coverNote = ""): Promise<MyApplication> =>
  unwrap((await client.post(`${API_BASE}/v1/teacher/applications/${vacancyId}/`, { cover_note: coverNote })).data);

const getMyApplications = async (params: Params = {}): Promise<Paginated<MyApplication>> =>
  (await client.get(`${API_BASE}/v1/teacher/applications/`, { params: clean(params) })).data;

const getMyApplication = async (id: string): Promise<MyApplication> =>
  unwrap((await client.get(`${API_BASE}/v1/teacher/applications/detail/${id}/`)).data);

const withdrawApplication = async (id: string, reason = ""): Promise<MyApplication> =>
  unwrap((await client.post(`${API_BASE}/v1/teacher/applications/detail/${id}/`, { reason })).data);

const getNotifications = async (params: Params = {}): Promise<Paginated<NotificationResp> & { unread: number }> =>
  (await client.get(`${API_BASE}/v1/teacher/notifications/`, { params: clean(params) })).data;

const markNotificationsSeen = async (id?: string): Promise<Envelope<{ read: number }>> =>
  (await client.post(`${API_BASE}/v1/teacher/notifications/seen`, id ? { id } : {})).data;

const registerDevice = async (
  token: string, platform = "web", appVersion = "",
): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/teacher/notifications/device`, {
    token, platform, app_version: appVersion,
  })).data;

// ── school ──────────────────────────────────────────────────────────────────

const getSchool = async (): Promise<SchoolResp> =>
  unwrap((await client.get(`${API_BASE}/v1/school/`)).data);

const createSchool = async (body: Record<string, unknown> | FormData): Promise<SchoolResp> =>
  unwrap((await client.post(`${API_BASE}/v1/school/`, body)).data);

const updateSchool = async (body: Record<string, unknown> | FormData): Promise<SchoolResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/school/`, body)).data);

const getSchoolDashboard = async (): Promise<SchoolDashboardResp> =>
  unwrap((await client.get(`${API_BASE}/v1/school/dashboard/`)).data);

const getSchoolVacancies = async (query: VacancyQuery = {}): Promise<Paginated<VacancyPanel>> =>
  (await client.get(`${API_BASE}/v1/school/vacancies/`, { params: clean(query as Params) })).data;

const getSchoolVacancy = async (id: string): Promise<VacancyPanel> =>
  unwrap((await client.get(`${API_BASE}/v1/school/vacancies/${id}/`)).data);

const createSchoolVacancy = async (body: Record<string, unknown>): Promise<VacancyPanel> =>
  unwrap((await client.post(`${API_BASE}/v1/school/vacancies/`, body)).data);

const updateSchoolVacancy = async (id: string, body: Record<string, unknown>): Promise<VacancyPanel> =>
  (await client.patch(`${API_BASE}/v1/school/vacancies/${id}/`, body)).data;

/** publish | close | fill | unpublish. One endpoint because the rules must not
 *  differ by who is asking — a school publishing its own post goes through the
 *  same verification check as the office publishing it for them. */
const schoolVacancyAction = async (
  id: string, action: "publish" | "close" | "fill" | "unpublish",
): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/school/vacancies/${id}/${action}`, {})).data;

const getApplicants = async (params: Params = {}): Promise<Paginated<ApplicantCard>> =>
  (await client.get(`${API_BASE}/v1/school/applicants/`, { params: clean(params) })).data;

const getApplicant = async (id: string): Promise<ApplicantDetail> =>
  unwrap((await client.get(`${API_BASE}/v1/school/applicants/${id}/`)).data);

const setApplicantStage = async (
  id: string, stage: string, note = "",
): Promise<ApplicantDetail> =>
  unwrap((await client.post(`${API_BASE}/v1/school/applicants/${id}/stage`, { stage, note })).data);

const bookDemoClass = async (id: string, body: Record<string, unknown>): Promise<DemoClassResp> =>
  unwrap((await client.post(`${API_BASE}/v1/school/applicants/${id}/demo`, body)).data);

const makeOffer = async (id: string, body: Record<string, unknown>): Promise<OfferResp> =>
  unwrap((await client.post(`${API_BASE}/v1/school/applicants/${id}/offer`, body)).data);

// ── the firm's panel ────────────────────────────────────────────────────────

const getDashboard = async (): Promise<DashboardResp> =>
  unwrap((await client.get(`${API_BASE}/v1/panel/dashboard/`)).data);

const getStaff = async (): Promise<StaffMember[]> =>
  unwrap((await client.get(`${API_BASE}/v1/panel/dashboard/staff/`)).data);

/** The office hands out a new password over the phone. Returns it once — it is
 *  hashed on the way in, so asking again mints a new one rather than showing
 *  the old. This is the whole password-recovery path; there is no SMS. */
const resetUserPassword = async (phone: string): Promise<PasswordReset> =>
  unwrap((await client.post(`${API_BASE}/v1/panel/dashboard/password-reset/`, { phone })).data);


/** Ask for a code to be mailed to an address you are claiming. Signed in —
 *  this proves *your* address, which is a different problem from the two
 *  password-reset calls below and is allowed to answer honestly about
 *  whether the address is already taken. */
const requestEmailCode = async (email: string): Promise<{ expires_in_minutes: number }> =>
  unwrap((await client.post(`${API_BASE}/v1/auth/email/code`, { email })).data);

const verifyEmail = async (email: string, code: string): Promise<{ email: string }> =>
  unwrap((await client.post(`${API_BASE}/v1/auth/email/verify`, { email, code })).data);

/** Start a reset. **Always resolves**, whether or not the address is on an
 *  account — the backend answers identically either way so this endpoint
 *  cannot be used to ask which addresses hold accounts. Do not add a branch
 *  here that reintroduces the difference. */
const forgotPassword = async (email: string): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/auth/password/forgot`, { email })).data;

/** The code, and the password it buys. Every existing session dies on
 *  success, including any this browser is holding. */
const resetPasswordWithCode = async (
  email: string, code: string, newPassword: string,
): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/auth/password/reset`, {
    email, code, new_password: newPassword,
  })).data;

// ── payments ────────────────────────────────────────────────────────────────

const getPlans = async (audience?: Role): Promise<Plan[]> =>
  (await client.get(`${API_BASE}/v1/public/plans/`, {
    params: audience ? { audience } : undefined,
  })).data;

/** Open a checkout. The amount is decided by the server from the plan code —
 *  there is deliberately no amount parameter here, and adding one would not
 *  work: the backend reads the price off the plan and ignores the body. */
const createOrder = async (plan: string): Promise<CheckoutIntent> =>
  unwrap((await client.post(`${API_BASE}/v1/pay/order`, { plan })).data);

/** Hand Razorpay's callback back to us. This is a *report*, not proof — the
 *  server re-asks Razorpay what actually happened before it settles anything,
 *  and the webhook settles it independently. */
const verifyPayment = async (payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<Order> =>
  unwrap((await client.post(`${API_BASE}/v1/pay/verify`, payload)).data);

const getMyOrders = async (): Promise<Paginated<Order>> =>
  (await client.get(`${API_BASE}/v1/pay/orders`)).data;

const panelPayments = async (query: { status?: string; q?: string; page?: number } = {}):
  Promise<Paginated<OrderPanel>> =>
  (await client.get(`${API_BASE}/v1/panel/payments/`, { params: clean(query as Params) })).data;

const panelRefund = async (
  id: string, body: { amount_paise?: number; reason?: string } = {},
): Promise<OrderPanel> =>
  unwrap((await client.post(`${API_BASE}/v1/panel/payments/${id}/refund/`, body)).data);


// ── student / parent workspace (section 6) ──────────────────────────────────

const getStudentProfile = async (): Promise<StudentProfileResp> =>
  unwrap((await client.get(`${API_BASE}/v1/student/profile/`)).data);

const createStudentProfile = async (body: Record<string, unknown>): Promise<StudentProfileResp> =>
  unwrap((await client.post(`${API_BASE}/v1/student/profile/`, body)).data);

const updateStudentProfile = async (body: Record<string, unknown>): Promise<StudentProfileResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/student/profile/`, body)).data);

/** A guardian typing their own name to agree. Its own call, never a field on
 *  the profile PATCH — the server records who agreed and when, and refuses to
 *  let a profile update set it. */
const giveConsent = async (guardianName: string): Promise<StudentProfileResp> =>
  unwrap((await client.post(`${API_BASE}/v1/student/consent/`, {
    guardian_name: guardianName, agreed: true,
  })).data);

const getMyRequirements = async (): Promise<Paginated<TuitionRequirementResp>> =>
  (await client.get(`${API_BASE}/v1/student/requirements/`)).data;

const createRequirement = async (body: Record<string, unknown>): Promise<TuitionRequirementResp> =>
  (await client.post(`${API_BASE}/v1/student/requirements/`, body)).data;

const updateRequirement = async (
  id: string, body: Record<string, unknown>,
): Promise<TuitionRequirementResp> =>
  (await client.patch(`${API_BASE}/v1/student/requirements/${id}/`, body)).data;

const deleteRequirement = async (id: string): Promise<void> => {
  await client.delete(`${API_BASE}/v1/student/requirements/${id}/`);
};

const getNearbyTeachers = async (
  params: { subject?: string; klass?: string; medium?: string; km?: number } = {},
): Promise<Paginated<TeacherCard>> =>
  (await client.get(`${API_BASE}/v1/student/teachers/`, { params: clean(params as Params) })).data;

/** Open tuition requirements, as a teacher sees them. */
const getOpenTuitions = async (
  params: { subject?: string; klass?: string; medium?: string; mode?: string; km?: number } = {},
): Promise<Paginated<TuitionCardResp>> =>
  (await client.get(`${API_BASE}/v1/teacher/tuitions/`, { params: clean(params as Params) })).data;

// ── interest and chat (sections 9 and 12) ───────────────────────────────────

const getInterests = async (
  box: "received" | "sent" = "received", status?: string,
): Promise<Paginated<InterestResp>> =>
  (await client.get(`${API_BASE}/v1/connect/interests/`, {
    params: clean({ box, status } as Params),
  })).data;

const sendInterest = async (body: {
  to_user: string; context?: string; context_id?: string; message?: string;
}): Promise<InterestResp> =>
  unwrap((await client.post(`${API_BASE}/v1/connect/interests/new/`, body)).data);

/** `action` is accept | reject | withdraw. Only the recipient may accept or
 *  reject; only the sender may withdraw. The server enforces both. */
const respondToInterest = async (
  id: string, action: "accept" | "reject" | "withdraw",
): Promise<Envelope<InterestResp>> =>
  (await client.post(`${API_BASE}/v1/connect/interests/${id}/${action}/`)).data;

const markInterestsSeen = async (): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/connect/interests/seen/`)).data;

const getThreads = async (): Promise<Paginated<ThreadResp>> =>
  (await client.get(`${API_BASE}/v1/connect/threads/`)).data;

/** Reading a thread marks the other side's messages read, server-side. */
const getMessages = async (
  threadId: string,
): Promise<{ person: Counterparty; messages: MessageResp[] }> =>
  unwrap((await client.get(`${API_BASE}/v1/connect/threads/${threadId}/messages/`)).data);

const sendMessage = async (threadId: string, body: string): Promise<MessageResp> =>
  unwrap((await client.post(`${API_BASE}/v1/connect/threads/${threadId}/messages/`, { body })).data);

const blockPerson = async (target: string, reason = ""): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/connect/block/`, { target, reason })).data;

const unblockPerson = async (target: string): Promise<Envelope<never>> =>
  (await client.delete(`${API_BASE}/v1/connect/block/`, { data: { target } })).data;

const reportPerson = async (
  target: string, reason: string, detail = "",
): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/connect/report/`, { target, reason, detail })).data;

// ── location (section 10) ───────────────────────────────────────────────────

const getStates = async (): Promise<StateResp[]> =>
  (await client.get(`${API_BASE}/v1/public/locations/states/`)).data;

const getDistricts = async (state: string): Promise<DistrictResp[]> =>
  (await client.get(`${API_BASE}/v1/public/locations/districts/`, { params: { state } })).data;

const getBlocks = async (district: string): Promise<BlockResp[]> =>
  (await client.get(`${API_BASE}/v1/public/locations/blocks/`, { params: { district } })).data;

// ── panel: students, reports, FAQs, stories ─────────────────────────────────

const panelStudents = async (
  params: { q?: string; needs_consent?: string; page?: number } = {},
): Promise<Paginated<StudentProfileResp>> =>
  (await client.get(`${API_BASE}/v1/panel/students/`, { params: clean(params as Params) })).data;

const panelReports = async (
  params: { status?: string; page?: number } = {},
): Promise<Paginated<Record<string, unknown>>> =>
  (await client.get(`${API_BASE}/v1/panel/reports/`, { params: clean(params as Params) })).data;

const panelActOnReport = async (
  id: string, status: string, note = "",
): Promise<Envelope<never>> =>
  (await client.post(`${API_BASE}/v1/panel/reports/${id}/`, { status, internal_note: note })).data;

const panelFaqs = async (): Promise<FaqResp[]> =>
  (await client.get(`${API_BASE}/v1/panel/site/faqs/`)).data;

const panelSaveFaq = async (id: string | null, body: Record<string, unknown>): Promise<FaqResp> =>
  id
    ? (await client.patch(`${API_BASE}/v1/panel/site/faqs/${id}/`, body)).data
    : (await client.post(`${API_BASE}/v1/panel/site/faqs/`, body)).data;

const panelDeleteFaq = async (id: string): Promise<void> => {
  await client.delete(`${API_BASE}/v1/panel/site/faqs/${id}/`);
};

const panelStories = async (): Promise<SuccessStoryResp[]> =>
  (await client.get(`${API_BASE}/v1/panel/site/stories/`)).data;

const panelSaveStory = async (
  id: string | null, body: Record<string, unknown>,
): Promise<SuccessStoryResp> =>
  id
    ? (await client.patch(`${API_BASE}/v1/panel/site/stories/${id}/`, body)).data
    : (await client.post(`${API_BASE}/v1/panel/site/stories/`, body)).data;

const panelDeleteStory = async (id: string): Promise<void> => {
  await client.delete(`${API_BASE}/v1/panel/site/stories/${id}/`);
};

const panelVacancies = async (query: VacancyQuery = {}): Promise<Paginated<VacancyPanel>> =>
  (await client.get(`${API_BASE}/v1/panel/vacancies/`, { params: clean(query as Params) })).data;

const panelVacancy = async (id: string): Promise<VacancyPanel> =>
  unwrap((await client.get(`${API_BASE}/v1/panel/vacancies/${id}/`)).data);

const panelCreateVacancy = async (body: Record<string, unknown>): Promise<VacancyPanel> =>
  (await client.post(`${API_BASE}/v1/panel/vacancies/`, body)).data;

const panelUpdateVacancy = async (id: string, body: Record<string, unknown>): Promise<VacancyPanel> =>
  (await client.patch(`${API_BASE}/v1/panel/vacancies/${id}/`, body)).data;

/** `publish` also pushes to every matching teacher — "send a push notification to
 *  matching teachers in the same action". The message counts them. */
const panelVacancyAction = async (
  id: string,
  action: "publish" | "close" | "fill" | "unpublish" | "assign" | "note",
  body: Record<string, unknown> = {},
): Promise<Envelope<{ notified?: number }>> =>
  (await client.post(`${API_BASE}/v1/panel/vacancies/${id}/${action}`, body)).data;

const panelApplications = async (params: Params = {}): Promise<Paginated<ApplicantPanel>> =>
  (await client.get(`${API_BASE}/v1/panel/applications/`, { params: clean(params) })).data;

const panelApplication = async (id: string): Promise<ApplicantPanel> =>
  unwrap((await client.get(`${API_BASE}/v1/panel/applications/${id}/`)).data);

const panelUpdateApplication = async (
  id: string, body: { internal_note?: string; consultant?: string | null },
): Promise<ApplicantPanel> =>
  unwrap((await client.patch(`${API_BASE}/v1/panel/applications/${id}/`, body)).data);

const panelSetStage = async (id: string, stage: string, note = ""): Promise<ApplicantDetail> =>
  unwrap((await client.post(`${API_BASE}/v1/panel/applications/${id}/stage`, { stage, note })).data);

const panelBookDemo = async (id: string, body: Record<string, unknown>): Promise<DemoClassResp> =>
  unwrap((await client.post(`${API_BASE}/v1/panel/applications/${id}/demo`, body)).data);

const panelUpdateDemo = async (id: string, body: Record<string, unknown>): Promise<DemoClassResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/panel/applications/demo/${id}/`, body)).data);

const panelMakeOffer = async (id: string, body: Record<string, unknown>): Promise<OfferResp> =>
  unwrap((await client.post(`${API_BASE}/v1/panel/applications/${id}/offer`, body)).data);

const panelDemoCalendar = async (from?: string, to?: string): Promise<DemoClassResp[]> =>
  (await client.get(`${API_BASE}/v1/panel/applications/demo/`, { params: clean({ from, to }) })).data;

const panelTeachers = async (params: Params = {}): Promise<Paginated<TeacherPanelResp>> =>
  (await client.get(`${API_BASE}/v1/panel/teachers/`, { params: clean(params) })).data;

const panelTeacher = async (id: string): Promise<TeacherPanelResp> =>
  unwrap((await client.get(`${API_BASE}/v1/panel/teachers/${id}/`)).data);

const panelUpdateTeacher = async (
  id: string,
  body: { verification?: string; police_verified?: boolean; internal_note?: string },
): Promise<TeacherPanelResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/panel/teachers/${id}/`, body)).data);

/** Verifying a document records WHO did it — the signature is the point. */
const panelVerifyDocument = async (
  teacherId: string, documentId: string, status: string, note = "",
): Promise<TeacherDocumentResp> =>
  unwrap((await client.post(
    `${API_BASE}/v1/panel/teachers/${teacherId}/documents/${documentId}/`, { status, note },
  )).data);

const panelSchools = async (params: Params = {}): Promise<Paginated<SchoolPanelResp>> =>
  (await client.get(`${API_BASE}/v1/panel/schools/`, { params: clean(params) })).data;

const panelSchool = async (id: string): Promise<SchoolPanelResp> =>
  unwrap((await client.get(`${API_BASE}/v1/panel/schools/${id}/`)).data);

const panelUpdateSchool = async (
  id: string, body: { internal_note?: string; consultant?: string | null },
): Promise<SchoolPanelResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/panel/schools/${id}/`, body)).data);

/** Verifying also publishes whatever the school posted while it waited. */
const panelVerifySchool = async (
  id: string, status: string, reason = "",
): Promise<SchoolPanelResp> =>
  unwrap((await client.post(`${API_BASE}/v1/panel/schools/${id}/verify`, { status, reason })).data);

const panelSiteSettings = async (): Promise<SiteSettings> =>
  unwrap((await client.get(`${API_BASE}/v1/panel/site/`)).data);

const panelUpdateSiteSettings = async (body: Record<string, unknown> | FormData): Promise<SiteSettings> =>
  unwrap((await client.patch(`${API_BASE}/v1/panel/site/`, body)).data);

/** The five content tables are the same CRUD five times, so they share one set of
 *  methods keyed by collection name rather than thirty near-identical ones. */
type Collection = "pages" | "services" | "process" | "team" | "testimonials";

const panelContent = async <T,>(collection: Collection): Promise<T[]> =>
  (await client.get(`${API_BASE}/v1/panel/site/${collection}/`)).data;

const panelCreateContent = async <T,>(
  collection: Collection, body: Record<string, unknown> | FormData,
): Promise<T> => (await client.post(`${API_BASE}/v1/panel/site/${collection}/`, body)).data;

const panelUpdateContent = async <T,>(
  collection: Collection, id: string, body: Record<string, unknown> | FormData,
): Promise<T> => (await client.patch(`${API_BASE}/v1/panel/site/${collection}/${id}/`, body)).data;

const panelDeleteContent = async (collection: Collection, id: string): Promise<void> => {
  await client.delete(`${API_BASE}/v1/panel/site/${collection}/${id}/`);
};

const panelEnquiries = async (params: Params = {}): Promise<Paginated<EnquiryResp>> =>
  (await client.get(`${API_BASE}/v1/panel/enquiries/`, { params: clean(params) })).data;

const panelUpdateEnquiry = async (
  id: string, body: { status?: string; internal_note?: string },
): Promise<EnquiryResp> =>
  unwrap((await client.patch(`${API_BASE}/v1/panel/enquiries/${id}/`, body)).data);

const panelCampaigns = async (params: Params = {}): Promise<Paginated<CampaignResp>> =>
  (await client.get(`${API_BASE}/v1/panel/notifications/`, { params: clean(params) })).data;

/** `send: true` creates and sends in one step. Without it the campaign is saved
 *  as a draft — two steps, because this button reaches every teacher the firm has
 *  and an accidental double-click should cost a draft, not 400 notifications. */
const panelCreateCampaign = async (
  body: Record<string, unknown>, send = false,
): Promise<CampaignResp> =>
  unwrap((await client.post(`${API_BASE}/v1/panel/notifications/`, body, {
    params: send ? { send: 1 } : {},
  })).data);

/** `preview` answers with the headcount and sends nothing — the number the person
 *  about to press Send actually wants first. */
const panelSendCampaign = async (id: string, preview = false): Promise<
  Envelope<CampaignResp | { recipients: number }>
> => (await client.post(`${API_BASE}/v1/panel/notifications/${id}/send`, {}, {
  params: preview ? { preview: 1 } : {},
})).data;

const ApiController = {
  // public
  getSite, getPage, getVacancies, getVacancy, getVacancyFacets, sendEnquiry,
  // auth
  signUp, signInWithPassword, setPassword, signInWithGoogle, linkGoogle,
  getMe, updateMe, signOut, readSession,
  requestEmailCode, verifyEmail, forgotPassword, resetPasswordWithCode,
  // payments
  getPlans, createOrder, verifyPayment, getMyOrders, panelPayments, panelRefund,
  // student / parent
  getStudentProfile, createStudentProfile, updateStudentProfile, giveConsent,
  getMyRequirements, createRequirement, updateRequirement, deleteRequirement,
  getNearbyTeachers, getOpenTuitions,
  // interest and chat
  getInterests, sendInterest, respondToInterest, markInterestsSeen,
  getThreads, getMessages, sendMessage, blockPerson, unblockPerson, reportPerson,
  // location
  getStates, getDistricts, getBlocks,
  // panel additions
  panelStudents, panelReports, panelActOnReport,
  panelFaqs, panelSaveFaq, panelDeleteFaq,
  panelStories, panelSaveStory, panelDeleteStory,
  // teacher
  getTeacherProfile, createTeacherProfile, updateTeacherProfile,
  getTeacherDocuments, uploadTeacherDocument, deleteTeacherDocument,
  getTeacherExperience, addTeacherExperience, updateTeacherExperience, deleteTeacherExperience,
  getMatchingVacancies, getTeacherVacancy, apply,
  getMyApplications, getMyApplication, withdrawApplication,
  getNotifications, markNotificationsSeen, registerDevice,
  // school
  getSchool, createSchool, updateSchool, getSchoolDashboard,
  getSchoolVacancies, getSchoolVacancy, createSchoolVacancy, updateSchoolVacancy, schoolVacancyAction,
  getApplicants, getApplicant, setApplicantStage, bookDemoClass, makeOffer,
  // panel
  getDashboard, getStaff, resetUserPassword,
  panelVacancies, panelVacancy, panelCreateVacancy, panelUpdateVacancy, panelVacancyAction,
  panelApplications, panelApplication, panelUpdateApplication, panelSetStage,
  panelBookDemo, panelUpdateDemo, panelMakeOffer, panelDemoCalendar,
  panelTeachers, panelTeacher, panelUpdateTeacher, panelVerifyDocument,
  panelSchools, panelSchool, panelUpdateSchool, panelVerifySchool,
  panelSiteSettings, panelUpdateSiteSettings,
  panelContent, panelCreateContent, panelUpdateContent, panelDeleteContent,
  panelEnquiries, panelUpdateEnquiry,
  panelCampaigns, panelCreateCampaign, panelSendCampaign,
};

export default ApiController;
