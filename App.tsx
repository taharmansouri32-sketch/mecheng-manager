import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'react-hot-toast';

import { Dashboard } from './pages/Dashboard';
import { CalendarManagement } from './pages/CalendarManagement';
import { SessionTracking } from './pages/SessionTracking';
import { ScheduleManagement } from './pages/ScheduleManagement';
import { ProjectManagement } from './pages/ProjectManagement';
import { TeacherManagement } from './pages/TeacherManagement';
import { SpecialtyManagement } from './pages/SpecialtyManagement';
import { CompensationPage } from './pages/Compensation';
import { OvertimeCalculation } from './pages/OvertimeCalculation';
import { StudentManagement } from './pages/StudentManagement';
import { DepartmentStatsPage } from './pages/DepartmentStats';
import { Certificates } from './pages/Certificates';
import { FieldVisits } from './pages/FieldVisits';
import { AIAssistant } from './pages/AIAssistant';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { dbService } from './services/db';
import toast from 'react-hot-toast';

function RefreshListener() {
  const { user } = useAuth();
  const lastRefreshRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!user) return;

    const unsubscribe = dbService.subscribeToDocument<{ lastRefresh: string }>('system_settings', 'global', (data) => {
      if (data?.lastRefresh) {
        if (lastRefreshRef.current && lastRefreshRef.current !== data.lastRefresh) {
          window.location.reload();
        }
        lastRefreshRef.current = data.lastRefresh;
      }
    });

    return () => unsubscribe();
  }, [user]);

  return null;
}

// Pages (to be implemented)

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode, requiredRole?: 'admin' | 'specialty_manager' | 'teacher' }) {
  const { user, loading, activeRole } = useAuth();
  const location = useLocation();
  
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
    </div>
  );
  
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (requiredRole && activeRole !== requiredRole && activeRole !== 'admin') {
    return <Navigate to="/" />;
  }
  
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LanguageProvider>
          <Toaster position="top-right" />
          <RefreshListener />
          <BrowserRouter>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/teachers" element={<ProtectedRoute requiredRole="admin"><TeacherManagement /></ProtectedRoute>} />
            <Route path="/specialties" element={<ProtectedRoute requiredRole="specialty_manager"><SpecialtyManagement /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute requiredRole="admin"><CalendarManagement /></ProtectedRoute>} />
            <Route path="/schedules" element={<ProtectedRoute><ScheduleManagement /></ProtectedRoute>} />
            <Route path="/sessions" element={<ProtectedRoute><SessionTracking /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><ProjectManagement /></ProtectedRoute>} />
            <Route path="/students" element={<ProtectedRoute requiredRole="specialty_manager"><StudentManagement /></ProtectedRoute>} />
            <Route path="/stats" element={<ProtectedRoute requiredRole="admin"><DepartmentStatsPage /></ProtectedRoute>} />
            <Route path="/compensation" element={<ProtectedRoute><CompensationPage /></ProtectedRoute>} />
            <Route path="/overtime" element={<ProtectedRoute><OvertimeCalculation /></ProtectedRoute>} />
            <Route path="/certificates" element={<ProtectedRoute><Certificates /></ProtectedRoute>} />
            <Route path="/field-visits" element={<ProtectedRoute><FieldVisits /></ProtectedRoute>} />
            <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  </ErrorBoundary>
  );
}
