import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/db';
import { Project, ProjectStatus, ProjectStage, SupervisionProblem, AbandonmentReason, Specialty, Level, Student, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Plus, FileText, Check, X, MessageSquare, TrendingUp, AlertTriangle, UserMinus, Edit2, Users, CheckCircle2, Calendar as CalendarIcon, Clock, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { ConfirmationModal } from '../components/ConfirmationModal';

export function ProjectManagement() {
  const { user, isAdmin, isSpecialtyManager } = useAuth();
  const { t, academicYear } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [distributingProject, setDistributingProject] = useState<Project | null>(null);
  const [updatingProgress, setUpdatingProgress] = useState<Project | null>(null);
  const [suggestingDefense, setSuggestingDefense] = useState<Project | null>(null);
  const [confirmingDefense, setConfirmingDefense] = useState<Project | null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProblemModal, setShowProblemModal] = useState<string | null>(null);
  const [showAbandonModal, setShowAbandonModal] = useState<string | null>(null);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>(user?.uid || '');

  const [selectedLevelName, setSelectedLevelName] = useState<string>('');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string>('');

  const [editingLevelName, setEditingLevelName] = useState<string>('');
  const [editingSpecialtyId, setEditingSpecialtyId] = useState<string>('');

  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');

  const [sendingThesis, setSendingThesis] = useState<Project | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    const unsubscribeProjects = dbService.subscribeToCollection<Project>('projects', [], (data) => {
      setProjects(data);
      setLoading(false);
    });

    const unsubscribeSpecialties = dbService.subscribeToCollection<Specialty>('specialties', [], (data) => {
      setSpecialties(data);
    });

    const unsubscribeLevels = dbService.subscribeToCollection<Level>('levels', [], (data) => {
      setLevels(data);
    });

    const unsubscribeStudents = dbService.subscribeToCollection<Student>('students', [], (data) => {
      setStudents(data);
    });

    const unsubscribeUsers = dbService.subscribeToCollection<User>('users', [], (data) => {
      setTeachers(data.filter(u => u.role === 'teacher' || u.role === 'specialty_manager' || u.role === 'admin'));
    });

    return () => {
      unsubscribeProjects();
      unsubscribeSpecialties();
      unsubscribeLevels();
      unsubscribeStudents();
      unsubscribeUsers();
    };
  }, []);

  // Filter levels for graduation projects: 3rd Year Licence, 2nd Year Master, Engineers
  const graduationLevels = useMemo(() => {
    return levels.filter(l => {
      const specialty = specialties.find(s => s.id === l.specialtyId);
      if (!specialty) return false;
      
      const name = l.name.toLowerCase();
      const sName = specialty.name.toLowerCase();
      
      // Engineering graduation (usually 5th year or 2nd year of specialized cycle)
      const isEng = (specialty.levelType === 'engineers' || sName.includes('engineer') || sName.includes('مهندس')) && 
                    (name.includes('5') || name.includes('fifth') || name.includes('خامسة') || 
                     name.includes('2') || name.includes('second') || name.includes('ثانية') || name.includes('الثانية') ||
                     name.includes('engineer') || name.includes('مهندس'));

      // Master graduation (2nd year)
      const isMaster = (specialty.levelType === 'master' || sName.includes('master') || sName.includes('ماستر')) && 
                       (name.includes('2') || name.includes('second') || name.includes('ثانية') || name.includes('الثانية') || name.includes('m2') || name.includes('ماستر'));

      // License graduation (3rd year)
      const isLicense = (specialty.levelType === 'license' || sName.includes('licence') || sName.includes('ليسانس')) && 
                        (name.includes('3') || name.includes('third') || name.includes('ثالثة') || name.includes('الثانية') || name.includes('l3') || name.includes('ليسانس'));

      return isEng || isMaster || isLicense;
    });
  }, [levels, specialties]);

  const filteredProjects = projects.filter(p => {
    // Only show graduation projects (filtered levels)
    const level = graduationLevels.find(l => l.id === p.levelId);
    if (!level) return false;

    const matchesSearch = p.title.toLowerCase().includes(filter.toLowerCase()) || 
                         p.description.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesYear = p.academicYear === academicYear;
    
    if (!matchesYear) return false;

    // Role-based filtering
    if (isAdmin) return matchesSearch && matchesStatus;
    
    // Specialty Manager sees projects in their specialty
    if (isSpecialtyManager) {
      if (user?.managedSpecialtyId) {
        return matchesSearch && matchesStatus && p.specialtyId === user.managedSpecialtyId;
      }
      return matchesSearch && matchesStatus;
    }

    // Teachers see all projects (to see what's available)
    return matchesSearch && matchesStatus;
  });

  const handleAddProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const specialty = specialties.find(s => s.id === selectedSpecialtyId);
    const newProject: Partial<Project> = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      specialtyId: selectedSpecialtyId,
      levelId: graduationLevels.find(l => l.name === selectedLevelName && l.specialtyId === selectedSpecialtyId)?.id || '',
      supervisorId: selectedSupervisorId || user?.uid,
      status: 'proposed',
      progress: 0,
      stage: 'start',
      phase: specialty?.levelType || 'license',
      students: [],
      keywords: (formData.get('keywords') as string).split(',').map(s => s.trim()),
      is1275: formData.get('is1275') === 'on',
      academicYear
    };
    const projectRef = await dbService.addDocument('projects', newProject);
    
    // Notify Admin and Specialty Manager
    const specialtyManager = teachers.find(t => t.role === 'specialty_manager' && t.managedSpecialtyId === selectedSpecialtyId);
    
    const notificationData = {
      userId: 'admin',
      title: t('new_project_added'),
      message: `${t('project')}: ${newProject.title} - ${t('by')} ${user?.displayName}`,
      type: 'project',
      link: '/projects',
      createdAt: new Date().toISOString(),
      read: false
    };
    await dbService.addDocument('notifications', notificationData);
    
    if (specialtyManager) {
      await dbService.addDocument('notifications', {
        ...notificationData,
        userId: specialtyManager.uid
      });
    }

    setShowAdd(false);
    setSelectedLevelName('');
    setSelectedSpecialtyId('');
    setSelectedSupervisorId(user?.uid || '');
  };

  const handleEditProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProject) return;
    const formData = new FormData(e.currentTarget);
    const specialty = specialties.find(s => s.id === editingSpecialtyId);
    const updates: Partial<Project> = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      specialtyId: editingSpecialtyId,
      levelId: levels.find(l => l.name === editingLevelName && l.specialtyId === editingSpecialtyId)?.id || '',
      phase: specialty?.levelType || 'license',
      keywords: (formData.get('keywords') as string).split(',').map(s => s.trim()),
      is1275: formData.get('is1275') === 'on'
    };
    await dbService.updateDocument('projects', editingProject.id, updates);
    setEditingProject(null);
    setEditingLevelName('');
    setEditingSpecialtyId('');
  };

  const handleDistribute = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!distributingProject) return;
    const formData = new FormData(e.currentTarget);
    const selectedStudentIds = formData.getAll('selectedStudents') as string[];
    
    // Get project specialty to check level type
    const specialty = specialties.find(s => s.id === distributingProject.specialtyId);
    const maxStudents = specialty?.levelType === 'license' ? 3 : 2;

    if (selectedStudentIds.length > maxStudents) {
      toast.error(
        specialty?.levelType === 'license' 
          ? 'مشاريع الليسانس لا يمكن أن تتعدى 3 طلبة' 
          : 'مشاريع الماستر لا يمكن أن تتعدى طالبين'
      );
      return;
    }

    // Update project with selected students
    await dbService.updateDocument('projects', distributingProject.id, { 
      students: selectedStudentIds,
      status: 'distributed'
    });

    // Update each student with the project ID
    for (const studentId of selectedStudentIds) {
      const studentExists = students.some(s => s.id === studentId);
      if (studentExists) {
        await dbService.updateDocument('students', studentId, { projectId: distributingProject.id });
      }
    }

    // Clear project ID from students who were previously assigned but now removed
    const removedStudentIds = distributingProject.students.filter(id => !selectedStudentIds.includes(id));
    for (const studentId of removedStudentIds) {
      const studentExists = students.some(s => s.id === studentId);
      if (studentExists) {
        await dbService.updateDocument('students', studentId, { projectId: null as any });
      }
    }

    setDistributingProject(null);
  };

  const updateProjectStatus = async (id: string, status: ProjectStatus) => {
    await dbService.updateDocument('projects', id, { status });
  };

  const updateProgress = async (id: string, progress: number, stage: ProjectStage) => {
    const project = projects.find(p => p.id === id);
    const updates: any = { progress, stage };
    
    // Master 2 defense suggestion logic
    if (stage === 'ready' && project?.phase === 'master') {
      const level = levels.find(l => l.id === project.levelId);
      const isMaster2 = level?.name.includes('2') || level?.name.includes('الثانية');
      if (isMaster2) {
        setSuggestingDefense(project);
      }
    }
    
    await dbService.updateDocument('projects', id, updates);
  };

  const handleSuggestDefense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!suggestingDefense) return;
    const formData = new FormData(e.currentTarget);
    const updates = {
      suggestedDefenseDate: formData.get('date') as string,
      suggestedDefenseTime: formData.get('time') as string,
    };
    await dbService.updateDocument('projects', suggestingDefense.id, updates);
    
    // Notify Admin
    await dbService.addDocument('notifications', {
      userId: 'admin',
      title: t('defense_suggested'),
      message: `${t('project')}: ${suggestingDefense.title} - ${t('by')} ${user?.displayName}`,
      type: 'defense',
      link: '/projects',
      createdAt: new Date().toISOString(),
      read: false
    });

    setSuggestingDefense(null);
    toast.success(t('success'));
  };

  const handleConfirmDefense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirmingDefense) return;
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    const time = formData.get('time') as string;
    const room = formData.get('room') as string;
    const committee = formData.getAll('committee') as string[];

    // Conflict detection
    const conflict = projects.find(p => 
      p.id !== confirmingDefense.id &&
      p.defenseDate === date &&
      p.defenseTime === time &&
      p.defenseRoom === room
    );

    if (conflict) {
      toast.error(t('defense_conflict'));
      return;
    }

    const updates = {
      defenseDate: date,
      defenseTime: time,
      defenseRoom: room,
      committeeMembers: committee
    };
    await dbService.updateDocument('projects', confirmingDefense.id, updates);
    
    // Notify Supervisor
    await dbService.addDocument('notifications', {
      userId: confirmingDefense.supervisorId,
      title: t('defense_confirmed'),
      message: `${t('project')}: ${confirmingDefense.title} - ${t('date')}: ${date} ${time}`,
      type: 'defense',
      link: '/projects',
      createdAt: new Date().toISOString(),
      read: false
    });

    setConfirmingDefense(null);
    toast.success(t('success'));
  };

  const handleSendThesis = async (project: Project) => {
    if (!project.finalThesisUrl) {
      toast.error('Please upload the final thesis first');
      return;
    }

    setIsSending(true);
    try {
      const committeeEmails = teachers
        .filter(t => project.committeeMembers?.includes(t.uid))
        .map(t => t.email);

      if (committeeEmails.length === 0) {
        toast.error('No committee members assigned');
        return;
      }

      const response = await fetch('/api/projects/send-thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectTitle: project.title,
          thesisUrl: project.finalThesisUrl,
          emails: committeeEmails
        })
      });

      if (response.ok) {
        await dbService.updateDocument('projects', project.id, {
          finalThesisSentAt: new Date().toISOString()
        });
        toast.success('Thesis sent to committee successfully');
      } else {
        throw new Error('Failed to send email');
      }
    } catch (error) {
      console.error('Error sending thesis:', error);
      toast.error('Failed to send thesis');
    } finally {
      setIsSending(false);
    }
  };

  const reportProblem = async (projectId: string, type: SupervisionProblem, notes: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const problems = project.problems || [];
    problems.push({ type, date: new Date().toISOString(), notes });
    await dbService.updateDocument('projects', projectId, { problems });
    setShowProblemModal(null);
  };

  const requestAbandonment = async (projectId: string, reason: AbandonmentReason, notes: string) => {
    await dbService.updateDocument('projects', projectId, {
      abandonmentRequest: {
        reason,
        date: new Date().toISOString(),
        notes,
        status: 'pending'
      }
    });
    setShowAbandonModal(null);
  };

  const handleDeleteProject = async (id: string) => {
    setConfirmationModal({
      title: t('delete'),
      message: t('confirm_delete_project') || 'Are you sure you want to delete this project?',
      onConfirm: async () => {
        try {
          await dbService.deleteDocument('projects', id);
          toast.success(t('success'));
          setConfirmationModal(null);
        } catch (error) {
          console.error('Error deleting project:', error);
          toast.error(t('error'));
        }
      }
    });
  };

  const handleClearAllProjects = async () => {
    setConfirmationModal({
      title: t('confirm_clear_all_projects_title'),
      message: t('confirm_clear_all_projects_desc'),
      onConfirm: async () => {
        const loadingToast = toast.loading(t('clearing_data'));
        try {
          const projectsToDelete = projects.filter(p => p.academicYear === academicYear);
          for (const project of projectsToDelete) {
            await dbService.deleteDocument('projects', project.id);
          }
          toast.success(t('data_cleared_success'), { id: loadingToast });
          setConfirmationModal(null);
        } catch (error) {
          console.error('Error clearing projects:', error);
          toast.error(t('error'), { id: loadingToast });
        }
      }
    });
  };

  const stages: ProjectStage[] = ['start', 'references', 'theory', 'practical', 'writing', 'ready'];
  const supervisionProblems: SupervisionProblem[] = ['no_response', 'absence', 'delay', 'technical', 'data_lack', 'other_supervision'];
  const abandonmentReasons: AbandonmentReason[] = ['no_commitment', 'repeated_absence', 'interruption', 'work_pressure', 'administrative', 'other_abandonment'];

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-zinc-900">{t('projects')}</h2>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder={t('search_projects') || 'Search projects...'}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <Plus className="absolute left-3 top-2.5 text-zinc-400" size={18} />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium outline-none"
          >
            <option value="all">{t('all_statuses') || 'All Statuses'}</option>
            <option value="proposed">{t('proposed')}</option>
            <option value="accepted">{t('accepted')}</option>
            <option value="rejected">{t('rejected')}</option>
            <option value="distributed">{t('distributed')}</option>
          </select>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-2 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2"
          >
            <Plus size={20} /> {t('propose_project')}
          </button>
          {isAdmin && (
            <button
              onClick={handleClearAllProjects}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100"
              title={t('clear_all_projects') || 'Clear All Projects'}
            >
              <Trash2 size={18} />
              {t('clear_all') || 'Clear All'}
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-6">{t('propose_project')}</h3>
            <form onSubmit={handleAddProject} className="space-y-4">
              <input name="title" placeholder={t('project_title')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              <textarea name="description" placeholder={t('project_description')} className="w-full p-3 rounded-xl border border-zinc-200 h-32" required />
              <div className="grid grid-cols-2 gap-4">
                <select 
                  className="w-full p-3 rounded-xl border border-zinc-200" 
                  required
                  onChange={(e) => {
                    const levelName = e.target.value;
                    setSelectedLevelName(levelName);
                    
                    // Filter specialties for this level
                    const filteredSpecs = specialties.filter(s => 
                      levels.some(l => l.name === levelName && l.specialtyId === s.id)
                    );
                    
                    // Auto-select if only one specialty
                    if (filteredSpecs.length === 1) {
                      setSelectedSpecialtyId(filteredSpecs[0].id);
                    } else {
                      setSelectedSpecialtyId('');
                    }
                  }}
                  value={selectedLevelName}
                >
                  <option value="">{t('level')}</option>
                  {Array.from(new Set(graduationLevels
                    .filter(l => {
                      if (!isAdmin && !isSpecialtyManager) {
                        // Teachers see L3 and M2 (graduation levels)
                        const name = l.name.toLowerCase();
                        const isL3 = name.includes('3') || name.includes('third') || name.includes('الثالثة') || name.includes('ثالثة') || name.includes('l3');
                        const isM2 = name.includes('2') || name.includes('second') || name.includes('الثانية') || name.includes('ثانية') || name.includes('m2') || name.includes('ماستر 2');
                        const isEng = name.includes('engineer') || name.includes('مهندس') || name.includes('ing') || name.includes('5') || name.includes('خامسة');
                        return isL3 || isM2 || isEng;
                      }
                      return true;
                    })
                    .map(l => l.name))).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <select 
                  className="w-full p-3 rounded-xl border border-zinc-200" 
                  required
                  disabled={!selectedLevelName}
                  onChange={(e) => setSelectedSpecialtyId(e.target.value)}
                  value={selectedSpecialtyId}
                >
                  <option value="">{t('specialty')}</option>
                  {specialties
                    .filter(s => graduationLevels.some(l => l.name === selectedLevelName && l.specialtyId === s.id))
                    .map(s => <option key={s.id as string} value={s.id as string}>{s.name}</option>)}
                </select>
              </div>
              
              {(isAdmin || isSpecialtyManager) && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">{t('supervisor')}</label>
                  <select 
                    className="w-full p-3 rounded-xl border border-zinc-200" 
                    required
                    value={selectedSupervisorId}
                    onChange={(e) => setSelectedSupervisorId(e.target.value)}
                  >
                    {teachers.map(t => (
                      <option key={t.uid} value={t.uid}>{t.displayName}</option>
                    ))}
                  </select>
                </div>
              )}

              <input name="keywords" placeholder={t('keywords_comma')} className="w-full p-3 rounded-xl border border-zinc-200" />
              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" name="is1275" id="is1275" className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="is1275" className="text-sm text-zinc-600">{t('under_1275')}</label>
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => { setShowAdd(false); setSelectedLevelName(''); setSelectedSpecialtyId(''); }} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-6">{t('edit_project') || 'Edit Project'}</h3>
            <form onSubmit={handleEditProject} className="space-y-4">
              <input name="title" defaultValue={editingProject.title} placeholder={t('project_title')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              <textarea name="description" defaultValue={editingProject.description} placeholder={t('project_description')} className="w-full p-3 rounded-xl border border-zinc-200 h-32" required />
              <div className="grid grid-cols-2 gap-4">
                <select 
                  className="w-full p-3 rounded-xl border border-zinc-200" 
                  required
                  onChange={(e) => {
                    const levelName = e.target.value;
                    setEditingLevelName(levelName);
                    
                    // Filter specialties for this level
                    const filteredSpecs = specialties.filter(s => 
                      levels.some(l => l.name === levelName && l.specialtyId === s.id)
                    );
                    
                    // Auto-select if only one specialty
                    if (filteredSpecs.length === 1) {
                      setEditingSpecialtyId(filteredSpecs[0].id);
                    } else {
                      setEditingSpecialtyId('');
                    }
                  }}
                  value={editingLevelName}
                >
                  <option value="">{t('level')}</option>
                  {Array.from(new Set(levels.map(l => l.name))).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <select 
                  className="w-full p-3 rounded-xl border border-zinc-200" 
                  required
                  disabled={!editingLevelName}
                  onChange={(e) => setEditingSpecialtyId(e.target.value)}
                  value={editingSpecialtyId}
                >
                  <option value="">{t('specialty')}</option>
                  {specialties
                    .filter(s => levels.some(l => l.name === editingLevelName && l.specialtyId === s.id))
                    .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <input name="keywords" defaultValue={editingProject.keywords.join(', ')} placeholder={t('keywords_comma')} className="w-full p-3 rounded-xl border border-zinc-200" />
              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" name="is1275" id="editIs1275" defaultChecked={editingProject.is1275} className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="editIs1275" className="text-sm text-zinc-600">{t('under_1275')}</label>
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setEditingProject(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {distributingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-6">{t('distribute_to_students') || 'Distribute to Students'}</h3>
            <form onSubmit={handleDistribute} className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-zinc-700">
                    Select Students (Specialty: {specialties.find(s => s.id === distributingProject.specialtyId)?.name})
                  </label>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                    Max: {specialties.find(s => s.id === distributingProject.specialtyId)?.levelType === 'license' ? 3 : 2}
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto border border-zinc-100 rounded-xl p-2 space-y-1">
                  {students
                    .filter(s => s.specialtyId === distributingProject.specialtyId && (!s.projectId || s.projectId === distributingProject.id))
                    .map(student => (
                      <label key={student.id} className="flex items-center gap-3 p-2 hover:bg-zinc-50 rounded-lg cursor-pointer">
                        <input 
                          type="checkbox" 
                          name="selectedStudents" 
                          value={student.id} 
                          defaultChecked={distributingProject.students.includes(student.id)}
                          className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-zinc-900">{student.name}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{student.registrationNumber}</div>
                        </div>
                      </label>
                    ))}
                  {students.filter(s => s.specialtyId === distributingProject.specialtyId && (!s.projectId || s.projectId === distributingProject.id)).length === 0 && (
                    <div className="text-center py-4 text-zinc-400 text-sm italic">No available students for this specialty.</div>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setDistributingProject(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold">Distribute</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProblemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('report_problem')}</h3>
            <div className="space-y-2">
              {supervisionProblems.map(type => (
                <button
                  key={type}
                  onClick={() => reportProblem(showProblemModal, type, '')}
                  className="w-full p-3 text-right rounded-xl hover:bg-zinc-50 border border-zinc-100 transition-all font-medium"
                >
                  {t(type)}
                </button>
              ))}
            </div>
            <button onClick={() => setShowProblemModal(null)} className="w-full mt-4 py-3 text-zinc-500 font-semibold">إلغاء</button>
          </div>
        </div>
      )}

      {showAbandonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('abandon_supervision')}</h3>
            <div className="space-y-2">
              {abandonmentReasons.map(reason => (
                <button
                  key={reason}
                  onClick={() => requestAbandonment(showAbandonModal, reason, '')}
                  className="w-full p-3 text-right rounded-xl hover:bg-zinc-50 border border-zinc-100 transition-all font-medium"
                >
                  {t(reason)}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAbandonModal(null)} className="w-full mt-4 py-3 text-zinc-500 font-semibold">إلغاء</button>
          </div>
        </div>
      )}

      {updatingProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('update_progress')}</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const progress = parseInt(formData.get('progress') as string);
              const stage = formData.get('stage') as ProjectStage;
              
              if (stage === 'ready') {
                setSuggestingDefense(updatingProgress);
                setUpdatingProgress(null);
                return;
              }

              await updateProgress(
                updatingProgress.id, 
                progress, 
                stage
              );
              setUpdatingProgress(null);
            }} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('progress')} (%)</label>
                <input 
                  type="number" 
                  name="progress" 
                  min="0" 
                  max="100" 
                  defaultValue={updatingProgress.progress}
                  className="w-full p-3 rounded-xl border border-zinc-200" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('stage')}</label>
                <select 
                  name="stage" 
                  defaultValue={updatingProgress.stage}
                  className="w-full p-3 rounded-xl border border-zinc-200" 
                  required
                >
                  {stages.map(s => <option key={s} value={s}>{t(s)}</option>)}
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setUpdatingProgress(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">
                  {t('update')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {suggestingDefense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('suggest_defense')}</h3>
            <form onSubmit={handleSuggestDefense} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('defense_date')}</label>
                <input type="date" name="date" className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('defense_time')}</label>
                <input type="time" name="time" className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setSuggestingDefense(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold">Suggest</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmingDefense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-6">{t('confirm_defense')}</h3>
            <form onSubmit={handleConfirmDefense} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('defense_date')}</label>
                <input 
                  type="date" 
                  name="date" 
                  defaultValue={confirmingDefense.suggestedDefenseDate} 
                  className="w-full p-3 rounded-xl border border-zinc-200" 
                  required 
                  onChange={(e) => {
                    // Force re-render to update conflict list
                    setConfirmingDefense({ ...confirmingDefense, suggestedDefenseDate: e.target.value });
                  }}
                />
              </div>
              
              {/* Conflict Alert Section */}
              {confirmingDefense.suggestedDefenseDate && (
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-2">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    {t('existing_defenses_on_this_day') || 'Existing Defenses on this Day'}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {projects
                      .filter(p => p.defenseDate === confirmingDefense.suggestedDefenseDate)
                      .map(p => (
                        <div key={p.id} className="text-xs flex justify-between items-center p-2 bg-white rounded-lg border border-zinc-100">
                          <span className="font-medium truncate max-w-[150px]">{p.title}</span>
                          <span className="text-indigo-600 font-bold">{p.defenseTime} - {p.defenseRoom}</span>
                        </div>
                      ))}
                    {projects.filter(p => p.defenseDate === confirmingDefense.suggestedDefenseDate).length === 0 && (
                      <div className="text-xs text-zinc-400 italic">{t('no_defenses_scheduled') || 'No defenses scheduled'}</div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('defense_time')}</label>
                <input type="time" name="time" defaultValue={confirmingDefense.suggestedDefenseTime} className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">{t('defense_room')}</label>
                <input type="text" name="room" className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Defense Committee</label>
                <div className="max-h-40 overflow-y-auto border border-zinc-100 rounded-xl p-2 space-y-1">
                  {teachers.map(teacher => (
                    <label key={teacher.uid} className="flex items-center gap-3 p-2 hover:bg-zinc-50 rounded-lg cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="committee" 
                        value={teacher.uid} 
                        className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">{teacher.displayName}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setConfirmingDefense(null)} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredProjects.map((project) => (
          <div key={project.id} className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4 flex flex-col">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1 flex-1">
                <h4 className="font-bold text-lg text-zinc-900 leading-tight">{project.title}</h4>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    <TrendingUp size={10} /> {t(project.stage)}
                  </div>
                  <div className="text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-lg">
                    {specialties.find(s => s.id === project.specialtyId)?.name}
                  </div>
                </div>
              </div>
              <span className={cn(
                "px-3 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap",
                project.status === 'accepted' ? "bg-emerald-100 text-emerald-700" :
                project.status === 'rejected' ? "bg-red-100 text-red-700" :
                project.status === 'distributed' ? "bg-indigo-100 text-indigo-700" :
                "bg-amber-100 text-amber-700"
              )}>
                {t(project.status)}
              </span>
              {(isAdmin || isSpecialtyManager || project.supervisorId === user?.uid) && (
                <button
                  onClick={() => handleDeleteProject(project.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title={t('delete')}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <p className="text-sm text-zinc-600 line-clamp-2 flex-1">{project.description}</p>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500 font-medium">{t('progress')}</span>
                <span className="font-bold text-zinc-900">{project.progress}%</span>
              </div>
              <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>

            {project.defenseDate && (
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-1">
                <div className="text-[10px] font-bold text-indigo-800 flex items-center gap-1">
                  <CalendarIcon size={12} /> {t('defense_date')}
                </div>
                <div className="text-xs font-bold text-indigo-700 flex justify-between">
                  <span>{project.defenseDate} @ {project.defenseTime}</span>
                  <span>{project.defenseRoom}</span>
                </div>
              </div>
            )}
            
            {!project.defenseDate && project.suggestedDefenseDate && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl space-y-1">
                <div className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                  <Clock size={12} /> {t('suggested_defense')}
                </div>
                <div className="text-xs font-bold text-amber-700">
                  {project.suggestedDefenseDate} @ {project.suggestedDefenseTime}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-zinc-50">
              <div className="flex flex-col w-full gap-3">
                {project.defenseDate && project.supervisorId === user?.uid && (
                  <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <input
                      type="file"
                      accept=".pdf"
                      id={`thesis-${project.id}`}
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Mock upload
                          const url = `https://example.com/theses/${project.id}/${file.name}`;
                          await dbService.updateDocument('projects', project.id, { finalThesisUrl: url });
                          toast.success('Thesis uploaded successfully');
                        }
                      }}
                    />
                    <label
                      htmlFor={`thesis-${project.id}`}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer transition-all"
                    >
                      <FileText size={14} />
                      {project.finalThesisUrl ? 'Update Thesis' : 'Upload Final Thesis (PDF)'}
                    </label>
                    {project.finalThesisUrl && (
                      <button
                        onClick={() => handleSendThesis(project)}
                        disabled={isSending}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        {isSending ? <Clock size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Send to Committee
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {/* Teacher Actions (Supervisor only) */}
                    {project.supervisorId === user?.uid && (
                  <>
                    <button 
                      onClick={() => setUpdatingProgress(project)}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                      title={t('update_progress')}
                    >
                      <TrendingUp size={18} />
                    </button>
                    <button 
                      onClick={() => setShowProblemModal(project.id)}
                      className="p-2 text-amber-500 hover:bg-amber-50 rounded-xl transition-colors"
                      title={t('report_problem')}
                    >
                      <AlertTriangle size={18} />
                    </button>
                    <button 
                      onClick={() => setShowAbandonModal(project.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      title={t('abandon_supervision')}
                    >
                      <UserMinus size={18} />
                    </button>
                  </>
                )}

                {/* Specialty Manager Actions */}
                {(isAdmin || isSpecialtyManager) && (
                  <>
                    {project.status === 'proposed' && (
                      <>
                        <button 
                          onClick={() => updateProjectStatus(project.id, 'accepted')} 
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                          title={t('accept')}
                        >
                          <Check size={18} />
                        </button>
                        <button 
                          onClick={() => updateProjectStatus(project.id, 'rejected')} 
                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title={t('reject')}
                        >
                          <X size={18} />
                        </button>
                      </>
                    )}
                    <button 
                      onClick={() => {
                        setEditingProject(project);
                        setEditingLevelName(levels.find(l => l.id === project.levelId)?.name || '');
                        setEditingSpecialtyId(project.specialtyId);
                      }}
                      className="p-2 text-zinc-400 hover:bg-zinc-50 rounded-xl transition-colors"
                      title={t('edit')}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => setDistributingProject(project)}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                      title={t('distribute')}
                    >
                      <Users size={18} />
                    </button>
                    {isAdmin && project.stage === 'ready' && project.suggestedDefenseDate && (
                      <button 
                        onClick={() => setConfirmingDefense(project)}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                        title={t('confirm_defense')}
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    )}
                  </>
                )}
              </div>
              
              <div className="flex -space-x-2">
                {project.students.length > 0 ? (
                  project.students.map((sid, i) => {
                    const student = students.find(s => s.id === sid);
                    return (
                      <div key={i} className="w-7 h-7 rounded-full bg-zinc-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-zinc-600" title={student?.name || sid}>
                        {student?.name?.charAt(0) || sid.charAt(0)}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[10px] text-zinc-400 font-medium italic">{t('not_distributed') || 'Not distributed'}</div>
                )}
              </div>
            </div>
          </div>
        </div>
            
            {project.problems && project.problems.length > 0 && (isAdmin || isSpecialtyManager) && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-2xl space-y-2">
                <div className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                  <AlertTriangle size={12} /> {t('reported_problems') || 'Reported Problems'}
                </div>
                {project.problems.map((prob, i) => (
                  <div key={i} className="text-[10px] text-amber-700 flex justify-between">
                    <span>{t(prob.type)}</span>
                    <span className="text-zinc-400">{new Date(prob.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
            
            {project.abandonmentRequest && (
              <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-2xl text-[10px] text-red-700 flex justify-between items-center">
                <div>
                  <span className="font-bold">{t('abandonment_request')}:</span> {t(project.abandonmentRequest.reason)}
                </div>
                <div className="font-black uppercase bg-red-100 px-2 py-0.5 rounded-lg">{project.abandonmentRequest.status}</div>
              </div>
            )}
          </div>
        ))}
      </div>

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
