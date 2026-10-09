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
