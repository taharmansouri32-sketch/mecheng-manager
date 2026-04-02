import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, Globe, Shield, Bell, Download, Upload, Calendar, Clock, Plus, Trash2, Lock, Mail, AlertCircle, CheckCircle2, Send, RefreshCw } from 'lucide-react';
import { backupService } from '../services/backupService';
import { dbService } from '../services/db';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import { ConfirmationModal } from '../components/ConfirmationModal';

export function Settings() {
  const { t, language, setLanguage, academicYear, setAcademicYear, academicYears, updateAcademicYears } = useLanguage();
  const { user, isAdmin, isActualAdmin, activeRole, updateUserPassword } = useAuth();
  const [restoring, setRestoring] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ configured: boolean; user: string | null; appUrl: string } | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    const checkEmailStatus = async () => {
      try {
        const response = await fetch('/api/config/status');
        const data = await response.json();
        setEmailStatus({ 
          configured: data.emailConfigured, 
          user: data.emailUser,
          appUrl: data.appUrl
        });
      } catch (error) {
        console.error('Failed to check email status:', error);
      }
    };
    if (isActualAdmin) {
      checkEmailStatus();
    }
  }, [isActualAdmin]);

  const handleTestEmail = async () => {
    setIsTestingEmail(true);
    try {
      const response = await fetch('/api/teachers/send-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          displayName: user?.displayName,
          password: 'TEST_PASSWORD_123'
        })
      });
      const data = await response.json();
      if (data.success) {
        toast.success(language === 'ar' ? 'تم إرسال بريد تجريبي بنجاح! تحقق من صندوق الوارد.' : 'Test email sent successfully! Check your inbox.');
      } else {
        toast.error(data.message || t('error'));
      }
    } catch (error) {
      console.error('Email test failed:', error);
      toast.error(t('error'));
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error(t('fill_all_fields') || 'Please fill in all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('passwords_dont_match') || 'Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t('password_too_short') || 'Password must be at least 6 characters');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await updateUserPassword(newPassword);
      toast.success(t('password_update_success') || 'Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password update failed:', error);
      if (error.message?.includes('identitytoolkit.googleapis.com') || error.code === 'auth/operation-not-allowed') {
        toast.error(language === 'ar' 
          ? 'يجب تفعيل Identity Toolkit API في لوحة تحكم Google Cloud. يرجى مراجعة المسؤول.' 
          : 'Identity Toolkit API must be enabled in Google Cloud Console. Please contact admin.', 
          { duration: 8000 }
        );
      } else {
        toast.error(error.message || t('error'));
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleAddYear = async () => {
    if (!newYear) return;
    if (academicYears.includes(newYear)) {
      toast.error(t('year_exists'));
      return;
    }
    const updatedYears = [...academicYears, newYear].sort().reverse();
    await updateAcademicYears(updatedYears);
    setNewYear('');
    toast.success(t('year_added_success'));
  };

  const handleDeleteYear = async (yearToDelete: string) => {
    if (academicYears.length <= 1) {
      toast.error(t('cannot_delete_last_year'));
      return;
    }
    const updatedYears = academicYears.filter(y => y !== yearToDelete);
    await updateAcademicYears(updatedYears);
    toast.success(t('year_deleted_success'));
  };

  const handleBackup = async () => {
    try {
      await backupService.exportData();
      toast.success(t('success'));
    } catch (error) {
      toast.error(t('error'));
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setConfirmationModal({
      title: t('restore_data') || 'Restore Data',
      message: t('confirm_restore') || 'Are you sure? This will overwrite existing data.',
      onConfirm: async () => {
        setRestoring(true);
        try {
          await backupService.importData(file);
          toast.success(t('success'));
          window.location.reload();
        } catch (error) {
          toast.error(t('error'));
        } finally {
          setRestoring(false);
          setConfirmationModal(null);
        }
      }
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-zinc-900">{t('settings')}</h2>
        <p className="text-zinc-500">{t('settings_desc') || 'Manage your account and application preferences'}</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Academic Year Settings */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
          <div className="flex items-center gap-3 text-zinc-900 font-bold">
            <Calendar className="text-zinc-400" size={20} />
            {t('active_academic_year')}
          </div>
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800 text-xs">
            {t('academic_year_info')}
          </div>
          <div className="flex flex-wrap gap-3">
            {academicYears.map((year) => (
              <button
                key={year}
                onClick={() => setAcademicYear(year)}
                className={`px-6 py-2 rounded-xl font-medium transition-all ${
                  academicYear === year
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
          
          {isActualAdmin && (
            <div className="pt-4 border-t border-zinc-100 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('manage_years')}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="e.g. 2027/2028"
                  className="flex-1 p-3 rounded-xl border border-zinc-200 text-sm"
                />
                <button
                  onClick={handleAddYear}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all flex items-center gap-2"
                >
                  <Plus size={16} /> {t('add')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {academicYears.map(year => (
                  <div key={year} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                    <span className="text-sm font-medium text-zinc-700">{year}</span>
                    <button
                      onClick={() => handleDeleteYear(year)}
                      className="p-1 text-zinc-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Language Settings */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
          <div className="flex items-center gap-3 text-zinc-900 font-bold">
            <Globe className="text-zinc-400" size={20} />
            {t('language')}
          </div>
          <div className="flex gap-3">
            {[
              { code: 'ar', label: 'العربية' },
              { code: 'fr', label: 'Français' },
              { code: 'en', label: 'English' }
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code as any)}
                className={`px-6 py-2 rounded-xl font-medium transition-all ${
                  language === lang.code
                    ? 'bg-zinc-900 text-white shadow-lg'
                    : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Profile Info */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
          <div className="flex items-center gap-3 text-zinc-900 font-bold">
            <Shield className="text-zinc-400" size={20} />
            {t('profile')}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between p-3 bg-zinc-50 rounded-xl">
              <span className="text-zinc-500">{t('name')}</span>
              <span className="font-bold">{user?.displayName}</span>
            </div>
            <div className="flex justify-between p-3 bg-zinc-50 rounded-xl">
              <span className="text-zinc-500">{t('email')}</span>
              <span className="font-bold">{user?.email}</span>
            </div>
            <div className="flex justify-between p-3 bg-zinc-50 rounded-xl">
              <span className="text-zinc-500">{t('role')}</span>
              <div className="flex flex-col items-end">
                <span className="font-bold uppercase">{user?.role}</span>
                {activeRole !== user?.role && (
                  <span className="text-[10px] text-emerald-600 font-bold uppercase">
                    ({t('active')}: {t(activeRole!)})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
          <div className="flex items-center gap-3 text-zinc-900 font-bold">
            <Lock className="text-zinc-400" size={20} />
            {t('change_password')}
          </div>
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('new_password')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3 rounded-xl border border-zinc-200 text-sm"
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 px-1">{t('confirm_password')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 rounded-xl border border-zinc-200 text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isUpdatingPassword ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={16} />}
              {t('update_password')}
            </button>
          </form>
        </div>

        {/* Admin Settings Section - Always visible to Admin to avoid confusion */}
        {isActualAdmin && (
          <div className="space-y-6 pt-6 border-t-2 border-zinc-200">
            <div className="flex items-center gap-2">
              <Shield className="text-emerald-600" size={24} />
              <h3 className="text-xl font-bold text-zinc-900">{t('admin_controls')}</h3>
            </div>

            {/* Backup & Restore */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
              <div className="flex items-center gap-3 text-zinc-900 font-bold">
                <Download className="text-zinc-400" size={20} />
                {t('backup_restore')}
              </div>
              <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-zinc-600 text-xs">
                {t('backup_info') || 'Export all application data to a JSON file for backup, or restore from a previously exported file.'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={handleBackup}
                  className="flex items-center justify-center gap-2 p-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all"
                >
                  <Download size={20} />
                  {t('download_backup')}
                </button>
                <label className="flex items-center justify-center gap-2 p-4 bg-zinc-100 text-zinc-900 rounded-2xl font-bold hover:bg-zinc-200 transition-all cursor-pointer">
                  <Upload size={20} />
                  {restoring ? t('restoring') : t('restore_backup')}
                  <input type="file" accept=".json" onChange={handleRestore} className="hidden" disabled={restoring} />
                </label>
              </div>
            </div>

            {/* Email Configuration Test */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-zinc-900 font-bold">
                  <Mail className="text-zinc-400" size={20} />
                  {language === 'ar' ? 'إعدادات البريد الإلكتروني' : 'Email Configuration'}
                </div>
                {emailStatus && (
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5",
                    emailStatus.configured ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                  )}>
                    <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", emailStatus.configured ? "bg-emerald-500" : "bg-red-500")} />
                    {emailStatus.configured ? (language === 'ar' ? 'جاهز للإرسال' : 'READY') : (language === 'ar' ? 'غير مضبوط' : 'NOT CONFIGURED')}
                  </div>
                )}
              </div>

              {emailStatus?.configured ? (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-medium border-b border-emerald-100 pb-2">
                    <CheckCircle2 size={14} />
                    <p>{language === 'ar' ? 'النظام متصل بالبريد:' : 'System connected to email:'} <span className="font-bold">{emailStatus.user}</span></p>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-700 text-[10px]">
                    <Globe size={12} />
                    <p>{language === 'ar' ? 'رابط التطبيق المرسل:' : 'Sent App URL:'} <span className="font-mono break-all">{emailStatus.appUrl}</span></p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-2">
                  <div className="flex items-start gap-2 text-amber-800 text-xs font-medium">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <p>
                      {language === 'ar' 
                        ? 'يجب ضبط متغيرات البيئة (EMAIL_USER و EMAIL_PASS) في إعدادات AI Studio ليعمل الإرسال.' 
                        : 'Environment variables (EMAIL_USER and EMAIL_PASS) must be set in AI Studio settings for this to work.'}
                    </p>
                  </div>
                  <div className="text-[10px] text-amber-700/70 italic px-6">
                    {language === 'ar'
                      ? 'انقر على أيقونة الترس (Settings) في أعلى يمين واجهة AI Studio، ثم اختر Environment Variables وأضف القيم هناك.'
                      : 'Click the gear icon (Settings) in the top-right of the AI Studio interface, select Environment Variables, and add the values there.'}
                  </div>
                </div>
              )}

              <button
                onClick={handleTestEmail}
                disabled={isTestingEmail}
                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isTestingEmail ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                {language === 'ar' ? 'إرسال بريد تجريبي لنفسي' : 'Send test email to myself'}
              </button>
            </div>

            {/* Overtime Rules */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
              <div className="flex items-center gap-3 text-zinc-900 font-bold">
                <Clock className="text-zinc-400" size={20} />
                {t('overtime_rules')}
              </div>
              <div className="p-4 bg-zinc-50 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-zinc-600">{t('internal_teacher_quota')}</span>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold">9 {t('hours')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-zinc-600">{t('external_teacher_quota')}</span>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold">0 {t('hours')}</span>
                </div>
                <p className="text-[10px] text-zinc-400 italic">
                  {t('overtime_info') || 'Internal teachers must complete 9 hours before overtime is calculated. External and temporary teachers receive overtime for all hours.'}
                </p>
              </div>
            </div>
          </div>
        )}
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
