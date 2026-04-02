import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { Session, SessionStatus, SessionProblem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { format } from 'date-fns';
import { Check, X, AlertCircle, Info, Search, Briefcase, HeartPulse, Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { where } from 'firebase/firestore';
import { Specialty, Level, Calendar } from '../types';
import { ConfirmationModal } from '../components/ConfirmationModal';
import toast from 'react-hot-toast';

export function SessionTracking() {
  const { user, isAdmin, isSpecialtyManager } = useAuth();
  const { t, isRTL, academicYear } = useLanguage();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showProblemModal, setShowProblemModal] = useState<string | null>(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [sData, lData, cData] = await Promise.all([
        dbService.getCollection<Specialty>('specialties'),
        dbService.getCollection<Level>('levels'),
        dbService.getCollection<Calendar>('calendars')
      ]);
      setSpecialties(sData);
      setLevels(lData);
      if (cData.length > 0) setCalendar(cData[0]);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    let constraints: any[] = [];
    if (isAdmin) {
      constraints = [];
    } else if (isSpecialtyManager && user.managedSpecialtyId) {
      constraints = [where('specialtyId', '==', user.managedSpecialtyId)];
    } else {
      constraints = [where('teacherId', '==', user.uid)];
    }

    const unsubscribe = dbService.subscribeToCollection<Session>('sessions', constraints, (data) => {
      const sorted = data.sort((a, b) => {
        // Sort by Date Descending
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;

        // Then by Phase -> Level -> Specialty
        const specA = specialties.find(s => s.id === a.specialtyId);
        const specB = specialties.find(s => s.id === b.specialtyId);
        
        if (specA && specB && specA.levelType !== specB.levelType) {
          const order = { 'license': 0, 'master': 1, 'engineers': 2 };
          return order[specA.levelType] - order[specB.levelType];
        }

        return 0;
      });
      setSessions(sorted);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isAdmin, isSpecialtyManager]);

  const [showStatusMenu, setShowStatusMenu] = useState<string | null>(null);

  const updateStatus = async (sessionId: string, status: SessionStatus, problemType?: SessionProblem, notes?: string) => {
    const updateData: any = { status };
    if (problemType !== undefined) updateData.problemType = problemType;
    if (notes !== undefined) updateData.notes = notes;
    
    await dbService.updateDocument('sessions', sessionId, updateData);
    
    // If internship, create compensation opportunity
    if (status === 'internship') {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        await dbService.addDocument('compensations', {
          sessionId,
          status: 'available',
          date: session.date,
          time: session.time,
          room: session.room,
          originalTeacherId: session.teacherId
        });
      }
    }
    
    setShowProblemModal(null);
    setShowStatusMenu(null);
  };

  const problemTypes: SessionProblem[] = [
    'group_absence', 'majority_absence', 'lack_of_means', 'room_problem', 
    'student_delay', 'teacher_delay', 'organizational', 'other_session'
  ];

  const handleAddManualSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const moduleName = formData.get('module') as string;
    if (!moduleName) {
      toast.error(t('module_required'));
      return;
    }

    const sessionData: Partial<Session> = {
      teacherId: user?.uid || 'unknown',
      module: moduleName,
      specialtyId: formData.get('specialtyId') as string,
      levelId: formData.get('levelId') as string,
      group: formData.get('group') as string,
      day: format(new Date(formData.get('date') as string), 'EEEE'),
      time: formData.get('time') as string,
      room: formData.get('room') as string,
      type: formData.get('type') as any,
      date: formData.get('date') as string,
      status: 'pending',
      academicYear
    };
    await dbService.addDocument('sessions', sessionData);
    setShowAddManual(false);
  };

  const deleteSession = async (sessionId: string) => {
    await dbService.deleteDocument('sessions', sessionId);
    setDeleteConfirm(null);
  };

  const deleteAllFilteredSessions = async () => {
    const loadingToast = toast.loading(t('deleting') || 'Deleting...');
    try {
      for (const session of filteredSessions) {
        await dbService.deleteDocument('sessions', session.id);
      }
      toast.success(t('success'));
    } catch (error) {
      toast.error(t('error_occurred'));
    } finally {
      toast.dismiss(loadingToast);
      setDeleteAllConfirm(false);
    }
  };

  const filteredSessions = sessions.filter(s => {
    const matchesSearch = s.module.toLowerCase().includes(filter.toLowerCase()) || s.date.includes(filter);
    const matchesYear = s.academicYear === academicYear;

    if (!matchesYear) return false;
    if (!matchesSearch) return false;

    if (!calendar) return true;
    const date = new Date(s.date);
    if (selectedSemester === 1) {
      return date >= new Date(calendar.semester1Start) && date <= new Date(calendar.semester1End);
    } else {
      return date >= new Date(calendar.semester2Start) && date <= new Date(calendar.semester2End);
    }
  });

  // Group sessions by module
  const moduleGroups = filteredSessions.reduce((acc, session) => {
    if (!acc[session.module]) {
      acc[session.module] = [];
    }
    acc[session.module].push(session);
    return acc;
  }, {} as Record<string, Session[]>);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-zinc-900">{t('taught_sessions')}</h2>
          <p className="text-sm text-zinc-500 font-medium">
            {t('semester')} {selectedSemester} - {academicYear}
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder={t('search_sessions')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="flex bg-zinc-100 p-1 rounded-xl">
            <button
              onClick={() => setSelectedSemester(1)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                selectedSemester === 1 ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              {t('semester')} 1
            </button>
            <button
              onClick={() => setSelectedSemester(2)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                selectedSemester === 2 ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              {t('semester')} 2
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(isAdmin || isSpecialtyManager) && filteredSessions.length > 0 && (
            <button 
              onClick={() => setDeleteAllConfirm(true)}
              className="px-4 py-3 bg-red-50 text-red-600 rounded-2xl font-semibold flex items-center gap-2 hover:bg-red-100 transition-all"
              title={t('delete_all') || 'Delete All'}
            >
              <Trash2 size={20} />
              <span className="hidden md:inline">{t('delete_all') || 'Delete All'}</span>
            </button>
          )}
          <button 
            onClick={() => setShowAddManual(true)}
            className="px-6 py-3 bg-zinc-900 text-white rounded-2xl font-semibold flex items-center gap-2 hover:bg-zinc-800 transition-all"
          >
            <Plus size={20} /> {t('add_session')}
          </button>
        </div>
      </div>

      {showAddManual && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-6">{t('add_session')}</h3>
            <form onSubmit={handleAddManualSession} className="space-y-4">
              <input name="module" placeholder={t('module')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              <div className="grid grid-cols-2 gap-4">
                <select name="specialtyId" className="w-full p-3 rounded-xl border border-zinc-200" required>
                  <option value="">{t('specialty')}</option>
                  {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select name="levelId" className="w-full p-3 rounded-xl border border-zinc-200" required>
                  <option value="">{t('level')}</option>
                  {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input name="date" type="date" className="w-full p-3 rounded-xl border border-zinc-200" required />
                <input name="time" placeholder="08:00-09:30" className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input name="room" placeholder={t('room')} className="w-full p-3 rounded-xl border border-zinc-200" required />
                <input name="group" placeholder={t('group')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <select name="type" className="w-full p-3 rounded-xl border border-zinc-200">
                <option value="Course">Course</option>
                <option value="TD">TD</option>
                <option value="TP">TP</option>
              </select>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddManual(false)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProblemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('problem')}</h3>
            <div className="grid grid-cols-1 gap-2">
              {problemTypes.map(type => (
                <button
                  key={type}
                  onClick={() => updateStatus(showProblemModal, 'problem', type)}
                  className="w-full p-3 text-right rounded-xl hover:bg-zinc-50 border border-zinc-100 transition-all font-medium"
                >
                  {t(type)}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setShowProblemModal(null)}
              className="w-full mt-4 py-3 text-zinc-500 font-semibold"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {showStatusMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-center">{t('select_status') || 'Select Status'}</h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => updateStatus(showStatusMenu, 'taught')}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100 transition-all"
              >
                <Check size={20} /> {t('taught')}
              </button>
              <button
                onClick={() => updateStatus(showStatusMenu, 'missed')}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-700 font-semibold border border-red-100 transition-all"
              >
                <X size={20} /> {t('missed')}
              </button>
              <button
                onClick={() => {
                  setShowProblemModal(showStatusMenu);
                  setShowStatusMenu(null);
                }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-amber-50 text-amber-700 font-semibold border border-amber-100 transition-all"
              >
                <AlertCircle size={20} /> {t('problem')}
              </button>
              <button
                onClick={() => updateStatus(showStatusMenu, 'internship')}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 transition-all"
              >
                <Briefcase size={20} /> {t('internship')}
              </button>
              <button
                onClick={() => updateStatus(showStatusMenu, 'sick')}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-pink-50 text-pink-700 font-semibold border border-pink-100 transition-all"
              >
                <HeartPulse size={20} /> {t('sick')}
              </button>
              <button
                onClick={() => updateStatus(showStatusMenu, 'pending')}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 text-zinc-500 font-semibold border border-zinc-100 transition-all"
              >
                <div className="w-5 h-5 rounded-full border-2 border-zinc-300" /> {t('pending')}
              </button>
              {(isAdmin || isSpecialtyManager) && (
                <button
                  onClick={() => {
                    setDeleteConfirm(showStatusMenu);
                    setShowStatusMenu(null);
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-600 font-semibold border border-red-100 transition-all mt-2"
                >
                  <Trash2 size={20} /> {t('delete') || 'Delete'}
                </button>
              )}
            </div>
            <button 
              onClick={() => setShowStatusMenu(null)}
              className="w-full mt-4 py-2 text-zinc-400 font-bold"
            >
              {t('cancel') || 'Cancel'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(moduleGroups).map(([moduleName, moduleSessions]) => {
          // Group by definition within module
          const groupedByDef = moduleSessions.reduce((acc, session) => {
            const key = `${session.group}-${session.type}-${session.time}-${session.room}`;
            if (!acc[key]) {
              acc[key] = {
                info: {
                  group: session.group,
                  type: session.type,
                  time: session.time,
                  room: session.room,
                },
                occurrences: []
              };
            }
            acc[key].occurrences.push(session);
            return acc;
          }, {} as Record<string, { info: any, occurrences: Session[] }>);

          const moduleDates = Array.from(new Set(moduleSessions.map(s => s.date))).sort();

          return (
            <div key={moduleName} className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900">{moduleName}</h3>
                <span className="text-xs font-medium text-zinc-500 px-2 py-1 bg-white rounded-lg border border-zinc-200">
                  {moduleSessions.length} {t('sessions')}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/30">
                      <th className="p-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider min-w-[150px] sticky right-0 bg-white z-10 border-l border-zinc-100">
                        {t('group')} / {t('type')}
                      </th>
                      {moduleDates.map(date => (
                        <th key={date} className="p-4 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider min-w-[100px] border-l border-zinc-100">
                          {format(new Date(date), 'dd/MM')}
                          <div className="text-[10px] font-normal text-zinc-400">{format(new Date(date), 'EEEE')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(groupedByDef).map((group, idx) => (
                      <tr key={idx} className="border-t border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                        <td className="p-4 sticky right-0 bg-white z-10 border-l border-zinc-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] font-bold rounded uppercase">
                                {group.info.type}
                              </span>
                              <span className="font-bold text-zinc-900 text-sm">{group.info.group}</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 flex flex-wrap gap-x-2">
                              <span>{group.info.time}</span>
                              <span>{group.info.room}</span>
                            </div>
                          </div>
                        </td>
                        {moduleDates.map(date => {
                          const session = group.occurrences.find(o => o.date === date);
                          if (!session) return <td key={date} className="p-4 border-l border-zinc-100 bg-zinc-50/10" />;

                          return (
                            <td key={date} className="p-2 border-l border-zinc-100 text-center">
                              <div className="flex flex-col gap-1 items-center">
                                <button
                                  onClick={() => setShowStatusMenu(session.id)}
                                  className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm",
                                    session.status === 'taught' ? "bg-emerald-600 text-white" :
                                    session.status === 'missed' ? "bg-red-600 text-white" :
                                    session.status === 'problem' ? "bg-amber-600 text-white" :
                                    session.status === 'internship' ? "bg-indigo-600 text-white" :
                                    session.status === 'sick' ? "bg-pink-600 text-white" :
                                    "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                                  )}
                                  title={t(session.status)}
                                >
                                  {session.status === 'taught' && <Check size={16} />}
                                  {session.status === 'missed' && <X size={16} />}
                                  {session.status === 'problem' && <AlertCircle size={16} />}
                                  {session.status === 'internship' && <Briefcase size={16} />}
                                  {session.status === 'sick' && <HeartPulse size={16} />}
                                  {session.status === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />}
                                </button>
                                {session.status === 'problem' && session.problemType && (
                                  <span className="text-[8px] font-bold text-amber-600 truncate max-w-[70px]">
                                    {t(session.problemType)}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {Object.keys(moduleGroups).length === 0 && (
          <div className="bg-white rounded-3xl border border-zinc-100 p-12 text-center">
            <Info className="mx-auto text-zinc-300 mb-2" size={48} />
            <p className="text-zinc-500">{t('no_sessions_found')}</p>
          </div>
        )}
      </div>
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && deleteSession(deleteConfirm)}
      />
      <ConfirmationModal
        isOpen={deleteAllConfirm}
        onClose={() => setDeleteAllConfirm(false)}
        onConfirm={deleteAllFilteredSessions}
        title={t('confirm_delete_all') || 'Delete All Sessions?'}
        message={t('confirm_delete_all_desc') || 'Are you sure you want to delete all filtered sessions? This action cannot be undone.'}
      />
    </div>
  );
}
