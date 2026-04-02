import React, { useState, useEffect } from 'react';
import { 
  DndContext, 
  useDraggable, 
  useDroppable, 
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { where } from 'firebase/firestore';
import { CSS } from '@dnd-kit/utilities';
import { dbService } from '../services/db';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSearchParams } from 'react-router-dom';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Edit2,
  Save, 
  Clock, 
  MapPin, 
  User as UserIcon, 
  BookOpen, 
  Check, 
  AlertCircle,
  Printer,
  ChevronRight,
  ChevronLeft,
  Search,
  LayoutGrid,
  Layout,
  Users,
  List as ListIcon,
  Download,
  FileText,
  Send,
  X,
  Link as LinkIcon,
  Copy
} from 'lucide-react';
import { motion } from 'motion/react';
import { User, Specialty, Level, Module, SemesterScheduleEntry, ExamScheduleEntry, Schedule } from '../types';
import { cn } from '../lib/utils';
import { ConfirmationModal } from '../components/ConfirmationModal';

type Tab = 'semester' | 'normal_exam' | 'remedial_exam' | 'hall_utilization' | 'my_schedule';

const ROOMS_CONFIG: { [key: string]: number } = {
  'Amphi D': 200,
  'Room 01/01': 40,
  'Room 01/02': 40,
  'Room 01/03': 40,
  'Room 01/04': 40,
  'Room 01/05': 40,
  'Room 01/06': 40,
  'Room 02/01': 40,
  'Room 02/02': 40,
  'Room 02/03': 40,
  'IT Lab': 25,
  'Workshop': 30,
  'Metrology Lab': 20,
  'Materials.1 Lab': 20,
  'Materials.2 Lab': 20,
  'Heat Transfer Lab': 20,
  'Testing Lab': 20,
  'Turbomachinery Lab': 20,
  'Online': 999
};

const ROOMS = Object.keys(ROOMS_CONFIG);

const SESSIONS = [
  { start: '08:00', end: '09:25' },
  { start: '09:35', end: '11:00' },
  { start: '11:10', end: '12:35' },
  { start: '12:40', end: '14:05' },
  { start: '14:05', end: '15:30' },
  { start: '15:35', end: '17:00' }
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

export function ScheduleManagement() {
  const { t, isRTL, academicYear, setAcademicYear, academicYears, getPublicUrl } = useLanguage();
  const { user, activeRole, isAdmin, isSpecialtyManager, isTeacher } = useAuth();
  const [searchParams] = useSearchParams();
  const teacherIdParam = searchParams.get('teacherId');
  const tabParam = searchParams.get('tab') as Tab;
  
  const tabs: Tab[] = ['semester', 'normal_exam', 'remedial_exam', 'hall_utilization'];
  const [activeTab, setActiveTab] = useState<Tab>(tabParam || 'semester');
  
  const canEdit = isAdmin;

  const [myScheduleSpecialty, setMyScheduleSpecialty] = useState<string>(user?.managedSpecialtyId || '');
  const [myScheduleLevel, setMyScheduleLevel] = useState<string>('');
  const [myScheduleSemester, setMyScheduleSemester] = useState<string>('S1');

  const cleanForPDF = (text: string) => {
    if (!text) return '';
    const cleaned = text.replace(/[\u0600-\u06FF]/g, '').trim();
    return cleaned || text;
  };

  const [selectedRoom, setSelectedRoom] = useState<string>(ROOMS[1]);
  const [hallViewType, setHallViewType] = useState<'lessons' | 'exams'>('lessons');
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for Semester (Filters only)
  const [semesterForm, setSemesterForm] = useState<Partial<SemesterScheduleEntry & { levelName: string; academicYear: string }>>({
    cycle: '',
    level: '',
    levelName: '',
    specialty: '',
    semester: 'S1',
    academicYear: academicYear
  });

  const [showAddModal, setShowAddModal] = useState<{ day: string; sessionIdx: number; entry?: SemesterScheduleEntry } | null>(null);
  const [modalForm, setModalForm] = useState({
    subject: '',
    teacherId: '',
    type: 'Cours' as 'Cours' | 'TD' | 'TP' | 'Online',
    room: '',
    isOnline: false,
    isInEnglish: false
  });

  // Form states for Exam
  const [examForm, setExamForm] = useState<any>({
    cycle: '',
    level: '',
    levelName: '',
    specialty: '',
    semester: 'S1',
    subject: '',
    date: '',
    academicYear: academicYear,
    isRemedial: false,
    failedStudents: 0,
    session: 'CUSTOM',
    startTime: '',
    endTime: '',
    room: '',
    room2: '',
    roomSelectionMode: 'simple',
    roomAssignments: [],
    teacherIds: []
  });

  const [savedSchedules, setSavedSchedules] = useState<Schedule[]>([]);
  const [editingExam, setEditingExam] = useState<ExamScheduleEntry | null>(null);
  const [examFilterSpecialty, setExamFilterSpecialty] = useState<string>('all');
  const [examFilterLevel, setExamFilterLevel] = useState<string>('all');

  const [semesterViewMode, setSemesterViewMode] = useState<'all' | 'personal'>(
    (isAdmin && !teacherIdParam) ? 'all' : 'personal'
  );
  const [confirmationModal, setConfirmationModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [examViewMode, setExamViewMode] = useState<'all' | 'personal'>(
    (isAdmin && !teacherIdParam) ? 'all' : 'personal'
  );

  // Filtered lists for Semester Form
  const semesterFilteredLevels = Array.from(new Set(
    levels
      .filter(l => specialties.find(s => s.id === l.specialtyId)?.levelType === semesterForm.cycle)
      .map(l => l.name)
  ));
  
  const semesterFilteredSpecialties = specialties.filter(s => 
    s.levelType === semesterForm.cycle && 
    levels.some(l => l.specialtyId === s.id && l.name === semesterForm.levelName)
  );
  
  const semesterFilteredModules = modules.filter(m => m.levelId === semesterForm.level && m.semester === semesterForm.semester);

  // Filtered lists for Exam Form
  const examFilteredLevels = Array.from(new Set(
    levels
      .filter(l => specialties.find(s => s.id === l.specialtyId)?.levelType === examForm.cycle)
      .map(l => l.name)
  ));
  
  const examFilteredSpecialties = specialties.filter(s => 
    s.levelType === examForm.cycle && 
    levels.some(l => l.specialtyId === s.id && l.name === examForm.levelName)
  );
  
  const examFilteredModules = modules.filter(m => m.levelId === examForm.level && m.semester === examForm.semester);

  const isModuleScheduled = (moduleId: string, type: 'semester' | 'exam', currentType?: string) => {
    if (type === 'semester') {
      const schedule = savedSchedules.find(s => s.type === 'semester');
      if (!schedule) return false;
      return schedule.data.some((entry: SemesterScheduleEntry) => 
        entry.subject === moduleId && 
        entry.level === semesterForm.level && 
        entry.specialty === semesterForm.specialty &&
        entry.type === (currentType || modalForm.type)
      );
    } else {
      const scheduleType = examForm.isRemedial ? 'remedial_exam' : 'normal_exam';
      const schedule = savedSchedules.find(s => s.type === scheduleType);
      if (!schedule) return false;
      return schedule.data.some((entry: any) => entry.subject === moduleId);
    }
  };

  useEffect(() => {
    setSemesterForm(prev => ({ ...prev, academicYear: academicYear }));
    setExamForm(prev => ({ ...prev, academicYear: academicYear }));
  }, [academicYear]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [s, l, m, u] = await Promise.all([
          dbService.getCollection<Specialty>('specialties'),
          dbService.getCollection<Level>('levels'),
          dbService.getCollection<Module>('modules'),
          dbService.getCollection<User>('users')
        ]);
        setSpecialties(s);
        setLevels(l);
        setModules(m);
        setTeachers(u.filter(user => user.role === 'teacher' || user.role === 'specialty_manager'));
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Subscribe to schedules for real-time updates
    const unsubscribe = dbService.subscribeToCollection<Schedule>('schedules', [
      { field: 'academicYear', operator: '==', value: academicYear }
    ], (sch) => {
      setSavedSchedules(sch);
    });

    return () => unsubscribe();
  }, [academicYear]);

  const getDayOfWeek = (dateString: string) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const date = new Date(dateString);
    return days[date.getDay()];
  };

  const handleCopyLink = (teacherId?: string) => {
    const baseUrl = getPublicUrl() + window.location.pathname;
    const params = new URLSearchParams();
    if (teacherId) params.set('teacherId', teacherId);
    params.set('tab', activeTab);
    
    const link = `${baseUrl}?${params.toString()}`;
    navigator.clipboard.writeText(link);
    toast.success(t('link_copied') || 'Link copied to clipboard!');
  };

  const sendEmailNotification = async (type: string, teacherEmail?: string) => {
    const isPersonal = (type === 'semester' ? semesterViewMode : examViewMode) === 'personal';
    
    setConfirmationModal({
      title: t('confirm_send_email'),
      message: teacherEmail 
        ? `${t('confirm_send_email_to')} ${teacherEmail}?`
        : (isPersonal 
          ? t('confirm_send_personal_email_desc')
          : t('confirm_send_email_desc')),
      onConfirm: async () => {
        const email = teacherEmail || user?.email || 'user@example.com';
        const scheduleType = t(type === 'semester' ? 'semester_schedule' : 'invigilation_schedule');
        
        const emails = (teacherEmail ? [teacherEmail] : (isPersonal ? [user?.email] : teachers.map(t => t.email))).filter(Boolean) as string[];
        
        if (emails.length === 0) {
          toast.error(t('no_emails_found') || 'No emails found');
          setConfirmationModal(null);
          return;
        }

        const loadingToast = toast.loading(t('sending_email') || 'Sending...');
        
        try {
          const response = await fetch('/api/notifications/send-schedule-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emails,
              fileName: scheduleType
            })
          });
          
          const result = await response.json();
          toast.dismiss(loadingToast);
          
          if (result.success) {
            toast.success(teacherEmail 
              ? `${t('notification_sent')}: ${email}`
              : (isPersonal 
                ? `${t('notification_sent')}: ${email}`
                : t('all_notifications_sent') || 'All notifications sent successfully'
              )
            );
          } else {
            toast.error(result.message || result.error || t('error_occurred'));
          }
        } catch (error) {
          toast.dismiss(loadingToast);
          toast.error(t('error_occurred'));
          console.error('Email error:', error);
        } finally {
          setConfirmationModal(null);
        }
      }
    });
  };

  const exportHallSchedule = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const headers = [['Day', ...SESSIONS.map((_, i) => `Session ${i + 1}`)]];
    const rows = DAYS.map(day => {
      const rowData = SESSIONS.map((_, idx) => {
        const entries = savedSchedules
          .filter(s => s.type === (hallViewType === 'lessons' ? 'semester' : 'normal_exam'))
          .flatMap(s => s.data)
          .filter(entry => {
            if (hallViewType === 'lessons') {
              const e = entry as SemesterScheduleEntry;
              return e.day === day && e.session === `H${idx + 1}` && e.room === selectedRoom;
            } else {
              const e = entry as ExamScheduleEntry;
              return getDayOfWeek(e.date) === day && e.room === selectedRoom;
            }
          });
        return entries.map((e: any) => {
          if (hallViewType === 'lessons') {
            const moduleName = modules.find(m => m.id === e.subject)?.name || e.subject;
            const teacherName = teachers.find(t => t.uid === e.teacherId)?.displayName || e.teacherId;
            return `${cleanForPDF(moduleName)} (${cleanForPDF(teacherName)})`;
          } else {
            return cleanForPDF(e.examName || e.subject);
          }
        }).join(' | ');
      });
      return [day, ...rowData];
    });

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 20,
      styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`hall_utilization_${selectedRoom.replace(/\//g, '_')}.pdf`);
  };

  const handleCloneSchedule = async () => {
    if (!isAdmin) return;
    
    const parts = academicYear.split('/');
    if (parts.length !== 2) return;
    const nextYear = (parseInt(parts[0]) + 1) + '/' + (parseInt(parts[1]) + 1);
    
    setConfirmationModal({
      title: t('confirm_clone_schedule'),
      message: `${t('confirm_clone_schedule_desc')} ${nextYear}?`,
      onConfirm: async () => {
        try {
          const loadingToast = toast.loading(t('cloning_schedule') || 'Cloning...');
          
          // Clone all schedules of the selected year to the next year
          const schedulesToClone = await dbService.getCollection<Schedule>('schedules', [
            where('academicYear', '==', academicYear)
          ]);
          
          for (const sch of schedulesToClone) {
            // Check if schedule already exists for next year
            const existing = await dbService.getCollection<Schedule>('schedules', [
              where('academicYear', '==', nextYear),
              where('type', '==', sch.type)
            ]);
            
            if (existing.length > 0) {
              await dbService.updateDocument('schedules', existing[0].id, {
                data: sch.data,
                uploadedAt: new Date().toISOString()
              });
            } else {
              await dbService.addDocument('schedules', {
                type: sch.type,
                data: sch.data,
                academicYear: nextYear,
                uploadedAt: new Date().toISOString()
              });
            }
          }
          
          toast.dismiss(loadingToast);
          toast.success(t('clone_success') || 'Schedules cloned successfully!');
          setAcademicYear(nextYear);
          setConfirmationModal(null);
        } catch (error) {
          console.error('Error cloning schedule:', error);
          toast.error(t('error_occurred'));
        }
      }
    });
  };

  const getDegreeInfo = () => {
    if (teacherIdParam || (activeTab === 'semester' && semesterViewMode === 'personal') || (activeTab !== 'semester' && examViewMode === 'personal')) {
      const prefix = activeTab === 'semester' ? t('semester_schedule') : t('invigilation_schedule');
      const teacher = teachers.find(t => t.uid === (teacherIdParam || user?.uid));
      return `${prefix} - ${teacher?.displayName || ''}`;
    }
    
    let levelName = '';
    let cycle = '';

    if (activeTab === 'semester') {
      levelName = semesterForm.levelName || '';
      cycle = semesterForm.cycle || '';
    } else {
      levelName = (examFilterLevel !== 'all' ? examFilterLevel : examForm.levelName) || '';
      cycle = examForm.cycle || '';
      if (!cycle && levelName) {
        const levelObj = levels.find(l => l.name === levelName);
        if (levelObj) {
          const specObj = specialties.find(s => s.id === levelObj.specialtyId);
          cycle = specObj?.levelType || '';
        }
      }
    }
    
    if (!levelName && !cycle) return t('all_levels');

    let yearText = '';
    if (levelName === 'L1') yearText = t('first_year');
    else if (levelName === 'L2') yearText = t('second_year');
    else if (levelName === 'L3') yearText = t('third_year');
    else if (levelName === 'M1') yearText = t('first_year');
    else if (levelName === 'M2') yearText = t('second_year');
    else if (levelName.startsWith('ING')) {
      const num = levelName.replace('ING', '');
      const years = [t('first'), t('second'), t('third'), t('fourth'), t('fifth')];
      const idx = parseInt(num) - 1;
      yearText = (idx >= 0 && idx < years.length) ? `${years[idx]} ${t('year')}` : levelName;
    }
    else yearText = levelName;

    let degreeText = '';
    if (cycle === 'license') degreeText = t('bachelor_degree');
    else if (cycle === 'master') degreeText = t('master_degree');
    else if (cycle === 'engineers') degreeText = t('engineering_degree');
    else degreeText = t('degree');

    return yearText ? `${yearText} ${degreeText}` : degreeText;
  };

  const handleDownloadPDF = (type: 'semester' | 'normal_exam' | 'remedial_exam' = 'semester', targetTeacherId?: string, targetSpecialtyId?: string) => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const scheduleType = type;
    const schedule = savedSchedules.find(s => s.type === scheduleType);
    
    if (!schedule) {
      toast.error(t('no_schedule_found'));
      return;
    }

    const effectiveTeacherId = targetTeacherId || (semesterViewMode === 'personal' ? user?.uid : undefined);
    const teacher = teachers.find(t => t.uid === effectiveTeacherId);
    const teacherName = teacher?.displayName || '';

    const effectiveSpecialty = targetSpecialtyId || semesterForm.specialty;
    const specialtyName = effectiveSpecialty === 'all' ? 'All Specialties' : (specialties.find(s => s.id === effectiveSpecialty)?.name || '');
    
    const levelText = getDegreeInfo();
    const specClean = cleanForPDF(specialtyName);
    const displaySpecialty = (specClean && specClean !== 'All Specialties') ? ` in ${specClean}` : '';
    const baseInfo = `${levelText}${displaySpecialty}`;
    
    const headerLine1 = "Mechanical Engineering Department - Laghouat University";
    const degreeInfo = getDegreeInfo();
    const typeText = type === 'semester' ? t('semester_schedule') : (type === 'normal_exam' ? 'Exam Schedule - Normal Session' : 'Exam Schedule - Remedial Session');
    const headerLine2 = `${degreeInfo} - ${typeText}`;
    const semesterText = type === 'semester' ? (semesterForm.semester === 'S1' ? 'Semester 1' : 'Semester 2') : (examForm.semester === 'S1' ? 'Semester 1' : 'Semester 2');
    const headerLine3 = `Academic Year ${academicYear} - ${semesterText}`;

    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(headerLine1, doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });
    
    doc.setFontSize(13);
    doc.text(headerLine2, doc.internal.pageSize.getWidth() / 2, 17, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(headerLine3, doc.internal.pageSize.getWidth() / 2, 24, { align: 'center' });

    if (type === 'semester') {
      const tableData = DAYS.map(day => {
        const row: any[] = [day];
        SESSIONS.forEach((_, idx) => {
          const entries = (schedule.data as SemesterScheduleEntry[]).filter((d: SemesterScheduleEntry) => {
            const isCorrectTime = d.day === day && d.session === `H${idx + 1}`;
            if (effectiveTeacherId) {
              return isCorrectTime && d.teacherId === effectiveTeacherId && d.semester === semesterForm.semester;
            }
            
            const dLevelName = levels.find(l => l.id === d.level)?.name;
            const isCorrectLevel = d.level === semesterForm.level || (semesterForm.levelName && dLevelName === semesterForm.levelName);

            return isCorrectTime && 
              isCorrectLevel &&
              (effectiveSpecialty === 'all' || d.specialty === effectiveSpecialty) &&
              d.semester === semesterForm.semester;
          });

          if (entries.length > 0) {
            const firstEntry = entries[0];
            const moduleNames = entries.map(e => modules.find(m => m.id === e.subject)?.name || e.subject).join(' / ');
            const tNames = entries.map(e => teachers.find(t => t.uid === e.teacherId)?.displayName || e.teacherId).join(' / ');
            const rooms = Array.from(new Set(entries.map(e => e.room))).join(' / ');
            
            let topInfo = '';
            if (effectiveTeacherId) {
              const specNames = Array.from(new Set(entries.map(e => specialties.find(s => s.id === e.specialty)?.name || e.specialty))).join(' / ');
              const levelNames = Array.from(new Set(entries.map(e => levels.find(l => l.id === e.level)?.name || e.level))).join(' / ');
              topInfo = `${cleanForPDF(levelNames)} ${cleanForPDF(specNames)}`;
            } else {
              if (semesterForm.specialty === 'all') {
                topInfo = entries.map(e => {
                  const tn = teachers.find(t => t.uid === e.teacherId)?.displayName || e.teacherId;
                  return cleanForPDF(tn);
                }).join(' / ');
              } else {
                topInfo = cleanForPDF(tNames);
              }
            }

            row.push({
              content: '', // didDrawCell handles it
              type: firstEntry.type,
              module: cleanForPDF(moduleNames),
              room: rooms,
              topInfo: topInfo
            });
          } else {
            row.push('');
          }
        });
        return row;
      });

      autoTable(doc, {
        startY: 35,
        head: [['Day', ...SESSIONS.map((_, i) => `SEANCE ${i + 1}\n${SESSIONS[i].start}-${SESSIONS[i].end}`)]],
        body: tableData as any[][],
        theme: 'grid',
        headStyles: { 
          fillColor: [30, 58, 138], // Professional Indigo 900
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          lineWidth: 0.5,
          lineColor: [255, 255, 255]
        },
        styles: { 
          fontSize: 7, 
          cellPadding: 1, 
          halign: 'center', 
          valign: 'middle',
          overflow: 'linebreak',
          lineWidth: 0.2,
          lineColor: [228, 228, 231],
          minCellHeight: 28
        },
        columnStyles: { 
          0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 30, textColor: [39, 39, 42] } 
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index > 0) {
            const cellData = data.cell.raw as any;
            if (cellData && cellData.module) {
              if (cellData.type === 'Cours') {
                doc.setFillColor(236, 253, 245);
              } else {
                doc.setFillColor(239, 246, 255);
              }
              doc.rect(data.cell.x + 0.2, data.cell.y + 0.2, data.cell.width - 0.4, data.cell.height - 0.4, 'F');

              const topInfo = cellData.topInfo || '';
              const module = cellData.module || '';
              const room = cellData.room || '';

              doc.setFontSize(7);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(82, 82, 91);
              const topInfoWidth = doc.getTextWidth(topInfo);
              doc.text(topInfo, data.cell.x + data.cell.width - topInfoWidth - 2, data.cell.y + 5);
              // doc.line(data.cell.x + data.cell.width - topInfoWidth - 2, data.cell.y + 5.5, data.cell.x + data.cell.width - 2, data.cell.y + 5.5);

              doc.setFontSize(9);
              doc.setFont('helvetica', 'bolditalic');
              doc.setTextColor(0, 0, 0);
              doc.text(module, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 2, { align: 'center', maxWidth: data.cell.width - 4 });

              doc.setFontSize(7);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(63, 63, 70); // Zinc 700
              doc.text(room, data.cell.x + 2, data.cell.y + data.cell.height - 3);

              doc.setFontSize(7);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(220, 38, 38);
              const typeWidth = doc.getTextWidth(cellData.type);
              doc.text(cellData.type, data.cell.x + data.cell.width - typeWidth - 2, data.cell.y + data.cell.height - 3);
            }
          }
        },
        margin: { top: 30, right: 5, bottom: 5, left: 5 },
        tableWidth: 'auto'
      });
    } else {
      // Exam Schedule
      if (effectiveTeacherId) {
        // Personal Invigilation Schedule (List format)
        const teacherExams = schedule.data
          .filter((e: ExamScheduleEntry) => e.teacherIds.includes(effectiveTeacherId))
          .sort((a: ExamScheduleEntry, b: ExamScheduleEntry) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const tableData = teacherExams.map((exam: ExamScheduleEntry) => {
          const moduleName = modules.find(m => m.id === exam.subject)?.name || exam.subject;
          const spec = specialties.find(s => s.id === exam.specialty)?.name || exam.specialty;
          const levelName = levels.find(l => l.id === exam.level)?.name || exam.level;
          return [
            exam.date,
            `${exam.startTime} - ${exam.endTime}`,
            cleanForPDF(moduleName),
            `${levelName} ${cleanForPDF(spec)}`,
            exam.room
          ];
        });

        autoTable(doc, {
          startY: 40,
          head: [['Date', 'Time', 'Module', 'Specialty', 'Room']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [5, 150, 105] },
          styles: { fontSize: 10, halign: 'center' }
        });
      } else {
        // Full Grid Exam Schedule (Existing logic from handleDownloadExamPDF)
        const filteredData = schedule.data.filter((e: ExamScheduleEntry) => {
          const matchesSpecialty = examFilterSpecialty === 'all' || e.specialty === examFilterSpecialty;
          const matchesLevel = examFilterLevel === 'all' || levels.find(l => l.id === e.level)?.name === examFilterLevel;
          return matchesSpecialty && matchesLevel;
        });

        const allDates = Array.from(new Set(filteredData.map((e: ExamScheduleEntry) => e.date))).sort();
        const relevantSpecialties = Array.from(new Set(filteredData.map((e: ExamScheduleEntry) => e.specialty)));
        
        const tableHeaders = [['', ...relevantSpecialties.map(specId => {
          const spec = specialties.find(s => s.id === specId);
          const examsForSpec = filteredData.filter(e => e.specialty === specId);
          const firstExam = examsForSpec[0];
          const timeRange = firstExam ? `${firstExam.startTime} - ${firstExam.endTime}` : '';
          return `${timeRange}\n\n${spec ? cleanForPDF(spec.name) : specId}`;
        })]];

        const examDataMap = new Map<string, any>();
        const tableData = allDates.map((date, rowIdx) => {
          const dayName = getDayOfWeek(date);
          const row: any[] = [`${dayName}\n${date}`];
          relevantSpecialties.forEach((specId, colIdx) => {
            const exams = filteredData.filter((e: ExamScheduleEntry) => e.date === date && e.specialty === specId);
            if (exams.length > 0) {
              const cellKey = `${rowIdx}-${colIdx + 1}`;
              const cellContent = exams.map(exam => ({
                module: cleanForPDF(modules.find(m => m.id === exam.subject)?.name || exam.subject),
                room: exam.room,
                roomAssignments: exam.roomAssignments || [],
                teacherIds: exam.teacherIds || [],
                teachers: cleanForPDF(exam.teacherIds.map(id => teachers.find(t => t.uid === id)?.displayName || id).join(', ')),
                failedStudents: exam.failedStudents
              }));
              examDataMap.set(cellKey, cellContent);
              row.push('');
            } else {
              row.push('');
            }
          });
          return row;
        });

        const specialtyColors: [number, number, number][] = [
          [219, 234, 254], // Blue 100
          [220, 252, 231], // Green 100
          [254, 226, 226], // Red 100
          [254, 249, 195], // Yellow 100
          [243, 232, 255], // Purple 100
          [255, 237, 213], // Orange 100
          [244, 244, 245], // Zinc 100
        ];

        const firstColWidth = 30;
        const otherColsWidth = (doc.internal.pageSize.getWidth() - 10 - firstColWidth) / relevantSpecialties.length;
        
        const columnStyles: any = {
          0: { cellWidth: firstColWidth, fontStyle: 'bold', fillColor: [245, 245, 245] }
        };
        relevantSpecialties.forEach((_, idx) => {
          columnStyles[idx + 1] = { cellWidth: otherColsWidth };
        });

        autoTable(doc, {
          startY: 30,
          head: tableHeaders,
          body: tableData as any[][],
          theme: 'grid',
          headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 8, fontStyle: 'bold', halign: 'center', valign: 'middle', lineWidth: 0.3, lineColor: [0, 0, 0], minCellHeight: 15 },
          styles: { fontSize: 7, cellPadding: 0.5, halign: 'center', valign: 'middle', overflow: 'linebreak', lineWidth: 0.3, lineColor: [0, 0, 0], textColor: [0, 0, 0], minCellHeight: 20 },
          columnStyles: columnStyles,
          didParseCell: (data) => {
            if (data.column.index > 0) {
              const specIdx = (data.column.index - 1) % specialtyColors.length;
              data.cell.styles.fillColor = specialtyColors[specIdx];
              if (data.section === 'head') {
                // Specialty Name in Dark Yellow/Gold for visibility
                data.cell.styles.textColor = [180, 150, 0]; 
                data.cell.styles.fontStyle = 'bold';
              }
            }
          },
          didDrawCell: (data) => {
            // Diagonal line for top-left cell
            if (data.section === 'head' && data.row.index === 0 && data.column.index === 0) {
              const { x, y, width, height } = data.cell;
              doc.setDrawColor(0, 0, 0);
              doc.setLineWidth(0.3);
              doc.line(x, y, x + width, y + height);
              
              doc.setFontSize(7);
              doc.setTextColor(100, 100, 100);
              doc.text('Hour', x + width - 1, y + 4, { align: 'right' });
              doc.text('Day', x + 1, y + height - 1, { align: 'left' });
            }

            if (data.section === 'body' && data.column.index > 0) {
              const cellKey = `${data.row.index}-${data.column.index}`;
              const exams = examDataMap.get(cellKey);
              if (Array.isArray(exams)) {
                const { x, y, width, height } = data.cell;
                
                exams.forEach((exam) => {
                  // 1. Subject Name - Center
                  doc.setFontSize(8);
                  doc.setFont('helvetica', 'bold');
                  doc.setTextColor(0, 0, 0);
                  const splitSubject = doc.splitTextToSize(exam.module, width - 2);
                  doc.text(splitSubject, x + width / 2, y + height / 2 - 1, { align: 'center', baseline: 'middle' });

                  if (exam.roomAssignments && exam.roomAssignments.length > 0) {
                    // Option 2: Detailed Mode (Multiple Rooms)
                    doc.setFontSize(6);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0, 0, 0);

                    const assignments = exam.roomAssignments.map((ra: any) => {
                      const invigilators = ra.invigilatorIds.map((id: string) => {
                        const t = teachers.find(teacher => teacher.uid === id);
                        if (!t) return id;
                        const names = t.displayName.split(' ');
                        const last = names[names.length - 1];
                        const first = names[0].charAt(0);
                        return `${first}.${last}`;
                      }).join(',');
                      return `${ra.room} (${ra.group}) ${invigilators}`;
                    });

                    // Room 1 - Bottom Left
                    if (assignments[0]) {
                      doc.text(cleanForPDF(assignments[0]), x + 1, y + height - 1, { align: 'left' });
                    }
                    // Room 2 - Bottom Center
                    if (assignments[1]) {
                      doc.text(cleanForPDF(assignments[1]), x + width / 2, y + height - 1, { align: 'center' });
                    }
                    // Room 3 - Bottom Right
                    if (assignments[2]) {
                      doc.text(cleanForPDF(assignments[2]), x + width - 1, y + height - 1, { align: 'right' });
                    }
                  } else {
                    // Option 1: Simple Mode
                    // Teacher - Top Right (Abbreviated)
                    doc.setFontSize(6);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0, 0, 0);
                    
                    const formattedTeachers = exam.teacherIds.map((id: string) => {
                      const t = teachers.find(teacher => teacher.uid === id);
                      if (!t) return id;
                      const names = t.displayName.split(' ');
                      const last = names[names.length - 1];
                      const first = names[0].charAt(0);
                      return `${first}.${last}`;
                    }).join(', ');

                    doc.text(cleanForPDF(formattedTeachers), x + width - 1, y + 3, { align: 'right' });

                    // Room - Bottom Left
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(220, 38, 38); // Red
                    doc.text(exam.room, x + 1, y + height - 1, { align: 'left' });
                  }
                });
              }
            }
          },
          margin: { top: 30, right: 5, bottom: 5, left: 5 }
        });
      }
    }

    const fileName = effectiveTeacherId 
      ? `${type}_Schedule_${teacherName.replace(/\s+/g, '_')}.pdf`
      : `${type}_Schedule.pdf`;
    doc.save(fileName);
  };

  const handleAddSemesterEntry = async () => {
    if (!showAddModal) return;
    
    setConfirmationModal({
      title: t('confirm_add_entry'),
      message: t('confirm_add_entry_desc'),
      onConfirm: async () => {
        const { day, sessionIdx, entry: editingEntry } = showAddModal;
        const session = SESSIONS[sessionIdx];
        if (!session) return;

        try {
          const existingSchedule = savedSchedules.find(s => s.type === 'semester');
          const newEntry: SemesterScheduleEntry = {
            ...semesterForm,
            ...modalForm,
            id: (showAddModal.entry as any)?.id || Math.random().toString(36).substr(2, 9),
            isOnline: modalForm.type === 'Online',
            room: modalForm.type === 'Online' ? 'Online' : (modalForm.room || ''),
            day,
            session: `H${sessionIdx + 1}`,
            startTime: session.start,
            endTime: session.end,
            branch: '',
          } as SemesterScheduleEntry;

          // Basic Validation
          if (!newEntry.subject || !newEntry.teacherId || (!newEntry.isOnline && !newEntry.room) || !newEntry.type) {
            toast.error(t('fill_all_fields'));
            return;
          }

          const module = modules.find(m => m.id === newEntry.subject);
          if (module && (module.semester !== newEntry.semester || module.levelId !== newEntry.level)) {
            toast.error(`${t('conflict_detected')}: ${t('semester_level_conflict')}`);
            return;
          }

          // Capacity Conflict
          const level = levels.find(l => l.id === newEntry.level);
          const roomCapacity = ROOMS_CONFIG[newEntry.room] || 0;
          if (newEntry.room && newEntry.room !== 'Online' && level?.studentCount && level.studentCount > roomCapacity) {
            toast.error(`${t('conflict_detected')}: ${t('capacity_conflict')} (${level.studentCount} > ${roomCapacity})`);
            return;
          }

          // Conflict Detection
          if (existingSchedule) {
            let conflictFound: any = null;

            existingSchedule.data.forEach((e: SemesterScheduleEntry) => {
              if (conflictFound) return;
              // Skip check against itself when editing
              if (editingEntry && e === editingEntry) return;

              const sameTime = e.day === newEntry.day && e.session === newEntry.session && e.semester === newEntry.semester;
              if (!sameTime) return;

              // Special case: Shared session (Same subject, same time, same room, same teacher)
              const isSharedSession = e.subject === newEntry.subject && 
                                     e.room === newEntry.room && 
                                     e.teacherId === newEntry.teacherId;

              if (isSharedSession) return;

              // 1. Room/Lab Conflict
              if (e.room && newEntry.room && e.room === newEntry.room && e.room !== 'Online') {
                const isLab = e.room.toLowerCase().includes('lab') || e.room.toLowerCase().includes('workshop');
                conflictFound = { type: isLab ? 'lab' : 'room' };
              }

              // 2. Teacher Conflict
              else if (e.teacherId === newEntry.teacherId) {
                conflictFound = { type: 'teacher' };
              }

              // 3. Group/Level Conflict
              else if (e.level === newEntry.level && e.specialty === newEntry.specialty && e.semester === newEntry.semester) {
                if (e.subject === newEntry.subject) {
                  conflictFound = { type: 'duplicate' };
                } else {
                  conflictFound = { type: 'group' };
                }
              }
            });

            if (conflictFound) {
              toast.error(`${t('conflict_detected')}: ${t(conflictFound.type + '_conflict')}`);
              return;
            }

            let updatedData;
            if (editingEntry) {
              updatedData = existingSchedule.data.map((e: any) => e === editingEntry ? newEntry : e);
            } else {
              updatedData = [...existingSchedule.data, newEntry];
            }

            await dbService.updateDocument('schedules', existingSchedule.id, {
              data: updatedData,
              uploadedAt: new Date().toISOString()
            });
          } else {
            await dbService.addDocument('schedules', {
              type: 'semester',
              uploadedAt: new Date().toISOString(),
              data: [newEntry],
              academicYear: academicYear
            });
          }
          toast.success(t('success'));
          setShowAddModal(null);
          setModalForm({
            subject: '',
            teacherId: '',
            type: 'Cours',
            room: '',
            isOnline: false,
            isInEnglish: false
          });
          setConfirmationModal(null);
          const sch = await dbService.getCollection<Schedule>('schedules');
          setSavedSchedules(sch);
        } catch (error) {
          console.error('Error adding semester entry:', error);
          toast.error(t('error_occurred'));
        }
      }
    });
  };

  const handleDeleteEntry = async (entry: any, type: 'semester' | 'normal_exam' | 'remedial_exam') => {
    setConfirmationModal({
      title: t('confirm_delete'),
      message: t('confirm_delete_desc') || 'Are you sure you want to delete this entry? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const existingSchedule = savedSchedules.find(s => s.type === type);
          if (existingSchedule) {
            const updatedData = existingSchedule.data.filter((e: any) => e !== entry);
            await dbService.updateDocument('schedules', existingSchedule.id, {
              data: updatedData,
              uploadedAt: new Date().toISOString()
            });
            toast.success(t('success'));
            const sch = await dbService.getCollection<Schedule>('schedules');
            setSavedSchedules(sch);
          }
          setConfirmationModal(null);
        } catch (error) {
          console.error('Error deleting entry:', error);
          toast.error(t('error_occurred'));
        }
      }
    });
  };

  const handleAddExamEntry = async () => {
    setConfirmationModal({
      title: t('confirm_add_exam_entry'),
      message: t('confirm_add_exam_entry_desc') || (isRTL ? 'هل أنت متأكد من إضافة هذا الامتحان؟' : 'Are you sure you want to add this exam entry?'),
      onConfirm: async () => {
        try {
          const type = examForm.isRemedial ? 'remedial_exam' : 'normal_exam';
          const existingSchedule = savedSchedules.find(s => s.type === type);
          
          // Derive room summary and teacher IDs based on mode
          let combinedRoom = examForm.room;
          let allTeacherIds = [...(examForm.teacherIds || [])];

          if (examForm.roomSelectionMode === 'detailed') {
            combinedRoom = (examForm.roomAssignments || []).map((ra: any) => ra.room).filter(Boolean).join(', ');
            // Extract all invigilators from assignments
            const invigilatorIds = new Set<string>();
            (examForm.roomAssignments || []).forEach((ra: any) => {
              (ra.invigilatorIds || []).forEach((id: string) => invigilatorIds.add(id));
            });
            allTeacherIds = Array.from(invigilatorIds);
          } else if (examForm.room2) {
            combinedRoom = `${examForm.room}, ${examForm.room2}`;
          }

          const newEntry = { 
            ...examForm,
            id: examForm.id || Math.random().toString(36).substr(2, 9),
            room: combinedRoom,
            teacherIds: allTeacherIds
          } as ExamScheduleEntry;

          // Basic Validation
          const isSimple = newEntry.roomSelectionMode === 'simple';
          const hasSubject = !!newEntry.subject;
          const hasDate = !!newEntry.date;
          const hasTimes = !!newEntry.startTime && !!newEntry.endTime;
          const hasRoom = isSimple ? !!newEntry.room : (newEntry.roomAssignments && newEntry.roomAssignments.length > 0);
          const hasTeachers = isSimple ? (newEntry.teacherIds && newEntry.teacherIds.length > 0) : true; 

          if (!hasSubject || !hasDate || !hasTimes || !hasRoom || !hasTeachers) {
            toast.error(t('fill_all_fields'));
            return;
          }
          
          // Validate room assignments if detailed mode
          if (!isSimple) {
            const invalidAssignment = newEntry.roomAssignments.find((ra: any) => !ra.room || !ra.group || !ra.invigilatorIds.length);
            if (invalidAssignment) {
              toast.error(t('fill_all_room_details') || 'Please fill all room details (Room, Group, and Invigilators)');
              return;
            }
          }

          const module = modules.find(m => m.id === newEntry.subject);
          if (module && (module.semester !== newEntry.semester || module.levelId !== newEntry.level)) {
            toast.error(`${t('conflict_detected')}: ${t('semester_level_conflict')}`);
            return;
          }

          // Conflict Detection for Exams
          if (existingSchedule) {
            let conflictFound: any = null;

            existingSchedule.data.forEach((e: ExamScheduleEntry) => {
              if (conflictFound) return;
              if (editingExam && e === editingExam) return;

              const sameTime = e.date === newEntry.date && e.semester === newEntry.semester &&
                ((newEntry.startTime >= e.startTime && newEntry.startTime < e.endTime) ||
                 (newEntry.endTime > e.startTime && newEntry.endTime <= e.endTime) ||
                 (newEntry.startTime <= e.startTime && newEntry.endTime >= e.endTime));
              
              if (!sameTime) return;

              // Shared exam session (Same subject, same time, same room)
              const isSharedExam = e.subject === newEntry.subject && e.room === newEntry.room;
              if (isSharedExam) return;

              // 1. Room Conflict
              if (e.room === newEntry.room) {
                conflictFound = { type: 'room' };
              }

              // 2. Teacher Conflict (Invigilators)
              else {
                const commonTeachers = e.teacherIds.filter(id => newEntry.teacherIds.includes(id));
                if (commonTeachers.length > 0) {
                  conflictFound = { type: 'teacher' };
                }
                // 3. Group/Level Conflict
                else if (e.level === newEntry.level && e.specialty === newEntry.specialty) {
                  if (e.subject === newEntry.subject) {
                    // Allow same subject/specialty if room is different
                    if (e.room === newEntry.room) {
                      conflictFound = { type: 'duplicate' };
                    }
                  } else {
                    conflictFound = { type: 'group' };
                  }
                }
              }
            });

            if (conflictFound) {
              toast.error(`${t('conflict_detected')}: ${t(conflictFound.type + '_conflict')}`);
              return;
            }

            let updatedData;
            if (editingExam) {
              updatedData = existingSchedule.data.map((e: any) => e === editingExam ? newEntry : e);
            } else {
              updatedData = [...existingSchedule.data, newEntry];
            }

            await dbService.updateDocument('schedules', existingSchedule.id, {
              data: updatedData,
              uploadedAt: new Date().toISOString()
            });
          } else {
            await dbService.addDocument('schedules', {
              type,
              uploadedAt: new Date().toISOString(),
              data: [newEntry],
              academicYear: academicYear
            });
          }
          toast.success(t('success'));
          setEditingExam(null);
          setExamForm({
            cycle: '',
            level: '',
            levelName: '',
            specialty: '',
            semester: 'S1',
            subject: '',
            date: '',
            academicYear: '2025/2026',
            isRemedial: false,
            failedStudents: 0,
            session: 'CUSTOM',
            startTime: '',
            endTime: '',
            room: '',
            room2: '',
            roomAssignments: [],
            teacherIds: []
          });
          setConfirmationModal(null);
          const sch = await dbService.getCollection<Schedule>('schedules');
          setSavedSchedules(sch);
        } catch (error) {
          console.error('Error adding exam entry:', error);
          toast.error(t('error_occurred'));
        }
      }
    });
  };

  const handleExamSessionChange = (session: string) => {
    let startTime = '';
    let endTime = '';
    const isS1 = examForm.semester === 'S1';
    const isRemedial = examForm.isRemedial;

    if (isRemedial) {
      if (session === 'S1') { startTime = '08:15'; endTime = '09:45'; }
      else if (session === 'S2') { startTime = '10:00'; endTime = '11:30'; }
    } else if (isS1) {
      if (session === 'S1') { startTime = '08:15'; endTime = '09:45'; }
      else if (session === 'S2') { startTime = '10:00'; endTime = '11:30'; }
    } else {
      // Normal S2
      if (session === 'S1') { startTime = '08:10'; endTime = '09:40'; }
      else if (session === 'S2') { startTime = '09:50'; endTime = '11:20'; }
      else if (session === 'S3') { startTime = '11:30'; endTime = '13:00'; }
    }
    setExamForm({ ...examForm, session, startTime, endTime });
  };

  const days = DAYS;
  const sessions = [
    'Session 1 (08:00 - 09:25)',
    'Session 2 (09:35 - 11:00)',
    'Session 3 (11:10 - 12:35)',
    'Session 4 (12:45 - 14:10)',
    'Session 5 (14:20 - 15:45)',
    'Session 6 (15:55 - 17:20)'
  ];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDeleteSpecialtySchedule = async (levelId: string, specialtyId: string, semester: string) => {
    setConfirmationModal({
      title: t('delete'),
      message: t('confirm_delete_specialty_schedule') || 'Are you sure you want to delete the schedule for this specialty?',
      onConfirm: async () => {
        try {
          const semesterSchedule = savedSchedules.find(s => s.type === 'semester');
          if (!semesterSchedule) return;

          const newData = (semesterSchedule.data as SemesterScheduleEntry[]).filter((d: SemesterScheduleEntry) => 
            !(d.level === levelId && d.specialty === specialtyId && d.semester === semester)
          );

          await dbService.updateDocument('schedules', semesterSchedule.id, {
            data: newData,
            updatedAt: new Date().toISOString()
          });
          
          toast.success(t('success'));
          setConfirmationModal(null);
        } catch (error) {
          console.error('Error deleting specialty schedule:', error);
          toast.error(t('error'));
        }
      }
    });
  };

  const handleDeleteFullSchedule = async (levelId: string, semester?: string, type: 'semester' | 'normal_exam' | 'remedial_exam' = 'semester') => {
    const confirmMsg = type === 'semester' 
      ? (t('confirm_delete_full_schedule') || 'Are you sure you want to delete the entire schedule for this level and semester?')
      : (t('confirm_delete_full_exam_schedule') || 'Are you sure you want to delete the entire exam schedule for this level?');
      
    setConfirmationModal({
      title: t('delete'),
      message: confirmMsg,
      onConfirm: async () => {
        try {
          const schedule = savedSchedules.find(s => s.type === type);
          if (!schedule) return;

          const newData = (schedule.data as any[]).filter((d: any) => {
            if (type === 'semester') {
              return !(d.level === levelId && d.semester === semester);
            } else {
              return d.level !== levelId;
            }
          });

          await dbService.updateDocument('schedules', schedule.id, {
            data: newData,
            updatedAt: new Date().toISOString()
          });
          
          toast.success(t('success'));
          setConfirmationModal(null);
        } catch (error) {
          console.error('Error deleting full schedule:', error);
          toast.error(t('error'));
        }
      }
    });
  };

  const handleClearAllSchedules = async () => {
    setConfirmationModal({
      title: t('confirm_clear_all_schedules_title'),
      message: t('confirm_clear_all_schedules_desc'),
      onConfirm: async () => {
        const loadingToast = toast.loading(t('clearing_data'));
        try {
          for (const schedule of savedSchedules) {
            await dbService.deleteDocument('schedules', schedule.id);
          }
          toast.success(t('data_cleared_success'), { id: loadingToast });
          const sch = await dbService.getCollection<Schedule>('schedules');
          setSavedSchedules(sch);
          setConfirmationModal(null);
        } catch (error) {
          console.error('Error clearing schedules:', error);
          toast.error(t('error'), { id: loadingToast });
        }
      }
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const entryId = active.id as string;
    const [overDay, overSessionIdx] = (over.id as string).split('|');
    const overSession = `H${parseInt(overSessionIdx) + 1}`;

    const scheduleType = 'semester';
    const existingSchedule = savedSchedules.find(s => s.type === scheduleType);
    if (!existingSchedule) return;

    const entryToMove = existingSchedule.data.find((d: any) => d.id === entryId);
    if (!entryToMove) return;

    // Don't do anything if dropped in same cell
    if (entryToMove.day === overDay && entryToMove.session === overSession) return;

    // Check if target cell is occupied
    const targetOccupied = existingSchedule.data.find((d: any) => 
      d.day === overDay && 
      d.session === overSession && 
      d.level === semesterForm.level && 
      d.specialty === semesterForm.specialty &&
      d.semester === semesterForm.semester
    );

    if (targetOccupied) {
      toast.error(t('cell_occupied'));
      return;
    }

    const updatedData = existingSchedule.data.map((d: any) => {
      if (d.id === entryId) {
        return { ...d, day: overDay, session: overSession };
      }
      return d;
    });

    try {
      await dbService.updateDocument('schedules', existingSchedule.id, {
        data: updatedData,
        uploadedAt: new Date().toISOString()
      });
      const sch = await dbService.getCollection<Schedule>('schedules');
      setSavedSchedules(sch);
      toast.success(t('success'));
    } catch (error) {
      console.error('Error moving entry:', error);
      toast.error(t('error_occurred'));
    }
  };

  const DraggableEntry = ({ entry, idx, day }: { entry: SemesterScheduleEntry, idx: number, day: string }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: entry.id || `${day}-${idx}`,
      disabled: !canEdit
    });

    const style = {
      transform: CSS.Translate.toString(transform),
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 100 : 1,
    };

    return (
      <div 
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="text-xs space-y-2 cursor-grab active:cursor-grabbing hover:bg-emerald-50/50 p-3 rounded-2xl transition-all border border-transparent hover:border-emerald-100 shadow-sm hover:shadow-md bg-white min-h-[120px] flex flex-col justify-center relative touch-none"
        onClick={(e) => {
          if (!canEdit) return;
          // Prevent click when dragging
          if (transform) return;
          setModalForm({
            subject: entry.subject,
            teacherId: entry.teacherId,
            type: entry.type,
            room: entry.room,
            isOnline: entry.isOnline,
            isInEnglish: entry.isInEnglish
          });
          setShowAddModal({ day, sessionIdx: idx, entry });
        }}
      >
        <div className="font-bold text-emerald-600 break-words leading-tight">
          {modules.find(m => m.id === entry.subject)?.name || entry.subject}
          {semesterForm.specialty === 'all' && (
            <span className="ml-1 text-[10px] text-zinc-400 font-normal">
              ({specialties.find(s => s.id === entry.specialty)?.name || entry.specialty})
            </span>
          )}
        </div>
        <div className="text-blue-600 flex items-center gap-1 break-words leading-tight"><UserIcon size={10} className="shrink-0" /> {teachers.find(t => t.uid === entry.teacherId)?.displayName || entry.teacherId}</div>
        <div className="text-[10px] text-orange-500 font-medium italic">({entry.type})</div>
        <div className="text-emerald-500 flex items-center gap-1"><MapPin size={10} /> {entry.room}</div>
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {canEdit && (
            <button 
              className="p-1 text-red-400 hover:text-red-600"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteEntry(entry, 'semester');
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const DroppableCell = ({ day, idx, children }: { day: string, idx: number, children: React.ReactNode }) => {
    const { isOver, setNodeRef } = useDroppable({
      id: `${day}|${idx}`,
    });

    return (
      <td 
        ref={setNodeRef}
        className={cn(
          "p-2 border border-zinc-100 min-w-[180px] relative group align-top transition-colors",
          isOver ? "bg-emerald-50" : ""
        )}
      >
        {children}
      </td>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Year Selector */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-zinc-100 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-zinc-900">{t('academic_year')}</h3>
            <div className="flex items-center gap-2 mt-1">
              {isAdmin ? (
                <select 
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="bg-transparent border-none p-0 text-sm font-bold text-indigo-600 outline-none cursor-pointer hover:underline"
                >
                  {academicYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-bold text-indigo-600">{academicYear}</span>
              )}
              {isAdmin && (
                <button 
                  onClick={handleCloneSchedule}
                  className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-600 transition-all flex items-center gap-1"
                >
                  <Plus size={12} />
                  {t('clone_to_next_year') || 'Clone to Next Year'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Header Tabs */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-zinc-100 gap-2 flex-1 w-full">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2",
                activeTab === tab 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
                  : "text-zinc-500 hover:bg-zinc-50"
              )}
            >
              <CalendarIcon size={18} />
              {tab === 'hall_utilization' 
                ? t('hall_utilization') 
                : (tab === 'semester'
                    ? t('semester_schedule')
                    : (isAdmin 
                        ? t(tab + '_schedule') 
                        : (tab === 'my_schedule' 
                            ? t('my_schedule') 
                            : (tab === 'remedial_exam' ? t('remedial_invigilation_schedule') : t('invigilation_schedule'))
                          )
                      )
                  )
              }
            </button>
          ))}
        </div>
        
        {isAdmin && (
          <button
            onClick={handleClearAllSchedules}
            className="px-6 py-3 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100"
            title={t('clear_all_schedules') || 'Clear All Schedules'}
          >
            <Trash2 size={18} />
            {t('clear_all') || 'Clear All'}
          </button>
        )}
      </div>

      {activeTab === 'semester' && (
        <div className="space-y-8">
          <div className="flex bg-zinc-100 p-1 rounded-2xl w-fit mb-6">
            <button
              onClick={() => setSemesterViewMode('all')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                semesterViewMode === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500"
              )}
            >
              <LayoutGrid size={18} />
              {t('all_specialties')}
            </button>
            <button
              onClick={() => setSemesterViewMode('personal')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                semesterViewMode === 'personal' ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500"
              )}
            >
              <UserIcon size={18} />
              {t('personal_schedule')}
            </button>
          </div>

          {semesterViewMode === 'all' && !semesterForm.level && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Array.from(new Set(
                (savedSchedules.find(s => s.type === 'semester')?.data || [])
                  .map((d: SemesterScheduleEntry) => {
                    const level = levels.find(l => l.id === d.level);
                    return JSON.stringify({ levelName: level?.name, semester: d.semester });
                  })
              )).map((sStr: string, idx) => {
                const s = JSON.parse(sStr);
                const level = levels.find(l => l.name === s.levelName);
                if (!level) return null;
                return (
                  <div
                    key={idx}
                    onClick={() => setSemesterForm({
                      ...semesterForm,
                      specialty: 'all',
                      level: level.id,
                      semester: s.semester,
                      levelName: level.name
                    })}
                    className="p-6 bg-white rounded-3xl shadow-sm border border-zinc-100 hover:shadow-md hover:border-indigo-200 transition-all text-left group cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSemesterForm({
                          ...semesterForm,
                          specialty: 'all',
                          level: level.id,
                          semester: s.semester,
                          levelName: level.name
                        });
                      }
                    }}
                  >
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <CalendarIcon size={24} />
                    </div>
                    <h4 className="font-bold text-zinc-900 text-lg mb-1">{level.name}</h4>
                    <p className="text-zinc-500 text-sm font-medium">{t('semester')} {s.semester.replace('S', '')}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center text-indigo-600 text-xs font-bold uppercase tracking-widest">
                        {t('view_all_specialties')} <ChevronRight size={14} className="ml-1" />
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFullSchedule(level.id, s.semester);
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title={t('delete')}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!(savedSchedules.find(s => s.type === 'semester')?.data?.length) && (
                <div className="col-span-full py-20 text-center text-zinc-400 italic bg-white rounded-3xl border border-dashed border-zinc-200">
                  {t('no_schedule_found')}
                </div>
              )}
            </div>
          )}

          {/* Semester Form - Only show for admin in 'all' mode */}
          {semesterViewMode === 'all' && isAdmin && (
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="bg-blue-600 p-4 flex items-center justify-between text-white">
                <h3 className="font-bold flex items-center gap-2">
                  <CalendarIcon size={20} />
                  {semesterForm.specialty ? t('edit_entry') : t('semester_schedule_title')}
                </h3>
                {semesterForm.specialty && (
                  <button 
                    onClick={() => setSemesterForm({ ...semesterForm, specialty: '', level: '' })}
                    className="text-xs font-bold bg-white/20 px-3 py-1 rounded-lg hover:bg-white/30 transition-all"
                  >
                    {t('back')}
                  </button>
                )}
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Row 1: Cycle -> Level -> Specialty -> Semester */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('cycle')}</label>
                  <select 
                    value={semesterForm.cycle}
                    onChange={(e) => setSemesterForm({
                      ...semesterForm, 
                      cycle: e.target.value,
                      levelName: '',
                      specialty: '',
                      level: '',
                    })}
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="">{t('select_program')}</option>
                    <option value="license">{t('license')}</option>
                    <option value="master">{t('master')}</option>
                    <option value="engineers">{t('engineers')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('level')}</label>
                  <select 
                    value={semesterForm.levelName}
                    onChange={(e) => setSemesterForm({
                      ...semesterForm, 
                      levelName: e.target.value,
                      specialty: '',
                      level: '',
                    })}
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="">{t('select_level')}</option>
                    {semesterFilteredLevels.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('specialty')}</label>
                  <select 
                    value={semesterForm.specialty}
                    onChange={(e) => {
                      const specId = e.target.value;
                      const level = levels.find(l => l.specialtyId === specId && l.name === semesterForm.levelName);
                      setSemesterForm({
                        ...semesterForm, 
                        specialty: specId,
                        level: level?.id || '',
                      });
                    }}
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="">{t('select_specialty')}</option>
                    {semesterFilteredSpecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('semester')}</label>
                  <select 
                    value={semesterForm.semester}
                    onChange={(e) => setSemesterForm({...semesterForm, semester: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="S1">{t('semester_1')}</option>
                    <option value="S2">{t('semester_2')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Semester Grid Preview - Show if a specific schedule is selected in all mode */}
          {semesterViewMode === 'all' && semesterForm.level && (
            <div className="space-y-8">
              {(semesterForm.specialty === 'all' 
                ? specialties.filter(s => levels.some(l => l.specialtyId === s.id && l.name === semesterForm.levelName))
                : [specialties.find(s => s.id === semesterForm.specialty)].filter(Boolean)
              ).map((spec: any) => {
                const specLevel = levels.find(l => l.specialtyId === spec.id && l.name === semesterForm.levelName);
                if (!specLevel) return null;

                return (
                  <div key={spec.id} className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        {semesterForm.specialty !== 'all' && (
                          <button 
                            onClick={() => setSemesterForm({ ...semesterForm, specialty: 'all' })}
                            className="p-2 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-all flex items-center gap-2 text-sm font-bold"
                          >
                            <ChevronLeft size={18} className={isRTL ? "rotate-180" : ""} />
                            {t('back')}
                          </button>
                        )}
                        <h3 className="font-bold text-zinc-900">
                          {spec.name} - {semesterForm.levelName}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteSpecialtySchedule(specLevel.id, spec.id, semesterForm.semester)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2 text-sm font-bold"
                            title={t('delete')}
                          >
                            <Trash2 size={18} />
                            {t('delete')}
                          </button>
                        )}
                        {isAdmin && (
                          <button 
                            onClick={() => sendEmailNotification('semester')}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all flex items-center gap-2 text-sm font-bold"
                          >
                            <Send size={18} />
                            {t('finalize_and_notify')}
                          </button>
                        )}
                        <button 
                          onClick={() => handleDownloadPDF('semester', undefined, spec.id)}
                          className="p-2 text-zinc-400 hover:text-emerald-500 transition-all flex items-center gap-2 text-sm font-medium"
                        >
                          <Download size={20} />
                          PDF
                        </button>
                        <button className="p-2 text-zinc-400 hover:text-emerald-500 transition-all">
                          <Printer size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="p-6 overflow-x-auto">
                      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-zinc-50">
                              <th className="p-4 border border-zinc-100 text-xs font-bold text-zinc-500 uppercase">{t('day')}</th>
                              {sessions.map((s, idx) => (
                                <th key={idx} className="p-4 border border-zinc-100 text-xs font-bold text-zinc-500 uppercase">
                                  {t('session_label')} {idx + 1}
                                  <div className="text-[10px] font-normal opacity-60">{s.split('(')[1].replace(')', '')}</div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {DAYS.map(day => (
                              <tr key={day}>
                                <td className="p-4 border border-zinc-100 font-bold text-zinc-700 bg-zinc-50/50 whitespace-nowrap min-w-[120px]">{t(day.toLowerCase())}</td>
                                  {sessions.map((session, idx) => {
                                    const entries = (savedSchedules.find(s => s.type === 'semester')?.data || []).filter((d: SemesterScheduleEntry) => {
                                      return d.day === day && d.session === `H${idx + 1}` && 
                                        d.level === specLevel.id &&
                                        d.semester === semesterForm.semester;
                                    });
                                    return (
                                      <DroppableCell key={idx} day={day} idx={idx}>
                                        <div className="space-y-2">
                                          {entries.map((entry: SemesterScheduleEntry, eIdx: number) => (
                                            <DraggableEntry key={entry.id || eIdx} entry={entry} idx={idx} day={day} />
                                          ))}
                                          {entries.length === 0 && (
                                            <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
                                              {canEdit && (
                                                <button 
                                                  onClick={() => setShowAddModal({ day, sessionIdx: idx })}
                                                  className="p-2 bg-zinc-100 text-zinc-400 rounded-full hover:bg-emerald-50 hover:text-emerald-500 transition-all"
                                                >
                                                  <Plus size={16} />
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </DroppableCell>
                                    );
                                  })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </DndContext>
                    </div>
                  </div>
                );
              })}
              {semesterForm.specialty === 'all' && (
                <div className="flex justify-center">
                  <button 
                    onClick={() => setSemesterForm({ ...semesterForm, specialty: '', level: '', levelName: '' })}
                    className="px-8 py-3 bg-zinc-100 text-zinc-600 rounded-2xl hover:bg-zinc-200 transition-all font-bold"
                  >
                    {t('back_to_levels')}
                  </button>
                </div>
              )}
            </div>
          )}

          {semesterViewMode === 'personal' && (
            <div className="space-y-8">
              {(isAdmin 
                ? (teacherIdParam ? teachers.filter(t => t.uid === teacherIdParam) : teachers)
                : [user]
              ).filter(Boolean).map((teacher) => {
                const teacherEntries = (savedSchedules.find(s => s.type === 'semester')?.data || [])
                  .filter((d: SemesterScheduleEntry) => d.teacherId === teacher?.uid)
                  .sort((a: SemesterScheduleEntry, b: SemesterScheduleEntry) => {
                    const dayOrder = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
                    if (dayOrder !== 0) return dayOrder;
                    return a.session.localeCompare(b.session);
                  });

                if (isAdmin && teacherEntries.length === 0 && !teacherIdParam) return null;

                return (
                  <div key={teacher?.uid} className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-emerald-600 text-white">
                      <h3 className="font-bold flex items-center gap-2">
                        <UserIcon size={20} />
                        {isAdmin ? teacher?.displayName : t('personal_schedule')}
                      </h3>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleCopyLink(teacher?.uid)}
                          className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all flex items-center gap-2 text-sm font-bold"
                          title={t('copy_link')}
                        >
                          <LinkIcon size={18} />
                          {t('copy_link')}
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={() => sendEmailNotification('semester', teacher?.email)}
                            className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all flex items-center gap-2 text-sm font-bold"
                          >
                            <FileText size={18} />
                            {t('send_to_email')}
                          </button>
                        )}
                        <button 
                          onClick={() => handleDownloadPDF('semester', teacher?.uid)}
                          className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all flex items-center gap-2 text-sm font-bold"
                        >
                          <Download size={18} />
                          {t('download')}
                        </button>
                      </div>
                    </div>
                    <div className="p-6 overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-zinc-50">
                            <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100">{t('day')}</th>
                            <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100">{t('time')}</th>
                            <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100">{t('subject')}</th>
                            <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100">{t('specialty')}</th>
                            <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100">{t('level')}</th>
                            <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100">{t('room')}</th>
                            <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100">{t('type')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teacherEntries.map((entry: SemesterScheduleEntry, idx: number) => {
                            const sessionIdx = parseInt(entry.session.replace('H', '')) - 1;
                            const session = SESSIONS[sessionIdx];
                            
                            if (!session || !entry.day) return null;

                            return (
                              <tr key={idx} className="hover:bg-zinc-50 transition-colors border-b border-zinc-100">
                                <td className="p-4 text-sm font-bold text-zinc-700">{t(entry.day.toLowerCase())}</td>
                                <td className="p-4 text-sm text-zinc-600 font-medium">{session.start} - {session.end}</td>
                                <td className="p-4 text-sm font-bold text-emerald-600">{modules.find(m => m.id === entry.subject)?.name || entry.subject}</td>
                                <td className="p-4 text-sm text-zinc-600">{specialties.find(s => s.id === entry.specialty)?.name || entry.specialty}</td>
                                <td className="p-4 text-sm text-zinc-600">{levels.find(l => l.id === entry.level)?.name || entry.level}</td>
                                <td className="p-4 text-sm text-zinc-600 font-bold">{entry.room}</td>
                                <td className="p-4">
                                  <span className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded text-[10px] font-bold uppercase">
                                    {entry.type}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {teacherEntries.length === 0 && (
                            <tr>
                              <td colSpan={7} className="p-12 text-center text-zinc-400 italic">
                                {t('no_schedule_found')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(activeTab === 'normal_exam' || activeTab === 'remedial_exam') && (
        <div className="space-y-8">
          {isAdmin && (
            <div className="flex bg-zinc-100 p-1 rounded-2xl w-fit mb-6">
              <button
                onClick={() => setExamViewMode('all')}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                  examViewMode === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500"
                )}
              >
                <LayoutGrid size={18} />
                {t('all_specialties')}
              </button>
              <button
                onClick={() => setExamViewMode('personal')}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                  examViewMode === 'personal' ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500"
                )}
              >
                <UserIcon size={18} />
                {t('personal_schedule')}
              </button>
            </div>
          )}

          {/* Exam Form - Only show for admin */}
          {isAdmin && (
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
            <div className="bg-blue-600 p-6 flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{t('exam_management')}</h3>
                  <p className="text-sm opacity-80">CONFIGURATION MODULE</p>
                </div>
              </div>
              <button className="px-4 py-2 bg-white/20 rounded-xl text-sm font-bold hover:bg-white/30 transition-all flex items-center gap-2">
                <Plus size={18} />
                {t('import_subjects')}
              </button>
            </div>
            
            <div className="p-8 grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Row 1: Cycle -> Level -> Specialty */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('cycle')}</label>
                <select 
                  value={examForm.cycle}
                  onChange={(e) => setExamForm({
                    ...examForm, 
                    cycle: e.target.value,
                    levelName: '',
                    specialty: '',
                    level: '',
                    subject: ''
                  })}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="">{t('select_program')}</option>
                  <option value="license">{t('license')}</option>
                  <option value="master">{t('master')}</option>
                  <option value="engineers">{t('engineers')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('level')}</label>
                <select 
                  value={examForm.levelName}
                  onChange={(e) => setExamForm({
                    ...examForm, 
                    levelName: e.target.value,
                    specialty: '',
                    level: '',
                    subject: ''
                  })}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="">{t('select_level')}</option>
                  {examFilteredLevels.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('specialty')}</label>
                <select 
                  value={examForm.specialty}
                  onChange={(e) => {
                    const specId = e.target.value;
                    const level = levels.find(l => l.specialtyId === specId && l.name === examForm.levelName);
                    setExamForm({
                      ...examForm, 
                      specialty: specId,
                      level: level?.id || '',
                      subject: ''
                    });
                  }}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="">{t('select_specialty')}</option>
                  {examFilteredSpecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('semester')}</label>
                <select 
                  value={examForm.semester}
                  onChange={(e) => setExamForm({...examForm, semester: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="S1">{t('semester_1')}</option>
                  <option value="S2">{t('semester_2')}</option>
                </select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('subject')}</label>
                <select 
                  value={examForm.subject}
                  onChange={(e) => setExamForm({...examForm, subject: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="">{t('select_subject')}</option>
                  {examFilteredModules.map(m => (
                    <option 
                      key={m.id} 
                      value={m.id}
                      disabled={isModuleScheduled(m.id, 'exam')}
                    >
                      {m.name} {isModuleScheduled(m.id, 'exam') ? `(${t('already_scheduled')})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {examForm.roomSelectionMode === 'simple' && (
                <div className="md:col-span-2 row-span-3 space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('teachers')}</label>
                  <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 h-[200px] overflow-y-auto space-y-2">
                    {teachers.map(teacher => (
                      <label key={teacher.uid} className="flex items-center justify-between p-2 hover:bg-white rounded-lg transition-all cursor-pointer group">
                        <span className="text-sm font-medium text-zinc-700">{teacher.displayName}</span>
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                          examForm.teacherIds?.includes(teacher.uid) ? "bg-emerald-500 border-emerald-500" : "border-zinc-200 group-hover:border-emerald-500"
                        )}>
                          {examForm.teacherIds?.includes(teacher.uid) && <Check size={12} className="text-white" />}
                        </div>
                        <input 
                          type="checkbox"
                          className="hidden"
                          checked={examForm.teacherIds?.includes(teacher.uid)}
                          onChange={(e) => {
                            const current = examForm.teacherIds || [];
                            if (e.target.checked) {
                              setExamForm({...examForm, teacherIds: [...current, teacher.uid]});
                            } else {
                              setExamForm({...examForm, teacherIds: current.filter(id => id !== teacher.uid)});
                            }
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('date')}</label>
                <input 
                  type="date"
                  value={examForm.date}
                  onChange={(e) => setExamForm({...examForm, date: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('academic_year')}</label>
                <input 
                  type="text"
                  value={examForm.academicYear}
                  onChange={(e) => setExamForm({...examForm, academicYear: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-2 pt-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                    examForm.isRemedial ? "bg-emerald-500 border-emerald-500" : "border-zinc-200 group-hover:border-emerald-500"
                  )}>
                    {examForm.isRemedial && <Check size={14} className="text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={examForm.isRemedial}
                    onChange={(e) => setExamForm({...examForm, isRemedial: e.target.checked})}
                  />
                  <span className="text-sm font-bold text-zinc-600">{t('remedial_checkbox')}</span>
                </label>
              </div>

              {examForm.isRemedial && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('failed_students_count')}</label>
                  <input 
                    type="number"
                    value={examForm.failedStudents}
                    onChange={(e) => setExamForm({...examForm, failedStudents: parseInt(e.target.value) || 0})}
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="0"
                  />
                </div>
              )}

              <div className="md:col-span-2 space-y-4 border-t border-zinc-100 pt-6">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('room_selection_mode') || 'Room Selection Mode'}</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setExamForm({...examForm, roomSelectionMode: 'simple'})}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                      examForm.roomSelectionMode === 'simple' 
                        ? "bg-indigo-50 border-indigo-600 text-indigo-600" 
                        : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200"
                    )}
                  >
                    <Layout size={24} />
                    <span className="font-bold text-sm">{t('simple_mode') || 'Simple (2 Rooms)'}</span>
                  </button>
                  <button 
                    onClick={() => setExamForm({...examForm, roomSelectionMode: 'detailed'})}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                      examForm.roomSelectionMode === 'detailed' 
                        ? "bg-indigo-50 border-indigo-600 text-indigo-600" 
                        : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200"
                    )}
                  >
                    <Users size={24} />
                    <span className="font-bold text-sm">{t('detailed_mode') || 'Detailed (Groups & Invigilators)'}</span>
                  </button>
                </div>
              </div>

              {examForm.roomSelectionMode === 'simple' ? (
                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('room')}</label>
                    <select 
                      value={examForm.room}
                      onChange={(e) => setExamForm({...examForm, room: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    >
                      <option value="">{t('select_room')}</option>
                      {ROOMS.map(room => <option key={room} value={room}>{room}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('room2') || 'Room 2 (Optional)'}</label>
                    <select 
                      value={examForm.room2}
                      onChange={(e) => setExamForm({...examForm, room2: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    >
                      <option value="">{t('select_room')}</option>
                      {ROOMS.map(room => <option key={room} value={room}>{room}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="md:col-span-2 space-y-4 border-t border-zinc-100 pt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('room_assignments') || 'Room Assignments'}</label>
                    <button 
                      onClick={() => setExamForm({
                        ...examForm, 
                        roomAssignments: [...(examForm.roomAssignments || []), { room: '', group: '', invigilatorIds: [] }]
                      })}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all flex items-center gap-1 text-xs font-bold"
                    >
                      <Plus size={14} /> {t('add_room') || 'Add Room'}
                    </button>
                  </div>
                  
                  {(examForm.roomAssignments || []).map((assignment: any, idx: number) => (
                    <div key={idx} className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-4 relative">
                      <div className="absolute -top-2 -left-2 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-md">
                        {idx + 1}
                      </div>
                      <button 
                        onClick={() => {
                          const newAssignments = [...examForm.roomAssignments];
                          newAssignments.splice(idx, 1);
                          setExamForm({ ...examForm, roomAssignments: newAssignments });
                        }}
                        className="absolute top-2 right-2 p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('room')}</label>
                          <select 
                            value={assignment.room}
                            onChange={(e) => {
                              const newAssignments = [...examForm.roomAssignments];
                              newAssignments[idx].room = e.target.value;
                              setExamForm({ ...examForm, roomAssignments: newAssignments });
                            }}
                            className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
                          >
                            <option value="">{t('select_room')}</option>
                            {ROOMS.map(room => <option key={room} value={room}>{room}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('group') || 'Group/Fouj'}</label>
                          <input 
                            type="text"
                            value={assignment.group}
                            onChange={(e) => {
                              const newAssignments = [...examForm.roomAssignments];
                              newAssignments[idx].group = e.target.value;
                              setExamForm({ ...examForm, roomAssignments: newAssignments });
                            }}
                            className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
                            placeholder="e.g. Group A"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('invigilators') || 'Invigilators'}</label>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 border border-zinc-200 rounded-xl bg-zinc-50/50">
                          {teachers.map(teacher => (
                            <label key={teacher.uid} className="flex items-center gap-2 p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all cursor-pointer border border-transparent hover:border-zinc-100">
                              <input 
                                type="checkbox"
                                checked={assignment.invigilatorIds.includes(teacher.uid)}
                                onChange={(e) => {
                                  const newAssignments = [...examForm.roomAssignments];
                                  if (e.target.checked) {
                                    newAssignments[idx].invigilatorIds = [...newAssignments[idx].invigilatorIds, teacher.uid];
                                  } else {
                                    newAssignments[idx].invigilatorIds = newAssignments[idx].invigilatorIds.filter((id: string) => id !== teacher.uid);
                                  }
                                  setExamForm({ ...examForm, roomAssignments: newAssignments });
                                }}
                                className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-xs text-zinc-700 font-medium truncate">{teacher.displayName}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('end_time_label')}</label>
                <input 
                  type="time"
                  value={examForm.endTime}
                  onChange={(e) => setExamForm({...examForm, endTime: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('start_time_label')}</label>
                <input 
                  type="time"
                  value={examForm.startTime}
                  onChange={(e) => setExamForm({...examForm, startTime: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('session_label')}</label>
                <select 
                  value={examForm.session}
                  onChange={(e) => handleExamSessionChange(e.target.value)}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="CUSTOM">CUSTOM</option>
                  <option value="S1">Session 1</option>
                  <option value="S2">Session 2</option>
                  <option value="S3">Session 3</option>
                </select>
              </div>
            </div>

            <div className="p-8 pt-0 space-y-4">
              <button 
                onClick={handleAddExamEntry}
                className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 uppercase tracking-widest"
              >
                {editingExam ? t('update') : t('deploy_exam')}
                {editingExam ? <Save size={24} /> : <Plus size={24} />}
              </button>
              {editingExam && (
                <button 
                  onClick={() => {
                    setEditingExam(null);
                    setExamForm({
                      cycle: '',
                      level: '',
                      levelName: '',
                      specialty: '',
                      semester: 'S1',
                      subject: '',
                      date: '',
                      academicYear: '2025/2026',
                      isRemedial: false,
                      failedStudents: 0,
                      session: 'CUSTOM',
                      startTime: '',
                      endTime: '',
                      room: '',
                      room2: '',
                      roomAssignments: [],
                      teacherIds: []
                    });
                  }}
                  className="w-full py-3 border border-zinc-200 rounded-xl font-semibold text-zinc-500"
                >
                  {t('cancel')}
                </button>
              )}
            </div>
          </div>
        )}

          {examViewMode === 'all' && examFilterLevel === 'all' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {Array.from(new Set(
                (savedSchedules.find(s => s.type === activeTab)?.data || [])
                  .map((d: ExamScheduleEntry) => {
                    const level = levels.find(l => l.id === d.level);
                    return JSON.stringify({ levelName: level?.name });
                  })
              )).map((sStr: string, idx) => {
                const s = JSON.parse(sStr);
                const level = levels.find(l => l.name === s.levelName);
                if (!level) return null;
                return (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setExamFilterLevel(level.name);
                        setExamFilterSpecialty('all');
                      }
                    }}
                    onClick={() => {
                      setExamFilterLevel(level.name);
                      setExamFilterSpecialty('all');
                    }}
                    className="p-6 bg-white rounded-3xl shadow-sm border border-zinc-100 hover:shadow-md hover:border-indigo-200 transition-all text-left group cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <CalendarIcon size={24} />
                    </div>
                    <h4 className="font-bold text-zinc-900 text-lg mb-1">{level.name}</h4>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center text-blue-600 text-xs font-bold uppercase tracking-widest">
                        {t('view_all_specialties')} <ChevronRight size={14} className="ml-1" />
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFullSchedule(level.id, undefined, activeTab as any);
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title={t('delete')}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!(savedSchedules.find(s => s.type === activeTab)?.data?.length) && (
                <div className="col-span-full py-20 text-center text-zinc-400 italic bg-white rounded-3xl border border-dashed border-zinc-200">
                  {t('no_schedule_found')}
                </div>
              )}
            </div>
          )}

          {/* Exam List View */}
          {(examViewMode === 'personal' || examFilterLevel !== 'all' || examFilterSpecialty !== 'all') && (
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  {examViewMode === 'all' && examFilterLevel !== 'all' && (
                    <button 
                      onClick={() => {
                        setExamFilterLevel('all');
                        setExamFilterSpecialty('all');
                      }}
                      className="p-2 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-all flex items-center gap-2 text-sm font-bold"
                    >
                      <ChevronLeft size={18} className={isRTL ? "rotate-180" : ""} />
                      {t('back')}
                    </button>
                  )}
                  <h3 className="font-bold text-zinc-900">
                    {examViewMode === 'personal' ? t('personal_schedule') : (examFilterSpecialty === 'all' ? examFilterLevel : `${specialties.find(s => s.id === examFilterSpecialty)?.name} - ${examFilterLevel}`)}
                  </h3>
                </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => handleDownloadPDF(activeTab as 'normal_exam' | 'remedial_exam', examViewMode === 'personal' ? user?.uid : undefined)}
                  className="p-2 text-zinc-400 hover:text-emerald-500 transition-all"
                  title={t('download_pdf')}
                >
                  <Download size={20} />
                </button>
                <button 
                  onClick={() => sendEmailNotification(activeTab)}
                  className="p-2 text-zinc-400 hover:text-blue-500 transition-all"
                  title={t('send_email')}
                >
                  <FileText size={20} />
                </button>
                {isAdmin && (
                  <>
                    <select 
                      value={examFilterSpecialty}
                      onChange={(e) => setExamFilterSpecialty(e.target.value)}
                      className="bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold outline-none"
                    >
                      <option value="all">{t('all_specialties')}</option>
                      {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select 
                      value={examFilterLevel}
                      onChange={(e) => setExamFilterLevel(e.target.value)}
                      className="bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold outline-none"
                    >
                      <option value="all">{t('all_levels')}</option>
                      {Array.from(new Set(levels.map(l => l.name))).map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </>
                )}
              </div>
            </div>
            <div className="p-6">
              {examViewMode === 'all' && examFilterSpecialty === 'all' && examFilterLevel !== 'all' ? (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button 
                      onClick={() => sendEmailNotification(activeTab)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-200"
                    >
                      <Send size={14} />
                      {t('send_to_email')}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-100">
                          <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('date')}</th>
                          <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('time')}</th>
                          <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('specialty')}</th>
                          <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('module')}</th>
                          <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('room')}</th>
                          <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('invigilators')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {(savedSchedules.find(s => s.type === activeTab)?.data || [])
                          .filter((exam: ExamScheduleEntry) => {
                            const matchesLevel = levels.find(l => l.id === exam.level)?.name === examFilterLevel;
                            return matchesLevel;
                          })
                          .sort((a: ExamScheduleEntry, b: ExamScheduleEntry) => {
                            const dateCompare = a.date.localeCompare(b.date);
                            if (dateCompare !== 0) return dateCompare;
                            return a.startTime.localeCompare(b.startTime);
                          })
                          .map((exam: ExamScheduleEntry, idx: number) => (
                            <tr key={idx} className="hover:bg-zinc-50 transition-all">
                              <td className="p-4 text-sm font-bold text-zinc-900">{exam.date}</td>
                              <td className="p-4 text-sm text-zinc-600">{exam.startTime} - {exam.endTime}</td>
                              <td className="p-4 text-sm font-medium text-blue-600">
                                {specialties.find(s => s.id === exam.specialty)?.name}
                              </td>
                              <td className="p-4 text-sm text-zinc-900">
                                {modules.find(m => m.id === exam.subject)?.name || exam.subject}
                              </td>
                              <td className="p-4 text-sm text-zinc-600 flex items-center gap-1">
                                <MapPin size={12} />
                                {exam.room}
                              </td>
                              <td className="p-4">
                                <div className="flex flex-wrap gap-1">
                                  {exam.teacherIds.map(id => (
                                    <span key={id} className="px-1.5 py-0.5 bg-zinc-100 rounded text-[9px] text-zinc-600 font-medium">
                                      {teachers.find(t => t.uid === id)?.displayName || id}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {(!savedSchedules.find(s => s.type === activeTab)?.data?.filter((exam: ExamScheduleEntry) => levels.find(l => l.id === exam.level)?.name === examFilterLevel).length) && (
                      <div className="text-center py-12 text-zinc-400 italic">
                        No exams scheduled for this level yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {(isAdmin && examViewMode === 'personal' 
                    ? (teacherIdParam ? teachers.filter(t => t.uid === teacherIdParam) : teachers)
                    : [user]
                  ).filter(Boolean).map((teacher) => {
                    const teacherExams = (savedSchedules.find(s => s.type === activeTab)?.data || [])
                      .filter((exam: ExamScheduleEntry) => {
                        const matchesSpecialty = examFilterSpecialty === 'all' || exam.specialty === examFilterSpecialty;
                        const matchesLevel = examFilterLevel === 'all' || levels.find(l => l.id === exam.level)?.name === examFilterLevel;
                        const matchesTeacher = exam.teacherIds.includes(teacher?.uid || '');
                        return matchesSpecialty && matchesLevel && matchesTeacher;
                      })
                      .sort((a: ExamScheduleEntry, b: ExamScheduleEntry) => {
                        const dateCompare = a.date.localeCompare(b.date);
                        if (dateCompare !== 0) return dateCompare;
                        return a.startTime.localeCompare(b.startTime);
                      });

                    if (isAdmin && examViewMode === 'personal' && teacherExams.length === 0 && !teacherIdParam) return null;

                    return (
                      <div key={teacher?.uid} className="space-y-4">
                        {isAdmin && examViewMode === 'personal' && (
                          <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-zinc-100 text-blue-600 shadow-sm">
                                <UserIcon size={20} />
                              </div>
                              <h4 className="font-bold text-zinc-900">{teacher?.displayName}</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => handleCopyLink(teacher?.uid)}
                                className="p-2 bg-white text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all border border-indigo-100 shadow-sm"
                                title={t('copy_link')}
                              >
                                <LinkIcon size={16} />
                              </button>
                              <button 
                                onClick={() => handleDownloadPDF(activeTab as 'normal_exam' | 'remedial_exam', teacher?.uid)}
                                className="p-2 bg-white text-emerald-600 rounded-xl hover:bg-emerald-50 transition-all border border-emerald-100 shadow-sm"
                                title={t('download_pdf')}
                              >
                                <Download size={16} />
                              </button>
                              <button 
                                onClick={() => sendEmailNotification(activeTab, teacher?.email)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-200"
                              >
                                <FileText size={14} />
                                {t('send_to_email')}
                              </button>
                            </div>
                          </div>
                        )}
                        <div className={cn(
                          "space-y-4",
                          examViewMode === 'all' && "grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0"
                        )}>
                          {teacherExams.map((exam: ExamScheduleEntry, idx: number) => (
                            <div key={idx} className={cn(
                              "flex items-center justify-between p-6 bg-zinc-50 rounded-2xl border border-zinc-100 group hover:bg-white hover:shadow-md transition-all",
                              examViewMode === 'all' && "flex-col items-start gap-4"
                            )}>
                              <div className="flex items-center gap-6">
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-zinc-100 font-bold text-blue-600 shadow-sm">
                                  {exam.subject.charAt(0)}
                                </div>
                                <div>
                                  <h4 className="font-bold text-zinc-900">{modules.find(m => m.id === exam.subject)?.name || exam.subject}</h4>
                                  <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                                    {levels.find(l => l.id === exam.level)?.name} {specialties.find(s => s.id === exam.specialty)?.name}
                                  </p>
                                </div>
                              </div>
                              
                              <div className={cn(
                                "flex items-center gap-12",
                                examViewMode === 'all' && "w-full justify-between gap-4"
                              )}>
                                <div className="text-center">
                                  <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold mb-1">
                                    {exam.startTime} - {exam.endTime}
                                  </div>
                                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                    {specialties.find(s => s.id === exam.specialty)?.name}
                                  </div>
                                </div>
                                
                                <div className="text-right">
                                  <div className="font-bold text-zinc-900">{exam.date}</div>
                                  <div className="text-xs text-zinc-400 flex items-center justify-end gap-1">
                                    <MapPin size={12} />
                                    {exam.room}
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  {canEdit && (
                                    <>
                                      <button 
                                        className="p-2 text-zinc-500 hover:text-emerald-600 transition-all bg-white border border-zinc-200 rounded-xl shadow-sm hover:shadow-md"
                                        onClick={() => {
                                          setEditingExam(exam);
                                          setExamForm({
                                            ...exam,
                                            levelName: levels.find(l => l.id === exam.level)?.name || ''
                                          });
                                          window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                      >
                                        <Edit2 size={18} />
                                      </button>
                                      <button 
                                        className="p-2 text-zinc-500 hover:text-red-600 transition-all bg-white border border-zinc-200 rounded-xl shadow-sm hover:shadow-md"
                                        onClick={() => handleDeleteEntry(exam, activeTab as any)}
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {examViewMode === 'all' && (
                                <div className="w-full pt-4 border-t border-zinc-200 mt-2">
                                  <div className="text-[10px] uppercase font-bold text-zinc-400 mb-2">{t('invigilators')}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {exam.teacherIds.map(id => (
                                      <div key={id} className="px-2 py-1 bg-zinc-200 rounded text-[10px] text-zinc-700 font-medium">
                                        {teachers.find(t => t.uid === id)?.displayName || id}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {((examViewMode === 'personal' && !teachers.some(t => (savedSchedules.find(s => s.type === activeTab)?.data || []).some((e: ExamScheduleEntry) => e.teacherIds.includes(t.uid)))) || 
                    (examViewMode !== 'personal' && !(savedSchedules.find(s => s.type === activeTab)?.data || []).length)) && (
                    <div className="text-center py-12 text-zinc-400 italic">
                      No exams scheduled yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}

      {activeTab === 'my_schedule' && (
        <div className="space-y-8">
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
            <div className="bg-emerald-600 p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <UserIcon size={24} />
                  {t('my_personal_schedule')}
                </h3>
                <p className="text-emerald-100 text-sm mt-1">{user?.displayName}</p>
              </div>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 gap-8">
                {/* Full Schedule Preview Section */}
                <div className="space-y-4 border-b pb-8">
                  <h4 className="font-bold text-zinc-700 flex items-center gap-2">
                    <CalendarIcon size={18} />
                    {t('full_specialty_schedule')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <select 
                      value={myScheduleSpecialty}
                      onChange={(e) => {
                        setMyScheduleSpecialty(e.target.value);
                        setMyScheduleLevel('');
                      }}
                      className="p-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm"
                    >
                      <option value="">{t('select_specialty')}</option>
                      {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select 
                      value={myScheduleLevel}
                      onChange={(e) => setMyScheduleLevel(e.target.value)}
                      className="p-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm"
                    >
                      <option value="">{t('select_level')}</option>
                      {levels.filter(l => l.specialtyId === myScheduleSpecialty).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <select 
                      value={myScheduleSemester}
                      onChange={(e) => setMyScheduleSemester(e.target.value)}
                      className="p-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm"
                    >
                      <option value="S1">{t('semester_1')}</option>
                      <option value="S2">{t('semester_2')}</option>
                    </select>
                  </div>
                  {myScheduleLevel && myScheduleSpecialty && (
                    <div className="overflow-x-auto bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                      <table className="w-full border-collapse text-[10px]">
                        <thead>
                          <tr>
                            <th className="p-2 border border-zinc-200 bg-white">{t('day')}</th>
                            {sessions.map((_, idx) => <th key={idx} className="p-2 border border-zinc-200 bg-white">{t('session_label')} {idx + 1}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {DAYS.map(day => (
                            <tr key={day}>
                              <td className="p-2 border border-zinc-200 font-bold bg-white">{t(day.toLowerCase())}</td>
                              {sessions.map((_, idx) => {
                                const entry = savedSchedules.find(s => s.type === 'semester')?.data.find((d: SemesterScheduleEntry) => 
                                  d.day === day && 
                                  d.session === `H${idx + 1}` &&
                                  d.level === myScheduleLevel &&
                                  d.specialty === myScheduleSpecialty &&
                                  d.semester === myScheduleSemester
                                );
                                return (
                                  <td key={idx} className="p-2 border border-zinc-200 min-w-[100px] h-16">
                                    {entry && (
                                      <div className={cn(
                                        "p-1 rounded h-full flex flex-col justify-center",
                                        entry.teacherId === user?.uid ? "bg-emerald-100 border border-emerald-200" : "bg-white"
                                      )}>
                                        <div className="font-bold truncate">{modules.find(m => m.id === entry.subject)?.name || entry.subject}</div>
                                        <div className="opacity-60 truncate">{teachers.find(t => t.uid === entry.teacherId)?.displayName}</div>
                                        <div className="opacity-60">{entry.room}</div>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Semester Schedule for Teacher */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="font-bold text-zinc-700 flex items-center gap-2">
                      <CalendarIcon size={18} />
                      {t('semester_schedule')}
                    </h4>
                    <button 
                      onClick={() => handleDownloadPDF('semester', user?.uid)}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-2 text-xs font-bold"
                    >
                      <Download size={14} />
                      {t('download')}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="p-4 bg-zinc-50 border border-zinc-100 text-zinc-500 font-bold text-xs uppercase tracking-wider">{t('day')}</th>
                          {sessions.map((session, idx) => (
                            <th key={idx} className="p-4 bg-zinc-50 border border-zinc-100 text-zinc-500 font-bold text-xs uppercase tracking-wider">
                              {session}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.map(day => (
                          <tr key={day}>
                            <td className="p-4 border border-zinc-100 font-bold text-zinc-700 bg-zinc-50/50">{t(day.toLowerCase())}</td>
                            {sessions.map((_, idx) => {
                              const entry = savedSchedules.find(s => s.type === 'semester')?.data.find((d: SemesterScheduleEntry) => 
                                d.day === day && 
                                d.session === `H${idx + 1}` &&
                                d.teacherId === user?.uid
                              );
                              return (
                                <td key={idx} className="p-4 border border-zinc-100 min-w-[150px]">
                                  {entry && (
                                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-1">
                                      <div className="font-bold text-emerald-700 text-sm">
                                        {modules.find(m => m.id === entry.subject)?.name || entry.subject}
                                      </div>
                                      <div className="text-xs text-emerald-600 flex items-center gap-1">
                                        <MapPin size={10} /> {entry.room}
                                      </div>
                                      <div className="text-[10px] text-emerald-500 italic">
                                        {entry.type}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Exam Schedule for Teacher */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="font-bold text-zinc-700 flex items-center gap-2">
                      <BookOpen size={18} />
                      {t('exam_schedule')}
                    </h4>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleDownloadPDF('normal_exam', user?.uid)}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-2 text-xs font-bold"
                      >
                        <Download size={14} />
                        {t('download_normal')}
                      </button>
                      <button 
                        onClick={() => handleDownloadPDF('remedial_exam', user?.uid)}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all flex items-center gap-2 text-xs font-bold"
                      >
                        <Download size={14} />
                        {t('download_remedial')}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {savedSchedules
                      .filter(s => s.type === 'normal_exam' || s.type === 'remedial_exam')
                      .flatMap(s => s.data)
                      .filter((e: ExamScheduleEntry) => e.teacherIds.includes(user?.uid || ''))
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map((exam, idx) => (
                        <div key={idx} className="p-4 rounded-2xl bg-white border border-zinc-100 shadow-sm space-y-3">
                          <div className="flex justify-between items-start">
                            <span className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-bold uppercase",
                              exam.isRemedial ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {exam.isRemedial ? t('remedial') : t('normal')}
                            </span>
                            <span className="text-xs text-zinc-400 font-medium">{exam.date}</span>
                          </div>
                          <h5 className="font-bold text-zinc-800">
                            {modules.find(m => m.id === exam.subject)?.name || exam.subject}
                          </h5>
                          <div className="flex items-center gap-4 text-xs text-zinc-500">
                            <div className="flex items-center gap-1">
                              <Clock size={14} />
                              {exam.startTime} - {exam.endTime}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin size={14} />
                              {exam.room}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'hall_utilization' && (
        <div className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl">
                <MapPin className="text-emerald-600" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">{t('hall_utilization')}</h2>
                <p className="text-sm text-zinc-500">Select a room to view its weekly schedule</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex bg-zinc-100 p-1 rounded-xl">
                <button
                  onClick={() => setHallViewType('lessons')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                    hallViewType === 'lessons' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500"
                  )}
                >
                  عرض الدروس
                </button>
                <button
                  onClick={() => setHallViewType('exams')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                    hallViewType === 'exams' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500"
                  )}
                >
                  عرض الامتحانات
                </button>
              </div>
              
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold min-w-[200px]"
              >
                {ROOMS.map(room => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
              
              <button 
                onClick={exportHallSchedule}
                className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                <Download size={20} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-4 bg-zinc-50 border border-zinc-100 text-zinc-500 font-bold text-sm w-32">
                    اليوم
                  </th>
                  {SESSIONS.map((session, idx) => (
                    <th key={idx} className="p-4 bg-zinc-50 border border-zinc-100">
                      <div className="text-xs font-bold text-zinc-400 uppercase mb-1">حصة {idx + 1}</div>
                      <div className="text-sm font-bold text-emerald-600">{session.start} - {session.end}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => (
                  <tr key={day}>
                    <td className="p-4 border border-zinc-100 font-bold text-zinc-700 bg-zinc-50/50">
                      {day}
                    </td>
                    {SESSIONS.map((session, idx) => {
                      const sessionEntries = savedSchedules
                        .filter(s => s.type === (hallViewType === 'lessons' ? 'semester' : 'normal_exam'))
                        .flatMap(s => s.data)
                        .filter(entry => {
                          if (hallViewType === 'lessons') {
                            const e = entry as SemesterScheduleEntry;
                            return e.day === day && e.session === `H${idx + 1}` && e.room === selectedRoom;
                          } else {
                            const e = entry as ExamScheduleEntry;
                            return getDayOfWeek(e.date) === day && e.room === selectedRoom; 
                          }
                        });

                      return (
                        <td key={idx} className="p-2 border border-zinc-100 min-h-[100px] align-top">
                          {sessionEntries.map((entry: any, eIdx) => (
                            <div 
                              key={eIdx} 
                              className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 mb-2 cursor-pointer hover:bg-emerald-100 transition-colors"
                              onClick={() => setSelectedEntry(entry)}
                            >
                              <div className="text-xs font-bold text-emerald-700 mb-1">
                                {modules.find(m => m.id === entry.subject)?.name || entry.subject}
                              </div>
                              <div className="text-[10px] text-emerald-600 font-medium">
                                {hallViewType === 'lessons' 
                                  ? (teachers.find(t => t.uid === entry.teacherId)?.displayName || entry.teacherId)
                                  : (specialties.find(s => s.id === entry.specialty)?.name || entry.specialty)
                                }
                              </div>
                              {hallViewType === 'lessons' && (
                                <div className="mt-1 flex gap-1">
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-bold uppercase">
                                    {entry.type}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Add Entry Modal */}
      {/* Confirmation Modal */}
      {confirmationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">{confirmationModal.title}</h3>
            <p className="text-zinc-500 mb-8 leading-relaxed">
              {confirmationModal.message}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmationModal(null)}
                className="flex-1 py-3 px-4 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={() => {
                  confirmationModal.onConfirm();
                  setConfirmationModal(null);
                }}
                className="flex-1 py-3 px-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
              >
                {t('confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">
              {showAddModal.entry ? t('edit_entry') : t('add_entry')} - {showAddModal.day ? t(showAddModal.day.toLowerCase()) : ''} ({SESSIONS[showAddModal.sessionIdx]?.start || ''} - {SESSIONS[showAddModal.sessionIdx]?.end || ''})
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('subject')}</label>
                <select 
                  value={modalForm.subject}
                  onChange={(e) => setModalForm({...modalForm, subject: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="">{t('select_subject')}</option>
                  {semesterFilteredModules.map(m => (
                    <option 
                      key={m.id} 
                      value={m.id}
                    >
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('teacher')}</label>
                <select 
                  value={modalForm.teacherId}
                  onChange={(e) => setModalForm({...modalForm, teacherId: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="">{t('select_teacher')}</option>
                  {teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('type')}</label>
                <select 
                  value={modalForm.type}
                  onChange={(e) => setModalForm({...modalForm, type: e.target.value as any})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="Cours">{t('cours')}</option>
                  <option value="TD">{t('td')}</option>
                  <option value="TP">{t('tp')}</option>
                  <option value="Online">{t('online')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('room')}</label>
                <select 
                  value={modalForm.room}
                  onChange={(e) => setModalForm({...modalForm, room: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="">{t('select_room')}</option>
                  {ROOMS.map(room => <option key={room} value={room}>{room}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-8 py-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                    modalForm.isInEnglish ? "bg-emerald-500 border-emerald-500" : "border-zinc-200 group-hover:border-emerald-500"
                  )}>
                    {modalForm.isInEnglish && <Check size={14} className="text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={modalForm.isInEnglish}
                    onChange={(e) => setModalForm({...modalForm, isInEnglish: e.target.checked})}
                  />
                  <span className="text-sm font-bold text-zinc-600">{t('in_english')}</span>
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowAddModal(null)}
                  className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold"
                >
                  {t('cancel') || 'Cancel'}
                </button>
                <button 
                  onClick={handleAddSemesterEntry}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
                >
                  {showAddModal.entry ? t('update') : (t('add') || 'Add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entry Details Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-emerald-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <BookOpen size={24} />
                {t('details')}
              </h3>
              <button 
                onClick={() => setSelectedEntry(null)}
                className="p-2 hover:bg-white/20 rounded-full transition-all"
              >
                <ChevronRight size={24} className={isRTL ? "" : "rotate-180"} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                  <BookOpen size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{t('subject')}</p>
                  <p className="text-lg font-bold text-zinc-900">
                    {modules.find(m => m.id === selectedEntry.subject)?.name || selectedEntry.subject}
                  </p>
                </div>
              </div>

              {selectedEntry.teacherId || selectedEntry.teacherIds ? (
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                    <UserIcon size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{t('teacher')}</p>
                    <p className="text-lg font-bold text-zinc-900">
                      {selectedEntry.teacherId 
                        ? (teachers.find(t => t.uid === selectedEntry.teacherId)?.displayName || selectedEntry.teacherId)
                        : (selectedEntry.teacherIds?.map((id: string) => teachers.find(t => t.uid === id)?.displayName || id).join(', '))
                      }
                    </p>
                  </div>
                </div>
              ) : null}

              {selectedEntry.room && selectedEntry.room !== 'Online' && (
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{t('room')}</p>
                    <p className="text-lg font-bold text-zinc-900">{selectedEntry.room}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shrink-0">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{t('time')}</p>
                  <p className="text-lg font-bold text-zinc-900">
                    {selectedEntry.day ? t(selectedEntry.day.toLowerCase()) : (selectedEntry.date || '')} 
                    <span className="ml-2 text-zinc-400">({selectedEntry.startTime} - {selectedEntry.endTime})</span>
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex flex-wrap gap-2">
                {selectedEntry.type && (
                  <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-bold uppercase">
                    {selectedEntry.type}
                  </span>
                )}
                {selectedEntry.cycle && (
                  <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-bold uppercase">
                    {t(selectedEntry.cycle)}
                  </span>
                )}
                {selectedEntry.specialty && (
                  <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-bold uppercase">
                    {specialties.find(s => s.id === selectedEntry.specialty)?.name || selectedEntry.specialty}
                  </span>
                )}
                {selectedEntry.isOnline && (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold uppercase">
                    {t('online')}
                  </span>
                )}
                {selectedEntry.isInEnglish && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg text-xs font-bold uppercase">
                    {t('in_english')}
                  </span>
                )}
              </div>
            </div>
            <div className="p-6 bg-zinc-50 border-t border-zinc-100">
              <button 
                onClick={() => setSelectedEntry(null)}
                className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmationModal && (
        <ConfirmationModal
          isOpen={true}
          title={confirmationModal.title}
          message={confirmationModal.message}
          onConfirm={confirmationModal.onConfirm}
          onClose={() => setConfirmationModal(null)}
        />
      )}
    </div>
  );
}
