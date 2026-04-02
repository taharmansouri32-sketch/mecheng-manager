import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { Calendar as CalendarType, Session, Specialty, Level, User, Holiday, Schedule } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import toast from 'react-hot-toast';
import { format, eachDayOfInterval, isSameDay, getDay, addDays, parseISO } from 'date-fns';
import { Plus, Trash2, Calendar as CalendarIcon, Loader2, X } from 'lucide-react';

export function CalendarManagement() {
  const { t, language, academicYear, isRTL } = useLanguage();
  const [calendar, setCalendar] = useState<CalendarType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showAddHoliday, setShowAddHoliday] = useState(false);

  useEffect(() => {
    const fetchCalendar = async () => {
      const data = await dbService.getCollection<CalendarType>('calendars');
      if (data.length > 0) setCalendar(data[0]);
      setLoading(false);
    };
    fetchCalendar();
  }, []);

  const handleSaveCalendar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newCalendar: Partial<CalendarType> = {
      semester1Start: formData.get('s1start') as string,
      semester1End: formData.get('s1end') as string,
      semester2Start: formData.get('s2start') as string,
      semester2End: formData.get('s2end') as string,
      holidays: calendar?.holidays || [],
      excludedDays: calendar?.excludedDays || [],
    };

    if (calendar?.id) {
      await dbService.updateDocument('calendars', calendar.id, newCalendar);
    } else {
      await dbService.addDocument('calendars', newCalendar);
    }
    toast.success(t('success'));
    
    const data = await dbService.getCollection<CalendarType>('calendars');
    setCalendar(data[0]);
  };

  const addHoliday = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const holiday: Holiday = {
      id: crypto.randomUUID(),
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string || undefined,
      name: t(formData.get('type') as string),
      type: formData.get('type') as any,
      notes: formData.get('notes') as string,
    };

    if (calendar) {
      const updatedHolidays = [...calendar.holidays, holiday];
      setCalendar({ ...calendar, holidays: updatedHolidays });
      dbService.updateDocument('calendars', calendar.id, { holidays: updatedHolidays });
    }
    setShowAddHoliday(false);
  };

  const removeHoliday = (index: number) => {
    if (calendar) {
      const updatedHolidays = calendar.holidays.filter((_, i) => i !== index);
      setCalendar({ ...calendar, holidays: updatedHolidays });
      dbService.updateDocument('calendars', calendar.id, { holidays: updatedHolidays });
    }
  };

  const toggleExcludedDay = (dateStr: string) => {
    if (calendar) {
      const excluded = calendar.excludedDays || [];
      const updated = excluded.includes(dateStr)
        ? excluded.filter(d => d !== dateStr)
        : [...excluded, dateStr];
      setCalendar({ ...calendar, excludedDays: updated });
      dbService.updateDocument('calendars', calendar.id, { excludedDays: updated });
    }
  };

  const generateSessions = async () => {
    if (!calendar) return;
    setGenerating(true);
    
    try {
      const schedules = await dbService.getCollection<Schedule>('schedules');
      const semesterSchedules = schedules.filter(s => s.type === 'semester' && s.academicYear === academicYear);
      
      if (semesterSchedules.length === 0) {
        toast.error(t('import_schedule_first'));
        return;
      }

      const start1 = parseISO(calendar.semester1Start);
      const end1 = parseISO(calendar.semester1End);
      const start2 = parseISO(calendar.semester2Start);
      const end2 = parseISO(calendar.semester2End);
      
      const interval1 = eachDayOfInterval({ start: start1, end: end1 });
      const interval2 = eachDayOfInterval({ start: start2, end: end2 });
      
      const holidayRanges = calendar.holidays.map(h => ({
        start: parseISO(h.startDate),
        end: h.endDate ? parseISO(h.endDate) : parseISO(h.startDate)
      }));
      const excluded = calendar.excludedDays.map(e => parseISO(e));

      const dayMap: { [key: string]: number } = {
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6,
        'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6,
        'الاحد': 0, 'الإثنين': 1, 'الاربعاء': 3 // Un-duplicated variants
      };

      let count = 0;
      for (const day of [...interval1, ...interval2]) {
        const isHoliday = holidayRanges.some(range => 
          (day >= range.start && day <= range.end)
        );
        if (isHoliday || excluded.some(e => isSameDay(e, day))) continue;
        
        const dayOfWeek = getDay(day);
        const isS1 = day >= start1 && day <= end1;
        
        for (const schedule of semesterSchedules) {
          const daySessions = schedule.data.filter((s: any) => {
            const entryDay = (s.day || '').trim().toLowerCase();
            const semesterMatches = isS1 ? s.semester === 'S1' : s.semester === 'S2';
            return dayMap[entryDay] === dayOfWeek && semesterMatches;
          });

          for (const s of daySessions) {
            if (!s.subject) continue;

            const sessionData: Partial<Session> = {
              teacherId: s.teacherId || 'unknown',
              module: s.subject,
              specialtyId: s.specialty,
              levelId: s.level,
              group: s.branch || '',
              day: s.day,
              time: s.session || `${s.startTime} - ${s.endTime}`,
              room: s.room,
              type: s.type,
              date: format(day, 'yyyy-MM-dd'),
              status: 'pending',
              academicYear: s.academicYear || academicYear
            };
            await dbService.addDocument('sessions', sessionData);
            count++;
          }
        }
      }
      
      if (count === 0) {
        toast.error(isRTL ? 'لم يتم العثور على أي حصص لتوليدها. تأكد من أن السداسيات في الجدول مطابقة لتواريخ التقويم.' : 'No sessions were found to generate. Make sure semester labels in the schedule match the calendar dates.');
      } else {
        toast.success(t('sessions_generated_success') + ` (${count})`);
      }
    } catch (error) {
      console.error(error);
      toast.error(t('error_generating_sessions'));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <CalendarIcon className="text-emerald-500" />
          {t('calendar_setup')}
        </h3>
        
        <form onSubmit={handleSaveCalendar} className="space-y-8">
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{t('semester1')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('semester_start')}</label>
                <input 
                  type="date" 
                  name="s1start" 
                  defaultValue={calendar?.semester1Start}
                  className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('semester_end')}</label>
                <input 
                  type="date" 
                  name="s1end" 
                  defaultValue={calendar?.semester1End}
                  className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none" 
                  required 
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{t('semester2')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('semester_start')}</label>
                <input 
                  type="date" 
                  name="s2start" 
                  defaultValue={calendar?.semester2Start}
                  className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('semester_end')}</label>
                <input 
                  type="date" 
                  name="s2end" 
                  defaultValue={calendar?.semester2End}
                  className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none" 
                  required 
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-zinc-700">{t('holidays')}</label>
              <button 
                type="button"
                onClick={() => setShowAddHoliday(true)}
                className="text-emerald-600 text-sm font-bold flex items-center gap-1"
              >
                <Plus size={16} /> {t('add_holiday')}
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {calendar?.holidays.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div>
                    <div className="font-bold text-sm">{h.name}</div>
                    <div className="text-xs text-zinc-500">
                      {h.startDate} {h.endDate ? `-> ${h.endDate}` : ''} ({t(h.type)})
                    </div>
                    {h.notes && <div className="text-[10px] text-zinc-400 italic">{h.notes}</div>}
                  </div>
                  <button onClick={() => removeHoliday(i)} className="text-red-500 hover:bg-red-50 p-1 rounded-lg">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-sm font-medium text-zinc-700">{t('excluded_days')}</label>
            <div className="flex flex-wrap gap-2">
              {calendar?.excludedDays.map((d, i) => (
                <span key={i} className="px-3 py-1 bg-zinc-100 text-zinc-700 rounded-full text-xs font-bold flex items-center gap-2">
                  {d}
                  <button onClick={() => toggleExcludedDay(d)} className="hover:text-red-500">
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input 
                type="date" 
                onChange={(e) => {
                  if (e.target.value) {
                    toggleExcludedDay(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="px-3 py-1 border border-zinc-200 rounded-full text-xs outline-none"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-semibold hover:bg-zinc-800 transition-all"
          >
            {t('save_calendar')}
          </button>
        </form>
      </div>

      {showAddHoliday && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('add_holiday')}</h3>
            <form onSubmit={addHoliday} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 px-1">From</label>
                  <input name="startDate" type="date" className="w-full p-3 rounded-xl border border-zinc-200" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 px-1">To (Optional)</label>
                  <input name="endDate" type="date" className="w-full p-3 rounded-xl border border-zinc-200" />
                </div>
              </div>
              <select name="type" className="w-full p-3 rounded-xl border border-zinc-200">
                <option value="national">{t('national')}</option>
                <option value="religious">{t('religious')}</option>
                <option value="break">{t('break')}</option>
                <option value="pedagogical">{t('pedagogical')}</option>
                <option value="exam">{t('exam')}</option>
                <option value="internship_period">{t('internship_period')}</option>
                <option value="exceptional">{t('exceptional')}</option>
                <option value="other">{t('other_holiday')}</option>
              </select>
              <input name="notes" placeholder="Notes (Optional)" className="w-full p-3 rounded-xl border border-zinc-200" />
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddHoliday(false)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {calendar && (
        <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100 text-center">
          <h3 className="text-xl font-bold text-emerald-900 mb-4">{t('generate_sessions_title')}</h3>
          <p className="text-emerald-700 mb-6">{t('generate_sessions_desc')}</p>
          <button
            onClick={generateSessions}
            disabled={generating}
            className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            {generating ? <Loader2 className="animate-spin" /> : <Plus size={20} />}
            {t('generate_sessions_btn')}
          </button>
        </div>
      )}
    </div>
  );
}
