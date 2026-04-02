import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { Specialty, Level, Module } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Book, Layers, Trash2, Database, BookOpen, RotateCcw, AlertCircle, Edit2 } from 'lucide-react';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { INITIAL_SPECIALTIES } from '../constants/initialData';
import { seedDatabase } from '../services/seedData';

export function SpecialtyManagement() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddLevel, setShowAddLevel] = useState<string | null>(null);
  const [showAddModule, setShowAddModule] = useState<{ specialtyId: string; levelId: string } | null>(null);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteArabicConfirm, setShowDeleteArabicConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'specialty' | 'level' | 'module', id: string, name: string } | null>(null);

  const fetchData = async () => {
    const s = await dbService.getCollection<Specialty>('specialties');
    const l = await dbService.getCollection<Level>('levels');
    const m = await dbService.getCollection<Module>('modules');
    setSpecialties(s);
    setLevels(l);
    setModules(m);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddLevel = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showAddLevel) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const studentCount = Number(formData.get('studentCount')) || 0;

    // Duplicate check
    const exists = levels.some(l => l.specialtyId === showAddLevel && l.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      toast.error(t('level_exists_error'));
      return;
    }

    await dbService.addDocument('levels', {
      name,
      specialtyId: showAddLevel,
      studentCount
    });
    setShowAddLevel(null);
    fetchData();
    toast.success(t('level_added_success'));
  };

  const handleAddModule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showAddModule) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const semester = formData.get('semester') as string;

    // Duplicate check
    const exists = modules.some(m => m.levelId === showAddModule.levelId && m.name.toLowerCase() === name.toLowerCase() && m.semester === semester);
    if (exists) {
      toast.error(t('module_exists_error'));
      return;
    }

    await dbService.addDocument('modules', {
      name,
      levelId: showAddModule.levelId,
      specialtyId: showAddModule.specialtyId,
      semester
    });
    setShowAddModule(null);
    fetchData();
    toast.success(t('module_added_success'));
  };

  const handleEditModule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingModule) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const semester = formData.get('semester') as string;

    await dbService.updateDocument('modules', editingModule.id, {
      name,
      semester
    });
    setEditingModule(null);
    fetchData();
    toast.success(t('module_updated_success'));
  };

  const handleBulkImport = async () => {
    setIsImporting(true);
    try {
      // Get current data to check for duplicates
      const currentSpecialties = await dbService.getCollection<Specialty>('specialties');
      const currentLevels = await dbService.getCollection<Level>('levels');

      for (const item of INITIAL_SPECIALTIES) {
        // Check if specialty already exists
        let specialty = currentSpecialties.find(s => 
          s.name.toLowerCase() === item.name.toLowerCase() && 
          s.levelType === item.levelType
        );

        let specialtyId: string;
        if (!specialty) {
          // Add Specialty
          const docRef = await dbService.addDocument('specialties', {
            name: item.name,
            levelType: item.levelType,
            field: item.field
          });
          specialtyId = docRef?.id || '';
        } else {
          specialtyId = specialty.id;
        }

        // Add Levels
        for (const year of item.years) {
          const levelExists = currentLevels.some(l => 
            l.specialtyId === specialtyId && 
            l.name.toLowerCase() === year.toLowerCase()
          );

          if (!levelExists) {
            await dbService.addDocument('levels', {
              name: year,
              specialtyId: specialtyId
            });
          }
        }
      }
      
      // Refresh data
      await fetchData();
      toast.success(t('import_completed_skip_duplicates'));
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t('import_failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleResetDatabase = async () => {
    setShowResetConfirm(false);
    const loadingToast = toast.loading(t('resetting_database'));
    setIsImporting(true);
    try {
      await seedDatabase();
      await fetchData();
      toast.success(t('database_reset_success'), { id: loadingToast });
    } catch (error) {
      console.error('Reset failed:', error);
      toast.error(t('reset_failed'), { id: loadingToast });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteArabicData = async () => {
    setShowDeleteArabicConfirm(false);
    const loadingToast = toast.loading(t('deleting_arabic_data'));
    try {
      const arabicSpecialties = specialties.filter(s => /[\u0600-\u06FF]/.test(s.name));
      const arabicLevels = levels.filter(l => /[\u0600-\u06FF]/.test(l.name));

      for (const s of arabicSpecialties) {
        const sLevels = levels.filter(l => l.specialtyId === s.id);
        for (const l of sLevels) {
          const lModules = modules.filter(m => m.levelId === l.id);
          for (const m of lModules) {
            await dbService.deleteDocument('modules', m.id);
          }
          await dbService.deleteDocument('levels', l.id);
        }
        await dbService.deleteDocument('specialties', s.id);
      }

      for (const l of arabicLevels) {
        const currentLevels = await dbService.getCollection<Level>('levels');
        if (currentLevels.some(el => el.id === l.id)) {
          const lModules = modules.filter(m => m.levelId === l.id);
          for (const m of lModules) {
            await dbService.deleteDocument('modules', m.id);
          }
          await dbService.deleteDocument('levels', l.id);
        }
      }

      await fetchData();
      toast.success(t('arabic_data_deleted_success'), { id: loadingToast });
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error(t('delete_failed'), { id: loadingToast });
    }
  };

  const handleAddSpecialty = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const field = formData.get('field') as string;
    const levelType = formData.get('levelType') as 'license' | 'master' | 'engineers';

    // Duplicate check
    const exists = specialties.some(s => s.name.toLowerCase() === name.toLowerCase() && s.levelType === levelType);
    if (exists) {
      toast.error(t('specialty_exists_error'));
      return;
    }

    await dbService.addDocument('specialties', { name, field, levelType });
    const s = await dbService.getCollection<Specialty>('specialties');
    setSpecialties(s);
    setShowAdd(false);
    toast.success(t('specialty_added_success'));
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    const loadingToast = toast.loading(`${t('deleting')} ${type}...`);
    
    try {
      if (type === 'specialty') {
        // Delete associated levels and modules first
        const specialtyLevels = levels.filter(l => l.specialtyId === id);
        for (const level of specialtyLevels) {
          const levelModules = modules.filter(m => m.levelId === level.id);
          for (const module of levelModules) {
            await dbService.deleteDocument('modules', module.id);
          }
          await dbService.deleteDocument('levels', level.id);
        }
        await dbService.deleteDocument('specialties', id);
      } else if (type === 'level') {
        // Delete associated modules first
        const levelModules = modules.filter(m => m.levelId === id);
        for (const module of levelModules) {
          await dbService.deleteDocument('modules', module.id);
        }
        await dbService.deleteDocument('levels', id);
      } else if (type === 'module') {
        await dbService.deleteDocument('modules', id);
      }
      
      await fetchData();
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} ${t('deleted_successfully')}`, { id: loadingToast });
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error(t('delete_failed') || 'Delete failed.', { id: loadingToast });
    } finally {
      setDeleteConfirm(null);
    }
  };

  const hasArabicLevels = levels.some(l => /[\u0600-\u06FF]/.test(l.name));

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      {isAdmin && hasArabicLevels && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-800">
            <AlertCircle className="shrink-0" />
            <p className="text-sm font-medium">
              {t('arabic_levels_warning')}
            </p>
          </div>
          <button
            onClick={() => setShowDeleteArabicConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all whitespace-nowrap"
          >
            {t('delete_arabic_data')}
          </button>
        </div>
      )}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-zinc-900">{t('specialties')}</h2>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={isImporting}
              className="px-6 py-3 bg-red-50 border border-red-200 text-red-600 rounded-2xl font-semibold hover:bg-red-100 transition-all flex items-center gap-2 disabled:opacity-50"
              title={t('reset_to_english_title')}
            >
              <RotateCcw size={20} /> {t('reset_to_english')}
            </button>
            <button
              onClick={handleBulkImport}
              disabled={isImporting}
              className="px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-semibold hover:bg-zinc-50 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Database size={20} /> {isImporting ? t('importing') : t('bulk_import')}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-6 py-3 bg-zinc-900 text-white rounded-2xl font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2"
            >
              <Plus size={20} /> {t('add_specialty')}
            </button>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('add_specialty')}</h3>
            <form onSubmit={handleAddSpecialty} className="space-y-4">
              <input name="name" placeholder={t('specialty_name')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              <input name="field" placeholder={t('field_placeholder')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              <select name="levelType" className="w-full p-3 rounded-xl border border-zinc-200">
                <option value="license">{t('license')}</option>
                <option value="master">{t('master')}</option>
                <option value="engineers">{t('engineers')}</option>
              </select>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">{t('cancel')}</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">{t('add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-12">
        {Object.entries(
          specialties.reduce((acc, s) => {
            const field = s.field || 'Other';
            if (!acc[field]) acc[field] = [];
            acc[field].push(s);
            return acc;
          }, {} as Record<string, Specialty[]>)
        ).map(([field, fieldSpecialties]) => (
          <div key={field} className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-zinc-800 uppercase tracking-wider px-4 py-1 bg-zinc-100 rounded-lg border border-zinc-200">
                {field}
              </h3>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {fieldSpecialties
                .sort((a, b) => {
                  // Sort by phase: license, then master, then engineers
                  if (a.levelType !== b.levelType) {
                    const order = { 'license': 0, 'master': 1, 'engineers': 2 };
                    return order[a.levelType] - order[b.levelType];
                  }
                  return a.name.localeCompare(b.name);
                })
                .map((specialty) => (
                  <div key={specialty.id} className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                          <Book size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-lg text-zinc-900">{specialty.name}</h4>
                          <span className="text-xs font-bold uppercase text-zinc-400">{specialty.levelType}</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <button 
                          onClick={() => setDeleteConfirm({ type: 'specialty', id: specialty.id, name: specialty.name })}
                          className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h5 className="text-sm font-bold text-zinc-700 flex items-center gap-2">
                        <Layers size={16} /> {t('levels')}
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {levels
                          .filter(l => l.specialtyId === specialty.id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(level => (
                            <div key={level.id} className="w-full space-y-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-zinc-700 text-sm">
                                  {level.name}
                                  {level.studentCount && (
                                    <span className="ml-2 text-[10px] text-zinc-400 font-normal">
                                      ({level.studentCount} {t('students')})
                                    </span>
                                  )}
                                </span>
                                {isAdmin && (
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => setShowAddModule({ specialtyId: specialty.id, levelId: level.id })}
                                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider"
                                    >
                                      + {t('add_module')}
                                    </button>
                                    <button 
                                      onClick={() => setDeleteConfirm({ type: 'level', id: level.id, name: level.name })}
                                      className="p-1 text-zinc-300 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                                <div className="flex flex-wrap gap-1">
                                  {['S1', 'S2'].map(sem => (
                                    <div key={sem} className="w-full space-y-1 mt-2">
                                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{sem === 'S1' ? t('semester_1') : t('semester_2')}</div>
                                      <div className="flex flex-wrap gap-1">
                                        {modules
                                          .filter(m => m.levelId === level.id && m.semester === sem)
                                          .map(module => (
                                            <span key={module.id} className="px-2 py-0.5 bg-white text-zinc-500 text-[10px] rounded border border-zinc-100 flex items-center gap-1 group relative">
                                              <BookOpen size={10} /> {module.name}
                                              {isAdmin && (
                                                <div className="flex items-center gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button 
                                                    onClick={() => setEditingModule(module)}
                                                    className="text-zinc-300 hover:text-indigo-500 transition-colors"
                                                  >
                                                    <Edit2 size={10} />
                                                  </button>
                                                  <button 
                                                    onClick={() => setDeleteConfirm({ type: 'module', id: module.id, name: module.name })}
                                                    className="text-zinc-300 hover:text-red-500 transition-colors"
                                                  >
                                                    <Trash2 size={10} />
                                                  </button>
                                                </div>
                                              )}
                                            </span>
                                          ))}
                                        {modules.filter(m => m.levelId === level.id && m.semester === sem).length === 0 && (
                                          <span className="text-[10px] text-zinc-400 italic">No modules</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                            </div>
                          ))}
                        {isAdmin && (
                          <button 
                            onClick={() => setShowAddLevel(specialty.id)}
                            className="w-full py-2 border border-dashed border-zinc-300 text-zinc-400 text-sm rounded-xl hover:border-emerald-500 hover:text-emerald-500 transition-all"
                          >
                            + {t('add_level')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6">
              <RotateCcw size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">{t('reset_database_confirm_title')}</h3>
            <p className="text-zinc-500 mb-8">
              {t('reset_database_confirm_desc')}
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowResetConfirm(false)} 
                className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold hover:bg-zinc-50 transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleResetDatabase} 
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                {t('yes_reset')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteArabicConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">{t('confirm_delete_arabic_data_title')}</h3>
            <p className="text-zinc-500 mb-8">
              {t('confirm_delete_arabic_data_desc')}
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowDeleteArabicConfirm(false)} 
                className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold hover:bg-zinc-50 transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleDeleteArabicData} 
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddLevel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('add_level')}</h3>
            <form onSubmit={handleAddLevel} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('level_name')}</label>
                <input name="name" placeholder="e.g. L1, M2, 2nd Year" className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('student_count')}</label>
                <input name="studentCount" type="number" placeholder="e.g. 45" className="w-full p-3 rounded-xl border border-zinc-200" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddLevel(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">{t('cancel')}</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">{t('add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('add_module')}</h3>
            <form onSubmit={handleAddModule} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('module_name')}</label>
                <input name="name" placeholder="e.g. Mathematics, Thermodynamics" className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('semester')}</label>
                <select name="semester" className="w-full p-3 rounded-xl border border-zinc-200" required>
                  <option value="S1">{t('semester_1')}</option>
                  <option value="S2">{t('semester_2')}</option>
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddModule(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">{t('cancel')}</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">{t('add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingModule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('edit_module')}</h3>
            <form onSubmit={handleEditModule} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('module_name')}</label>
                <input name="name" defaultValue={editingModule.name} placeholder="e.g. Mathematics, Thermodynamics" className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('semester')}</label>
                <select name="semester" defaultValue={editingModule.semester} className="w-full p-3 rounded-xl border border-zinc-200" required>
                  <option value="S1">{t('semester_1')}</option>
                  <option value="S2">{t('semester_2')}</option>
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingModule(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">{t('cancel')}</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title={t('confirm_delete')}
        message={`${t('confirm_delete_desc_1')} ${deleteConfirm?.type} "${deleteConfirm?.name}"? ${deleteConfirm?.type !== 'module' ? t('confirm_delete_desc_2') : ''} ${t('action_cannot_be_undone')}`}
      />
    </div>
  );
}
