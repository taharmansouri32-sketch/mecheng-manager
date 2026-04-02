import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { dbService } from '../services/db';
import toast from 'react-hot-toast';
import { Session, Project, User, Specialty, Level, Module, Schedule, SemesterScheduleEntry } from '../types';
import { seedDatabase } from '../services/seedData';
import { 
  Users, 
  BookOpen, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  Download,
  Calendar as CalendarIcon,
  ShieldAlert,
  Eye,
  X,
  GraduationCap,
  Layers,
  Layout as LayoutIcon,
  FileText,
  FileSpreadsheet,
  FileDown,
  RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function Dashboard() {
  const { user, isAdmin, isSpecialtyManager } = useAuth();
  const { t, language } = useLanguage();
  const [stats, setStats] = useState({
    totalTeachers: 0,
    totalSessions: 0,
    taughtSessions: 0,
    missedSessions: 0,
    activeProjects: 0,
    problems: 0,
    internships: 0,
    sickLeaves: 0,
    specialtiesByPhase: {} as Record<string, number>,
    modulesBySpecialty: [] as { level: string, specialty: string, s1: number, s2: number, levelType: string }[],
    studentsByLevel: [] as { level: string, specialty: string, phase: string, count: number }[]
  });
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [mySchedules, setMySchedules] = useState<Schedule[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);

  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);

  const handleRefreshApp = async () => {
    try {
      await dbService.setDocument('system_settings', 'global', {
        lastRefresh: new Date().toISOString()
      });
      toast.success(t('app_refreshed'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      let teachers = await dbService.getCollection<User>('users');
      let sessions = await dbService.getCollection<Session>('sessions');
      let projects = await dbService.getCollection<Project>('projects');
      const schedules = await dbService.getCollection<Schedule>('schedules');
      const specialties = await dbService.getCollection<Specialty>('specialties');
      const levels = await dbService.getCollection<Level>('levels');
      const modulesList = await dbService.getCollection<Module>('modules');

      // Specialties by phase
      const specialtiesByPhase: Record<string, number> = {};
      specialties.forEach(s => {
        specialtiesByPhase[s.phase] = (specialtiesByPhase[s.phase] || 0) + 1;
      });

      // Modules by Level and Specialty
      const modulesBySpecialty = levels.map(l => {
        const spec = specialties.find(s => s.id === l.specialtyId);
        const lModules = modulesList.filter(m => m.levelId === l.id);
        return {
          level: l.name,
          specialty: spec?.name || 'Unknown',
          levelType: spec?.levelType || '',
          s1: lModules.filter(m => m.semester === 'S1').length,
          s2: lModules.filter(m => m.semester === 'S2').length
        };
      }).sort((a, b) => {
        // Sort by levelType (License first, then Master, then Engineers)
        const typeOrder = { 'license': 1, 'master': 2, 'engineers': 3 };
        const typeDiff = (typeOrder[a.levelType as keyof typeof typeOrder] || 99) - (typeOrder[b.levelType as keyof typeof typeOrder] || 99);
        if (typeDiff !== 0) return typeDiff;
        // Then by level name
        return a.level.localeCompare(b.level);
      });

      // Students by level, specialty, phase
      const studentsByLevel = levels.map(l => {
        const spec = specialties.find(s => s.id === l.specialtyId);
        return {
          level: l.name,
          specialty: spec?.name || 'Unknown',
          phase: spec?.phase || 'Unknown',
          count: l.studentCount || 0
        };
      });

      if (!isAdmin) {
        if (isSpecialtyManager && user.managedSpecialtyId) {
          teachers = teachers.filter(t => t.specialties?.includes(user.managedSpecialtyId!) || t.managedSpecialtyId === user.managedSpecialtyId);
          sessions = sessions.filter(s => s.specialtyId === user.managedSpecialtyId);
          projects = projects.filter(p => p.specialtyId === user.managedSpecialtyId);
        } else {
          // Teacher view
          sessions = sessions.filter(s => s.teacherId === user.uid);
          projects = projects.filter(p => p.supervisorId === user.uid);
          // For teachers, totalTeachers might not be relevant or could be colleagues in same specialty
        }
      }

      setStats({
        totalTeachers: teachers.length,
        totalSessions: sessions.length,
        taughtSessions: sessions.filter(s => s.status === 'taught').length,
        missedSessions: sessions.filter(s => s.status === 'missed').length,
        activeProjects: projects.length,
        problems: sessions.filter(s => s.status === 'problem').length,
        internships: sessions.filter(s => s.status === 'internship').length,
        sickLeaves: sessions.filter(s => s.status === 'sick').length,
        specialtiesByPhase,
        modulesBySpecialty,
        studentsByLevel
      });

      setRecentSessions(sessions.slice(0, 5));
      setRecentProjects(projects.slice(0, 5));
      
      // Filter schedules for the current teacher
      if (!isAdmin) {
        const teacherSchedules = schedules.filter(s => 
          s.data?.some(row => row.teacherId === user.uid)
        );
        setMySchedules(teacherSchedules);
      }
    };

    fetchStats();
  }, [user, isAdmin, isSpecialtyManager]);

  const exportSummaryWord = async () => {
    try {
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              children: [new TextRun({ text: t('dashboard_summary'), bold: true, size: 32 })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(t('teachers'))] }),
                    new TableCell({ children: [new Paragraph(stats.totalTeachers.toString())] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(t('sessions'))] }),
                    new TableCell({ children: [new Paragraph(stats.totalSessions.toString())] }),
                  ],
                }),
              ],
            }),
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Dashboard_Summary_${language}.docx`);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const exportSummaryExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Summary');
      worksheet.columns = [
        { header: t('category'), key: 'cat', width: 30 },
        { header: t('value'), key: 'val', width: 15 },
      ];
      worksheet.addRows([
        { cat: t('teachers'), val: stats.totalTeachers },
        { cat: t('sessions'), val: stats.totalSessions },
        { cat: t('taught_sessions'), val: stats.taughtSessions },
        { cat: t('missed_sessions'), val: stats.missedSessions },
      ]);
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Dashboard_Summary_${language}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const exportSummaryPDF = () => {
    try {
      const doc = new jsPDF();
      doc.text(t('dashboard_summary'), 105, 15, { align: 'center' });
      autoTable(doc, {
        startY: 25,
        head: [[t('category'), t('value')]],
        body: [
          [t('teachers'), stats.totalTeachers],
          [t('sessions'), stats.totalSessions],
          [t('taught_sessions'), stats.taughtSessions],
          [t('missed_sessions'), stats.missedSessions],
        ],
      });
      doc.save(`Dashboard_Summary_${language}.pdf`);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 flex items-center gap-4"
    >
      <div className={cn("p-4 rounded-2xl", color)}>
        <Icon size={24} className="text-white" />
      </div>
      <div>
        <div className="text-sm text-zinc-500 font-medium">{t(title)}</div>
        <div className="text-2xl font-bold text-zinc-900">{value}</div>
      </div>
    </motion.div>
  );

  const downloadSchedule = (schedule: Schedule) => {
    const teacherData = schedule.data?.filter(row => row.teacherId === user?.uid);
    const blob = new Blob([JSON.stringify(teacherData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schedule.type}_schedule_${user?.displayName}.json`;
    a.click();
  };

  const renderScheduleTable = (schedule: Schedule) => {
    const teacherData = schedule.data?.filter(row => row.teacherId === user?.uid) || [];
    if (schedule.type === 'semester') {
      return (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="pb-2 font-semibold text-zinc-600">{t('day')}</th>
              <th className="pb-2 font-semibold text-zinc-600">{t('time')}</th>
              <th className="pb-2 font-semibold text-zinc-600">{t('module')}</th>
              <th className="pb-2 font-semibold text-zinc-600">{t('room')}</th>
              <th className="pb-2 font-semibold text-zinc-600">{t('type')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {teacherData.map((row, i) => (
              <tr key={i}>
                <td className="py-2 text-zinc-900">{row.day}</td>
                <td className="py-2 text-zinc-500">{row.time}</td>
                <td className="py-2 text-zinc-900 font-medium">{row.module}</td>
                <td className="py-2 text-zinc-500">{row.room}</td>
                <td className="py-2 text-zinc-500">{row.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    } else {
      return (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="pb-2 font-semibold text-zinc-600">{t('date')}</th>
              <th className="pb-2 font-semibold text-zinc-600">{t('time')}</th>
              <th className="pb-2 font-semibold text-zinc-600">{t('module')}</th>
              <th className="pb-2 font-semibold text-zinc-600">{t('room')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {teacherData.map((row, i) => (
              <tr key={i}>
                <td className="py-2 text-zinc-900">{row.date}</td>
                <td className="py-2 text-zinc-500">{row.time}</td>
                <td className="py-2 text-zinc-900 font-medium">{row.module}</td>
                <td className="py-2 text-zinc-500">{row.room}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  };

  const [showConfirmSeed, setShowConfirmSeed] = useState(false);

  const [seedProgress, setSeedProgress] = useState('');

  const handleSeed = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsSeeding(true);
    setSeedProgress('Starting...');
    console.log('Starting seed process from UI...');
    try {
      // We can't easily get progress from the service without changing its signature,
      // but we can at least show that it's working.
      setSeedProgress('Deleting old data...');
      await seedDatabase();
      setSeedProgress('Done!');
      console.log('Seed process finished successfully');
      toast.success(t('database_seeded_success'));
      window.location.reload();
    } catch (error: any) {
      console.error('Seeding error details:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`${t('error_seeding_database')}: ${errorMessage}`);
      setSeedProgress('Error occurred.');
    } finally {
      setIsSeeding(false);
      setShowConfirmSeed(false);
    }
  };

  return (
    <div className="space-y-8">
      {isAdmin && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-amber-800">
              <ShieldAlert size={20} />
              <span className="text-sm font-medium">{t('admin_actions_seed')}</span>
            </div>
            {!showConfirmSeed ? (
              <button
                onClick={() => setShowConfirmSeed(true)}
                disabled={isSeeding}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isSeeding ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {seedProgress || t('seeding')}
                  </>
                ) : (
                  t('seed_database')
                )}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSeed}
                  disabled={isSeeding}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isSeeding ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {seedProgress || t('processing')}
                    </>
                  ) : (
                    t('confirm_seed')
                  )}
                </button>
                <button
                  onClick={() => setShowConfirmSeed(false)}
                  disabled={isSeeding}
                  className="px-4 py-2 bg-zinc-200 text-zinc-700 rounded-xl text-sm font-bold hover:bg-zinc-300 transition-all disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={handleRefreshApp}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <RefreshCw size={18} />
              {t('refresh_app')}
            </button>
          </div>
          {showConfirmSeed && !isSeeding && (
            <p className="text-xs text-amber-700 font-medium">
              {t('seed_warning')}
            </p>
          )}
        </div>
      )}
      {viewingSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-4xl w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">{t(viewingSchedule.type === 'semester' ? 'semester_schedule' : 'invigilation_schedule')}</h3>
              <button onClick={() => setViewingSchedule(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            {renderScheduleTable(viewingSchedule)}
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setViewingSchedule(null)}
                className="px-6 py-2 bg-zinc-900 text-white rounded-xl font-semibold"
              >
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold text-zinc-900">
            {t('welcome')}, {user?.displayName}
          </h2>
          <p className="text-zinc-500">
            {isAdmin ? t('admin') : isSpecialtyManager ? t('manager') : t('teacher')}
          </p>
        </div>
        
        {isAdmin && (
          <div className="flex items-center bg-white rounded-2xl border border-zinc-200 p-1 shadow-sm">
            <button
              onClick={exportSummaryPDF}
              className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-all flex items-center gap-2 px-4"
              title={t('export_pdf')}
            >
              <FileDown size={18} />
              <span className="text-xs font-bold">PDF</span>
            </button>
            <button
              onClick={exportSummaryExcel}
              className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-all flex items-center gap-2 px-4 border-x border-zinc-100"
              title={t('export_excel')}
            >
              <FileSpreadsheet size={18} />
              <span className="text-xs font-bold">Excel</span>
            </button>
            <button
              onClick={exportSummaryWord}
              className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-all flex items-center gap-2 px-4"
              title={t('export_word')}
            >
              <FileText size={18} />
              <span className="text-xs font-bold">Word</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isAdmin && <StatCard title="teachers" value={stats.totalTeachers} icon={Users} color="bg-blue-500" />}
        <StatCard title="sessions" value={stats.totalSessions} icon={Clock} color="bg-zinc-800" />
        <StatCard title="taught_sessions" value={stats.taughtSessions} icon={CheckCircle} color="bg-emerald-500" />
        <StatCard title="missed_sessions" value={stats.missedSessions} icon={AlertTriangle} color="bg-red-500" />
        <StatCard title="projects" value={stats.activeProjects} icon={BookOpen} color="bg-indigo-500" />
        <StatCard title="problems" value={stats.problems} icon={TrendingUp} color="bg-amber-500" />
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Specialties by Phase */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Layers className="text-blue-500" />
              {t('specialties_per_phase')}
            </h3>
            <div className="space-y-4">
              {Object.entries(stats.specialtiesByPhase).map(([phase, count]) => (
                <div key={phase} className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                  <span className="font-bold text-sm uppercase">{phase}</span>
                  <span className="text-lg font-bold text-blue-600">{count}</span>
                </div>
              ))}
              {Object.keys(stats.specialtiesByPhase).length === 0 && <p className="text-zinc-400 text-sm italic">{t('no_sessions_found')}</p>}
            </div>
          </div>

          {/* Modules per Level & Specialty */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <LayoutIcon className="text-emerald-500" />
              {t('modules_per_level_specialty')}
            </h3>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {stats.modulesBySpecialty.map((item, i) => (
                <div key={i} className="p-3 bg-zinc-50 rounded-xl space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-sm">{item.level}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">{item.specialty}</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500 border-t border-zinc-100 pt-2">
                    <span>{t('semester1')}: <span className="font-bold text-zinc-900">{item.s1}</span></span>
                    <span>{t('semester2')}: <span className="font-bold text-zinc-900">{item.s2}</span></span>
                  </div>
                </div>
              ))}
              {stats.modulesBySpecialty.length === 0 && <p className="text-zinc-400 text-sm italic">{t('no_sessions_found')}</p>}
            </div>
          </div>

          {/* Students per Level */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <GraduationCap className="text-indigo-500" />
              {t('students_per_level')}
            </h3>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {stats.studentsByLevel.map((item, i) => (
                <div key={i} className="p-3 bg-zinc-50 rounded-xl space-y-1">
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-sm">{item.level}</div>
                    <span className="text-lg font-bold text-indigo-600">{item.count}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase flex gap-2">
                    <span>{item.specialty}</span>
                    <span>•</span>
                    <span>{item.phase}</span>
                  </div>
                </div>
              ))}
              {stats.studentsByLevel.length === 0 && <p className="text-zinc-400 text-sm italic">{t('no_sessions_found')}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {!isAdmin && mySchedules.length > 0 && (
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <CalendarIcon className="text-emerald-500" />
              {t('my_schedules')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mySchedules.map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      schedule.type === 'semester' ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
                    )}>
                      {schedule.type === 'semester' ? <CalendarIcon size={20} /> : <ShieldAlert size={20} />}
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900 capitalize">{t(schedule.type === 'semester' ? 'semester_schedule' : 'invigilation_schedule')}</div>
                      <div className="text-xs text-zinc-500">{new Date(schedule.uploadedAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setViewingSchedule(schedule)}
                      className="p-2 text-zinc-400 hover:text-indigo-600 transition-all"
                      title={t('view') || 'View'}
                    >
                      <Eye size={20} />
                    </button>
                    <button 
                      onClick={() => downloadSchedule(schedule)}
                      className="p-2 text-zinc-400 hover:text-emerald-600 transition-all"
                      title={t('download')}
                    >
                      <Download size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
          <h3 className="text-xl font-bold mb-6">{t('recent_sessions')}</h3>
          <div className="space-y-4">
            {recentSessions.map(session => (
              <div key={session.id} className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                <div>
                  <div className="font-bold text-sm">{session.module}</div>
                  <div className="text-xs text-zinc-500">{session.date} - {session.time}</div>
                </div>
                <span className="text-xs font-bold uppercase">{t(session.status)}</span>
              </div>
            ))}
            {recentSessions.length === 0 && <p className="text-zinc-400 text-sm italic">No recent sessions found.</p>}
          </div>
        </div>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
          <h3 className="text-xl font-bold mb-6">{t('active_projects')}</h3>
          <div className="space-y-4">
            {recentProjects.map(project => (
              <div key={project.id} className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                <div>
                  <div className="font-bold text-sm">{project.title}</div>
                  <div className="text-xs text-zinc-500">{t(project.stage)}</div>
                </div>
                <span className="text-xs font-bold">{project.progress}%</span>
              </div>
            ))}
            {recentProjects.length === 0 && <p className="text-zinc-400 text-sm italic">No active projects found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
