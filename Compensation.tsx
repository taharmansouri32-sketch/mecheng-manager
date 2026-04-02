import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { Compensation, Session } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { AlertCircle, Check, Calendar, Clock, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';

export function CompensationPage() {
  const { user, isAdmin } = useAuth();
  const { t, academicYear } = useLanguage();
  const [compensations, setCompensations] = useState<Compensation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = dbService.subscribeToCollection<Compensation>('compensations', [], (data) => {
      setCompensations(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleReserve = async (id: string) => {
    await dbService.updateDocument('compensations', id, {
      status: 'reserved',
      teacherId: user?.uid
    });
  };

  const handleApprove = async (id: string) => {
    await dbService.updateDocument('compensations', id, { status: 'approved' });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-zinc-900">{t('compensation')}</h2>
        <p className="text-zinc-500">{t('compensation_desc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {compensations.filter(c => c.academicYear === academicYear).map((comp) => (
          <div key={comp.id} className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <AlertCircle size={24} />
              </div>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-bold uppercase",
                comp.status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                comp.status === 'reserved' ? "bg-blue-100 text-blue-700" :
                "bg-amber-100 text-amber-700"
              )}>
                {t(comp.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Calendar size={16} className="text-zinc-400" />
                {comp.date}
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Clock size={16} className="text-zinc-400" />
                {comp.time}
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <MapPin size={16} className="text-zinc-400" />
                {comp.room}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-50 flex gap-3">
              {comp.status === 'available' && (
                <button
                  onClick={() => handleReserve(comp.id)}
                  className="flex-1 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all"
                >
                  {t('reserve')}
                </button>
              )}
              {isAdmin && comp.status === 'reserved' && (
                <button
                  onClick={() => handleApprove(comp.id)}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all"
                >
                  {t('approve')}
                </button>
              )}
            </div>
          </div>
        ))}
        {compensations.length === 0 && (
          <div className="col-span-full py-12 text-center text-zinc-400 italic">
            {t('no_compensations_available')}
          </div>
        )}
      </div>
    </div>
  );
}
