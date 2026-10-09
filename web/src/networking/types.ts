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

export type Role = "teacher" | "school" | "staff";
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

export interface PublicSiteResp {
  settings: SiteSettings;
  services: ServiceResp[];
  process: ProcessStepResp[];
  team: TeamMemberResp[];
  testimonials: TestimonialResp[];
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
