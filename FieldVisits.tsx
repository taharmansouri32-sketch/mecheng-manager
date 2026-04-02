import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { FieldVisit, Specialty, Level, Module, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Plus, Calendar as CalendarIcon, Building2, Users, Trash2, Edit2, Check, X, Clock, Search, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

export function FieldVisits() {
  const { user, isAdmin, isSpecialtyManager } = useAuth();
  const { t, academicYear } = useLanguage();
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingVisit, setEditingVisit] = useState<FieldVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [selectedLevelName, setSelectedLevelName] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [supervisors, setSupervisors] = useState<{ id?: string; name: string }[]>([]);
  const [manualTeacherName, setManualTeacherName] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vData, sData, lData, mData, uData] = await Promise.all([
          dbService.getCollection<FieldVisit>('field_visits'),
          dbService.getCollection<Specialty>('specialties'),
          dbService.getCollection<Level>('levels'),
          dbService.getCollection<Module>('modules'),
          dbService.getCollection<User>('users')
        ]);
        setVisits(vData);
        setSpecialties(sData);
        setLevels(lData);
        setModules(mData);
        setTeachers(uData.filter(u => u.role === 'teacher' || u.role === 'specialty_manager' || u.role === 'admin'));
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    const unsubscribe = dbService.subscribeToCollection<FieldVisit>('field_visits', [], (data) => {
      setVisits(data);
    });
    return unsubscribe;
  }, []);

  const filteredSpecialties = specialties.filter(s => 
    levels.some(l => l.specialtyId === s.id && l.name === selectedLevelName)
  );

  const filteredModules = modules.filter(m => {
    const level = levels.find(l => l.id === m.levelId);
    return m.specialtyId === selectedSpecialtyId && level?.name === selectedLevelName;
  });

  const handleAddVisit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedLevelId || !selectedSpecialtyId || !selectedModuleId) {
      toast.error('Please complete all selections');
      return;
    }

    const visitData: Partial<FieldVisit> = {
      teacherId: user?.uid,
      companyName: formData.get('companyName') as string,
      levelId: selectedLevelId,
      specialtyId: selectedSpecialtyId,
      moduleId: selectedModuleId,
      visitDate: formData.get('visitDate') as string,
      studentCount: parseInt(formData.get('studentCount') as string),
      supervisors: supervisors,
      status: 'pending',
      academicYear,
      createdAt: new Date().toISOString()
    };

    if (editingVisit) {
      await dbService.updateDocument('field_visits', editingVisit.id, visitData);
      toast.success('Request updated successfully');
    } else {
      await dbService.addDocument('field_visits', visitData);
      toast.success('Request submitted successfully');
    }

    setShowAdd(false);
    setEditingVisit(null);
    resetForm();
  };

  const handleDeleteVisit = async (id: string) => {
    if (!isAdmin && !isSpecialtyManager) {
      toast.error('Only department heads can delete visits');
      return;
    }
    
    try {
      await dbService.deleteDocument('field_visits', id);
      toast.success('Request deleted');
      setDeletingId(null);
    } catch (error) {
      console.error('Error deleting visit:', error);
      toast.error('Failed to delete request');
    }
  };

  const openEditModal = (visit: FieldVisit) => {
    setEditingVisit(visit);
    const level = levels.find(l => l.id === visit.levelId);
    setSelectedLevelName(level?.name || '');
    setSelectedLevelId(visit.levelId);
    setSelectedSpecialtyId(visit.specialtyId);
    setSelectedModuleId(visit.moduleId);
    setSupervisors(visit.supervisors);
    setShowAdd(true);
  };

  const resetForm = () => {
    setSelectedLevelName('');
    setSelectedLevelId('');
    setSelectedSpecialtyId('');
    setSelectedModuleId('');
    setSupervisors([]);
    setManualTeacherName('');
  };

  const addSupervisor = (teacherId: string) => {
    const teacher = teachers.find(t => t.uid === teacherId);
    if (teacher && !supervisors.some(s => s.id === teacherId)) {
      setSupervisors([...supervisors, { id: teacher.uid, name: teacher.displayName }]);
    }
  };

  const addManualSupervisor = () => {
    if (manualTeacherName.trim()) {
      setSupervisors([...supervisors, { name: manualTeacherName.trim() }]);
      setManualTeacherName('');
    }
  };

  const removeSupervisor = (index: number) => {
    setSupervisors(supervisors.filter((_, i) => i !== index));
  };

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    if (!isAdmin && !isSpecialtyManager) {
      toast.error('Only department heads can update status');
      return;
    }
    const visit = visits.find(v => v.id === id);
    if (!visit) return;

    await dbService.updateDocument('field_visits', id, { status });
    
    // Add in-app notification for the teacher
    if (status === 'approved') {
      await dbService.addDocument('notifications', {
        userId: visit.teacherId,
        title: t('field_visit_approved') || 'Field Visit Approved',
        message: t('field_visit_ready_pickup') || `Your field visit to ${visit.companyName} has been approved. Please visit the administration to pick up the documents.`,
        type: 'info',
        read: false,
        timestamp: new Date().toISOString()
      });

      // Send email notification
      const teacher = teachers.find(t => t.uid === visit.teacherId);
      if (teacher?.email) {
        try {
          await fetch('/api/notifications/send-field-visit-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: teacher.email,
              teacherName: teacher.displayName,
              companyName: visit.companyName
            })
          });
        } catch (error) {
          console.error('Error sending email notification:', error);
        }
      }
    }

    toast.success(`Request ${status}`);
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Pedagogical Field Visits</h2>
          <p className="text-zinc-500">Manage and request pedagogical visits to companies</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
        >
          <Plus size={20} />
          New Request
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {visits.filter(v => isAdmin || isSpecialtyManager || v.teacherId === user?.uid).map((visit) => (
          <div key={visit.id} className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">{visit.companyName}</h3>
                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span className="flex items-center gap-1">
                        <CalendarIcon size={14} />
                        {visit.visitDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {visit.studentCount} Students
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 bg-zinc-50 rounded-xl">
                    <p className="text-zinc-400 text-xs uppercase font-bold mb-1">Level & Specialty</p>
                    <p className="font-medium">
                      {levels.find(l => l.id === visit.levelId)?.name} - {specialties.find(s => s.id === visit.specialtyId)?.name}
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-xl">
                    <p className="text-zinc-400 text-xs uppercase font-bold mb-1">Module</p>
                    <p className="font-medium">{modules.find(m => m.id === visit.moduleId)?.name}</p>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-xl">
                    <p className="text-zinc-400 text-xs uppercase font-bold mb-1">Supervisors</p>
                    <div className="flex flex-wrap gap-1">
                      {visit.supervisors.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white border border-zinc-200 rounded-lg text-xs">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                  visit.status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                  visit.status === 'rejected' ? "bg-red-100 text-red-700" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {visit.status}
                </span>
                
                <div className="flex gap-2">
                  {((visit.status === 'pending' && visit.teacherId === user?.uid) || isAdmin || isSpecialtyManager) && (
                    <button
                      onClick={() => openEditModal(visit)}
                      className="p-2 bg-zinc-50 text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                  )}
                  {(isAdmin || isSpecialtyManager) && (
                    <div className="flex gap-2">
                      {deletingId === visit.id ? (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                          <button
                            onClick={() => handleDeleteVisit(visit.id)}
                            className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-3 py-1 bg-zinc-200 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(visit.id)}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  )}
                  {(isAdmin || isSpecialtyManager) && visit.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(visit.id, 'approved')}
                        className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                        title="Approve"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => updateStatus(visit.id, 'rejected')}
                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="Reject"
                      >
                        <X size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {visits.length === 0 && (
          <div className="text-center py-12 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
            <Building2 className="mx-auto text-zinc-300 mb-4" size={48} />
            <p className="text-zinc-500">No field visit requests found</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center">
                  {editingVisit ? <Edit2 size={20} /> : <Plus size={20} />}
                </div>
                <h3 className="text-2xl font-black text-zinc-900">{editingVisit ? 'Edit Field Visit' : 'Request Field Visit'}</h3>
              </div>
              <button onClick={() => { setShowAdd(false); setEditingVisit(null); resetForm(); }} className="p-2 hover:bg-white rounded-xl transition-all">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddVisit} className="flex flex-col max-h-[80vh]">
              <div className="p-8 space-y-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Target Company</label>
                    <input
                      name="companyName"
                      required
                      defaultValue={editingVisit?.companyName}
                      className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all"
                      placeholder="Company Name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Visit Date</label>
                    <input
                      name="visitDate"
                      type="date"
                      required
                      defaultValue={editingVisit?.visitDate}
                      className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Number of Students</label>
                    <input
                      name="studentCount"
                      type="number"
                      required
                      defaultValue={editingVisit?.studentCount}
                      className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Level</label>
                    <select
                      value={selectedLevelName}
                      onChange={(e) => {
                        const levelName = e.target.value;
                        setSelectedLevelName(levelName);
                        // Set a default levelId for the form submission (first match)
                        const firstLevel = levels.find(l => l.name === levelName);
                        setSelectedLevelId(firstLevel?.id || '');
                        setSelectedSpecialtyId('');
                        setSelectedModuleId('');
                      }}
                      required
                      className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all"
                    >
                      <option value="">Select Level</option>
                      {Array.from(new Set(levels.map(l => l.name))).sort().map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Specialty</label>
                    <select
                      value={selectedSpecialtyId}
                      onChange={(e) => {
                        const specId = e.target.value;
                        setSelectedSpecialtyId(specId);
                        // Find the correct level ID for this specialty and level name
                        const correctLevel = levels.find(l => l.specialtyId === specId && l.name === selectedLevelName);
                        setSelectedLevelId(correctLevel?.id || '');
                        setSelectedModuleId('');
                      }}
                      required
                      disabled={!selectedLevelName}
                      className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all disabled:opacity-50"
                    >
                      <option value="">Select Specialty</option>
                      {filteredSpecialties.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Module</label>
                    <select
                      value={selectedModuleId}
                      onChange={(e) => setSelectedModuleId(e.target.value)}
                      required
                      disabled={!selectedSpecialtyId}
                      className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all disabled:opacity-50"
                    >
                      <option value="">Select Module</option>
                      {filteredModules.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Supervising Teachers</label>
                  </div>
                  
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => addSupervisor(e.target.value)}
                      className="flex-1 p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all"
                      value=""
                    >
                      <option value="">Select from list...</option>
                      {teachers.map(t => (
                        <option key={t.uid} value={t.uid}>{t.displayName}</option>
                      ))}
                    </select>
                    <div className="flex-1 flex gap-2">
                      <input
                        value={manualTeacherName}
                        onChange={(e) => setManualTeacherName(e.target.value)}
                        className="flex-1 p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all"
                        placeholder="Or enter name manually..."
                      />
                      <button
                        type="button"
                        onClick={addManualSupervisor}
                        className="p-4 bg-zinc-900 text-white rounded-2xl hover:bg-zinc-800 transition-colors"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {supervisors.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-sm">
                        {s.name}
                        <button type="button" onClick={() => removeSupervisor(i)} className="text-emerald-400 hover:text-emerald-600">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-zinc-100 flex gap-4 bg-zinc-50">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setEditingVisit(null); resetForm(); }}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-white transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  {editingVisit ? 'Update Request' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
