/**
 * Wire types — the shapes the Django serializers actually send.
 *
 * Hand-written rather than generated, same as allcoaching-educator. They are the
 * place to look when a field is missing from a response: if it is not here, check
 * the backend's READ serializer, which lists its fields explicitly and will have
 * silently omitted it.
 */

export interface Envelope<T> {
  status: "true" | "false";
  message: string;
  data: T;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Role = "teacher" | "school" | "student" | "staff";
export type Verification = "pending" | "verified" | "rejected";

export type PostType =
  | "pre_primary" | "prt" | "tgt" | "pgt" | "faculty" | "leadership" | "non_teaching";

export type ExperienceBand = "fresher" | "1_3" | "3_6" | "6_plus";

export type VacancyStatus =
  | "draft" | "pending_review" | "live" | "shortlisting" | "interviewing" | "filled" | "closed";

export type Stage =
  | "applied" | "screening" | "shortlisted" | "demo_scheduled" | "demo_done"
  | "interview" | "offered" | "joined" | "rejected" | "withdrawn";

// ── auth ───────────────────────────────────────────────────────────────────

export interface UserResp {
  id: string;
  name: string;
  email: string | null;
  /** Null until a code sent to `email` came back correct. An unverified
   *  address may be a typo for a stranger's mailbox, so nothing sensitive —
   *  least of all a password reset — is ever sent to one. */
  email_verified_at: string | null;
  phone: string;
  city: string;
  state: string;
  image: string;
  roles: Role[];
  has_password: boolean;
  is_staff_member: boolean;
  date_joined: string;
}

export interface SignInResp {
  key: string;
  role: Role;
  user: UserResp;
  needs_profile: boolean;
  is_new?: boolean;
  teacher_id?: string;
  school_id?: string;
  completeness?: number;
  missing_documents?: string[];
  status?: Verification;
  outstanding?: string[];
}

/** A Google sign-in for someone we have never seen answers this instead of a
 *  token: without a mobile number this platform cannot do the one thing it
 *  exists for, which is ring a teacher about a vacancy. */
export interface GoogleNeedsPhoneResp {
  needs_phone: true;
  google_sub: string;
  email: string;
  name: string;
}

// ── vacancy ────────────────────────────────────────────────────────────────

export interface VacancyCard {
  id: string;
  title: string;
  post: PostType;
  post_label: string;
  subject: string;
  institution: string;
  initials: string;
  logo: string;
  institution_type: string;
  institution_label: string;
  board: string;
  board_label: string;
  city: string;
  locality: string;
  grades: string;
  openings: number;
  qualification: string;
  experience_band: ExperienceBand;
  experience_label: string;
  salary: string;
  salary_min_lpa: string | null;
  salary_max_lpa: string | null;
  salary_note: string;
  is_new: boolean;
  is_featured: boolean;
  is_urgent: boolean;
  published_at: string | null;
}

export interface VacancyDetail extends VacancyCard {
  description: string;
  duties: string[];
  requirements: string[];
  demo_class: string;
  qualification_codes: string[];
  state: string;
  experience_min: string | null;
  experience_max: string | null;
  status: VacancyStatus;
  closes_on: string | null;
  created_at: string;
  applications_count: number;
  /** Only on the teacher endpoint. */
  has_applied?: boolean;
  application?: { id: string; stage: Stage } | null;
}

export interface VacancyPanel extends VacancyDetail {
  source: "firm" | "school";
  school: string | null;
  school_name: string;
  school_status: string;
  status_label: string;
  consultant: string | null;
  consultant_name: string;
  internal_note: string;
  view_count: number;
  new_applications: number;
  salary_hidden: boolean;
  filled_at: string | null;
}

export interface Facet { value: string; count: number; label?: string }
export interface Choice { value: string; label: string }

export interface VacancyFacets {
  total: number;
  city: Facet[];
  post: Facet[];
  institution_type: Facet[];
  board: Facet[];
  subject: Facet[];
  experience_band: Facet[];
  taxonomy: {
    posts: Choice[];
    qualifications: Choice[];
    institutions: Choice[];
    boards: Choice[];
    experience: Choice[];
  };
}

export interface VacancyQuery {
  city?: string;
  post?: string;
  institution_type?: string;
  board?: string;
  subject?: string;
  experience?: string;
  qualification?: string;
  salary_min?: string | number;
  q?: string;
  only?: "featured" | "new";
  sort?: "newest" | "salary" | "salary_asc" | "oldest";
  status?: string;
  mine?: "1";
  all?: "1";
  page?: number;
}

// ── teacher ────────────────────────────────────────────────────────────────

export interface TeacherDocumentResp {
  id: string;
  kind: string;
  kind_label: string;
  title: string;
  file: string;
  status: Verification;
  status_label: string;
  note: string;
  verified_by_name: string;
  verified_at: string | null;
  uploaded_at: string;
}

export interface TeacherExperienceResp {
  id: string;
  institution: string;
  post: PostType | "";
  post_label: string;
  subject: string;
  city: string;
  board: string;
  board_label: string;
  started_on: string | null;
  ended_on: string | null;
  is_current: boolean;
  salary_lpa: string | null;
}

export interface TeacherProfileResp {
  id: string;
  name: string;
  phone: string;
  email: string;
  image: string;
  post: PostType;
  post_label: string;
  subjects: string[];
  qualifications: string[];
  highest_qualification: string;
  experience_band: ExperienceBand;
  experience_label: string;
  experience_years: string;
  city: string;
  state: string;
  preferred_cities: string[];
  willing_to_relocate: boolean;
  expected_salary_lpa: string | null;
  available_from: string | null;
  notice_period_days: number | null;
  headline: string;
  about: string;
  languages: string[];
  cv: string;
  verification: Verification;
  police_verified: boolean;
  is_open_to_work: boolean;
  completeness: number;
  missing_documents: string[];
  documents: TeacherDocumentResp[];
  experience: TeacherExperienceResp[];
  created_at: string;
}

export interface TeacherPanelResp extends TeacherProfileResp {
  internal_note: string;
  applications_count: number;
  placed_count: number;
}

/** What a SCHOOL sees. No phone, no email, no CV url — the firm is the channel,
 *  and that is what it is paid for. */
export interface TeacherCard {
  /** The USER id, for addressing an interest. `id` is the profile's.
   *  Always present — TeacherCardSerializer sends it on every card. */
  user_id: string;
  designation?: string;
  designation_label?: string;
  medium?: string;
  medium_label?: string;
  open_to_residential?: boolean;
  id: string;
  name: string;
  image: string;
  post: PostType;
  post_label: string;
  subjects: string[];
  qualifications: string[];
  highest_qualification: string;
  experience_band: ExperienceBand;
  experience_label: string;
  experience_years: string;
  city: string;
  headline: string;
  about: string;
  verification: Verification;
  police_verified: boolean;
  documents_verified: Record<string, boolean>;
}

// ── school ─────────────────────────────────────────────────────────────────

export interface SchoolResp {
  id: string;
  name: string;
  initials: string;
  logo: string;
  institution_type: string;
  type_label: string;
  board: string;
  board_label: string;
  city: string;
  locality: string;
  about: string;
  established_year: number | null;
  student_count: number | null;
  contact_person: string;
  designation: string;
  contact_name: string;
  login_phone: string;
  office_phone: string;
  office_email: string;
  website: string;
  address: string;
  pincode: string;
  state: string;
  staff_count: number | null;
  status: Verification;
  status_label: string;
  is_verified: boolean;
  outstanding: string[];
  affiliation_certificate: string;
  rejection_reason: string;
  created_at: string;
}

export interface SchoolPanelResp extends SchoolResp {
  consultant: string | null;
  consultant_name: string;
  internal_note: string;
  vacancies_count: number;
  live_vacancies: number;
}

// ── application ────────────────────────────────────────────────────────────

export interface DemoClassResp {
  id: string;
  application: string;
  scheduled_at: string;
  duration_minutes: number;
  topic: string;
  grade: string;
  mode: "in_person" | "online";
  mode_label: string;
  venue: string;
  meeting_link: string;
  panel: string;
  status: string;
  status_label: string;
  feedback: string;
  rating: number | null;
  recommended: boolean | null;
  teacher_name: string;
  vacancy_title: string;
  created_at: string;
}

export interface OfferResp {
  id: string;
  salary_lpa: string | null;
  joining_date: string | null;
  terms: string;
  letter: string;
  status: "sent" | "accepted" | "declined" | "withdrawn";
  status_label: string;
  sent_at: string;
  responded_at: string | null;
}

export interface ApplicationEventResp {
  id: string;
  from_stage: Stage | "";
  from_label: string;
  to_stage: Stage;
  to_label: string;
  by_name: string;
  note: string;
  at: string;
}

/** The teacher's own view. */
export interface MyApplication {
  id: string;
  vacancy: VacancyCard;
  stage: Stage;
  stage_label: string;
  progress: number;
  cover_note: string;
  outcome_note: string;
  demo_class: DemoClassResp | null;
  offer: OfferResp | null;
  applied_at: string;
  stage_changed_at: string;
}

/** The school's and the panel's view. */
export interface ApplicantCard {
  id: string;
  teacher: TeacherCard;
  vacancy_id: string;
  vacancy_title: string;
  stage: Stage;
  stage_label: string;
  progress: number;
  documents_pending: string[];
  cover_note: string;
  applied_at: string;
  stage_changed_at: string;
}

export interface ApplicantDetail extends ApplicantCard {
  demo_classes: DemoClassResp[];
  offer: OfferResp | null;
  events: ApplicationEventResp[];
}

export interface ApplicantPanel extends ApplicantDetail {
  consultant: string | null;
  consultant_name: string;
  internal_note: string;
  outcome_note: string;
  school_name: string;
  teacher_phone: string;
}

// ── site content ───────────────────────────────────────────────────────────

export interface SiteSettings {
  brand_name: string;
  tagline: string;
  logo: string;
  logo_dark: string;
  favicon: string;
  accent_colour: string;
  deep_colour: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  map_url: string;
  office_hours: string;
  established_year: number | null;
  about_heading: string;
  about_body: string;
  stats: { label: string; value: string; note?: string }[];
  social: Record<string, string>;
  seo_title: string;
  seo_description: string;
  og_image: string;
  google_verification: string;
  updated_at: string;
}

export interface ServiceResp {
  id: string; title: string; description: string; icon: string; order: number; is_published: boolean;
}
export interface ProcessStepResp {
  id: string; title: string; description: string; timing: string;
  audience: "institution" | "teacher"; order: number; is_published: boolean;
}
export interface TeamMemberResp {
  id: string; name: string; role: string; bio: string; photo_url: string;
  phone: string; email: string; order: number; is_published: boolean;
}
export interface TestimonialResp {
  id: string; quote: string; author: string; author_role: string; institution: string;
  photo_url: string; side: "institution" | "teacher"; order: number; is_published: boolean;
}

export interface FaqResp {
  id: string; question: string; answer: string;
  /** Both sides ask different questions — a teacher asks what registering
   *  costs, a school asks how long a shortlist takes. The homepage groups on
   *  this rather than printing one undifferentiated list. */
  audience: "teacher" | "institution" | "student" | "all";
  audience_label: string; order: number; is_published: boolean;
}

/** An outcome with a number on it, which is what persuades a principal who has
 *  been let down before. Distinct from a TestimonialResp, which is a quote. */
export interface SuccessStoryResp {
  id: string; headline: string; body: string;
  teacher_name: string; teacher_post: string; post_label: string;
  institution_name: string; city: string;
  days_to_place: number | null;
  photo: string; order: number; is_published: boolean;
}

export interface PublicSiteResp {
  settings: SiteSettings;
  services: ServiceResp[];
  process: ProcessStepResp[];
  team: TeamMemberResp[];
  testimonials: TestimonialResp[];
  faqs: FaqResp[];
  stories: SuccessStoryResp[];
  live_vacancies: number;
}

export interface PageResp {
  id: string; slug: string; title: string; heading: string; subheading: string;
  blocks: Record<string, unknown>[];
  seo_title: string; seo_description: string; is_published: boolean; updated_at: string;
}

export interface EnquiryResp {
  id: string; side: "teacher" | "institution"; side_label: string;
  name: string; phone: string; email: string; city: string;
  post: string; post_label: string; subject: string; qualification: string;
  experience_band: string; cv: string;
  institution_name: string; institution_type: string; vacancies_count: number | null;
  message: string; source_path: string;
  status: "new" | "contacted" | "converted" | "closed" | "spam"; status_label: string;
  handled_by_name: string; handled_at: string | null; internal_note: string; created_at: string;
}

// ── notifications ──────────────────────────────────────────────────────────

export interface NotificationResp {
  id: string; kind: string; kind_label: string; title: string; body: string;
  data: Record<string, string>; is_read: boolean; read_at: string | null; created_at: string;
}

export interface CampaignResp {
  id: string; title: string; body: string; audience: string; audience_label: string;
  filters: Record<string, string>; vacancy: string | null; vacancy_title: string;
  status: string; status_label: string;
  recipients: number; delivered: number; failed: number; error: string;
  sent_by_name: string; created_at: string; sent_at: string | null;
}

// ── the panel's dashboard ──────────────────────────────────────────────────

export interface DashboardResp {
  counts: {
    live_vacancies: number;
    awaiting_review: number;
    new_applications: number;
    in_pipeline: number;
    demo_classes_this_week: number;
    placed_this_month: number;
    teachers: number;
    teachers_unverified: number;
    schools: number;
    schools_unverified: number;
    new_enquiries: number;
    documents_pending: number;
  };
  pipeline: { stage: Stage; label: string; count: number }[];
  demo_classes: DemoClassResp[];
  new_applications: ApplicantPanel[];
  needs_attention: VacancyPanel[];
}

export interface SchoolDashboardResp {
  school: SchoolResp;
  counts: {
    live_vacancies: number;
    total_vacancies: number;
    new_applications: number;
    in_progress: number;
    demo_classes_this_week: number;
  };
  live_vacancies: VacancyPanel[];
  new_applications: ApplicantCard[];
  demo_classes: DemoClassResp[];
}

export interface StaffMember { id: string; name: string; phone: string }

/** What the office reads out after a reset. Shown once and never stored. */
export interface PasswordReset {
  phone: string;
  name: string;
  temporary_password: string;
}

// ── payments ────────────────────────────────────────────────────────────────

export type PlanAudience = "teacher" | "school";

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  audience: PlanAudience;
  interval: "once" | "monthly" | "yearly";
  /** Paise. Integers throughout — a float rupee is a rounding error waiting
   *  for a reconciliation meeting. Format with `amount_rupees`, never compute
   *  with it. */
  amount_paise: number;
  amount_rupees: string;
  grants_days: number;
  grants_vacancies: number;
}

export type OrderStatus = "created" | "paid" | "failed" | "refunded";

/** What the payer is allowed to see about their own order. Deliberately
 *  without `failure_reason` and the Razorpay ids — the bank's exact wording is
 *  for the staff member they ring, not for the payment screen. */
export interface Order {
  id: string;
  plan_name: string;
  plan_code: string;
  amount_paise: number;
  amount_rupees: string;
  currency: string;
  status: OrderStatus;
  method: string;
  receipt_no: string;
  created_at: string;
  paid_at: string | null;
}

/** The staff view: everything, including who refunded what and why. */
export interface OrderPanel extends Omit<Order, "plan_code"> {
  user_name: string;
  user_phone: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  failure_reason: string;
  refunded_paise: number;
  refunded_at: string | null;
  refunded_by_name: string;
  refund_reason: string;
}

/** Everything Razorpay's checkout widget needs. `key_id` is public by design —
 *  it is in the page source of every site using Razorpay. The secret is not
 *  here and never reaches the browser. */
export interface CheckoutIntent {
  order: Order;
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
  name: string;
  email: string;
  phone: string;
}


// ── students, parents and tuition (section 6) ───────────────────────────────

export interface StudentProfileResp {
  id: string;
  account_holder: "student" | "parent";
  student_name: string;
  date_of_birth: string | null;
  age: number | null;
  klass: string; klass_label: string;
  school_name: string; board: string; medium: string; phone: string;
  guardian_name: string; guardian_relation: string;
  guardian_phone: string; guardian_email: string;
  /** Null until a named guardian has agreed. Until then the profile is
   *  invisible to every teacher and cannot be contacted through any route. */
  guardian_consent_at: string | null;
  guardian_consent_by: string;
  is_minor: boolean;
  needs_consent: boolean;
  is_contactable: boolean;
  address: string; village: string; city: string; pincode: string;
  state_ref: string | null; district_ref: string | null; block_ref: string | null;
  latitude: number | null; longitude: number | null;
  is_hidden: boolean; created_at: string;
}

/** What a TEACHER is shown of a student. First name, class and district — never
 *  the address, the date of birth or the coordinates. */
export interface StudentCardResp {
  id: string;
  /** The USER id. `id` above is the profile's — an interest is addressed to a
   *  person, and sending the profile id gets "No such person" every time. */
  user_id: string;
  first_name: string;
  klass: string; klass_label: string;
  board: string; medium: string; area: string;
}

export interface TuitionRequirementResp {
  id: string;
  klass: string; klass_label: string;
  subjects: string[]; medium: string; board: string; exams: string[];
  mode: "home" | "teacher_place" | "online" | "either"; mode_label: string;
  days_per_week: number | null; preferred_time: string;
  budget_min: number | null; budget_max: number | null; budget_label: string;
  teacher_gender: string;
  city: string; district_ref: string | null; block_ref: string | null;
  description: string;
  status: "open" | "filled" | "closed"; status_label: string;
  view_count: number; interests_count: number; created_at: string;
}

/** The same requirement as a teacher sees it: no coordinates, no block, and
 *  the nested student is the card shape. */
export interface TuitionCardResp {
  id: string; student: StudentCardResp;
  klass: string; klass_label: string;
  subjects: string[]; medium: string; board: string; exams: string[];
  mode: string; mode_label: string;
  days_per_week: number | null; preferred_time: string;
  budget_label: string; teacher_gender: string;
  city: string; description: string;
  distance_km: number | null;
  created_at: string;
}

// ── interest and chat (sections 9 and 12) ───────────────────────────────────

/** The other person in a connection. Name and role only — no phone and no
 *  email, even after an interest is accepted. The firm is the channel. */
export interface Counterparty {
  id: string; name: string; roles: Role[]; image: string; is_me: boolean;
}

export interface InterestResp {
  id: string;
  person: Counterparty;
  direction: "sent" | "received";
  context: "profile" | "vacancy" | "tuition";
  context_label: string; context_id: string;
  message: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  status_label: string;
  seen_at: string | null; responded_at: string | null;
  /** Present only once accepted. Its absence IS "no conversation yet". */
  thread_id: string | null;
  created_at: string;
}

export interface ThreadResp {
  id: string;
  person: Counterparty;
  last_message: { body: string; at: string; mine: boolean } | null;
  unread: number;
  last_message_at: string | null;
  created_at: string;
}

export interface MessageResp {
  id: string; body: string; mine: boolean;
  read_at: string | null; created_at: string;
}

// ── location (section 10) ───────────────────────────────────────────────────

export interface StateResp { id: string; name: string; is_union_territory: boolean; }
export interface DistrictResp { id: string; name: string; state: string; }
export interface BlockResp { id: string; name: string; kind: string; district: string; }
