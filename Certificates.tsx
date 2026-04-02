import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { User, Certificate, Module, Project, Specialty, Level } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  Award, 
  FileText, 
  Download, 
  Plus, 
  Search, 
  Filter, 
  Calendar,
  User as UserIcon,
  BookOpen,
  GraduationCap,
  ChevronRight,
  CheckCircle2,
  Clock,
  Send,
  Edit2,
  AlertCircle,
  Image as ImageIcon,
  Trash2,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { CertificateTemplate } from '../components/CertificateTemplate';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, TableBorders, UnderlineType } from 'docx';
import { saveAs } from 'file-saver';

export function Certificates() {
  const { t, isRTL, academicYear, academicYears } = useLanguage();
  const { user, activeRole, isAdmin } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'teaching' | 'supervision'>('teaching');
  const [selectedYears, setSelectedYears] = useState<string[]>([academicYear]);
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [autoFetchedModules, setAutoFetchedModules] = useState<{ name: string; level: string; specialty: string; academicYear: string; semester?: string }[]>([]);
  const [manualModules, setManualModules] = useState<{ name: string; level: string; specialty: string; academicYear: string; semester?: string }[]>([]);
  const [autoFetchedProjects, setAutoFetchedProjects] = useState<{ title: string; studentNames: string[]; academicYear: string; specialty?: string; defenseDate?: string }[]>([]);
  const [manualProjects, setManualProjects] = useState<{ title: string; studentNames: string[]; academicYear: string; specialty?: string; defenseDate?: string }[]>([]);
  const [showAddModuleModal, setShowAddModuleModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [issueTeacherId, setIssueTeacherId] = useState('');
  const [issueType, setIssueType] = useState<'teaching' | 'supervision'>('teaching');
  const [issueAutoFetchedModules, setIssueAutoFetchedModules] = useState<{ name: string; level: string; specialty: string; academicYear: string; semester?: string }[]>([]);
  const [issueManualModules, setIssueManualModules] = useState<{ name: string; level: string; specialty: string; academicYear: string; semester?: string }[]>([]);
  const [issueAutoFetchedProjects, setIssueAutoFetchedProjects] = useState<{ title: string; studentNames: string[]; academicYear: string; specialty?: string; defenseDate?: string }[]>([]);
  const [issueManualProjects, setIssueManualProjects] = useState<{ title: string; studentNames: string[]; academicYear: string; specialty?: string; defenseDate?: string }[]>([]);
  const [editingCert, setEditingCert] = useState<Certificate | null>(null);
  const [deletingCert, setDeletingCert] = useState<Certificate | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'teaching' | 'supervision'>('all');
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeCertForTemplate, setActiveCertForTemplate] = useState<{ cert: Certificate; teacher: User } | null>(null);
  const [selectedLevelNames, setSelectedLevelNames] = useState<string[]>([]);
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<string[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<'S1' | 'S2'>('S1');
  const [availableSpecialties, setAvailableSpecialties] = useState<Specialty[]>([]);
  const [availableModules, setAvailableModules] = useState<Module[]>([]);

  useEffect(() => {
    if (selectedLevelNames.length > 0) {
      const filteredSpecs = specialties.filter(s => 
        levels.some(l => selectedLevelNames.includes(l.name) && l.specialtyId === s.id)
      );
      setAvailableSpecialties(filteredSpecs);
      setSelectedSpecialtyIds(prev => prev.filter(id => filteredSpecs.some(s => s.id === id)));
    } else {
      setAvailableSpecialties([]);
      setSelectedSpecialtyIds([]);
    }
  }, [selectedLevelNames, specialties, levels]);

  useEffect(() => {
    if (selectedSpecialtyIds.length > 0 && selectedLevelNames.length > 0) {
      const filteredModules = modules.filter(m => {
        const level = levels.find(l => l.id === m.levelId);
        return selectedSpecialtyIds.includes(m.specialtyId) && 
               level && selectedLevelNames.includes(level.name) && 
               m.semester === selectedSemester;
      });
      setAvailableModules(filteredModules);
    } else {
      setAvailableModules([]);
    }
  }, [selectedSpecialtyIds, selectedLevelNames, selectedSemester, modules, levels]);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const settings = await dbService.getDocument('settings', 'certificate_logo') as any;
        if (settings && settings.url) {
          setLogoUrl(settings.url);
        }
      } catch (error) {
        console.error('Error fetching logo:', error);
      }
    };
    fetchLogo();
  }, []);

  useEffect(() => {
    if (user && showRequestModal) {
      setBirthDate(user.birthDate || '');
      setBirthPlace(user.birthPlace || '');
    }
  }, [user, showRequestModal]);

  useEffect(() => {
    const fetchData = async () => {
      const [certsData, teachersData, modulesData, projectsData, specsData, levelsData, schedulesData, studentsData] = await Promise.all([
        dbService.getCollection<Certificate>('certificates'),
        dbService.getCollection<User>('users'),
        dbService.getCollection<Module>('modules'),
        dbService.getCollection<Project>('projects'),
        dbService.getCollection<Specialty>('specialties'),
        dbService.getCollection<Level>('levels'),
        dbService.getCollection<any>('schedules'),
        dbService.getCollection<any>('students')
      ]);
      
      setCertificates(certsData);
      setTeachers(teachersData); // Include all users so we can find the admin for notifications
      setModules(modulesData);
      setProjects(projectsData);
      setSpecialties(specsData);
      setLevels(levelsData);
      setSchedules(schedulesData);
      setStudents(studentsData);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!user || !showRequestModal) return;

    if (requestType === 'teaching') {
      const fetched: { name: string; level: string; specialty: string; academicYear: string; semester?: string }[] = [];
      schedules
        .filter(s => s.type === 'semester' && selectedYears.includes(s.academicYear))
        .forEach(s => {
          if (s.data && Array.isArray(s.data)) {
            s.data.forEach((entry: any) => {
              if (entry.teacherId === user.uid) {
                fetched.push({
                  name: entry.subject,
                  level: entry.level,
                  specialty: entry.specialty,
                  academicYear: entry.academicYear,
                  semester: s.semester || ''
                });
              }
            });
          }
        });
      
      // Remove duplicates
      const unique = fetched.filter((v, i, a) => a.findIndex(t => (
        t.name === v.name && 
        t.level === v.level && 
        t.specialty === v.specialty && 
        t.academicYear === v.academicYear &&
        t.semester === v.semester
      )) === i);
      setAutoFetchedModules(unique);
    } else {
      const fetched = projects
        .filter(p => p.supervisorId === user.uid && selectedYears.includes(p.academicYear))
        .map(p => {
          const specialty = specialties.find(s => s.id === p.specialtyId);
          return {
            title: p.title,
            studentNames: p.students.map(sid => {
              const student = students.find(s => s.id === sid);
              return student ? student.name : sid;
            }),
            academicYear: p.academicYear,
            specialty: specialty ? specialty.name : '',
            defenseDate: p.defenseDate || ''
          };
        });
      setAutoFetchedProjects(fetched);
    }
  }, [requestType, selectedYears, user, showRequestModal, schedules, projects, students, specialties]);

  useEffect(() => {
    if (!issueTeacherId || !showIssueModal) return;

    if (issueType === 'teaching') {
      const fetched: { name: string; level: string; specialty: string; academicYear: string; semester?: string }[] = [];
      schedules
        .filter(s => s.type === 'semester' && selectedYears.includes(s.academicYear))
        .forEach(s => {
          if (s.data && Array.isArray(s.data)) {
            s.data.forEach((entry: any) => {
              if (entry.teacherId === issueTeacherId) {
                fetched.push({
                  name: entry.subject,
                  level: entry.level,
                  specialty: entry.specialty,
                  academicYear: entry.academicYear,
                  semester: s.semester || ''
                });
              }
            });
          }
        });
      
      const unique = fetched.filter((v, i, a) => a.findIndex(t => (
        t.name === v.name && 
        t.level === v.level && 
        t.specialty === v.specialty && 
        t.academicYear === v.academicYear &&
        t.semester === v.semester
      )) === i);
      setIssueAutoFetchedModules(unique);
    } else {
      const fetched = projects
        .filter(p => p.supervisorId === issueTeacherId && selectedYears.includes(p.academicYear))
        .map(p => {
          const specialty = specialties.find(s => s.id === p.specialtyId);
          return {
            title: p.title,
            studentNames: p.students.map(sid => {
              const student = students.find(s => s.id === sid);
              return student ? student.name : sid;
            }),
            academicYear: p.academicYear,
            specialty: specialty ? specialty.name : '',
            defenseDate: p.defenseDate || ''
          };
        });
      setIssueAutoFetchedProjects(fetched);
    }
  }, [issueTeacherId, issueType, selectedYears, showIssueModal, schedules, projects, students, specialties]);

  const generatePDF = async (cert: Certificate) => {
    const teacher = teachers.find(t => t.uid === cert.teacherId);
    if (!teacher) return;

    setIsGenerating(true);
    setActiveCertForTemplate({ cert, teacher });

    // Wait for the template to render
    setTimeout(async () => {
      const element = document.getElementById('certificate-template');
      if (!element) {
        setIsGenerating(false);
        return;
      }

      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          onclone: (clonedDoc) => {
            const styles = clonedDoc.getElementsByTagName('style');
            for (let i = 0; i < styles.length; i++) {
              styles[i].innerHTML = styles[i].innerHTML.replace(/oklch\([^)]+\)/g, '#000');
            }
          }
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgWidth = imgProps.width;
        const imgHeight = imgProps.height;
        
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        const finalWidth = imgWidth * ratio;
        const finalHeight = imgHeight * ratio;
        
        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;

        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
        pdf.save(`certificate_${cert.id}.pdf`);
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error(t('error_occurred'));
      } finally {
        setIsGenerating(false);
        setActiveCertForTemplate(null);
      }
    }, 500);
  };

  const previewPDF = async (cert: Certificate) => {
    const teacher = teachers.find(t => t.uid === cert.teacherId);
    if (!teacher) return;

    setIsGenerating(true);
    setActiveCertForTemplate({ cert, teacher });

    // Wait for the template to render
    setTimeout(async () => {
      const element = document.getElementById('certificate-template');
      if (!element) {
        setIsGenerating(false);
        return;
      }

      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          onclone: (clonedDoc) => {
            const styles = clonedDoc.getElementsByTagName('style');
            for (let i = 0; i < styles.length; i++) {
              styles[i].innerHTML = styles[i].innerHTML.replace(/oklch\([^)]+\)/g, '#000');
            }
          }
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgWidth = imgProps.width;
        const imgHeight = imgProps.height;
        
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        const finalWidth = imgWidth * ratio;
        const finalHeight = imgHeight * ratio;
        
        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;

        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
        
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        setPreviewPdfUrl(url);
      } catch (error) {
        console.error('Error previewing PDF:', error);
        toast.error(t('error_occurred'));
      } finally {
        setIsGenerating(false);
        setActiveCertForTemplate(null);
      }
    }, 500);
  };

  const handleRequestCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const request: Certificate = {
      id: Math.random().toString(36).substr(2, 9),
      teacherId: user.uid,
      type: requestType,
      academicYear: selectedYears[0] || academicYear,
      academicYears: selectedYears,
      status: 'requested',
      requestedAt: new Date().toISOString(),
      issuedAt: '',
      birthDate: birthDate || '',
      birthPlace: birthPlace || '',
      details: requestType === 'teaching' ? {
        modules: [...autoFetchedModules, ...manualModules]
      } : {
        projects: [...autoFetchedProjects, ...manualProjects]
      }
    };

    try {
      await dbService.setDocument('certificates', request.id, request);
      
      // Update UI immediately on success
      setCertificates([request, ...certificates]);
      setShowRequestModal(false);
      setSelectedLevelNames([]);
      setSelectedSpecialtyIds([]);
      setManualModules([]);
      setManualProjects([]);
      toast.success(t('request_submitted_success'));

      // Perform secondary actions silently in the background
      (async () => {
        // Save birth info to user profile
        if (requestType === 'teaching' && user.uid) {
          try {
            await dbService.updateDocument('users', user.uid, {
              birthDate,
              birthPlace
            });
          } catch (e) {
            console.warn('Silent profile update failed', e);
          }
        }

        // Create notification for admin
        const admin = teachers.find(t => t.role === 'admin');
        if (admin) {
          try {
            await dbService.addDocument('notifications', {
              userId: admin.uid,
              type: 'certificate_request',
              teacherId: user.uid,
              teacherName: user.displayName,
              certificateId: request.id,
              certificateType: requestType,
              timestamp: new Date().toISOString(),
              read: false
            });
          } catch (e) {
            console.warn('Silent notification failed', e);
          }
        }
      })();
      
    } catch (error) {
      console.error('Certificate request failed:', error);
      toast.error(t('error_occurred'));
    }
  };

  const handlePrepareCertificate = async (cert: Certificate) => {
    try {
      const updates: Partial<Certificate> = {
        status: 'prepared',
        preparedAt: new Date().toISOString()
      };
      await dbService.updateDocument('certificates', cert.id, updates);
      setCertificates(certificates.map(c => c.id === cert.id ? { ...c, ...updates } : c));
      
      // Create notification for teacher
      const teacher = teachers.find(t => t.uid === cert.teacherId);
      if (teacher) {
        await dbService.addDocument('notifications', {
          type: 'certificate_ready',
          teacherId: teacher.uid,
          teacherName: teacher.displayName,
          certificateId: cert.id,
          message: `Your ${cert.type} certificate is ready for pickup at the department office.`,
          timestamp: new Date().toISOString(),
          read: false
        });
        toast.success(`${t('notification_sent_to')} ${teacher.displayName}`);
      }
      
      toast.success(t('certificate_prepared_success'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  const handleIssueCertificate = async (cert: Certificate) => {
    try {
      const updates: Partial<Certificate> = {
        status: 'issued',
        issuedAt: new Date().toISOString()
      };
      await dbService.updateDocument('certificates', cert.id, updates);

      // Notify Teacher
      await dbService.addDocument('notifications', {
        userId: cert.teacherId,
        title: t('certificate_issued'),
        message: `${t('certificate_type')}: ${t(cert.type)} - ${t('issued_at')}: ${new Date().toLocaleDateString()}`,
        type: 'certificate',
        link: '/certificates',
        createdAt: new Date().toISOString(),
        read: false
      });

      setCertificates(certificates.map(c => c.id === cert.id ? { ...c, ...updates } : c));
      toast.success(t('certificate_issued_success'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  const handleUpdateCertificate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCert) return;

    const formData = new FormData(e.currentTarget);
    const updates: Partial<Certificate> = {
      academicYear: formData.get('academicYear') as string,
      birthDate: (formData.get('birthDate') as string) || '',
      birthPlace: (formData.get('birthPlace') as string) || '',
    };

    try {
      await dbService.updateDocument('certificates', editingCert.id, updates);
      setCertificates(certificates.map(c => c.id === editingCert.id ? { ...c, ...updates } : c));
      setEditingCert(null);
      toast.success(t('success'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  const downloadWord = async (cert: Certificate) => {
    const teacher = teachers.find(t => t.uid === cert.teacherId);
    if (!teacher) return;

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "الجمهورية الجزائرية الديمقراطية الشعبية", bold: true, size: 28 }),
              new TextRun({ text: "\nRépublique Algérienne Démocratique et Populaire", size: 20, break: 1 }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: TableBorders.NONE,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: "Ministère de l'Enseignement Supérieur", size: 18 }),
                          new TextRun({ text: "\net de la Recherche Scientifique", size: 18, break: 1 }),
                          new TextRun({ text: "\nUniversité Amar Telidji - Laghouat", size: 18, break: 1 }),
                          new TextRun({ text: "\nFaculté de Technologie", size: 18, break: 1 }),
                          new TextRun({ text: "\nDépartement de Génie Mécanique", size: 18, break: 1 }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "[LOGO]", size: 18 }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({ text: "وزارة التعليم العالي والبحث العلمي", size: 18 }),
                          new TextRun({ text: "\nجامعة عمار ثليجي - الأغواط", size: 18, break: 1 }),
                          new TextRun({ text: "\nكلية التكنولوجيا", size: 18, break: 1 }),
                          new TextRun({ text: "\nقسم الهندسة الميكانيكية", size: 18, break: 1 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ 
                text: cert.type === 'teaching' ? "شهادة تدريس" : "ATTESTATION D'ENCADREMENT", 
                bold: true, 
                size: 36, 
                underline: { type: UnderlineType.SINGLE } 
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "أنا الممضي أسفله، السيد رئيس قسم الهندسة الميكانيكية بجامعة عمار ثليجي بالأغواط، أشهد بأن:", size: 24 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "السيد (ة): ", size: 24 }),
              new TextRun({ text: teacher.displayNameAr || teacher.displayName, bold: true, size: 24 }),
            ],
          }),
          ...(cert.type === 'teaching' ? [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "المولود (ة) بتاريخ: ", size: 24 }),
                new TextRun({ text: cert.birthDate || "....................", bold: true, size: 24 }),
                new TextRun({ text: " بـ: ", size: 24 }),
                new TextRun({ text: cert.birthPlace || "....................", bold: true, size: 24 }),
              ],
            }),
          ] : []),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "الرتبة: ", size: 24 }),
              new TextRun({ text: teacher.rank || "....................", bold: true, size: 24 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `قد قام بـ${cert.type === 'teaching' ? 'تدريس المقاييس' : 'تأطير المشاريع'} التالية:`, size: 24 }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: cert.type === 'teaching' ? "المقياس" : "عنوان المشروع", alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ text: cert.type === 'teaching' ? "المستوى" : "الطلبة", alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ text: "السنة الجامعية", alignment: AlignmentType.CENTER })] }),
                ],
              }),
              ...(cert.type === 'teaching' 
                ? (cert.details.modules || []).map(m => new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph({ text: m.name })] }),
                      new TableCell({ children: [new Paragraph({ text: `${m.level} - ${m.specialty}` })] }),
                      new TableCell({ children: [new Paragraph({ text: m.academicYear })] }),
                    ],
                  }))
                : (cert.details.projects || []).map(p => new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph({ text: p.title })] }),
                      new TableCell({ children: [new Paragraph({ text: p.studentNames.join(', ') })] }),
                      new TableCell({ children: [new Paragraph({ text: p.academicYear })] }),
                    ],
                  }))
              ),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "\n\nحرر بالأغواط في: " + new Date().toLocaleDateString('ar-DZ'), size: 24, break: 1 }),
              new TextRun({ text: "\nرئيس القسم", size: 24, break: 1 }),
            ],
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Certificate_${teacher.displayName}_${cert.type}.docx`);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setLogoUrl(base64);
        try {
          await dbService.setDocument('settings', 'certificate_logo', { url: base64 });
          toast.success(t('logo_updated_success'));
        } catch (error) {
          console.error('Error saving logo:', error);
          toast.error(t('error_occurred'));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteCertificate = async (id: string) => {
    try {
      await dbService.deleteDocument('certificates', id);
      setCertificates(certificates.filter(c => c.id !== id));
      setDeletingCert(null);
      toast.success(t('success'));
    } catch (error) {
      toast.error(t('error_occurred'));
    }
  };

  const filteredCerts = certificates.filter(c => {
    const teacher = teachers.find(t => t.uid === c.teacherId);
    const teacherName = teacher ? (teacher.displayNameAr || teacher.displayName).toLowerCase() : '';
    const matchesSearch = teacherName.includes(filter.toLowerCase());
    const matchesType = selectedType === 'all' || c.type === selectedType;
    const matchesYear = c.academicYear.includes(academicYear);
    const isOwner = isAdmin || c.teacherId === user?.uid;
    return matchesSearch && matchesType && matchesYear && isOwner;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Clock className="animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-8 pb-20">
      {/* Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-4">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-2xl flex items-center justify-center animate-bounce">
            <Award size={40} className="text-amber-600" />
          </div>
          <p className="text-white font-black text-xl tracking-tight drop-shadow-md">{t('generating_certificate')}...</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-600 text-white rounded-2xl shadow-lg shadow-amber-200 flex items-center justify-center">
            <Award size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-zinc-900 tracking-tight">{t('certificates')}</h2>
            <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest">{certificates.length} {t('issued_certificates')}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {isAdmin && (
            <div className="relative">
              <input
                type="file"
                id="logo-upload"
                className="hidden"
                accept="image/*"
                onChange={handleLogoUpload}
              />
              <label
                htmlFor="logo-upload"
                className="px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <ImageIcon size={20} /> {t('upload_logo')}
              </label>
            </div>
          )}
          {(activeRole === 'teacher' || activeRole === 'specialty_manager') && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100"
            >
              <Send size={20} /> {t('request_certificate')}
            </button>
          )}
          {(isAdmin || activeRole === 'specialty_manager') && (
            <button
              onClick={() => {
                setIssueTeacherId(teachers[0]?.uid || '');
                setShowIssueModal(true);
              }}
              className="flex-1 md:flex-none px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-zinc-200"
            >
              <Plus size={20} /> {t('issue_certificate')}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-zinc-100 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
          <input
            type="text"
            placeholder={t('search_teachers')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-amber-500 outline-none transition-all font-medium"
          />
        </div>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as any)}
          className="px-6 py-4 rounded-2xl bg-zinc-100 border-none focus:ring-2 focus:ring-amber-500 outline-none font-bold text-zinc-600 transition-all"
        >
          <option value="all">{t('all_types')}</option>
          <option value="teaching">{t('teaching_certificate')}</option>
          <option value="supervision">{t('supervision_certificate')}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredCerts.map((cert) => {
          const teacher = teachers.find(t => t.uid === cert.teacherId);
          return (
            <div key={cert.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100 hover:shadow-md hover:border-amber-100 transition-all group">
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  {cert.type === 'teaching' ? <BookOpen size={24} /> : <GraduationCap size={24} />}
                </div>
                <div className="flex gap-1">
                  {isAdmin && (
                    <>
                      {cert.status === 'requested' && (
                        <button
                          onClick={() => handlePrepareCertificate(cert)}
                          className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          title={t('prepare_certificate')}
                        >
                          <Clock size={20} />
                        </button>
                      )}
                      {cert.status === 'prepared' && (
                        <button
                          onClick={() => handleIssueCertificate(cert)}
                          className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title={t('issue_certificate')}
                        >
                          <CheckCircle2 size={20} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditingCert(cert)}
                        className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-xl transition-all"
                        title={t('edit_certificate')}
                      >
                        <Edit2 size={20} />
                      </button>
                      <button
                        onClick={() => setDeletingCert(cert)}
                        className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        title={t('delete')}
                      >
                        <Trash2 size={20} />
                      </button>
                    </>
                  )}
                    <button
                      onClick={() => previewPDF(cert)}
                      className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title={t('preview')}
                    >
                      <ImageIcon size={20} />
                    </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-black text-zinc-900">{teacher?.displayNameAr || teacher?.displayName}</h4>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">
                      {cert.type === 'teaching' ? t('teaching_certificate') : t('supervision_certificate')}
                    </p>
                  </div>
                  {cert.status && (
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      cert.status === 'issued' ? "bg-emerald-50 text-emerald-600" :
                      cert.status === 'prepared' ? "bg-indigo-50 text-indigo-600" :
                      "bg-amber-50 text-amber-600"
                    )}>
                      {t(cert.status)}
                    </span>
                  )}
                </div>

                <div className="p-4 bg-zinc-50 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                    <Calendar size={14} className="text-amber-500" />
                    {t('academic_year')}: <span className="text-zinc-900">{cert.academicYear}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                    <Clock size={14} className="text-amber-500" />
                    {t('issued_at')}: <span className="text-zinc-900">{cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : t('pending')}</span>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  {cert.details.modules && cert.details.modules.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('modules')}</p>
                      <div className="flex flex-wrap gap-1">
                        {cert.details.modules.map((m: any, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[10px] font-bold border border-zinc-200">
                            {m.name} ({m.level})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {cert.details.projects && cert.details.projects.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('projects')}</p>
                      <div className="space-y-1">
                        {cert.details.projects.map((p: any, idx: number) => (
                          <div key={idx} className="p-2 bg-zinc-50 rounded-lg border border-zinc-100">
                            <p className="text-xs font-bold text-zinc-900">{p.title}</p>
                            <p className="text-[10px] text-zinc-500">
                              {p.studentNames ? p.studentNames.join(', ') : p.studentName} - {p.specialty || p.level}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {cert.details.projectTitle && (!cert.details.projects || cert.details.projects.length === 0) && (
                    <div className="text-sm font-medium text-zinc-600 italic line-clamp-2">
                      "{cert.details.projectTitle}"
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCerts.length === 0 && (
        <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-zinc-100">
          <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
            <Award size={40} />
          </div>
          <p className="text-zinc-500 font-bold">{t('no_certificates_found')}</p>
        </div>
      )}

      {/* Hidden Template for PDF Generation */}
      <div className="fixed -left-[9999px] top-0">
        {activeCertForTemplate && (
          <CertificateTemplate 
            cert={activeCertForTemplate.cert} 
            teacher={activeCertForTemplate.teacher} 
            logoUrl={logoUrl}
          />
        )}
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col my-auto">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
                  <Send size={20} />
                </div>
                <h3 className="text-2xl font-black text-zinc-900">{t('request_certificate')}</h3>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="p-2 hover:bg-white rounded-xl transition-all">
                <ChevronRight size={24} className="rotate-90" />
              </button>
            </div>
            
            <form className="flex flex-col max-h-[80vh]" onSubmit={handleRequestCertificate}>
              <div className="p-8 space-y-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('type')}</label>
                    <select 
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value as any)}
                      className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                    >
                      <option value="teaching">{t('teaching_certificate')}</option>
                      <option value="supervision">{t('supervision_certificate')}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('select_years')}</label>
                    <div className="flex flex-wrap gap-2 p-2 bg-zinc-50 rounded-2xl min-h-[3.5rem]">
                      {academicYears.map(year => (
                        <button
                          key={year}
                          type="button"
                          onClick={() => {
                            if (selectedYears.includes(year)) {
                              setSelectedYears(selectedYears.filter(y => y !== year));
                            } else {
                              setSelectedYears([...selectedYears, year]);
                            }
                          }}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                            selectedYears.includes(year) 
                              ? "bg-indigo-600 text-white" 
                              : "bg-white text-zinc-500 border border-zinc-200"
                          )}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {requestType === 'teaching' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('birth_date')}</label>
                      <input 
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        required
                        className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('birth_place')}</label>
                      <input 
                        type="text"
                        value={birthPlace}
                        onChange={(e) => setBirthPlace(e.target.value)}
                        required
                        placeholder={t('birth_place')}
                        className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" 
                      />
                    </div>
                  </div>
                )}

                {requestType === 'teaching' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('levels')}</label>
                        <div className="flex flex-wrap gap-2 p-3 bg-zinc-50 rounded-2xl min-h-[3.5rem]">
                          {Array.from(new Set(levels.map(l => l.name))).sort().map(name => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                if (selectedLevelNames.includes(name)) {
                                  setSelectedLevelNames(selectedLevelNames.filter(n => n !== name));
                                } else {
                                  setSelectedLevelNames([...selectedLevelNames, name]);
                                }
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                                selectedLevelNames.includes(name) 
                                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
                                  : "bg-white text-zinc-500 border border-zinc-200 hover:border-indigo-200"
                              )}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('semester')}</label>
                        <select 
                          value={selectedSemester}
                          onChange={(e) => setSelectedSemester(e.target.value as any)}
                          className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                        >
                          <option value="S1">S1</option>
                          <option value="S2">S2</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('specialties')}</label>
                      <div className="flex flex-wrap gap-2 p-3 bg-zinc-50 rounded-2xl min-h-[3.5rem] max-h-40 overflow-y-auto">
                        {availableSpecialties.length > 0 ? (
                          availableSpecialties.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                if (selectedSpecialtyIds.includes(s.id)) {
                                  setSelectedSpecialtyIds(selectedSpecialtyIds.filter(id => id !== s.id));
                                } else {
                                  setSelectedSpecialtyIds([...selectedSpecialtyIds, s.id]);
                                }
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                                selectedSpecialtyIds.includes(s.id) 
                                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
                                  : "bg-white text-zinc-500 border border-zinc-200 hover:border-indigo-200"
                              )}
                            >
                              {s.name}
                            </button>
                          ))
                        ) : (
                          <p className="text-[10px] text-zinc-400 italic p-2">{selectedLevelNames.length > 0 ? t('no_specialties_found') : t('select_level_first')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                      {requestType === 'teaching' ? t('modules') : t('projects')}
                    </h4>
                    <button
                      type="button"
                      onClick={() => requestType === 'teaching' ? setShowAddModuleModal(true) : setShowAddProjectModal(true)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Plus size={14} /> {requestType === 'teaching' ? t('add_module_manually') : t('add_project_manually')}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {requestType === 'teaching' ? (
                      <div className="grid grid-cols-1 gap-2">
                        {availableModules.map((m, i) => {
                          const level = levels.find(l => l.id === m.levelId);
                          const levelName = level?.name || '';
                          const isSelected = manualModules.some(mod => mod.name === m.name && mod.level === levelName);
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                if (isSelected) {
                                  setManualModules(manualModules.filter(mod => !(mod.name === m.name && mod.level === levelName)));
                                } else {
                                  setManualModules([...manualModules, {
                                    name: m.name,
                                    level: levelName,
                                    specialty: specialties.find(s => s.id === m.specialtyId)?.name || '',
                                    academicYear: academicYear,
                                    semester: selectedSemester
                                  }]);
                                }
                              }}
                              className={cn(
                                "p-3 rounded-xl flex justify-between items-center cursor-pointer transition-all",
                                isSelected ? "bg-indigo-50 border-2 border-indigo-200" : "bg-zinc-50 border-2 border-transparent hover:bg-zinc-100"
                              )}
                            >
                              <div>
                                <p className="text-sm font-bold text-zinc-900">{m.name}</p>
                                <p className="text-[10px] text-zinc-500 font-medium">{levelName} - {specialties.find(s => s.id === m.specialtyId)?.name}</p>
                              </div>
                              {isSelected && <CheckCircle2 size={16} className="text-indigo-600" />}
                            </div>
                          );
                        })}
                        {availableModules.length === 0 && selectedSpecialtyIds.length > 0 && (
                          <p className="text-center py-4 text-zinc-400 text-sm italic">{t('no_modules_found')}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        {[...autoFetchedProjects, ...manualProjects].map((p, i) => (
                          <div key={i} className="p-3 bg-zinc-50 rounded-xl flex justify-between items-center">
                            <div>
                              <p className="text-sm font-bold text-zinc-900">{p.title}</p>
                              <p className="text-[10px] text-zinc-500 font-medium">{p.studentNames.join(', ')} ({p.academicYear})</p>
                            </div>
                            {manualProjects.includes(p) && (
                              <button 
                                type="button" 
                                onClick={() => setManualProjects(manualProjects.filter(proj => proj !== p))}
                                className="text-red-500 hover:bg-red-50 p-1 rounded-lg"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-zinc-100 flex gap-4 bg-zinc-50 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setShowRequestModal(false)} 
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-white transition-all"
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  {t('submit_request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCert && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-900 text-white rounded-xl flex items-center justify-center">
                  <Edit2 size={20} />
                </div>
                <h3 className="text-2xl font-black text-zinc-900">{t('edit_certificate')}</h3>
              </div>
              <button onClick={() => setEditingCert(null)} className="p-2 hover:bg-white rounded-xl transition-all">
                <ChevronRight size={24} className="rotate-90" />
              </button>
            </div>
            
            <form className="p-8 space-y-6" onSubmit={handleUpdateCertificate}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('academic_year')}</label>
                  <input name="academicYear" defaultValue={editingCert.academicYear} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-zinc-500 outline-none font-bold transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('birth_date')}</label>
                  <input name="birthDate" type="date" defaultValue={editingCert.birthDate} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-zinc-500 outline-none font-bold transition-all" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('birth_place')}</label>
                <input name="birthPlace" defaultValue={editingCert.birthPlace} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-zinc-500 outline-none font-bold transition-all" />
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingCert(null)} className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-50 transition-all">
                  {t('cancel')}
                </button>
                <button type="submit" className="flex-1 px-6 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-100">
                  {t('save_changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showIssueModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-600 text-white rounded-xl flex items-center justify-center">
                  <Plus size={20} />
                </div>
                <h3 className="text-2xl font-black text-zinc-900">{t('issue_certificate')}</h3>
              </div>
              <button onClick={() => setShowIssueModal(false)} className="p-2 hover:bg-white rounded-xl transition-all">
                <ChevronRight size={24} className="rotate-90" />
              </button>
            </div>
            
            <form className="p-8 space-y-6 overflow-y-auto" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const teacherId = formData.get('teacherId') as string;
              const type = formData.get('type') as 'teaching' | 'supervision';
              const academicYear = formData.get('academicYear') as string;
              const birthDate = (formData.get('birthDate') as string) || '';
              const birthPlace = (formData.get('birthPlace') as string) || '';
              
              const newCert: Certificate = {
                id: Math.random().toString(36).substr(2, 9),
                teacherId,
                type,
                academicYear,
                academicYears: [academicYear],
                issuedAt: new Date().toISOString(),
                status: 'issued',
                birthDate,
                birthPlace,
                details: type === 'teaching' ? {
                  modules: [...issueAutoFetchedModules, ...issueManualModules]
                } : {
                  projects: [...issueAutoFetchedProjects, ...issueManualProjects]
                }
              };
              
              dbService.setDocument('certificates', newCert.id, newCert);
              setCertificates([newCert, ...certificates]);
              setShowIssueModal(false);
              toast.success(t('certificate_issued_success'));
            }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('teacher')}</label>
                  <select 
                    name="teacherId" 
                    value={issueTeacherId}
                    onChange={(e) => setIssueTeacherId(e.target.value)}
                    className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-amber-500 outline-none font-bold transition-all"
                  >
                    {teachers.map(t => (
                      <option key={t.uid} value={t.uid}>{t.displayNameAr || t.displayName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('type')}</label>
                  <select 
                    name="type" 
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as any)}
                    className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-amber-500 outline-none font-bold transition-all"
                  >
                    <option value="teaching">{t('teaching_certificate')}</option>
                    <option value="supervision">{t('supervision_certificate')}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('academic_year')}</label>
                  <input name="academicYear" defaultValue={academicYear} className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-amber-500 outline-none font-bold transition-all" />
                </div>
                {issueType === 'teaching' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('birth_date')}</label>
                    <input name="birthDate" type="date" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-amber-500 outline-none font-bold transition-all" />
                  </div>
                )}
              </div>

              {issueType === 'teaching' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('birth_place')}</label>
                  <input name="birthPlace" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-amber-500 outline-none font-bold transition-all" />
                </div>
              )}

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                    {issueType === 'teaching' ? t('modules') : t('projects')}
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      // We reuse the same manual entry modals but need to know where to add
                      if (issueType === 'teaching') {
                        setShowAddModuleModal(true);
                        // We'll need a way to distinguish if we are adding to request or issue
                        // For now, let's just add a flag or check if issue modal is open
                      } else {
                        setShowAddProjectModal(true);
                      }
                    }}
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    <Plus size={14} /> {issueType === 'teaching' ? t('add_module_manually') : t('add_project_manually')}
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {issueType === 'teaching' ? (
                    <>
                      {[...issueAutoFetchedModules, ...issueManualModules].map((m, i) => (
                        <div key={i} className="p-3 bg-zinc-50 rounded-xl flex justify-between items-center">
                          <div>
                            <p className="text-sm font-bold text-zinc-900">{m.name}</p>
                            <p className="text-[10px] text-zinc-500 font-medium">{m.level} - {m.specialty} ({m.academicYear})</p>
                          </div>
                          {issueManualModules.includes(m) && (
                            <button 
                              type="button" 
                              onClick={() => setIssueManualModules(issueManualModules.filter(mod => mod !== m))}
                              className="text-red-500 hover:bg-red-50 p-1 rounded-lg"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {[...issueAutoFetchedProjects, ...issueManualProjects].map((p, i) => (
                        <div key={i} className="p-3 bg-zinc-50 rounded-xl flex justify-between items-center">
                          <div>
                            <p className="text-sm font-bold text-zinc-900">{p.title}</p>
                            <p className="text-[10px] text-zinc-500 font-medium">{p.studentNames.join(', ')} ({p.academicYear})</p>
                          </div>
                          {issueManualProjects.includes(p) && (
                            <button 
                              type="button" 
                              onClick={() => setIssueManualProjects(issueManualProjects.filter(proj => proj !== p))}
                              className="text-red-500 hover:bg-red-50 p-1 rounded-lg"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowIssueModal(false)} className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-50 transition-all">
                  {t('cancel')}
                </button>
                <button type="submit" className="flex-1 px-6 py-4 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">
                  {t('issue_certificate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewPdfUrl && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
                  <ImageIcon size={20} />
                </div>
                <h3 className="text-xl font-black text-zinc-900">{t('certificate_preview')}</h3>
              </div>
              <button 
                onClick={() => {
                  URL.revokeObjectURL(previewPdfUrl);
                  setPreviewPdfUrl(null);
                }}
                className="p-2 hover:bg-white rounded-xl transition-all"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 bg-zinc-800 p-8 overflow-auto flex justify-center">
              <div className="w-full max-w-[210mm] bg-white shadow-2xl rounded-sm">
                <iframe 
                  src={previewPdfUrl} 
                  className="w-full h-full min-h-[70vh] border-none"
                  title="Certificate Preview"
                />
              </div>
            </div>
            <div className="p-6 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50">
              <button 
                onClick={() => {
                  URL.revokeObjectURL(previewPdfUrl);
                  setPreviewPdfUrl(null);
                }}
                className="px-8 py-3 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center gap-2"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deletingCert}
        onClose={() => setDeletingCert(null)}
        onConfirm={() => deletingCert && handleDeleteCertificate(deletingCert.id)}
        title={t('delete_certificate')}
        message={t('confirm_delete_certificate')}
      />

      {/* Add Module Manually Modal */}
      {showAddModuleModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-6 space-y-4">
            <h3 className="text-xl font-black text-zinc-900">{t('add_module_manually')}</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('academic_year')}</label>
                <select id="manual-module-year" className="w-full p-3 rounded-xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold">
                  {selectedYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('level')}</label>
                <select id="manual-module-level" className="w-full p-3 rounded-xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold">
                  {levels.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('specialty')}</label>
                <select id="manual-module-specialty" className="w-full p-3 rounded-xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold">
                  {specialties.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('module')}</label>
                <input id="manual-module-name" type="text" className="w-full p-3 rounded-xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold" placeholder={t('module_name')} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('semester')}</label>
                <select id="manual-module-semester" className="w-full p-3 rounded-xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold">
                  <option value="S1">S1</option>
                  <option value="S2">S2</option>
                  <option value="S1/S2">S1/S2</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddModuleModal(false)} className="flex-1 py-3 font-bold text-zinc-500 hover:bg-zinc-50 rounded-xl transition-all">{t('cancel')}</button>
              <button 
                onClick={() => {
                  const name = (document.getElementById('manual-module-name') as HTMLInputElement).value;
                  const level = (document.getElementById('manual-module-level') as HTMLSelectElement).value;
                  const specialty = (document.getElementById('manual-module-specialty') as HTMLSelectElement).value;
                  const academicYear = (document.getElementById('manual-module-year') as HTMLSelectElement).value;
                  const semester = (document.getElementById('manual-module-semester') as HTMLSelectElement).value;
                  if (name) {
                    if (showIssueModal) {
                      setIssueManualModules([...issueManualModules, { name, level, specialty, academicYear, semester }]);
                    } else {
                      setManualModules([...manualModules, { name, level, specialty, academicYear, semester }]);
                    }
                    setShowAddModuleModal(false);
                  }
                }}
                className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
              >
                {t('add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Project Manually Modal */}
      {showAddProjectModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2rem] shadow-2xl p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black text-zinc-900">{t('add_project_manually')}</h3>
              <button onClick={() => setShowAddProjectModal(false)} className="p-2 hover:bg-zinc-50 rounded-xl">
                <X size={24} />
              </button>
            </div>

            {/* Search from existing projects */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('select_from_existing_projects')}</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input 
                  type="text" 
                  placeholder={t('search_projects')}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                  onChange={(e) => {
                    const term = e.target.value.toLowerCase();
                    const results = projects.filter(p => 
                      p.title.toLowerCase().includes(term) || 
                      p.academicYear.includes(term)
                    ).slice(0, 5);
                    const resultsContainer = document.getElementById('project-search-results');
                    if (resultsContainer) {
                      resultsContainer.innerHTML = '';
                      results.forEach(p => {
                        const btn = document.createElement('button');
                        btn.className = "w-full text-left p-3 hover:bg-indigo-50 rounded-lg transition-all border-b border-zinc-100 last:border-none";
                        btn.innerHTML = `
                          <p class="text-sm font-bold text-zinc-900">${p.title}</p>
                          <p class="text-[10px] text-zinc-500">${p.academicYear} - ${specialties.find(s => s.id === p.specialtyId)?.name || ''}</p>
                        `;
                        btn.onclick = () => {
                          (document.getElementById('manual-project-title') as HTMLInputElement).value = p.title;
                          (document.getElementById('manual-project-year') as HTMLSelectElement).value = p.academicYear;
                          (document.getElementById('manual-project-specialty') as HTMLSelectElement).value = specialties.find(s => s.id === p.specialtyId)?.name || '';
                          (document.getElementById('manual-project-defense-date') as HTMLInputElement).value = p.defenseDate || '';
                          (document.getElementById('manual-project-students') as HTMLInputElement).value = p.students.map(sid => students.find(s => s.id === sid)?.name || sid).join(', ');
                          resultsContainer.innerHTML = '';
                        };
                        resultsContainer.appendChild(btn);
                      });
                    }
                  }}
                />
              </div>
              <div id="project-search-results" className="bg-white rounded-xl shadow-sm border border-zinc-100 empty:hidden"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('academic_year')}</label>
                <select id="manual-project-year" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all">
                  {selectedYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('specialty')}</label>
                <select id="manual-project-specialty" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all">
                  {specialties.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('project_title')}</label>
              <input id="manual-project-title" type="text" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" placeholder={t('project_title')} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('defense_date')}</label>
                <input id="manual-project-defense-date" type="text" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" placeholder="Ex: Session Juin 2024" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">{t('students_comma_separated')}</label>
                <input id="manual-project-students" type="text" className="w-full p-4 rounded-2xl bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all" placeholder={t('student_names')} />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button onClick={() => setShowAddProjectModal(false)} className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-50 transition-all">{t('cancel')}</button>
              <button 
                onClick={() => {
                  const title = (document.getElementById('manual-project-title') as HTMLInputElement).value;
                  const studentsInput = (document.getElementById('manual-project-students') as HTMLInputElement).value;
                  const academicYear = (document.getElementById('manual-project-year') as HTMLSelectElement).value;
                  const specialty = (document.getElementById('manual-project-specialty') as HTMLSelectElement).value;
                  const defenseDate = (document.getElementById('manual-project-defense-date') as HTMLInputElement).value;
                  if (title && studentsInput) {
                    const projectData = { title, studentNames: studentsInput.split(',').map(s => s.trim()), academicYear, specialty, defenseDate };
                    if (showIssueModal) {
                      setIssueManualProjects([...issueManualProjects, projectData]);
                    } else {
                      setManualProjects([...manualProjects, projectData]);
                    }
                    setShowAddProjectModal(false);
                  }
                }}
                className="flex-1 px-6 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                {t('add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
