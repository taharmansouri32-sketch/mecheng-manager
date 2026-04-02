import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { User, UserRole, Specialty } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { createUserWithEmailAndPassword, updatePassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Plus, Mail, Shield, ShieldAlert, Trash2, Edit2, Search, Users, Send, Key, Copy, CheckCircle2, RefreshCw, Download, UserCheck, UserX, Eye, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { INITIAL_TEACHERS } from '../constants/initialData';
import * as XLSX from 'xlsx';
import { ConfirmationModal } from '../components/ConfirmationModal';

export function TeacherManagement() {
  const { t, language, getPublicUrl } = useLanguage();
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<User | null>(null);
  const [filter, setFilter] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [sendingAccount, setSendingAccount] = useState<string | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>('teacher');
  const [generatedAccount, setGeneratedAccount] = useState<{ email: string; password: string; name: string; uid: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const generateCredentials = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const password = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return { password, randomNum };
  };

  useEffect(() => {
    const fetchSpecialties = async () => {
      const data = await dbService.getCollection<Specialty>('specialties');
      setSpecialties(data);
    };
    fetchSpecialties();
  }, []);

  useEffect(() => {
    const unsubscribe = dbService.subscribeToCollection<User>('users', [], (data) => {
      setTeachers(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleBulkImport = async () => {
    setIsImporting(true);
    const defaultPassword = 'Lagh@' + new Date().getFullYear();
    let importedCount = 0;

    try {
      for (const teacher of INITIAL_TEACHERS) {
        const exists = teachers.some(t => t.email === teacher.email);
        if (!exists) {
          const newUid = teacher.email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5);
          await dbService.setDocument('users', newUid, {
            email: teacher.email,
            displayName: teacher.name,
            role: 'teacher',
            uid: newUid,
            password: defaultPassword,
            isActive: true,
            teacherType: 'permanent_internal'
          });
          importedCount++;
        }
      }
      
      toast.success(`${t('import_completed')} (${importedCount} success)`);
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t('import_failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string).toLowerCase().trim();
    const displayName = formData.get('name') as string;
    const role = formData.get('role') as UserRole;
    const password = formData.get('password') as string;
    const sendEmail = formData.get('sendEmail') === 'on';
    const isTemporary = formData.get('isTemporary') === 'on';
    const teacherType = formData.get('teacherType') as any;
    const department = formData.get('department') as string;
    const rank = formData.get('rank') as any;
    const isUnder1275 = formData.get('isUnder1275') === 'on';
    const managedSpecialtyId = formData.get('managedSpecialtyId') as string;
    const managedPhase = formData.get('managedPhase') as any;
    const appointmentDate = formData.get('appointmentDate') as string;
    const isRenewed = formData.get('isRenewed') === 'on';
    const uid = email.split('@')[0];

    const newUser: Partial<User> = {
      email,
      displayName,
      role,
      password,
      isTemporary,
      teacherType,
      department,
      rank,
      isUnder1275,
      isActive: true,
    };

    if (role === 'specialty_manager') {
      newUser.managedSpecialtyId = managedSpecialtyId;
      newUser.managedPhase = managedPhase;
      newUser.appointmentDate = appointmentDate;
      newUser.isRenewed = isRenewed;
    }

    // Create user locally in Firestore
    try {
      const exists = teachers.some(t => t.email === email);
      if (exists) {
        toast.error(language === 'ar' ? 'هذا البريد الإلكتروني مسجل مسبقاً' : 'This email is already registered');
        return;
      }

      const newUid = email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5);
      newUser.uid = newUid;
      await dbService.setDocument('users', newUid, newUser);
      
      if (sendEmail) {
        await sendAccountDetails({ ...newUser, uid: newUid } as User, password);
      }

      setGeneratedAccount({ email, password, name: displayName, uid: newUid });
      toast.success(t('success'));
      setShowAdd(false);
      setSelectedRole('teacher');
    } catch (error) {
      console.error('Unknown creation error:', error);
      toast.error(t('error'));
    }
  };

  const handleEditTeacher = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTeacher) return;
    const formData = new FormData(e.currentTarget);
    const role = formData.get('role') as UserRole;
    const isTemporary = formData.get('isTemporary') === 'on';
    const teacherType = formData.get('teacherType') as any;
    const department = formData.get('department') as string;
    const rank = formData.get('rank') as any;
    const isUnder1275 = formData.get('isUnder1275') === 'on';
    const managedSpecialtyId = formData.get('managedSpecialtyId') as string;
    const managedPhase = formData.get('managedPhase') as any;
    const appointmentDate = formData.get('appointmentDate') as string;
    const isRenewed = formData.get('isRenewed') === 'on';

    const updates: Partial<User> = {
      displayName: formData.get('name') as string,
      email: (formData.get('email') as string).toLowerCase().trim(),
      role,
      isTemporary,
      teacherType,
      department,
      rank,
      isUnder1275,
    };

    if (role === 'specialty_manager') {
      updates.managedSpecialtyId = managedSpecialtyId;
      updates.managedPhase = managedPhase;
      updates.appointmentDate = appointmentDate;
      updates.isRenewed = isRenewed;
    } else {
      updates.managedSpecialtyId = null as any;
      updates.managedPhase = null as any;
      updates.appointmentDate = null as any;
      updates.isRenewed = null as any;
    }

    await dbService.updateDocument('users', editingTeacher.id!, updates);
    toast.success(t('success'));
    setEditingTeacher(null);
    setSelectedRole('teacher');
  };

  const deleteTeacher = async (id: string) => {
    try {
      await dbService.deleteDocument('users', id);
      toast.success(t('success'));
    } catch (error) {
      console.error('Error deleting teacher:', error);
      toast.error(t('error'));
    } finally {
      setConfirmationModal(null);
    }
  };

  const handleManualGenerateAccount = async (teacher: User) => {
    setIsGenerating(teacher.uid);
    try {
      const { password } = generateCredentials();
      const updates: Partial<User> = { password, authStatus: 'success', authError: null as any };
      
      await dbService.updateDocument('users', teacher.uid, updates);
      
      setGeneratedAccount({ email: teacher.email, password, name: teacher.displayName, uid: teacher.uid });
      toast.success(t('success'));
    } catch (error) {
      console.error('Failed to generate account:', error);
      toast.error(t('failed_to_generate_account'));
    } finally {
      setIsGenerating(null);
    }
  };

  const shareViaWhatsApp = (generatedAccount: { email: string; password: string; name: string }) => {
    const message = t('whatsapp_message', {
      name: generatedAccount.name,
      email: generatedAccount.email,
      password: generatedAccount.password,
      url: getPublicUrl()
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const sendAccountDetails = async (teacher: User, password?: string) => {
    setSendingAccount(teacher.uid);
    try {
      const response = await fetch('/api/teachers/send-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: teacher.email,
          displayName: teacher.displayName,
          password: password || teacher.password
        })
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message || t('failed_to_send_account'));
      }
    } catch (error) {
      console.error('Failed to send account:', error);
      toast.error(t('failed_to_send_account'));
    } finally {
      setSendingAccount(null);
    }
  };

  const toggleTeacherStatus = async (teacher: User) => {
    try {
      await dbService.updateDocument('users', teacher.id!, {
        isActive: !teacher.isActive
      });
      toast.success(t('success'));
    } catch (error) {
      console.error('Failed to toggle status:', error);
      toast.error(t('error'));
    }
  };

  const downloadTeacherList = (lang: 'ar' | 'en') => {
    const data = filteredTeachers.map(teacher => ({
      [lang === 'ar' ? 'الاسم الكامل' : 'Full Name']: teacher.displayName,
      [lang === 'ar' ? 'البريد الإلكتروني' : 'Email']: teacher.email,
      [lang === 'ar' ? 'الرتبة' : 'Rank']: teacher.rank || '-',
      [lang === 'ar' ? 'القسم' : 'Department']: teacher.department || '-',
      [lang === 'ar' ? 'نوع الأستاذ' : 'Teacher Type']: t(teacher.teacherType || ''),
      [lang === 'ar' ? 'الحالة' : 'Status']: teacher.isActive !== false ? (lang === 'ar' ? 'مفعل' : 'Active') : (lang === 'ar' ? 'متوقف' : 'Inactive'),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Teachers');
    XLSX.writeFile(wb, `teachers_list_${lang}.xlsx`);
  };

  const getAppointmentStatus = (teacher: User) => {
    if (!teacher.appointmentDate) return null;
    const start = new Date(teacher.appointmentDate);
    const expiry = new Date(start);
    expiry.setFullYear(start.getFullYear() + 3);
    
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: t('expired'), color: 'text-red-600 bg-red-50', expiryDate: expiry };
    if (diffDays < 90) return { label: t('expiring_soon'), color: 'text-amber-600 bg-amber-50', expiryDate: expiry };
    return { label: t('active'), color: 'text-emerald-600 bg-emerald-50', expiryDate: expiry };
  };

  const deleteAllTeachers = async () => {
    try {
      setIsImporting(true);
      const teachersToDelete = teachers.filter(t => t.email !== 't.mansouri@lagh-univ.dz' && t.email !== 'taharmansouri32@gmail.com');
      for (const t of teachersToDelete) {
        await dbService.deleteDocument('users', t.id || t.uid);
      }
      toast.success(language === 'ar' ? 'تم حذف جميع الأساتذة بنجاح' : 'All teachers deleted successfully');
    } catch (error) {
      toast.error(language === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Failed to delete teachers');
    } finally {
      setIsImporting(false);
      setConfirmationModal(null);
    }
  };

  const filteredTeachers = teachers.filter(t => 
    t.displayName.toLowerCase().includes(filter.toLowerCase()) || 
    t.email.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-8">

      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder={t('search_teachers')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-zinc-200"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="flex gap-2">
            <button
              onClick={() => downloadTeacherList('ar')}
              className="px-4 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-semibold hover:bg-zinc-50 transition-all flex items-center gap-2"
              title="Download Arabic"
            >
              <Download size={20} /> AR
            </button>
            <button
              onClick={() => downloadTeacherList('en')}
              className="px-4 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-semibold hover:bg-zinc-50 transition-all flex items-center gap-2"
              title="Download English"
            >
              <Download size={20} /> EN
            </button>
          </div>
          <button
            onClick={() => setConfirmationModal({
              title: language === 'ar' ? 'حذف جميع الأساتذة؟' : 'Delete All Teachers?',
              message: language === 'ar' ? 'تحذير: هذا سيؤدي إلى حذف جميع حسابات الأساتذة نهائياً، ألا الإدارة. هل أنت متأكد؟' : 'Warning: This will delete all teacher accounts permanently except admins. Are you sure?',
              onConfirm: deleteAllTeachers
            })}
            disabled={isImporting}
            className="flex-1 md:flex-none px-6 py-3 bg-red-50 border border-red-200 text-red-600 rounded-2xl font-semibold hover:bg-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Trash2 size={20} /> {language === 'ar' ? 'حذف الكل' : 'Delete All'}
          </button>
          <button
            onClick={handleBulkImport}
            disabled={isImporting}
            className="flex-1 md:flex-none px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-semibold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Users size={20} /> {isImporting ? t('importing') : t('bulk_import')}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex-1 md:flex-none px-6 py-3 bg-zinc-900 text-white rounded-2xl font-semibold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} /> {t('add_teacher')}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('add_teacher')}</h3>
            <form onSubmit={handleAddTeacher} className="space-y-4">
              <div className="relative">
                <input name="name" placeholder={t('full_name')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="relative">
                <input name="email" type="email" placeholder={t('email')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              </div>
              <div className="relative">
                <input name="password" type="text" placeholder={t('password')} className="w-full p-3 rounded-xl border border-zinc-200" required />
                <button 
                  type="button"
                  onClick={(e) => {
                    const { password } = generateCredentials();
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    input.value = password;
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                  title={t('generate_account')}
                >
                  <Key size={18} />
                </button>
              </div>
              <select 
                name="role" 
                className="w-full p-3 rounded-xl border border-zinc-200"
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                value={selectedRole}
              >
                <option value="teacher">{t('teacher')}</option>
                <option value="specialty_manager">{t('manager')}</option>
                <option value="admin">{t('admin')}</option>
              </select>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('teacher_type')}</label>
                <select name="teacherType" className="w-full p-3 rounded-xl border border-zinc-200" required>
                  <option value="permanent_internal">{t('permanent_internal')}</option>
                  <option value="permanent_external">{t('permanent_external')}</option>
                  <option value="temporary">{t('temporary')}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('department')}</label>
                <input name="department" placeholder={t('mechanical_engineering_example')} className="w-full p-3 rounded-xl border border-zinc-200" />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('rank')}</label>
                <select name="rank" className="w-full p-3 rounded-xl border border-zinc-200">
                  <option value="">{t('select_rank')}</option>
                  <option value="Pr">Pr</option>
                  <option value="MCA">MCA</option>
                  <option value="MCB">MCB</option>
                  <option value="MAA">MAA</option>
                  <option value="MAA_DOC">MAA (DOC)</option>
                  <option value="DOC">DOC</option>
                </select>
              </div>

              {selectedRole === 'specialty_manager' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500 px-1">{t('managed_specialty')}</label>
                    <select name="managedSpecialtyId" className="w-full p-3 rounded-xl border border-zinc-200" required>
                      <option value="">{t('select_specialty')}</option>
                      {specialties.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.field})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500 px-1">{t('managed_phase')}</label>
                    <select name="managedPhase" className="w-full p-3 rounded-xl border border-zinc-200" required>
                      <option value="">{t('select_phase')}</option>
                      <option value="license">{t('license')}</option>
                      <option value="master">{t('master')}</option>
                      <option value="engineers">{t('engineers')}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500 px-1">{t('appointment_date')}</label>
                    <input name="appointmentDate" type="date" className="w-full p-3 rounded-xl border border-zinc-200" required />
                    <p className="text-[10px] text-zinc-400 px-1">{t('appointment_duration')}</p>
                  </div>
                  <div className="flex items-center gap-2 px-1">
                    <input type="checkbox" name="isRenewed" id="isRenewed" className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                    <label htmlFor="isRenewed" className="text-sm text-zinc-600">{t('renewed_appointment')}</label>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" name="isTemporary" id="isTemporary" className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="isTemporary" className="text-sm text-zinc-600">{t('temporary_teacher')}</label>
              </div>

              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" name="isUnder1275" id="isUnder1275" className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="isUnder1275" className="text-sm text-zinc-600">{t('under_1275')}</label>
              </div>

              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" name="sendEmail" id="sendEmail" className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="sendEmail" className="text-sm text-zinc-600">{t('send_account_details')}</label>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => { setShowAdd(false); setSelectedRole('teacher'); }} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">{t('cancel')}</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">{t('add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {generatedAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-900">{t('account_created_success')}</h3>
              <p className="text-zinc-500 text-sm mt-1">{t('credentials_for')} {generatedAccount.name}</p>
            </div>
            
            <div className="bg-zinc-50 p-4 rounded-2xl space-y-3 text-left border border-zinc-100">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">{t('username_email')}</label>
                <div className="font-mono text-sm text-zinc-700">{generatedAccount.email}</div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">{t('password')}</label>
                <div className="font-mono text-sm text-zinc-700">{generatedAccount.password}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    const appUrl = getPublicUrl();
                    const text = t('whatsapp_message')
                      .replace('{name}', generatedAccount.name)
                      .replace('{email}', generatedAccount.email)
                      .replace('{password}', generatedAccount.password)
                      .replace('{url}', appUrl);
                    navigator.clipboard.writeText(text);
                    toast.success(t('success'));
                  }}
                  className="flex-1 py-3 bg-zinc-100 text-zinc-700 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all"
                >
                  <Copy size={18} /> {t('copy')}
                </button>
                <button 
                  onClick={() => shareViaWhatsApp(generatedAccount)}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-700 transition-all"
                >
                  <MessageCircle size={18} /> WhatsApp
                </button>
              </div>
              <button 
                onClick={() => sendAccountDetails({ email: generatedAccount.email, displayName: generatedAccount.name, uid: generatedAccount.uid } as User, generatedAccount.password)}
                disabled={sendingAccount === generatedAccount.uid}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                <Mail size={18} className={cn(sendingAccount === generatedAccount.uid && "animate-spin")} />
                {sendingAccount === generatedAccount.uid ? t('sending_email') : t('send_to_email')}
              </button>
            </div>
            <button 
              onClick={() => setGeneratedAccount(null)}
              className="w-full py-2 text-zinc-400 text-sm hover:text-zinc-600"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {editingTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t('edit_teacher')}</h3>
            <form onSubmit={handleEditTeacher} className="space-y-4">
              <input name="name" defaultValue={editingTeacher.displayName} placeholder={t('full_name')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              <input name="email" type="email" defaultValue={editingTeacher.email} placeholder={t('email')} className="w-full p-3 rounded-xl border border-zinc-200" required />
              <select 
                name="role" 
                defaultValue={editingTeacher.role} 
                className="w-full p-3 rounded-xl border border-zinc-200"
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              >
                <option value="teacher">{t('teacher')}</option>
                <option value="specialty_manager">{t('manager')}</option>
                <option value="admin">{t('admin')}</option>
              </select>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('teacher_type')}</label>
                <select name="teacherType" defaultValue={editingTeacher.teacherType} className="w-full p-3 rounded-xl border border-zinc-200" required>
                  <option value="permanent_internal">{t('permanent_internal')}</option>
                  <option value="permanent_external">{t('permanent_external')}</option>
                  <option value="temporary">{t('temporary')}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('department')}</label>
                <input name="department" defaultValue={editingTeacher.department} placeholder={t('mechanical_engineering_example')} className="w-full p-3 rounded-xl border border-zinc-200" />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('rank')}</label>
                <select name="rank" defaultValue={editingTeacher.rank} className="w-full p-3 rounded-xl border border-zinc-200">
                  <option value="">{t('select_rank')}</option>
                  <option value="Pr">Pr</option>
                  <option value="MCA">MCA</option>
                  <option value="MCB">MCB</option>
                  <option value="MAA">MAA</option>
                  <option value="MAA_DOC">MAA (DOC)</option>
                  <option value="DOC">DOC</option>
                </select>
              </div>

              {(selectedRole === 'specialty_manager' || (selectedRole === 'teacher' && editingTeacher.role === 'specialty_manager')) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500 px-1">{t('managed_specialty')}</label>
                    <select name="managedSpecialtyId" defaultValue={editingTeacher.managedSpecialtyId} className="w-full p-3 rounded-xl border border-zinc-200" required>
                      <option value="">{t('select_specialty')}</option>
                      {specialties.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.field})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500 px-1">{t('managed_phase')}</label>
                    <select name="managedPhase" defaultValue={editingTeacher.managedPhase} className="w-full p-3 rounded-xl border border-zinc-200" required>
                      <option value="">{t('select_phase')}</option>
                      <option value="license">{t('license')}</option>
                      <option value="master">{t('master')}</option>
                      <option value="engineers">{t('engineers')}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500 px-1">{t('appointment_date')}</label>
                    <input name="appointmentDate" type="date" defaultValue={editingTeacher.appointmentDate} className="w-full p-3 rounded-xl border border-zinc-200" required />
                  </div>
                  <div className="flex items-center gap-2 px-1">
                    <input type="checkbox" name="isRenewed" id="editIsRenewed" defaultChecked={editingTeacher.isRenewed} className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                    <label htmlFor="editIsRenewed" className="text-sm text-zinc-600">{t('renewed_appointment')}</label>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" name="isTemporary" id="editIsTemporary" defaultChecked={editingTeacher.isTemporary} className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="editIsTemporary" className="text-sm text-zinc-600">{t('temporary_teacher')}</label>
              </div>

              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" name="isUnder1275" id="editIsUnder1275" defaultChecked={editingTeacher.isUnder1275} className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="editIsUnder1275" className="text-sm text-zinc-600">{t('under_1275')}</label>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => { setEditingTeacher(null); setSelectedRole('teacher'); }} className="flex-1 py-3 border border-zinc-200 rounded-xl font-semibold">{t('cancel')}</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTeachers.map((teacher) => (
          <div key={teacher.uid} className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden flex flex-col">
            <div className="p-6 flex-1 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl border flex items-center justify-center font-bold text-xl shadow-inner transition-all",
                    teacher.isActive !== false ? "bg-zinc-50 border-zinc-100 text-zinc-600" : "bg-red-50 border-red-100 text-red-600 grayscale opacity-50"
                  )}>
                    {teacher.displayName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={cn(
                        "font-bold truncate text-lg transition-all",
                        teacher.isActive !== false ? "text-zinc-900" : "text-zinc-400 line-through"
                      )}>{teacher.displayName}</h4>
                      {teacher.rank && (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-tighter">
                          {teacher.rank}
                        </span>
                      )}
                      {teacher.authStatus === 'failed' && (
                        <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-tighter animate-pulse" title={teacher.authError}>
                          {t('no_auth') || 'بدون حساب'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                      <Mail size={12} />
                      <span className="truncate">{teacher.email}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleTeacherStatus(teacher)}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    teacher.isActive !== false 
                      ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" 
                      : "text-red-600 bg-red-50 hover:bg-red-100"
                  )}
                  title={teacher.isActive !== false ? t('inactive_account') : t('active_account')}
                >
                  {teacher.isActive !== false ? <UserCheck size={20} /> : <UserX size={20} />}
                </button>
              </div>

              <div className="space-y-3 pt-2">
                {teacher.role === 'specialty_manager' && teacher.managedSpecialtyId && (
                  <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 space-y-2">
                    <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                      <Shield size={10} /> {t('manager')}
                    </div>
                    <div className="text-xs font-bold text-zinc-700">
                      {specialties.find(s => s.id === teacher.managedSpecialtyId)?.name}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase">
                      <span>{t(teacher.managedPhase || '')}</span>
                      {teacher.appointmentDate && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full",
                          getAppointmentStatus(teacher)?.color
                        )}>
                          {getAppointmentStatus(teacher)?.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {teacher.teacherType && (
                    <div className={cn(
                      "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border",
                      teacher.teacherType === 'permanent_internal' ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
                      teacher.teacherType === 'permanent_external' ? "bg-blue-50 border-blue-100 text-blue-700" :
                      "bg-amber-50 border-amber-100 text-amber-700"
                    )}>
                      {teacher.teacherType === 'permanent_internal' ? t('permanent_internal') :
                       teacher.teacherType === 'permanent_external' ? t('permanent_external') :
                       t('temporary')}
                    </div>
                  )}
                  {teacher.department && (
                    <div className="px-3 py-1 bg-zinc-50 border border-zinc-100 text-zinc-500 rounded-xl text-[10px] font-black uppercase tracking-wider">
                      {teacher.department}
                    </div>
                  )}
                  {teacher.isUnder1275 && (
                    <div className="px-3 py-1 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-indigo-100">
                      1275
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                <Shield size={10} />
                {t(teacher.role)}
              </div>
              <div className="flex gap-1">
                {teacher.password && teacher.password.length > 0 && (
                  <button 
                    onClick={() => setGeneratedAccount({ email: teacher.email, password: teacher.password!, name: teacher.displayName, uid: teacher.uid })}
                    className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                    title={t('view_account') || 'View Account'}
                  >
                    <Eye size={16} />
                  </button>
                )}
                <button 
                  onClick={() => handleManualGenerateAccount(teacher)}
                  disabled={isGenerating === teacher.uid}
                  className={cn(
                    "p-2 rounded-xl transition-all disabled:opacity-50",
                    teacher.password ? "text-amber-600 hover:bg-amber-50" : "text-zinc-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                  )}
                  title={teacher.password ? t('regenerate_password') : t('generate_account')}
                >
                  {teacher.password ? (
                    <RefreshCw size={16} className={cn(isGenerating === teacher.uid && "animate-spin")} />
                  ) : (
                    <Key size={16} className={cn(isGenerating === teacher.uid && "animate-spin")} />
                  )}
                </button>
                <div className="w-px h-4 bg-zinc-200 mx-1 self-center" />
                <button 
                  onClick={() => setEditingTeacher(teacher)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => setConfirmationModal({
                    title: t('delete'),
                    message: t('delete_warning'),
                    onConfirm: () => deleteTeacher(teacher.id!)
                  })}
                  className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
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
