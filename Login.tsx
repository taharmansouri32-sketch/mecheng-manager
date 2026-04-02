import React, { useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { motion } from 'motion/react';
import { LogIn, Mail, Lock, Sparkles, Settings as SettingsIcon } from 'lucide-react';
import toast from 'react-hot-toast';

export const Login: React.FC = () => {
  const { login, loginWithEmail, user } = useAuth();
  const { t, language } = useLanguage();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || "/";
  const search = (location.state as any)?.from?.search || "";

  if (user) return <Navigate to={from + search} replace />;

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await login();
      // If login is successful, the component will re-render and Navigate to "/"
    } catch (error: any) {
      console.error('Google login error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        toast.error(language === 'ar'
          ? 'يجب إضافة localhost ضمن Authorized domains في Firebase Authentication.'
          : 'Add localhost to Authorized domains in Firebase Authentication.',
          { duration: 8000 }
        );
      } else if (error.message?.includes('identitytoolkit.googleapis.com') || error.code === 'auth/operation-not-allowed') {
        const projectId = "gen-lang-client-0665993045";
        toast.error(language === 'ar' 
          ? 'يجب تفعيل Identity Toolkit API في لوحة تحكم Google Cloud. يرجى مراجعة المسؤول.' 
          : 'Identity Toolkit API must be enabled in Google Cloud Console. Please contact admin.', 
          { duration: 8000 }
        );
      } else if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        toast.error(language === 'ar'
          ? 'تم حظر نافذة تسجيل الدخول. يرجى السماح بالمنافذ المنبثقة أو استخدام متصفح آخر.'
          : 'Popup sign-in was blocked. Please allow popups or use a different browser.',
          { duration: 8000 }
        );
      } else if (error.code === 'auth/not-authorized') {
        toast.error(language === 'ar' ? 'عذراً، هذا البريد الإلكتروني غير مسجل في قائمة الأساتذة. يرجى مراجعة رئيس القسم.' : 'Sorry, this email is not in the authorized teachers list. Please contact the department head.');
      } else {
        toast.error(error.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();
      await loginWithEmail(trimmedEmail, trimmedPassword);
      toast.success(language === 'ar' ? 'أهلاً بك مجدداً!' : 'Welcome back!');
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/not-authorized') {
        toast.error(language === 'ar' ? 'عذراً، هذا البريد الإلكتروني غير مسجل في قائمة الأساتذة.' : 'Sorry, this email is not in the authorized teachers list.');
      } else if (error.code === 'auth/user-disabled') {
         toast.error(language === 'ar' ? 'عذراً، هذا الحساب معطل حالياً. يرجى مراجعة الإدارة.' : 'Account disabled. Please contact admin.');
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-email') {
        if (email.trim().toLowerCase() === 'taharmansouri32@gmail.com' || email.trim().toLowerCase() === 't.mansouri@lagh-univ.dz') {
          toast.error(language === 'ar' ? 'بيانات الدخول غير صحيحة. يرجى استخدام "الدخول عبر جوجل" للمسؤول.' : 'Invalid admin credentials. Please use "Google Login".');
        } else {
          toast.error(language === 'ar' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Invalid email or password.');
        }
      } else {
        toast.error(error.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-zinc-950">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 opacity-40 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?auto=format&fit=crop&q=80&w=1920")',
          filter: 'grayscale(0.5) contrast(1.2)'
        }}
      />
      <div className="absolute inset-0 z-10 bg-gradient-to-br from-zinc-950/90 via-zinc-950/70 to-zinc-900/90" />

      {/* Animated Gears (SVG) for Mechanical Feel */}
      <div className="absolute top-10 left-10 opacity-10 animate-spin-slow text-white">
        <SettingsIcon size={200} />
      </div>
      <div className="absolute bottom-10 right-10 opacity-10 animate-reverse-spin text-white">
        <SettingsIcon size={150} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-20 max-w-lg w-full"
      >
        {/* Header Info */}
        <div className="text-center mb-8 text-white space-y-2">
          <motion.h2 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg font-medium opacity-80"
          >
            {t('university_name')}
          </motion.h2>
          <motion.h3 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-md opacity-70"
          >
            {t('faculty_name')}
          </motion.h3>
          <motion.h1 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="text-3xl font-bold tracking-tight text-indigo-400"
          >
            {t('department_name')}
          </motion.h1>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2.5rem] shadow-2xl overflow-hidden">
          <div className="p-8 md:p-12">
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                <LogIn size={40} />
              </div>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2 px-1">
                  {t('username')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="example@univ.dz"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2 px-1">
                  {t('password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn size={22} />
                    {t('login_button')}
                  </>
                )}
              </button>
            </form>

            <div className="relative my-10">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-transparent text-zinc-500 uppercase tracking-widest font-medium">
                  {t('or_continue_with')}
                </span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  {t('google_login')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer Info */}
        <p className="text-center mt-8 text-zinc-500 text-sm">
          &copy; {new Date().getFullYear()} {t('department_name')}
        </p>
      </motion.div>

      <style>{`
        @keyframes reverse-spin {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .animate-spin-slow {
          animation: spin 15s linear infinite;
        }
        .animate-reverse-spin {
          animation: reverse-spin 20s linear infinite;
        }
      `}</style>
    </div>
  );
};
