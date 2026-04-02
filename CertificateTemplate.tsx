import React from 'react';
import { Certificate, User } from '../types';

interface Props {
  cert: Certificate;
  teacher: User;
  logoUrl?: string | null;
}

export function CertificateTemplate({ cert, teacher, logoUrl }: Props) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const currentYear = new Date().getFullYear();
  const teacherName = teacher.displayName;
  const teacherNameAr = teacher.displayNameAr || teacher.displayName;
  const bDate = cert.birthDate || '...........................';
  const bPlace = cert.birthPlace || '...........................';
  
  let rank = 'دائم';
  if (teacher.teacherType === 'temporary') rank = 'مؤقت';
  if (teacher.teacherType === 'permanent_external') rank = 'مشارك';

  return (
    <div id="certificate-template" className="bg-white w-[210mm] min-h-[297mm] p-[10mm] mx-auto text-black font-serif relative overflow-hidden" style={{ boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#000000' }}>
      {/* Decorative Border */}
      <div className="absolute inset-[5mm] border-[4px] border-double border-[#18181b] pointer-events-none" />
      <div className="absolute inset-[8mm] border border-[#a1a1aa] pointer-events-none" />
      
      <div className="relative z-10 p-[10mm] h-full flex flex-col">
        {/* Top Center: Republic Name */}
        <div className="text-center mb-2 font-amiri">
          <h1 className="text-lg font-bold">الجمهورية الجزائرية الديمقراطية الشعبية</h1>
          <p className="text-[10px] font-serif">République Algérienne Démocratique et Populaire</p>
        </div>

        {/* Header Grid */}
        <div className="grid grid-cols-3 items-start mb-6">
          {/* Left: French Info */}
          <div className="text-left text-[9px] font-serif space-y-0.5 leading-tight text-[#3b82f6]">
            <div className="flex items-start gap-1">
              <div className="w-1 h-1 rounded-full bg-[#3b82f6] mt-1 flex-shrink-0" />
              <div>
                <p>Ministère de l'Enseignement Supérieur</p>
                <p>et de la Recherche Scientifique</p>
                <p>Université Amar Telidji - Laghouat</p>
                <p>Faculté de Technologie</p>
                <p>Département de Génie Mécanique</p>
              </div>
            </div>
          </div>

          {/* Middle: Logo */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full border border-[#d4d4d8] flex items-center justify-center overflow-hidden bg-[#ffffff]">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-20 h-20 object-contain" referrerPolicy="no-referrer" />
              ) : (
                <div className="text-[#d4d4d8] text-[8px] text-center px-1">Logo University</div>
              )}
            </div>
          </div>

          {/* Right: Arabic Info */}
          <div className="text-right text-[10px] font-amiri space-y-0.5 leading-tight text-[#3b82f6]" dir="rtl">
            <div className="flex items-start gap-1">
              <div className="w-1 h-1 rounded-full bg-[#3b82f6] mt-1.5 flex-shrink-0" />
              <div>
                <p>وزارة التعليم العالي والبحث العلمي</p>
                <p>جامعة عمار ثليجي - الأغواط</p>
                <p>كلية التكنولوجيا</p>
                <p>قسم الهندسة الميكانيكية</p>
              </div>
            </div>
          </div>
        </div>

        {/* References */}
        <div className="flex justify-between items-center mb-8 px-4">
          <p className="text-[10px] font-bold">N° {cert.id.toUpperCase().slice(0, 4)} /D.G.M/ {currentYear}</p>
          <p className="text-[10px]">Laghouat, le {today}</p>
        </div>

        {cert.type === 'supervision' ? (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-center underline decoration-2 underline-offset-8 mb-10">ATTESTATION D'ENCADREMENT</h2>
            
            <div className="space-y-6 flex-1">
              <p className="text-justify leading-relaxed text-sm">
                Le chef de département de Génie Mécanique atteste que Mr. <strong>{teacherName}</strong>, 
                enseignant-chercheur au Département Mécanique, a encadré l'étudiant en troisième année de licence (LMD) 
                comme indiqué dans le tableau ci-dessous:
              </p>

              <table className="w-full border-collapse border border-black text-[10px]">
                <thead>
                  <tr className="bg-[#f4f4f5]">
                    <th className="border border-black p-2 w-10">N°</th>
                    <th className="border border-black p-2">Nom et prénom de l'étudiant</th>
                    <th className="border border-black p-2">Titre du mémoire</th>
                    <th className="border border-black p-2">Spécialité</th>
                    <th className="border border-black p-2">Date de soutenance</th>
                  </tr>
                </thead>
                <tbody>
                  {cert.details.projects?.map((p, index) => (
                    <tr key={index}>
                      <td className="border border-black p-2 text-center">{(index + 1).toString().padStart(2, '0')}</td>
                      <td className="border border-black p-2 whitespace-pre-line">{p.studentNames.join('\n')}</td>
                      <td className="border border-black p-2">{p.title}</td>
                      <td className="border border-black p-2">{p.specialty || 'Génie Mécanique'}</td>
                      <td className="border border-black p-2">{p.defenseDate || `Session Juin ${p.academicYear.split('-')[1]}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-auto pt-10">
              <p className="text-xs">Cette présente attestation est délivrée à l'intéressé pour servir et valoir à qui de droit.</p>
              <div className="mt-12 text-right pr-16">
                <p className="font-bold text-base">Le Chef de Département</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col" dir="rtl">
            <h2 className="text-2xl font-bold text-center underline decoration-2 underline-offset-8 font-amiri mb-10">شهادة تدريس</h2>
            
            <div className="space-y-6 text-base leading-loose font-amiri flex-1">
              <p>أنا الممضي أسفله، السيد رئيس قسم الهندسة الميكانيكية بجامعة عمار ثليجي بالأغواط، أشهد بأن:</p>
              <p>السيد (ة): <strong>{teacherNameAr}</strong> المولود (ة) بتاريخ: <strong>{bDate}</strong> بـ: <strong>{bPlace}</strong></p>
              <p>درس (ت) بقسم الهندسة الميكانيكية بكلية التكنولوجيا بجامعة عمار ثليجي - الأغواط، بصفته (أ): <strong>({rank})</strong>، المواد التعليمية التالية:</p>

              <table className="w-full border-collapse border border-black text-sm font-serif" dir="rtl">
                <thead>
                  <tr className="bg-[#f4f4f5] font-amiri">
                    <th className="border border-black p-2">السنة الجامعية</th>
                    <th className="border border-black p-2">المادة</th>
                    <th className="border border-black p-2">السداسي</th>
                    <th className="border border-black p-2">Cours/TD/TP</th>
                  </tr>
                </thead>
                <tbody className="font-amiri">
                  {cert.details.modules?.map((m, index) => (
                    <tr key={index}>
                      <td className="border border-black p-2 text-center">{m.academicYear}</td>
                      <td className="border border-black p-2">{m.name}</td>
                      <td className="border border-black p-2 text-center">{m.semester || 'S1/S2'}</td>
                      <td className="border border-black p-2 text-center">Cours/TD/TP</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-auto pt-10 font-amiri">
              <p>سلمت هذه الشهادة بطلب من المعني قصد استعمالها فيما يخوله له القانون.</p>
              <div className="mt-12 text-left pl-16">
                <p className="font-bold text-lg">Le Chef de Département</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
