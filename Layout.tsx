import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  Calendar as CalendarIcon, 
  Clock, 
  FileText, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Globe,
  ClipboardCheck,
  AlertCircle,
  Calculator,
  BarChart3,
  Award,
  Bell,
  Map,
  Bot
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../lib/utils';
import { dbService } from '../services/db';
import { where } from 'firebase/firestore';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  roles: string[];
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { 
    user, 
    logout, 
    isAdmin, 
    isActualAdmin, 
    activeRole, 
    setImpersonatedRole,
  } = useAuth();
  const { t, language, setLanguage, isRTL, academicYear, setAcademicYear, academicYears } = useLanguage();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      const fetchNotifications = async () => {
        const data = await dbService.getCollection('notifications', [
          where('userId', '==', user.uid)
        ]);
        setNotifications(data.filter((n: any) => !n.read).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      };
      fetchNotifications();
      
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const markAsRead = async (id: string) => {
    await dbService.updateDocument('notifications', id, { read: true });
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const navItems: NavItem[] = [
    { label: 'dashboard', icon: LayoutDashboard, path: '/', roles: ['admin', 'vice_admin', 'specialty_manager', 'teacher'] },
    { label: 'teachers', icon: Users, path: '/teachers', roles: ['admin', 'vice_admin'] },
    { label: 'specialties', icon: BookOpen, path: '/specialties', roles: ['admin', 'vice_admin', 'specialty_manager'] },
    { label: 'calendar', icon: CalendarIcon, path: '/calendar', roles: ['admin', 'vice_admin'] },
    { label: 'schedules', icon: Clock, path: '/schedules', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'sessions', icon: ClipboardCheck, path: '/sessions', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'projects', icon: FileText, path: '/projects', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'students', icon: Users, path: '/students', roles: ['admin', 'vice_admin', 'specialty_manager'] },
    { label: 'department_stats', icon: BarChart3, path: '/stats', roles: ['admin', 'vice_admin'] },
    { label: 'compensation', icon: AlertCircle, path: '/compensation', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'overtime_calculation', icon: Calculator, path: '/overtime', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'certificates', icon: Award, path: '/certificates', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'field_visits', icon: Map, path: '/field-visits', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'ai_assistant', icon: Bot, path: '/ai-assistant', roles: ['admin', 'vice_admin', 'teacher', 'specialty_manager'] },
    { label: 'settings', icon: Settings, path: '/settings', roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => 
    activeRole && item.roles.includes(activeRole)
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={cn("min-h-screen bg-stone-100 flex", isRTL ? "font-arabic" : "font-sans")}>
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-zinc-900 text-white flex flex-col sticky top-0 h-screen z-50"
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-xl tracking-tight"
            >
              MechEng <span className="text-emerald-500">Manager</span>
            </motion.div>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {filteredNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center p-3 rounded-xl transition-all duration-200 group",
                location.pathname === item.path 
                  ? "bg-emerald-600 text-white" 
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              )}
            >
              <item.icon size={22} className={cn(isSidebarOpen && (isRTL ? "ml-3" : "mr-3"))} />
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  {t(item.label)}
                </motion.span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-800 hidden md:block">
          <div className="flex items-center gap-3 p-3 text-zinc-500 text-xs font-medium">
            <Globe size={16} />
            {isSidebarOpen && <span>v2.1.0-stable</span>}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-zinc-900">
              {filteredNavItems.find(i => i.path === location.pathname)?.label ? t(filteredNavItems.find(i => i.path === location.pathname)!.label) : t('dashboard')}
            </h1>
            
            {/* Academic Year Selector */}
            <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg">
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-white text-zinc-700 border-none focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer shadow-sm"
              >
                {academicYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg">
              {['ar', 'fr', 'en'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang as any)}
                  className={cn(
                    "text-[10px] font-bold uppercase px-2 py-1 rounded transition-all",
                    language === lang ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {lang}
                </button>
              ))}
            </div>

            {/* Role Switcher */}
            {isActualAdmin && (
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
                <button
                  onClick={() => setImpersonatedRole(null)}
                  className={cn(
                    "text-[10px] font-bold uppercase px-2 py-1 rounded transition-all",
                    activeRole === 'admin' ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {t('admin')}
                </button>
                <button
                  onClick={() => setImpersonatedRole('vice_admin')}
                  className={cn(
                    "text-[10px] font-bold uppercase px-2 py-1 rounded transition-all",
                    activeRole === 'vice_admin' ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {t('vice_admin')}
                </button>
                <button
                  onClick={() => setImpersonatedRole('specialty_manager')}
                  className={cn(
                    "text-[10px] font-bold uppercase px-2 py-1 rounded transition-all",
                    activeRole === 'specialty_manager' ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {t('manager')}
                </button>
                <button
                  onClick={() => setImpersonatedRole('teacher')}
                  className={cn(
                    "text-[10px] font-bold uppercase px-2 py-1 rounded transition-all",
                    activeRole === 'teacher' ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {t('teacher')}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-all relative"
                >
                  <Bell size={22} className="text-zinc-600" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                  )}
                </button>

                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-zinc-100 overflow-hidden z-[60]"
                    >
                      <div className="p-4 border-b border-zinc-100 bg-zinc-50 flex justify-between items-center">
                        <h3 className="font-bold text-zinc-900">{t('notifications')}</h3>
                        <span className="text-[10px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">
                          {notifications.length} {t('new')}
                        </span>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-zinc-400">
                            <Bell size={32} className="mx-auto mb-2 opacity-20" />
                            <p className="text-sm font-medium">{t('no_new_notifications')}</p>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className="p-4 border-b border-zinc-50 hover:bg-zinc-50 transition-all cursor-pointer group"
                              onClick={() => {
                                markAsRead(notif.id);
                                if (notif.type === 'certificate_request') {
                                  navigate('/certificates');
                                }
                                setShowNotifications(false);
                              }}
                            >
                              <div className="flex gap-3">
                                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                                  <Award size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-zinc-900 leading-tight">
                                    {t('new_request_notification')}
                                  </p>
                                  <p className="text-xs text-zinc-500 mt-1">
                                    {notif.teacherName} - {t(notif.certificateType)}
                                  </p>
                                  <p className="text-[10px] text-zinc-400 mt-2 font-medium">
                                    {new Date(notif.timestamp).toLocaleString()}
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(notif.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-600 transition-all"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-zinc-900">{user?.displayName}</div>
              <div className="text-xs text-zinc-500">{t(activeRole || 'teacher')}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold border border-emerald-200">
              {user?.displayName?.charAt(0)}
            </div>
            <button
              onClick={handleLogout}
              className="p-2.5 hover:bg-red-50 text-zinc-400 hover:text-red-600 rounded-xl transition-all group"
              title={t('logout')}
            >
              <LogOut size={22} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
