import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { 
  Student, 
  User, 
  Specialty, 
  Level, 
  Schedule, 
  DepartmentStats,
  SemesterScheduleEntry
} from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { where } from 'firebase/firestore';
import { 
  BarChart3, 
  Save, 
  RefreshCw, 
  Users, 
  GraduationCap, 
  Building2, 
  Microscope,
  Globe,
  Monitor,
  Briefcase,
  CheckCircle2,
  XCircle,
  FileText,
  FileSpreadsheet,
  FileDown,
  ChevronRight,
  History
} from 'lucide-react';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

export function DepartmentStatsPage() {
  const { t, language } = useLanguage();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Data for auto-calculation
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showCloneModal, setShowCloneModal] = useState(false);
  
  // Manual stats
  const [manualStats, setManualStats] = useState<Partial<DepartmentStats>>({
    academicYear: '2025/2026',
    internationalStudentsCount: 0,
    licenseGroupsCount: 0,
    masterGroupsCount: 0,
    engineersGroupsCount: 0,
    amphitheatersCount: 0,
    tdRoomsCount: 0,
    tpRoomsCount: 0,
    tpComputersCount: 0,
    labSeatsCount: 0,
    consumablesSufficiency: 0,
    teachesAI: false,
    teachesEntrepreneurship: false,
    itEngineersCount: 0,
    itTechniciansCount: 0,
    adminWorkersCount: 0
  });

  // Dynamic academic years starting from 2025/2026
  const currentYear = new Date().getFullYear();
  const academicYears = Array.from({ length: 10 }, (_, i) => {
    const start = 2025 + i;
    return `${start}/${start + 1}`;
  });

  const fetchStatsForYear = async (year: string) => {
    setLoading(true);
    try {
      const ds = await dbService.getCollection<DepartmentStats>('department_stats', [
        where('academicYear', '==', year)
      ]);
      
      if (ds.length > 0) {
        setManualStats(ds[0]);
      } else {
        setManualStats({
          academicYear: year,
          internationalStudentsCount: 0,
          licenseGroupsCount: 0,
          masterGroupsCount: 0,
          engineersGroupsCount: 0,
          amphitheatersCount: 0,
          tdRoomsCount: 0,
          tpRoomsCount: 0,
          tpComputersCount: 0,
          labSeatsCount: 0,
          consumablesSufficiency: 0,
          teachesAI: false,
          teachesEntrepreneurship: false,
          itEngineersCount: 0,
          itTechniciansCount: 0,
          adminWorkersCount: 0
        });
      }
    } catch (error) {
      console.error('Failed to fetch stats for year:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [st, te, sp, le, sc] = await Promise.all([
          dbService.getCollection<Student>('students'),
          dbService.getCollection<User>('users'),
          dbService.getCollection<Specialty>('specialties'),
          dbService.getCollection<Level>('levels'),
          dbService.getCollection<Schedule>('schedules')
        ]);
        
        setStudents(st);
        setTeachers(te);
        setSpecialties(sp);
        setLevels(le);
        setSchedules(sc);
        
        await fetchStatsForYear(manualStats.academicYear || '2025/2026');
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      }
    };
    fetchData();
  }, []);

  const handleYearChange = (year: string) => {
    fetchStatsForYear(year);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const statsToSave = {
        ...manualStats,
        lastUpdated: new Date().toISOString()
      };
      
      if (manualStats.id) {
        await dbService.updateDocument('department_stats', manualStats.id, statsToSave);
      } else {
        const docRef = await dbService.addDocument('department_stats', statsToSave);
        if (docRef) {
          setManualStats({ ...statsToSave, id: docRef.id });
        }
      }
      toast.success(t('success'));
    } catch (error) {
      toast.error(t('error_occurred'));
    } finally {
      setSaving(false);
    }
  };

  const handleClone = async (fromYear: string) => {
    setLoading(true);
    try {
      const ds = await dbService.getCollection<DepartmentStats>('department_stats', [
        where('academicYear', '==', fromYear)
      ]);
      
      if (ds.length > 0) {
        const { id, academicYear, lastUpdated, ...rest } = ds[0];
        setManualStats({
          ...manualStats,
          ...rest,
          academicYear: manualStats.academicYear // Keep current selected year
        });
        toast.success(t('cloned_successfully'));
      } else {
        toast.error(t('no_data_to_clone'));
      }
    } catch (error) {
      toast.error(t('error_occurred'));
    } finally {
      setLoading(false);
      setShowCloneModal(false);
    }
  };

  const exportToExcel = () => {
    const statsData = [
      [t('department_stats'), manualStats.academicYear],
      [],
      [t('general_info')],
      [t('students'), students.length],
      [t('international_students'), manualStats.internationalStudentsCount],
      [t('english_taught'), englishModules],
      [t('remote_lessons'), remoteLessons],
      [],
      [t('license_phase')],
      [t('students'), licenseStats.students],
      [t('groups'), manualStats.licenseGroupsCount],
      [t('cours'), licenseStats.cours],
      [t('td'), licenseStats.td],
      [t('tp'), licenseStats.tp],
      [],
      [t('master_phase')],
      [t('students'), masterStats.students],
      [t('groups'), manualStats.masterGroupsCount],
      [t('cours'), masterStats.cours],
      [t('td'), masterStats.td],
      [t('tp'), masterStats.tp],
      [],
      [t('engineers_phase')],
      [t('students'), engineersStats.students],
      [t('groups'), manualStats.engineersGroupsCount],
      [t('cours'), engineersStats.cours],
      [t('td'), engineersStats.td],
      [t('tp'), engineersStats.tp],
      [],
      [t('teaching_staff')],
      [t('assistant'), teacherStats.assistant],
      [t('lecturer'), teacherStats.lecturerA + teacherStats.lecturerB],
      [t('professor'), teacherStats.professor],
      [t('temporary_staff'), teacherStats.temporary],
      [],
      [t('infrastructure')],
      [t('amphitheaters'), manualStats.amphitheatersCount],
      [t('td_rooms'), manualStats.tdRoomsCount],
      [t('tp_rooms'), manualStats.tpRoomsCount],
      [t('tp_computers'), manualStats.tpComputersCount],
      [t('lab_seats'), manualStats.labSeatsCount],
      [t('consumables_sufficiency'), `${manualStats.consumablesSufficiency}%`],
      [],
      [t('specialized_teaching')],
      [t('teaches_ai'), manualStats.teachesAI ? t('yes') : t('no')],
      [t('teaches_entrepreneurship'), manualStats.teachesEntrepreneurship ? t('yes') : t('no')],
      [],
      [t('support_staff')],
      [t('it_engineers'), manualStats.itEngineersCount],
      [t('it_technicians'), manualStats.itTechniciansCount],
      [t('admin_workers'), manualStats.adminWorkersCount]
    ];

    const teachersData = [
      [t('name'), t('name_ar'), t('rank'), t('type'), t('department')],
      ...teachers.map(t => [t.displayName, t.displayNameAr || '', t.rank || '', t.teacherType || '', t.department || ''])
    ];

    const studentsData = [
      [t('name'), t('registration_number'), t('specialty'), t('level')],
      ...students.map(s => [
        s.name, 
        s.registrationNumber, 
        specialties.find(sp => sp.id === s.specialtyId)?.name || '', 
        levels.find(l => l.id === s.levelId)?.name || ''
      ])
    ];

    const specialtiesData = [
      [t('name'), t('cycle')],
      ...specialties.map(s => [s.name, t(s.levelType)])
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(statsData), "Summary Stats");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(teachersData), "Teachers List");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(studentsData), "Students List");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(specialtiesData), "Specialties");
    
    XLSX.writeFile(wb, `Department_Full_Stats_${manualStats.academicYear}_${language}.xlsx`);
  };

  const exportToPDF = async () => {
    const element = document.getElementById('stats-content');
    if (!element) return;
    
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Department_Stats_${manualStats.academicYear}_${language}.pdf`);
  };

  const exportToWord = async () => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${t('department_stats')} - ${manualStats.academicYear}`,
                bold: true,
                size: 32,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          
          // General Info
          new Paragraph({
            children: [new TextRun({ text: t('general_info'), bold: true, size: 24 })],
            spacing: { before: 400, after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(t('students'))] }),
                  new TableCell({ children: [new Paragraph(students.length.toString())] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(t('international_students'))] }),
                  new TableCell({ children: [new Paragraph(manualStats.internationalStudentsCount?.toString() || "0")] }),
                ],
              }),
            ],
          }),

          // License Phase
          new Paragraph({
            children: [new TextRun({ text: t('license_phase'), bold: true, size: 24 })],
            spacing: { before: 400, after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(t('students'))] }),
                  new TableCell({ children: [new Paragraph(licenseStats.students.toString())] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(t('groups'))] }),
                  new TableCell({ children: [new Paragraph(manualStats.licenseGroupsCount?.toString() || "0")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(t('cours'))] }),
                  new TableCell({ children: [new Paragraph(licenseStats.cours.toString())] }),
                ],
              }),
            ],
          }),

          // Infrastructure
          new Paragraph({
            children: [new TextRun({ text: t('infrastructure'), bold: true, size: 24 })],
            spacing: { before: 400, after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(t('amphitheaters'))] }),
                  new TableCell({ children: [new Paragraph(manualStats.amphitheatersCount?.toString() || "0")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(t('td_rooms'))] }),
                  new TableCell({ children: [new Paragraph(manualStats.tdRoomsCount?.toString() || "0")] }),
                ],
              }),
            ],
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Department_Stats_${manualStats.academicYear}_${language}.docx`);
  };

  // Auto-calculations
  const getPhaseStats = (phase: 'license' | 'master' | 'engineers') => {
    const phaseSpecialties = specialties.filter(s => s.levelType === phase);
    const phaseLevels = levels.filter(l => phaseSpecialties.some(s => s.id === l.specialtyId));
    const phaseStudents = students.filter(s => phaseSpecialties.some(sp => sp.id === s.specialtyId));
    
    // Count groups (assuming level.studentCount / 25 or similar, but we'll just sum level student counts for now)
    // Actually, the user asked for "عدد الأفواج" (number of groups). 
    // We don't have a direct "groups" collection, but we can infer from schedules if they mention groups.
    // For now, let's use a placeholder or sum level student counts.
    
    const semesterSchedules = schedules.filter(s => s.type === 'semester');
    let cours = 0, td = 0, tp = 0;
    let tempCours = 0, tempTd = 0, tempTp = 0;
    let firstYearTempCours = 0, firstYearTempTd = 0;

    semesterSchedules.forEach(s => {
      s.data.forEach((entry: SemesterScheduleEntry) => {
        const spec = specialties.find(sp => sp.name === entry.specialty);
        if (spec?.levelType === phase) {
          if (entry.type === 'Cours') cours++;
          if (entry.type === 'TD') td++;
          if (entry.type === 'TP') tp++;

          const teacher = teachers.find(t => t.uid === entry.teacherId);
          if (teacher?.teacherType === 'temporary') {
            if (entry.type === 'Cours') tempCours++;
            if (entry.type === 'TD') tempTd++;
            if (entry.type === 'TP') tempTp++;

            if (entry.level.includes('1')) {
              if (entry.type === 'Cours') firstYearTempCours++;
              if (entry.type === 'TD') firstYearTempTd++;
            }
          }
        }
      });
    });

    return {
      students: phaseStudents.length,
      groups: phaseLevels.length * 2, // Placeholder: 2 groups per level
      cours,
      td,
      tp,
      tempCours,
      tempTd,
      tempTp,
      firstYearTempCours,
      firstYearTempTd
    };
  };

  const licenseStats = getPhaseStats('license');
  const masterStats = getPhaseStats('master');
  const engineersStats = getPhaseStats('engineers');

  const teacherStats = {
    assistant: teachers.filter(t => t.rank === 'MAA' || t.rank === 'MAA_DOC').length,
    lecturerB: teachers.filter(t => t.rank === 'MCB').length,
    lecturerA: teachers.filter(t => t.rank === 'MCA').length,
    professor: teachers.filter(t => t.rank === 'Pr').length,
    temporary: teachers.filter(t => t.teacherType === 'temporary').length
  };

  const englishModules = schedules.filter(s => s.type === 'semester')
    .reduce((acc, s) => acc + s.data.filter((e: any) => e.isInEnglish).length, 0);

  const remoteLessons = schedules.filter(s => s.type === 'semester')
    .reduce((acc, s) => acc + s.data.filter((e: any) => e.isOnline).length, 0);

  if (!isAdmin) return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin text-zinc-400" /></div>;

  const StatSection = ({ title, icon: Icon, children }: any) => (
    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-100 space-y-8 hover:shadow-md transition-all">
      <div className="flex items-center justify-between border-b border-zinc-50 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <Icon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900">{title}</h3>
            <p className="text-xs text-zinc-400 font-medium uppercase tracking-widest">{t('section_details')}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {children}
      </div>
    </div>
  );

  const DataItem = ({ label, value, isAuto = true }: { label: string, value: any, isAuto?: boolean }) => (
    <div className="p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100/50 space-y-2 group hover:bg-white hover:border-indigo-100 transition-all">
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
        {label}
        {isAuto && <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">{t('auto')}</span>}
      </div>
      <div className="text-2xl font-black text-zinc-900 tabular-nums">{value}</div>
    </div>
  );

  const InputItem = ({ label, value, onChange, type = "number" }: any) => (
    <div className="p-6 bg-white rounded-2xl border border-zinc-100 space-y-3 hover:border-indigo-200 transition-all">
      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</label>
      {type === "boolean" ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-bold text-sm ${value ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-emerald-200'}`}
          >
            <CheckCircle2 size={18} /> {t('yes')}
          </button>
          <button
            onClick={() => onChange(false)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-bold text-sm ${!value ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-red-200'}`}
          >
            <XCircle size={18} /> {t('no')}
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-100 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold text-lg transition-all"
          />
          {type === 'number' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1">
              <button onClick={() => onChange(value + 1)} className="text-zinc-400 hover:text-indigo-600 transition-colors">
                <ChevronRight size={14} className="-rotate-90" />
              </button>
              <button onClick={() => onChange(Math.max(0, value - 1))} className="text-zinc-400 hover:text-indigo-600 transition-colors">
                <ChevronRight size={14} className="rotate-90" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
            <BarChart3 size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">{t('department_stats')}</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-zinc-500 text-sm">{t('academic_year')}</p>
              <div className="flex items-center gap-2">
                <select
                  value={manualStats.academicYear}
                  onChange={(e) => handleYearChange(e.target.value)}
                  className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border-none focus:ring-0 cursor-pointer"
                >
                  {academicYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowCloneModal(true)}
                  className="p-1 text-zinc-400 hover:text-indigo-600 transition-colors"
                  title={t('clone_from_previous_year')}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white rounded-2xl border border-zinc-200 p-1 shadow-sm">
            <button
              onClick={exportToPDF}
              className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-all flex items-center gap-2 px-4"
              title={t('export_pdf')}
            >
              <FileDown size={18} />
              <span className="text-xs font-bold">PDF</span>
            </button>
            <button
              onClick={exportToExcel}
              className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-all flex items-center gap-2 px-4 border-x border-zinc-100"
              title={t('export_excel')}
            >
              <FileSpreadsheet size={18} />
              <span className="text-xs font-bold">Excel</span>
            </button>
            <button
              onClick={exportToWord}
              className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-all flex items-center gap-2 px-4"
              title={t('export_word')}
            >
              <FileText size={18} />
              <span className="text-xs font-bold">Word</span>
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-xl shadow-zinc-200 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
            {t('save_stats')}
          </button>
        </div>
      </div>

      <div id="stats-content" className="space-y-8">
        {/* General Stats */}
        <StatSection title={t('general_info')} icon={Globe}>
          <DataItem label={t('students')} value={students.length} />
          <InputItem 
            label={t('international_students')} 
            value={manualStats.internationalStudentsCount} 
            onChange={(v: number) => setManualStats({...manualStats, internationalStudentsCount: v})} 
          />
          <DataItem label={t('english_taught')} value={englishModules} />
          <DataItem label={t('remote_lessons')} value={remoteLessons} />
        </StatSection>

        {/* License Stats */}
        <StatSection title={t('license_phase')} icon={GraduationCap}>
          <DataItem label={t('students')} value={licenseStats.students} />
          <InputItem 
            label={t('groups')} 
            value={manualStats.licenseGroupsCount} 
            onChange={(v: number) => setManualStats({...manualStats, licenseGroupsCount: v})} 
          />
          <DataItem label={t('cours')} value={licenseStats.cours} />
          <DataItem label={t('td')} value={licenseStats.td} />
          <DataItem label={t('tp')} value={licenseStats.tp} />
        </StatSection>

        {/* Master Stats */}
        <StatSection title={t('master_phase')} icon={GraduationCap}>
          <DataItem label={t('students')} value={masterStats.students} />
          <InputItem 
            label={t('groups')} 
            value={manualStats.masterGroupsCount} 
            onChange={(v: number) => setManualStats({...manualStats, masterGroupsCount: v})} 
          />
          <DataItem label={t('cours')} value={masterStats.cours} />
          <DataItem label={t('td')} value={masterStats.td} />
          <DataItem label={t('tp')} value={masterStats.tp} />
        </StatSection>

        {/* Engineers Stats */}
        <StatSection title={t('engineers_phase')} icon={GraduationCap}>
          <DataItem label={t('students')} value={engineersStats.students} />
          <InputItem 
            label={t('groups')} 
            value={manualStats.engineersGroupsCount} 
            onChange={(v: number) => setManualStats({...manualStats, engineersGroupsCount: v})} 
          />
          <DataItem label={t('cours')} value={engineersStats.cours} />
          <DataItem label={t('td')} value={engineersStats.td} />
          <DataItem label={t('tp')} value={engineersStats.tp} />
        </StatSection>

        {/* Teacher Stats */}
        <StatSection title={t('teaching_staff')} icon={Users}>
          <DataItem label={t('assistant')} value={teacherStats.assistant} />
          <DataItem label={t('lecturer')} value={teacherStats.lecturerA + teacherStats.lecturerB} />
          <DataItem label={t('professor')} value={teacherStats.professor} />
          <DataItem label={t('temporary_staff')} value={teacherStats.temporary} />
        </StatSection>

        {/* Temporary Teacher Workload */}
        <StatSection title={t('workload')} icon={Briefcase}>
          <DataItem label={t('cours')} value={licenseStats.tempCours + masterStats.tempCours + engineersStats.tempCours} />
          <DataItem label={t('td')} value={licenseStats.tempTd + masterStats.tempTd + engineersStats.tempTd} />
          <DataItem label={t('tp')} value={licenseStats.tempTp + masterStats.tempTp + engineersStats.tempTp} />
          <DataItem label={t('first_year_teaching')} value={licenseStats.firstYearTempCours + licenseStats.firstYearTempTd} />
        </StatSection>

        {/* Infrastructure */}
        <StatSection title={t('infrastructure')} icon={Building2}>
          <InputItem 
            label={t('amphitheaters')} 
            value={manualStats.amphitheatersCount} 
            onChange={(v: number) => setManualStats({...manualStats, amphitheatersCount: v})} 
          />
          <InputItem 
            label={t('td_rooms')} 
            value={manualStats.tdRoomsCount} 
            onChange={(v: number) => setManualStats({...manualStats, tdRoomsCount: v})} 
          />
          <InputItem 
            label={t('tp_rooms')} 
            value={manualStats.tpRoomsCount} 
            onChange={(v: number) => setManualStats({...manualStats, tpRoomsCount: v})} 
          />
          <InputItem 
            label={t('tp_computers')} 
            value={manualStats.tpComputersCount} 
            onChange={(v: number) => setManualStats({...manualStats, tpComputersCount: v})} 
          />
          <InputItem 
            label={t('lab_seats')} 
            value={manualStats.labSeatsCount} 
            onChange={(v: number) => setManualStats({...manualStats, labSeatsCount: v})} 
          />
          <InputItem 
            label={t('consumables_sufficiency')} 
            value={manualStats.consumablesSufficiency} 
            onChange={(v: number) => setManualStats({...manualStats, consumablesSufficiency: v})} 
          />
        </StatSection>

        {/* Specialized Teaching */}
        <StatSection title={t('specialized_teaching')} icon={Microscope}>
          <InputItem 
            label={t('teaches_ai')} 
            value={manualStats.teachesAI} 
            type="boolean"
            onChange={(v: boolean) => setManualStats({...manualStats, teachesAI: v})} 
          />
          <InputItem 
            label={t('teaches_entrepreneurship')} 
            value={manualStats.teachesEntrepreneurship} 
            type="boolean"
            onChange={(v: boolean) => setManualStats({...manualStats, teachesEntrepreneurship: v})} 
          />
        </StatSection>

        {/* Personnel */}
        <StatSection title={t('support_staff')} icon={Monitor}>
          <InputItem 
            label={t('it_engineers')} 
            value={manualStats.itEngineersCount} 
            onChange={(v: number) => setManualStats({...manualStats, itEngineersCount: v})} 
          />
          <InputItem 
            label={t('it_technicians')} 
            value={manualStats.itTechniciansCount} 
            onChange={(v: number) => setManualStats({...manualStats, itTechniciansCount: v})} 
          />
          <InputItem 
            label={t('admin_workers')} 
            value={manualStats.adminWorkersCount} 
            onChange={(v: number) => setManualStats({...manualStats, adminWorkersCount: v})} 
          />
        </StatSection>
      </div>

      {/* Clone Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <h3 className="text-xl font-black text-zinc-900">{t('clone_from_previous_year')}</h3>
              <button onClick={() => setShowCloneModal(false)} className="p-2 hover:bg-white rounded-xl transition-all">
                <ChevronRight size={24} className="rotate-90" />
              </button>
            </div>
            <div className="p-8 space-y-4">
              <p className="text-sm text-zinc-500 font-medium">{t('select_year_to_clone')}</p>
              <div className="grid grid-cols-1 gap-2">
                {academicYears.filter(y => y !== manualStats.academicYear).map(year => (
                  <button
                    key={year}
                    onClick={() => handleClone(year)}
                    className="w-full p-4 rounded-2xl bg-zinc-50 hover:bg-indigo-50 hover:text-indigo-600 font-bold transition-all text-left flex justify-between items-center group"
                  >
                    {year}
                    <ChevronRight size={18} className="opacity-0 group-hover:opacity-100 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
