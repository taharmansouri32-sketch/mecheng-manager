import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { User, Session, Schedule, Project, TeacherType, OvertimeEntry } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  Calculator, 
  Search, 
  Download, 
  User as UserIcon, 
  Clock, 
  Edit2,
  Trash2,
  TrendingUp, 
  TrendingDown,
  Star,
  AlertCircle, 
  ShieldCheck, 
  GraduationCap, 
  FileText, 
  Table as TableIcon, 
  Filter,
  Settings,
  Briefcase,
  BookOpen,
  ChevronRight,
  Info,
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  XCircle,
  X,
  History
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, HeadingLevel, AlignmentType, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

export function OvertimeCalculation() {
  const { t, isRTL, academicYear } = useLanguage();
  const { user, activeRole, isAdmin } = useAuth();
  const [teachers, setTeachers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [teacherTypeFilter, setTeacherTypeFilter] = useState<TeacherType | 'all'>('all');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null>(null);

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await dbService.deleteDocument('overtime_entries', entryId);
      setOvertimeEntries(overtimeEntries.filter(e => e.id !== entryId));
      toast.success(t('deleted_successfully'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  const [showRejectionModal, setShowRejectionModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedSubmitSemester, setSelectedSubmitSemester] = useState<'S1' | 'S2'>('S1');

  useEffect(() => {
    const fetchData = async () => {
      const [teachersData, sessionsData, schedulesData, projectsData, overtimeData] = await Promise.all([
        dbService.getCollection<User>('users'),
        dbService.getCollection<Session>('sessions'),
        dbService.getCollection<Schedule>('schedules'),
        dbService.getCollection<Project>('projects'),
        dbService.getCollection<OvertimeEntry>('overtime_entries')
      ]);
      setTeachers(teachersData.filter(u => u.role === 'teacher' || u.role === 'specialty_manager'));
      setSessions(sessionsData.filter(s => s.status === 'taught'));
      setSchedules(schedulesData);
      setProjects(projectsData);
      setOvertimeEntries(overtimeData);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleApprove = async (entryId: string) => {
    try {
      await dbService.updateDocument('overtime_entries', entryId, {
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.uid
      });
      setOvertimeEntries(overtimeEntries.map(e => e.id === entryId ? { ...e, status: 'approved' } : e));
      toast.success(t('approved_successfully'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  const handleReject = async (entryId: string, reason: string) => {
    try {
      await dbService.updateDocument('overtime_entries', entryId, {
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.uid,
        rejectionReason: reason
      });
      setOvertimeEntries(overtimeEntries.map(e => e.id === entryId ? { ...e, status: 'rejected' } : e));
      toast.success(t('rejected_successfully'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  const calculateHours = (teacher: User) => {
    const teacherSessions = sessions.filter(s => s.teacherId === teacher.uid && s.academicYear === academicYear);
    let totalHours = 0;
    
    if (teacherSessions.length > 0) {
      teacherSessions.forEach(s => {
        if (s.type === 'lecture') {
          totalHours += 2.25; // 2h 15m
        } else {
          totalHours += 1.5; // TD/TP 1h 30m
        }
      });
    } else {
      // Fallback to semester schedules if no sessions recorded
      const semesterSchedules = schedules.filter(s => s.type === 'semester' && s.academicYear === academicYear);
      semesterSchedules.forEach(s => {
        s.data?.forEach(row => {
          if (row.teacherId === teacher.uid) {
            if (row.type === 'lecture') totalHours += 2.25;
            else totalHours += 1.5;
          }
        });
      });
    }

    // Add approved external hours
    const externalHours = overtimeEntries
      .filter(e => e.teacherId === teacher.uid && e.type === 'external' && e.status === 'approved')
      .reduce((acc, e) => acc + e.hours, 0);

    return totalHours + externalHours;
  };

  const getInvigilationCount = (teacherId: string) => {
    const invigilationSchedules = schedules.filter(s => (s.type === 'normal_exam' || s.type === 'remedial_exam') && s.academicYear === academicYear);
    let count = 0;
    invigilationSchedules.forEach(s => {
      s.data?.forEach((row: any) => {
        // Check main teachers
        const isMainTeacher = row.teacherId === teacherId || (row.teacherIds && Array.isArray(row.teacherIds) && row.teacherIds.includes(teacherId));
        
        // Check invigilators in detailed room assignments
        const isInvigilator = row.roomAssignments?.some((ra: any) => ra.invigilatorIds?.includes(teacherId));
        
        if (isMainTeacher || isInvigilator) {
          count++;
        }
      });
    });
    return count;
  };

  const getSupervisionStats = (teacherId: string) => {
    const teacherProjects = projects.filter(p => p.supervisorId === teacherId && p.academicYear === academicYear);
    const stats: Record<string, number> = { '1275': 0 };
    teacherProjects.forEach(p => {
      if (p.is1275) {
        stats['1275']++;
      } else if (p.phase) {
        stats[p.phase] = (stats[p.phase] || 0) + 1;
      }
    });
    return stats;
  };

  const getTeacherThreshold = (teacher: User) => {
    let threshold = teacher.teacherType === 'permanent_internal' ? 9 : 0;
    // Decision 1275 teachers have a reduced threshold (usually -3 hours)
    if (teacher.isUnder1275) {
      threshold = Math.max(0, threshold - 3);
    }
    return threshold;
  };

  const [showSettings, setShowSettings] = useState(false);
  const [invigilationRate, setInvigilationRate] = useState(1.5); // h per session
  const [supervisionRate, setSupervisionRate] = useState(5); // h per project

  const calculateTeacherStats = (teacher: User) => {
    const teachingHours = calculateHours(teacher);
    
    // Calculate teaching sessions from the weekly schedule (planned)
    const semesterSchedule = schedules.find(s => s.type === 'semester' && s.academicYear === academicYear);
    const plannedSessions = semesterSchedule?.data?.filter((s: any) => s.teacherId === teacher.uid) || [];
    const teachingSessions = plannedSessions.length;
    
    const invigilationSessions = getInvigilationCount(teacher.uid);
    const invigilationHours = invigilationSessions * invigilationRate;
    
    const supervisions = getSupervisionStats(teacher.uid);
    const supervisionSessions = Object.values(supervisions).reduce((acc, count) => acc + count, 0);
    const supervisionHours = Object.entries(supervisions).reduce((acc, [phase, count]) => {
      // Decision 1275 projects count as 12 hours per project
      if (phase === '1275') return acc + (count * 12);
      return acc + (count * supervisionRate);
    }, 0);
    
    const threshold = getTeacherThreshold(teacher);
    // NEW RULE: Total Overtime Hours ignores invigilation and supervision hours
    // ONLY teaching hours are compared against the legal threshold (9h for permanent)
    const overtime = Math.max(0, teachingHours - threshold);

    return {
      teachingHours,
      teachingSessions,
      invigilationSessions,
      invigilationHours,
      supervisionHours,
      supervisionSessions,
      supervisions,
      totalHours: teachingHours + invigilationHours + supervisionHours, // Actual total presence
      overtime,
      threshold
    };
  };

  const filteredTeachers = teachers.filter(t => {
    const name = t.displayNameAr || t.displayName;
    const matchesSearch = name.toLowerCase().includes(filter.toLowerCase());
    const matchesType = teacherTypeFilter === 'all' || t.teacherType === teacherTypeFilter;
    const isOwner = activeRole === 'admin' || t.uid === user?.uid;
    return matchesSearch && matchesType && isOwner;
  });

  const exportToCSV = () => {
    const headers = ['Teacher', 'Role', 'Status', 'Total Hours', 'Threshold', 'Overtime', 'Invigilation', 'Decision 1275'];
    const data = teachers.map(teacher => {
      const stats = calculateTeacherStats(teacher);
      return [
        teacher.displayName,
        teacher.role,
        teacher.teacherType || 'temporary',
        stats.totalHours.toFixed(2),
        stats.threshold,
        stats.overtime.toFixed(2),
        stats.invigilationSessions,
        teacher.isUnder1275 ? 'Yes' : 'No'
      ];
    });

    const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overtime_calculation_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportToExcel = () => {
    const data = filteredTeachers.map(teacher => {
      const stats = calculateTeacherStats(teacher);
      const supervisions = getSupervisionStats(teacher.uid);
      
      return {
        'Teacher Name': teacher.displayNameAr || teacher.displayName,
        'Rank': teacher.rank || '',
        'Type': teacher.teacherType === 'permanent_internal' ? 'Permanent (Internal)' :
                teacher.teacherType === 'permanent_external' ? 'Permanent (External)' :
                'Temporary',
        'Department': teacher.department || '',
        'Threshold': stats.threshold,
        'Total Hours': stats.totalHours.toFixed(2),
        'Overtime Hours': stats.overtime.toFixed(2),
        'Invigilation Sessions': stats.invigilationSessions,
        'Supervisions': Object.entries(supervisions).map(([p, c]) => `${p}: ${c}`).join(', '),
        'Decision 1275': teacher.isUnder1275 ? 'Yes' : 'No'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Overtime Report");
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `overtime_report_${teacherTypeFilter}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToWord = async () => {
    const rows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: "Teacher", style: "Heading2" })] }),
          new TableCell({ children: [new Paragraph({ text: "Type", style: "Heading2" })] }),
          new TableCell({ children: [new Paragraph({ text: "Total Hours", style: "Heading2" })] }),
          new TableCell({ children: [new Paragraph({ text: "Overtime", style: "Heading2" })] }),
          new TableCell({ children: [new Paragraph({ text: "Invigilation", style: "Heading2" })] }),
        ],
      }),
    ];

    filteredTeachers.forEach(teacher => {
      const stats = calculateTeacherStats(teacher);

      rows.push(
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(teacher.displayName)] }),
            new TableCell({ children: [new Paragraph(teacher.teacherType || 'temporary')] }),
            new TableCell({ children: [new Paragraph(`${stats.totalHours.toFixed(2)}h`)] }),
            new TableCell({ children: [new Paragraph(`${stats.overtime.toFixed(2)}h`)] }),
            new TableCell({ children: [new Paragraph(stats.invigilationSessions.toString())] }),
          ],
        })
      );
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "Overtime Calculation Report",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: `Generated on: ${new Date().toLocaleDateString()}`,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: `Filter: ${teacherTypeFilter === 'all' ? 'All Teachers' : teacherTypeFilter}`,
            spacing: { after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows,
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `overtime_report_${teacherTypeFilter}_${new Date().toISOString().split('T')[0]}.docx`);
  };


  if (loading) return <div className="flex items-center justify-center h-64"><Clock className="animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center">
            <Calculator size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-zinc-900 tracking-tight">{t('overtime_calculation')}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest">{teachers.length} {t('teachers_analyzed')}</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button
            onClick={() => {
              const infoSection = document.getElementById('calculation-info');
              infoSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex-1 md:flex-none px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Info size={20} className="text-indigo-500" /> {t('calculation_info')}
          </button>
          {activeRole === 'teacher' && (
            <button
              onClick={() => setShowSubmitModal(true)}
              className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100"
            >
              <Plus size={20} /> {t('submit_overtime')}
            </button>
          )}
          {activeRole === 'admin' && (
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex-1 md:flex-none px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <History size={20} /> {t('pending_approval')}
              {overtimeEntries.filter(e => e.status === 'pending').length > 0 && (
                <span className="w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center animate-bounce">
                  {overtimeEntries.filter(e => e.status === 'pending').length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "flex-1 md:flex-none px-6 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm",
              showSettings ? "bg-indigo-50 text-indigo-600 border-2 border-indigo-200" : "bg-white border border-zinc-200 text-zinc-700"
            )}
          >
            <Settings size={20} /> {t('settings')}
          </button>
          <div className="relative flex-1 md:flex-none group">
            <button className="w-full px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-zinc-200">
              <Download size={20} /> {t('export')}
            </button>
            <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-zinc-100 py-2 hidden group-hover:block z-10">
              <button onClick={() => exportToCSV()} className="w-full px-4 py-2 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                <FileText size={16} className="text-blue-500" /> CSV
              </button>
              <button onClick={() => exportToExcel()} className="w-full px-4 py-2 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-emerald-500" /> Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-100 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Settings size={20} />
            </div>
            <h3 className="text-xl font-bold text-zinc-900">{t('calculation_settings')}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('invigilation_rate')}</label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  step="0.1"
                  value={invigilationRate}
                  onChange={(e) => setInvigilationRate(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg"
                />
                <span className="text-sm font-bold text-zinc-400">{t('h_per_session')}</span>
              </div>
            </div>
            <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('supervision_rate')}</label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={supervisionRate}
                  onChange={(e) => setSupervisionRate(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg"
                />
                <span className="text-sm font-bold text-zinc-400">{t('h_per_project')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('teaching_sessions')}</p>
            <p className="text-2xl font-black text-zinc-900">
              {teachers.reduce((acc, t) => acc + calculateTeacherStats(t).teachingSessions, 0)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('invigilation_sessions')}</p>
            <p className="text-2xl font-black text-zinc-900">
              {teachers.reduce((acc, t) => acc + calculateTeacherStats(t).invigilationSessions, 0)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
            <Briefcase size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('supervision_sessions')}</p>
            <p className="text-2xl font-black text-zinc-900">
              {teachers.reduce((acc, t) => acc + calculateTeacherStats(t).supervisionSessions, 0)}
            </p>
          </div>
        </div>
        <div className="bg-indigo-600 p-6 rounded-[2rem] shadow-lg shadow-indigo-100 flex items-center gap-4 text-white">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest">{t('total_overtime')}</p>
            <p className="text-2xl font-black">
              {teachers.reduce((acc, t) => acc + calculateTeacherStats(t).overtime, 0).toFixed(1)}h
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-zinc-100 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
          <input
            type="text"
            placeholder={t('search_teachers_placeholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
          />
        </div>
        <select
          value={teacherTypeFilter}
          onChange={(e) => setTeacherTypeFilter(e.target.value as any)}
          className="px-6 py-4 rounded-2xl bg-zinc-100 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-zinc-600 transition-all"
        >
          <option value="all">{t('all_types')}</option>
          <option value="permanent_internal">{t('permanent_internal')}</option>
          <option value="permanent_external">{t('permanent_external')}</option>
          <option value="temporary">{t('temporary')}</option>
        </select>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-4 border-b border-zinc-100 pb-4">
          <button className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold">{t('overtime_dashboard')}</button>
          <button 
            onClick={() => {
              const approvedSection = document.getElementById('approved-list');
              approvedSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-6 py-2 bg-zinc-100 text-zinc-600 rounded-xl font-bold hover:bg-zinc-200 transition-all"
          >
            {t('approved_overtime_list')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {filteredTeachers.map((teacher) => {
            const stats = calculateTeacherStats(teacher);
            const isTemp = teacher.isTemporary || teacher.teacherType === 'temporary';
            
            return (
              <div key={teacher.uid} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-zinc-100 hover:shadow-md hover:border-indigo-100 transition-all group overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-50 rounded-full -mr-32 -mt-32 transition-transform group-hover:scale-110"></div>
                
                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                      <UserIcon size={32} />
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-zinc-900 group-hover:text-indigo-600 transition-colors">{teacher.displayNameAr || teacher.displayName}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">{teacher.rank || t('no_rank')}</span>
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest",
                          isTemp ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {isTemp ? t('temporary') : t('permanent')}
                        </span>
                        {teacher.isUnder1275 && (
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-600 text-[10px] rounded-lg font-bold uppercase tracking-widest">1275</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 flex-1 max-w-xl">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                        <BookOpen size={12} /> {t('teaching_hours')}
                      </p>
                      <p className="text-xl font-black text-zinc-900 tabular-nums">{stats.teachingHours.toFixed(1)}h</p>
                    </div>
                    <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100 group-hover:scale-105 transition-transform relative">
                      {stats.overtime > 20 && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg animate-pulse" title={t('overtime_alert')}>
                          <AlertCircle size={14} />
                        </div>
                      )}
                      <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">{t('overtime_hours')}</p>
                      <p className="text-2xl font-black tabular-nums">{stats.overtime.toFixed(1)}h</p>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="relative mt-8 pt-8 border-t border-zinc-50 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                      <Info size={14} className="text-indigo-400" />
                      {t('legal_threshold')}: <span className="text-zinc-900">{stats.threshold}h</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-400" title={`${stats.teachingHours.toFixed(1)}h teaching + ${stats.invigilationHours.toFixed(1)}h invigilation + ${stats.supervisionHours.toFixed(1)}h supervision`}>
                      <Clock size={14} className="text-indigo-400" />
                      {t('total_worked_hours')}: <span className="text-zinc-900">{stats.totalHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex flex-wrap gap-2 ml-auto">
                      <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                        <ShieldCheck size={12} /> {t('invigilation')}: {stats.invigilationHours}h
                      </span>
                      <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                        <GraduationCap size={12} /> {t('supervision')}: {stats.supervisionHours}h
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div id="approved-list" className="space-y-6 pt-12 border-t-2 border-zinc-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-2xl font-black text-zinc-900">{t('confirmed_overtime_list')}</h3>
          </div>
          <button 
            onClick={() => {
              const approved = overtimeEntries.filter(e => e.status === 'approved' && e.academicYear === academicYear);
              const data = approved.map(e => {
                const teacher = teachers.find(t => t.uid === e.teacherId);
                return {
                  'الأستاذ': teacher?.displayNameAr || teacher?.displayName,
                  'السنة الجامعية': e.academicYear,
                  'السداسي': e.semester,
                  'الساعات المصادق عليها': e.hours,
                  'تاريخ التدقيق': new Date(e.reviewedAt || '').toLocaleDateString(),
                  'الوصف': e.description
                };
              });
              const ws = XLSX.utils.json_to_sheet(data);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Confirmed Overtime");
              XLSX.writeFile(wb, `approved_overtime_${academicYear.replace('/', '-')}.xlsx`);
            }}
            className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
          >
            <Download size={20} /> {t('download_approved_list')}
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden shadow-sm">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-black text-zinc-400 uppercase tracking-widest">{t('teacher')}</th>
                <th className="px-6 py-4 text-xs font-black text-zinc-400 uppercase tracking-widest">{t('semester')}</th>
                <th className="px-6 py-4 text-xs font-black text-zinc-400 uppercase tracking-widest">{t('hours')}</th>
                <th className="px-6 py-4 text-xs font-black text-zinc-400 uppercase tracking-widest">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {overtimeEntries
                .filter(e => e.status === 'approved' && e.academicYear === academicYear)
                .map(entry => {
                  const teacher = teachers.find(t => t.uid === entry.teacherId);
                  return (
                    <tr key={entry.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-bold text-zinc-900">{teacher?.displayNameAr || teacher?.displayName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-zinc-600">{entry.semester}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-black">{entry.hours}h</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] rounded-lg font-black uppercase tracking-wider">
                          {t('approved')}
                        </span>
                      </td>
                    </tr>
                  );
              })}
              {overtimeEntries.filter(e => e.status === 'approved' && e.academicYear === academicYear).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 font-bold">
                    {t('no_entries_found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
                  <Plus size={20} />
                </div>
                <h3 className="text-2xl font-black text-zinc-900">{t('submit_overtime')}</h3>
              </div>
              <button onClick={() => setShowSubmitModal(false)} className="p-2 hover:bg-white rounded-xl transition-all">
                <ChevronRight size={24} className="rotate-90" />
              </button>
            </div>
            
            <form className="p-8 space-y-6" onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const semester = formData.get('semester') as 'S1' | 'S2';
              
              const months = semester === 'S1' 
                ? ['september', 'october', 'november', 'december', 'january']
                : ['february', 'march', 'april', 'may', 'june'];
              
              const monthlyHours: Record<string, number> = {};
              let totalMonthlyHours = 0;
              months.forEach(month => {
                const val = Number(formData.get(`month_${month}`) || 0);
                monthlyHours[month] = val;
                totalMonthlyHours += val;
              });

              const entry: OvertimeEntry = {
                id: Math.random().toString(36).substr(2, 9),
                teacherId: user?.uid || '',
                academicYear: formData.get('academicYear') as string,
                semester,
                date: new Date().toISOString().split('T')[0],
                hours: totalMonthlyHours,
                monthlyHours,
                type: formData.get('type') as 'internal' | 'external',
                description: formData.get('description') as string,
                status: 'pending',
                submittedAt: new Date().toISOString()
              };
              
              try {
                await dbService.setDocument('overtime_entries', entry.id, entry);
                setOvertimeEntries([entry, ...overtimeEntries]);
                setShowSubmitModal(false);
                toast.success(t('submitted_successfully'));
              } catch (error) {
                toast.error(t('error_occurred'));
              }
            }}>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('academic_year')}</label>
                  <input name="academicYear" defaultValue={academicYear} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('semester')}</label>
                  <select 
                    name="semester" 
                    value={selectedSubmitSemester}
                    onChange={(e) => setSelectedSubmitSemester(e.target.value as 'S1' | 'S2')}
                    className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                  >
                    <option value="S1">{t('semester_1')}</option>
                    <option value="S2">{t('semester_2')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('monthly_hours')}</label>
                <div className="grid grid-cols-5 gap-2">
                  {selectedSubmitSemester === 'S2' ? (
                    ['february', 'march', 'april', 'may', 'june'].map(month => (
                      <div key={month} className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase text-center block">{t(month)}</label>
                        <input name={`month_${month}`} type="number" step="0.5" className="w-full p-2 rounded-xl bg-zinc-50 border border-zinc-100 text-center font-bold text-sm" placeholder="0" />
                      </div>
                    ))
                  ) : (
                    ['september', 'october', 'november', 'december', 'january'].map(month => (
                      <div key={month} className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase text-center block">{t(month)}</label>
                        <input name={`month_${month}`} type="number" step="0.5" className="w-full p-2 rounded-xl bg-zinc-50 border border-zinc-100 text-center font-bold text-sm" placeholder="0" />
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('type')}</label>
                  <select name="type" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all">
                    <option value="internal">{t('internal_hours')}</option>
                    <option value="external">{t('external_hours')}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('description')}</label>
                  <input name="description" placeholder={t('description')} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowSubmitModal(false)} className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-50 transition-all">
                  {t('cancel')}
                </button>
                <button type="submit" className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                  {t('submit_overtime')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pending Approvals Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-600 text-white rounded-xl flex items-center justify-center">
                  <History size={20} />
                </div>
                <h3 className="text-2xl font-black text-zinc-900">{t('pending_approval')}</h3>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-white rounded-xl transition-all">
                <ChevronRight size={24} className="rotate-90" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-4 max-h-[60vh]">
              {(user?.role === 'admin' ? overtimeEntries : overtimeEntries.filter(e => e.teacherId === user?.uid))
                .filter(e => e.academicYear === academicYear)
                .map(entry => {
                const teacher = teachers.find(t => t.uid === entry.teacherId);
                return (
                  <div key={entry.id} className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-zinc-400">
                        <UserIcon size={24} />
                      </div>
                      <div>
                        <h5 className="font-black text-zinc-900">{teacher?.displayNameAr || teacher?.displayName}</h5>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{entry.academicYear} - {entry.semester}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            entry.status === 'approved' ? "bg-emerald-100 text-emerald-600" :
                            entry.status === 'rejected' ? "bg-red-100 text-red-600" :
                            "bg-amber-100 text-amber-600"
                          )}>
                            {t(entry.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 px-6 border-x border-zinc-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          entry.type === 'external' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                        )}>
                          {entry.type === 'external' ? t('external_hours') : t('internal_hours')}
                        </span>
                        <span className="text-lg font-black text-zinc-900">{entry.hours}h</span>
                      </div>
                      <p className="text-sm text-zinc-500 line-clamp-1">{entry.description}</p>
                      {entry.rejectionReason && (
                        <p className="text-xs text-red-500 mt-1 font-bold italic">
                          {t('rejection_reason')}: {entry.rejectionReason}
                        </p>
                      )}
                    </div>

                    {((user?.role === 'admin' || entry.teacherId === user?.uid)) && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setEditingEntry(entry)}
                          className="p-3 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          title={t('edit')}
                        >
                          <Edit2 size={24} />
                        </button>
                        <button 
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="p-3 text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title={t('delete')}
                        >
                          <Trash2 size={24} />
                        </button>
                        {user?.role === 'admin' && entry.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => setShowRejectionModal(entry.id)}
                              className="p-3 text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              title={t('reject')}
                            >
                              <XCircle size={24} />
                            </button>
                            <button 
                              onClick={() => handleApprove(entry.id)}
                              className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                              title={t('approve')}
                            >
                              <CheckCircle2 size={24} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {(user?.role === 'admin' ? overtimeEntries : overtimeEntries.filter(e => e.teacherId === user?.uid)).length === 0 && (
                <div className="text-center py-12 text-zinc-400 font-bold">
                  {t('no_entries_found')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
                  <Edit2 size={20} />
                </div>
                <h3 className="text-2xl font-black text-zinc-900">{t('edit_overtime')}</h3>
              </div>
              <button onClick={() => setEditingEntry(null)} className="p-2 hover:bg-white rounded-xl transition-all">
                <X size={24} className="text-zinc-400" />
              </button>
            </div>
            
            <form className="p-8 space-y-6" onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const semester = formData.get('semester') as 'S1' | 'S2';
              
              const months = semester === 'S1' 
                ? ['september', 'october', 'november', 'december', 'january']
                : ['february', 'march', 'april', 'may', 'june'];
              
              const monthlyHours: Record<string, number> = {};
              let totalMonthlyHours = 0;
              months.forEach(month => {
                const val = Number(formData.get(`month_${month}`) || 0);
                monthlyHours[month] = val;
                totalMonthlyHours += val;
              });

              const updates: Partial<OvertimeEntry> = {
                academicYear: formData.get('academicYear') as string,
                semester,
                hours: totalMonthlyHours,
                monthlyHours,
                type: formData.get('type') as 'internal' | 'external',
                description: formData.get('description') as string,
                updatedAt: new Date().toISOString()
              };
              
              try {
                await dbService.updateDocument('overtime_entries', editingEntry.id, updates);
                setOvertimeEntries(overtimeEntries.map(ent => ent.id === editingEntry.id ? { ...ent, ...updates } : ent));
                setEditingEntry(null);
                toast.success(t('updated_successfully'));
              } catch (error) {
                toast.error(t('error_occurred'));
              }
            }}>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('academic_year')}</label>
                  <input name="academicYear" defaultValue={editingEntry.academicYear} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('semester')}</label>
                  <select 
                    name="semester" 
                    defaultValue={editingEntry.semester}
                    className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                  >
                    <option value="S1">{t('semester_1')}</option>
                    <option value="S2">{t('semester_2')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('monthly_hours')}</label>
                <div className="grid grid-cols-5 gap-2">
                  {(editingEntry.semester === 'S2' ? ['february', 'march', 'april', 'may', 'june'] : ['september', 'october', 'november', 'december', 'january']).map(month => (
                    <div key={month} className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase text-center block">{t(month)}</label>
                      <input 
                        name={`month_${month}`} 
                        type="number" 
                        step="0.5" 
                        defaultValue={editingEntry.monthlyHours?.[month] || 0}
                        className="w-full p-2 rounded-xl bg-zinc-50 border border-zinc-100 text-center font-bold text-sm" 
                        placeholder="0" 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('type')}</label>
                  <select name="type" defaultValue={editingEntry.type} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all">
                    <option value="internal">{t('internal_hours')}</option>
                    <option value="external">{t('external_hours')}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('description')}</label>
                  <input name="description" defaultValue={editingEntry.description} placeholder={t('description')} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingEntry(null)} className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-50 transition-all">
                  {t('cancel')}
                </button>
                <button type="submit" className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                  {t('save_changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <h3 className="text-xl font-black text-zinc-900">{t('rejection_reason')}</h3>
              <button onClick={() => setShowRejectionModal(null)} className="p-2 hover:bg-white rounded-xl transition-all">
                <X size={24} className="text-zinc-400" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-red-500 outline-none font-bold transition-all min-h-[120px]"
                placeholder={t('enter_rejection_reason')}
              />
              <div className="flex gap-4">
                <button
                  onClick={() => setShowRejectionModal(null)}
                  className="flex-1 px-6 py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={() => {
                    if (rejectionReason) {
                      handleReject(showRejectionModal, rejectionReason);
                      setShowRejectionModal(null);
                      setRejectionReason('');
                    } else {
                      toast.error(t('please_enter_reason'));
                    }
                  }}
                  className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-100"
                >
                  {t('reject')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div id="calculation-info" className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl">
            <Info size={24} />
          </div>
          <h3 className="text-2xl font-black text-zinc-900">{t('calculation_info')}</h3>
        </div>
        <p className="text-zinc-600 font-medium leading-relaxed max-w-3xl">
          {t('calculation_info_desc')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-indigo-600 font-bold">
              <BookOpen size={18} /> {t('teaching')}
            </div>
            <p className="text-sm text-zinc-500">{t('overtime_new_calc_note') || 'Overtime is calculated based on TEACHING hours only (Modules), minus the 9h legal quota for permanent teachers.'}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-zinc-400 font-bold italic">
              <ShieldCheck size={18} /> {t('invigilation')}
            </div>
            <p className="text-xs text-zinc-400 italic">{t('invigilation_not_in_sum') || 'Shown for information only, not included in overtime sum.'}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-zinc-400 font-bold italic">
              <Briefcase size={18} /> {t('supervision')}
            </div>
            <p className="text-xs text-zinc-400 italic">{t('supervision_not_in_sum') || 'Shown for information only, not included in overtime sum.'}</p>
          </div>
          <div className="bg-indigo-600 p-6 rounded-2xl border border-indigo-500 space-y-2 text-white">
            <div className="flex items-center gap-2 font-bold">
              <Star size={18} /> {t('under_1275')} (1275)
            </div>
            <p className="text-xs text-indigo-100 font-medium">{t('supervision_1275_calc')}</p>
          </div>
          <div className="bg-indigo-900 p-6 rounded-2xl border border-indigo-800 space-y-2 text-white">
            <div className="flex items-center gap-2 font-bold">
              <TrendingDown size={18} /> {t('under_1275')} (1275)
            </div>
            <p className="text-xs text-indigo-100 font-medium">{t('threshold_1275_calc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 bg-white/50 p-3 rounded-xl w-fit">
          <AlertCircle size={14} />
          {t('decision_1275_note')}
        </div>
      </div>
    </div>
  );
}
