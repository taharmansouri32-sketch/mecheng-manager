export type UserRole = 'admin' | 'vice_admin' | 'specialty_manager' | 'teacher';
export type TeacherRank = 'Pr' | 'MCA' | 'MCB' | 'MAA' | 'MAA_DOC' | 'DOC';
export type TeacherType = 'permanent_internal' | 'permanent_external' | 'temporary';

export interface User {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  displayNameAr?: string;
  role: UserRole;
  specialties?: string[];
  managedSpecialtyId?: string;
  managedPhase?: 'license' | 'master' | 'engineers';
  password?: string;
  isTemporary?: boolean;
  teacherType?: TeacherType;
  department?: string;
  rank?: TeacherRank;
  appointmentDate?: string; // For specialty managers
  isRenewed?: boolean; // For specialty managers
  isUnder1275?: boolean; // Decision 1275
  isActive?: boolean;
  birthDate?: string;
  birthPlace?: string;
  authStatus?: 'success' | 'failed' | 'pending';
  authError?: string;
}

export interface Specialty {
  id: string;
  name: string;
  field: string;
  levelType: 'license' | 'master' | 'engineers';
  phase: string;
}

export interface Level {
  id: string;
  name: string;
  specialtyId: string;
  studentCount?: number;
}

export interface Module {
  id: string;
  name: string;
  levelId: string;
  specialtyId: string;
  semester: string;
}

export interface SemesterScheduleEntry {
  id?: string;
  cycle: string;
  level: string;
  specialty: string;
  semester: string;
  subject: string;
  teacherId: string;
  academicYear: string;
  type: 'Cours' | 'TD' | 'TP';
  branch: string;
  room: string;
  day: string;
  session: string;
  startTime: string;
  endTime: string;
  isOnline: boolean;
  isInEnglish: boolean;
}

export interface RoomAssignment {
  room: string;
  group: string;
  invigilatorIds: string[];
}

export interface ExamScheduleEntry {
  id?: string;
  cycle: string;
  level: string;
  specialty: string;
  semester: string;
  subject: string;
  date: string;
  academicYear: string;
  isRemedial: boolean;
  session: string;
  startTime: string;
  endTime: string;
  room: string;
  room2?: string;
  roomSelectionMode?: 'simple' | 'detailed';
  roomAssignments?: RoomAssignment[];
  teacherIds: string[];
  failedStudents?: number;
}

export interface Schedule {
  id: string;
  type: 'semester' | 'normal_exam' | 'remedial_exam' | 'hall_utilization' | 'teacher';
  uploadedAt: string;
  data: (SemesterScheduleEntry | ExamScheduleEntry | any)[];
  fileName?: string;
  academicYear: string;
}

export interface Holiday {
  id: string;
  startDate: string;
  endDate?: string;
  name: string;
  type: 'national' | 'religious' | 'break' | 'pedagogical' | 'exam' | 'internship' | 'exceptional' | 'other_holiday';
  notes?: string;
}

export interface Calendar {
  id: string;
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
  holidays: Holiday[];
  excludedDays: string[];
}

export type SessionStatus = 'pending' | 'taught' | 'missed' | 'problem' | 'internship' | 'sick';

export type SessionProblem = 
  | 'group_absence' 
  | 'majority_absence' 
  | 'lack_of_means' 
  | 'room_problem' 
  | 'student_delay' 
  | 'teacher_delay' 
  | 'organizational' 
  | 'other_session';

export interface Session {
  id: string;
  teacherId: string;
  module: string;
  specialtyId: string;
  levelId: string;
  group: string;
  day: string;
  time: string;
  room: string;
  type: string;
  date: string;
  status: SessionStatus;
  problemType?: SessionProblem;
  notes?: string;
  academicYear: string;
}

export type CompensationStatus = 'available' | 'reserved' | 'approved' | 'cancelled';

export interface Compensation {
  id: string;
  sessionId: string;
  teacherId?: string;
  status: CompensationStatus;
  date: string;
  time: string;
  room: string;
  academicYear: string;
}

export type ProjectStatus = 'proposed' | 'accepted' | 'rejected' | 'distributed';
export type ProjectStage = 'start' | 'references' | 'theory' | 'practical' | 'writing' | 'ready';

export type SupervisionProblem = 
  | 'no_response' 
  | 'absence' 
  | 'delay' 
  | 'technical' 
  | 'data_lack' 
  | 'other_supervision';

export type AbandonmentReason = 
  | 'no_commitment' 
  | 'repeated_absence' 
  | 'interruption' 
  | 'work_pressure' 
  | 'administrative' 
  | 'other_abandonment';

export interface Project {
  id: string;
  title: string;
  description: string;
  levelId: string;
  specialtyId: string;
  students: string[]; // Array of Student IDs
  supervisorId: string;
  keywords: string[];
  status: ProjectStatus;
  progress: number;
  stage: ProjectStage;
  phase?: string;
  is1275?: boolean; // Decision 1275 (Startup/Patent)
  academicYear: string;
  defenseDate?: string;
  defenseTime?: string;
  defenseRoom?: string;
  suggestedDefenseDate?: string;
  suggestedDefenseTime?: string;
  committeeMembers?: string[]; // Array of Teacher IDs
  finalThesisUrl?: string;
  finalThesisSentAt?: string;
  problems?: {
    type: SupervisionProblem;
    date: string;
    notes: string;
  }[];
  abandonmentRequest?: {
    reason: AbandonmentReason;
    date: string;
    notes: string;
    status: 'pending' | 'approved' | 'rejected';
  };
}

export interface FieldVisit {
  id: string;
  teacherId: string;
  companyName: string;
  levelId: string;
  specialtyId: string;
  moduleId: string;
  visitDate: string;
  studentCount: number;
  supervisors: {
    id?: string; // Teacher ID if existing
    name: string; // Name if manual or existing
  }[];
  status: 'pending' | 'approved' | 'rejected';
  academicYear: string;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  registrationNumber: string;
  specialtyId: string;
  levelId: string;
  projectId?: string; // ID of the assigned project
  isInternational?: boolean;
  academicYear: string;
}

export interface DepartmentStats {
  id: string;
  academicYear: string;
  internationalStudentsCount: number;
  licenseGroupsCount: number;
  masterGroupsCount: number;
  engineersGroupsCount: number;
  amphitheatersCount: number;
  tdRoomsCount: number;
  tpRoomsCount: number;
  tpComputersCount: number;
  labSeatsCount: number;
  consumablesSufficiency: number; // percentage
  teachesAI: boolean;
  teachesEntrepreneurship: boolean;
  itEngineersCount: number;
  itTechniciansCount: number;
  adminWorkersCount: number;
  lastUpdated: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  timestamp: string;
  details?: any;
}

export interface OvertimeEntry {
  id: string;
  teacherId: string;
  academicYear: string;
  semester: 'S1' | 'S2';
  date: string;
  hours: number;
  type: 'internal' | 'external';
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  monthlyHours?: { [month: string]: number };
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  updatedAt?: string;
}

export interface Certificate {
  id: string;
  teacherId: string;
  type: 'teaching' | 'supervision';
  academicYear: string; // Keep for backward compatibility or single year
  academicYears?: string[]; // Multiple years support
  issuedAt: string;
  status: 'requested' | 'prepared' | 'issued';
  requestedAt?: string;
  preparedAt?: string;
  notifiedAt?: string;
  birthDate?: string;
  birthPlace?: string;
  details: {
    modules?: {
      name: string;
      level: string;
      specialty: string;
      academicYear: string;
      semester?: string;
    }[];
    projects?: {
      title: string;
      studentNames: string[];
      academicYear: string;
      specialty?: string;
      defenseDate?: string;
    }[];
    projectTitle?: string; // Legacy
    studentNames?: string[]; // Legacy
    level?: string; // Legacy
  };
}
