import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { Student, Specialty, Level } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, 
  Download, 
  Upload, 
  Trash2, 
  Search, 
  Users, 
  FileSpreadsheet, 
  AlertCircle,
  Filter,
  GraduationCap,
  Globe,
  MoreVertical,
  Edit2
} from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { ConfirmationModal } from '../components/ConfirmationModal';

export function StudentManagement() {
  const { t, academicYear } = useLanguage();
  const { isAdmin, isSpecialtyManager, user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    name: '',
    registrationNumber: '',
    specialtyId: '',
    levelId: '',
    isInternational: false
  });

  useEffect(() => {
    const fetchData = async () => {
      const [sData, lData] = await Promise.all([
        dbService.getCollection<Specialty>('specialties'),
        dbService.getCollection<Level>('levels')
      ]);
      setSpecialties(sData);
      setLevels(lData);
    };
    fetchData();

    const unsubscribe = dbService.subscribeToCollection<Student>('students', [], (data) => {
      setStudents(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const downloadTemplate = () => {
    const template = [
      {
        'Full Name': 'John Doe',
        'Registration Number': '20230001',
        'Specialty ID': specialties[0]?.id || 'specialty_id_here',
        'Level ID': levels[0]?.id || 'level_id_here'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students Template");
    XLSX.writeFile(wb, "students_import_template.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const newStudents: Partial<Student>[] = data.map(row => ({
          name: row['Full Name'] || row['name'],
          registrationNumber: String(row['Registration Number'] || row['registrationNumber']),
          specialtyId: row['Specialty ID'] || row['specialtyId'],
          levelId: row['Level ID'] || row['levelId'],
          academicYear
        })).filter(s => s.name && s.registrationNumber && s.specialtyId);

        for (const student of newStudents) {
          await dbService.addDocument('students', student);
        }

        toast.success(`Successfully imported ${newStudents.length} students`);
      } catch (error) {
        console.error('Import failed:', error);
        toast.error('Failed to import students. Please check the template.');
      } finally {
        setIsImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const deleteStudent = async (id: string) => {
    await dbService.deleteDocument('students', id);
    toast.success(t('success'));
    setDeleteConfirm(null);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.registrationNumber || !newStudent.specialtyId || !newStudent.levelId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await dbService.addDocument('students', { ...newStudent, academicYear });
      toast.success('Student added successfully');
      setShowAddModal(false);
      setNewStudent({
        name: '',
        registrationNumber: '',
        specialtyId: '',
        levelId: '',
        isInternational: false
      });
    } catch (error) {
      toast.error('Failed to add student');
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(filter.toLowerCase()) || 
                         s.registrationNumber.includes(filter);
    const matchesYear = s.academicYear === academicYear;

    if (!matchesYear) return false;
    
    if (isAdmin) return matchesSearch;
    if (isSpecialtyManager && user?.managedSpecialtyId) {
      return matchesSearch && s.specialtyId === user.managedSpecialtyId;
    }
    return matchesSearch;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><AlertCircle className="animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center">
            <Users size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-zinc-900 tracking-tight">{t('student_management')}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest">{students.length} {t('total_students')}</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100"
          >
            <Plus size={20} /> {t('add_student')}
          </button>
          <button
            onClick={downloadTemplate}
            className="flex-1 md:flex-none px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Download size={20} /> {t('template')}
          </button>
          <label className="flex-1 md:flex-none px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-zinc-200">
            <Upload size={20} /> {isImporting ? t('importing') : t('import_students')}
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" disabled={isImporting} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 space-y-6">
          <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-zinc-100 flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
              <input
                type="text"
                placeholder={t('search_students_placeholder')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
              />
            </div>
            <button className="p-4 bg-zinc-100 text-zinc-600 rounded-2xl hover:bg-zinc-200 transition-all">
              <Filter size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredStudents.map((student) => (
              <div key={student.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100 hover:shadow-md hover:border-indigo-100 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                
                <div className="relative flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                      <GraduationCap size={28} />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-zinc-900 group-hover:text-indigo-600 transition-colors">{student.name}</h4>
                      <p className="text-xs font-mono text-zinc-400 font-bold uppercase tracking-widest">{student.registrationNumber}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setDeleteConfirm(student.id!)}
                      className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="relative mt-6 grid grid-cols-2 gap-4">
                  <div className="p-3 bg-zinc-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t('specialty')}</p>
                    <p className="text-xs font-bold text-zinc-700 truncate">
                      {specialties.find(s => s.id === student.specialtyId)?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t('level')}</p>
                    <p className="text-xs font-bold text-zinc-700">
                      {levels.find(l => l.id === student.levelId)?.name || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="relative mt-4 flex items-center justify-between">
                  <div className="flex gap-2">
                    {student.isInternational && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1">
                        <Globe size={10} /> {t('international')}
                      </span>
                    )}
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1",
                      student.projectId ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {student.projectId ? t('assigned') : t('unassigned')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredStudents.length === 0 && (
            <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-zinc-100">
              <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
                <Users size={40} />
              </div>
              <p className="text-zinc-500 font-bold">{t('no_students_found')}</p>
              <p className="text-zinc-400 text-sm mt-1">{t('import_students_hint')}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900 p-8 rounded-[2rem] text-white shadow-xl shadow-zinc-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16"></div>
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <AlertCircle size={20} className="text-indigo-400" />
              {t('quick_actions')}
            </h3>
            <div className="space-y-4">
              <button className="w-full p-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all text-left group">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">{t('export')}</p>
                <p className="text-sm font-bold group-hover:translate-x-1 transition-transform">{t('download_all_students')}</p>
              </button>
              <button className="w-full p-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all text-left group">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">{t('reports')}</p>
                <p className="text-sm font-bold group-hover:translate-x-1 transition-transform">{t('generate_enrollment_report')}</p>
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-100">
            <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-emerald-500" />
              {t('statistics')}
            </h3>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500 font-medium">{t('international')}</span>
                <span className="text-lg font-black text-zinc-900">{students.filter(s => s.isInternational).length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500 font-medium">{t('assigned_projects')}</span>
                <span className="text-lg font-black text-zinc-900">{students.filter(s => s.projectId).length}</span>
              </div>
              <div className="pt-4 border-t border-zinc-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('completion_rate')}</span>
                  <span className="text-xs font-bold text-emerald-600">
                    {Math.round((students.filter(s => s.projectId).length / (students.length || 1)) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${(students.filter(s => s.projectId).length / (students.length || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight">{t('add_new_student')}</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-all">
                <Plus size={24} className="rotate-45 text-zinc-400" />
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('full_name')}</label>
                <input
                  type="text"
                  required
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  className="w-full px-5 py-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                  placeholder={t('john_doe_example')}
                />
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('registration_number')}</label>
                  <input
                    type="text"
                    required
                    value={newStudent.registrationNumber}
                    onChange={(e) => setNewStudent({ ...newStudent, registrationNumber: e.target.value })}
                    className="w-full px-5 py-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                    placeholder={t('student_id_example')}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('level')}</label>
                  <select
                    required
                    value={newStudent.levelId}
                    onChange={(e) => {
                      const selectedLevel = levels.find(l => l.id === e.target.value);
                      setNewStudent({ 
                        ...newStudent, 
                        levelId: e.target.value,
                        specialtyId: selectedLevel?.specialtyId || ''
                      });
                    }}
                    className="w-full px-5 py-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                  >
                    <option value="">{t('select_level')}</option>
                    {levels
                      .filter(l => !isSpecialtyManager || l.specialtyId === user?.managedSpecialtyId)
                      .map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({specialties.find(s => s.id === l.specialtyId)?.name})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('specialty')}</label>
                  <select
                    required
                    disabled
                    value={newStudent.specialtyId}
                    className="w-full px-5 py-4 rounded-2xl bg-zinc-100 border-none focus:ring-0 outline-none font-bold transition-all opacity-70"
                  >
                    <option value="">{t('select_specialty')}</option>
                    {specialties.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-2xl cursor-pointer hover:bg-zinc-100 transition-all">
                <input
                  type="checkbox"
                  id="isInternational"
                  checked={newStudent.isInternational}
                  onChange={(e) => setNewStudent({ ...newStudent, isInternational: e.target.checked })}
                  className="w-5 h-5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="isInternational" className="text-sm font-bold text-zinc-700 cursor-pointer">{t('international_student')}</label>
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                >
                  {t('add_student')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && deleteStudent(deleteConfirm)}
      />
    </div>
  );
}
