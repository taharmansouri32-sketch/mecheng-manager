import { dbService } from './db';
import { Specialty, Level, Module } from '../types';

export async function seedDatabase() {
  console.log('Starting database seeding...');

  // 1. Clear existing data (optional but recommended for a clean start as requested)
  // Note: In a real app we might want to be careful here. 
  // The user said "Delete the specialties window and enter the following specialties".
  // This implies a reset of the academic structure.

  const existingSpecialties = await dbService.getCollection<Specialty>('specialties');
  console.log(`Deleting ${existingSpecialties.length} specialties...`);
  for (const s of existingSpecialties) {
    await dbService.deleteDocument('specialties', s.id);
  }

  const existingLevels = await dbService.getCollection<Level>('levels');
  console.log(`Deleting ${existingLevels.length} levels...`);
  for (const l of existingLevels) {
    await dbService.deleteDocument('levels', l.id);
  }

  const existingModules = await dbService.getCollection<Module>('modules');
  console.log(`Deleting ${existingModules.length} modules...`);
  for (const m of existingModules) {
    await dbService.deleteDocument('modules', m.id);
  }

  // 2. Define Cycles
  const cycles = {
    engineering: 'engineers',
    lmd: 'license',
    master: 'master'
  };

  // Helper to add specialty, level, and modules
  const addStructure = async (cycle: string, levelName: string, specialtyName: string, semesters: { [key: string]: string[] }) => {
    // Add Specialty
    const specialtyRef = await dbService.addDocument('specialties', {
      name: specialtyName,
      field: cycle === 'engineers' ? 'Engineering' : 'LMD',
      levelType: cycle
    });
    const specialtyId = specialtyRef?.id;
    if (!specialtyId) return;

    // Add Level
    const levelRef = await dbService.addDocument('levels', {
      name: levelName,
      specialtyId: specialtyId
    });
    const levelId = levelRef?.id;
    if (!levelId) return;

    // Add Modules
    for (const [semester, modules] of Object.entries(semesters)) {
      for (const moduleName of modules) {
        await dbService.addDocument('modules', {
          name: moduleName,
          levelId: levelId,
          specialtyId: specialtyId,
          semester: semester // Adding semester to module for better filtering
        });
      }
    }
  };

  // --- DATA SEEDING ---
  console.log('Adding Engineering structure...');
  await addStructure(cycles.engineering, 'Second Year Engineering', 'Mechanical Engineering', {
    'S2': [
      'Computer-Aided Design',
      'Fluid Mechanics',
      'Information and Communication Technologies (ICT)',
      'Materials Science',
      'Measurement and Metrology',
      'Mechanical Design',
      'Numerical Analysis 2',
      'Steel Structures',
      'Strength of Materials'
    ]
  });

  console.log('Adding LMD 2nd Year structure...');
  await addStructure(cycles.lmd, 'Second Year Bachelor', 'Mechanical Engineering', {
    'S2': [
      'Materials Science',
      'Strength of Materials',
      'Thermodynamics 2',
      'Mechanical Manufacturing',
      'Industrial Electricity',
      'Computer-Aided Design',
      'Mechanical Manufacturing Lab',
      'Strength of Materials Lab'
    ]
  });

  console.log('Adding LMD 3rd Year Energetics structure...');
  await addStructure(cycles.lmd, 'Third Year Bachelor', 'Energetics', {
    'S1': [
      'Heat Transfer 1',
      'Measurement and Instrumentation',
      'Control and Automation',
      'Energy Conversion',
      'Machine Elements',
      'Fluid Mechanics 2',
      'Turbomachinery 1',
      'Environment and Sustainable Development'
    ],
    'S2': [
      'Internal Combustion Engines',
      'Turbomachinery 2',
      'Cryogenics',
      'Heat Transfer 2',
      'Refrigeration and Heat Pump Systems',
      'Renewable Energy',
      'Entrepreneurship',
      'Final Year Project'
    ]
  });

  console.log('Adding LMD 3rd Year Materials structure...');
  await addStructure(cycles.lmd, 'Third Year Bachelor', 'Materials Engineering', {
    'S1': [
      'Ceramics and Glasses',
      'Metals and Alloys',
      'Continuum Mechanics',
      'Binders and Concretes',
      'Heat and Mass Transfer',
      'Analytical and Characterization Methods'
    ],
    'S2': [
      'Polymers',
      'Composite Materials',
      'Environmental Impact of Materials',
      'Degradation and Protection of Materials',
      'Rheology of Materials',
      'Introduction to Biomaterials',
      'Entrepreneurship',
      'Final Year Project'
    ]
  });

  console.log('Adding LMD 3rd Year Design structure...');
  await addStructure(cycles.lmd, 'Third Year Bachelor', 'Mechanical Design', {
    'S1': [
      'Machine Design',
      'Control and Automation',
      'Elasticity',
      'Analytical Mechanics',
      'CAD/CAM',
      'Metrology',
      'Strength of Materials 2'
    ],
    'S2': [
      'Internal Combustion Engines',
      'Non-metallic Materials',
      'Theory of Machines',
      'Hydraulic and Pneumatic Systems',
      'Machine Design 2',
      'Heat Transfer',
      'Structural Dynamics',
      'Entrepreneurship',
      'Final Year Project'
    ]
  });

  console.log('Adding LMD 3rd Year Maintenance structure...');
  await addStructure(cycles.lmd, 'Third Year Bachelor', 'Industrial Maintenance', {
    'S1': [
      'Applied Electronics',
      'Elements of Heat Transfer',
      'Machine Elements',
      'Computer-Aided Maintenance Management (CAMM)',
      'Maintenance Organization and Methods',
      'Sensors and Metrology',
      'Applied Electrical Engineering'
    ],
    'S2': [
      'Industrial Robotics',
      'Signal Processing',
      'Condition-Based Maintenance Tools',
      'Thermal and Hydraulic Machinery Technology',
      'Reliability',
      'Structural Dynamics',
      'Internal Combustion Engines',
      'Entrepreneurship',
      'Final Year Project'
    ]
  });

  console.log('Adding Master 1 Energetics structure...');
  await addStructure(cycles.master, 'First Year Master', 'Energetics', {
    'S1': [
      'Advanced Heat and Mass Transfer',
      'Advanced Numerical Methods',
      'Advanced Fluid Mechanics',
      'Thermal Machines',
      'Advanced Python Programming',
      'Environment, Protection and Control'
    ],
    'S2': [
      'Thermal Drying',
      'Finite Volume Methods',
      'Gas Dynamics',
      'Advanced Turbomachinery',
      'Heating and Air Conditioning',
      'Compliance with Ethical Standards, Rules, and Integrity',
      'Elements of Applied Artificial Intelligence'
    ]
  });

  console.log('Adding Master 1 Materials structure...');
  await addStructure(cycles.master, 'First Year Master', 'Materials and Surface Engineering', {
    'S1': [
      'Ferrous and Non-Ferrous Materials',
      'Phase Transformations',
      'Materials Forming',
      'Mechanical Properties of Materials',
      'Surface Engineering',
      'Applied Numerical Methods',
      'Advanced Python Programming',
      'Environment, Protection and Control'
    ],
    'S2': [
      'Physico-Chemical and Mechanical Properties of Polymers',
      'Fracture Mechanics',
      'Finite Element Methods 2',
      'Diffusion and Phase Transformation',
      'Mechanical Behavior of Composite and Multi-Materials',
      'Heat Treatments',
      'Mechanical Testing 2',
      'Elements of Applied Artificial Intelligence',
      'Compliance with Ethical Standards, Rules, and Integrity'
    ]
  });

  console.log('Adding Master 1 Maintenance structure...');
  await addStructure(cycles.master, 'First Year Master', 'Industrial Maintenance', {
    'S1': [
      'Statistical Methods and Sampling',
      'Applied Thermodynamics',
      'Continuum Mechanics',
      'Structural Dynamics',
      'Maintenance Strategy',
      'Signal Processing',
      'Advanced Python Programming',
      'Environment, Protection and Control'
    ],
    'S2': [
      'Computerized Maintenance Management System (CMMS)',
      'Rotating Machinery Vibration',
      'System Reliability',
      'Finite Element Method',
      'Smart Sensors',
      'Mechanical Design',
      'Manufacturing Processes and Machine Tools',
      'Elements of Applied Artificial Intelligence',
      'Compliance with Ethical Standards, Rules, and Integrity'
    ]
  });

  console.log('Adding Master 1 Renewable structure...');
  await addStructure(cycles.master, 'First Year Master', 'Renewable Energy in Mechanical Systems', {
    'S1': [
      'Applied Numerical Methods',
      'Advanced Fluid Mechanics',
      'Advanced Thermodynamics and Transport Phenomena',
      'Renewable Resources and Meteorology',
      'Advanced Python Programming',
      'Environment, Protection and Control'
    ],
    'S2': [
      'Hydroelectric and Wind Energy',
      'Solar Radiation',
      'Thermal Solar Energy and Applications',
      'Installation and Sizing of Renewable Energy Projects',
      'Energy Conversion',
      'Advanced Heat Transfer and Transport Phenomena',
      'Elements of Applied Artificial Intelligence',
      'Control and Regulation'
    ]
  });

  console.log('Adding Master 2 Energetics structure...');
  await addStructure(cycles.master, 'Second Year Master', 'Energetics', {
    'S1': [
      'CFD and Software',
      'Heat Exchangers',
      'Optimization',
      'Propulsion Mechanics',
      'Advanced Internal Combustion Engines',
      'Cryogenics',
      'Reverse Engineering',
      'Dissertation Design'
    ]
  });

  console.log('Adding Master 2 Maintenance structure...');
  await addStructure(cycles.master, 'Second Year Master', 'Industrial Maintenance', {
    'S1': [
      'Tribology and Lubrication of Mechanical Systems',
      'Applied Acoustics',
      'Fracture Mechanics and Damage Analysis',
      'Failure Detection Techniques',
      'Industrial Automation',
      'Reverse Engineering',
      'Vibration-Based Diagnostics'
    ]
  });

  console.log('Adding Master 2 Renewable structure...');
  await addStructure(cycles.master, 'Second Year Master', 'Renewable Energy in Mechanical Systems', {
    'S1': [
      'Building Energy and Thermal Efficiency',
      'Maintenance of Renewable Energy Systems',
      'Solar Cooling and Air Conditioning',
      'Working Fluids, Materials and Storage Devices',
      'Fuel Cells and Hydrogen Production',
      'Photovoltaic Solar Energy and Applications',
      'Techno-Economic Analysis and Project Management for Renewable Energy'
    ]
  });

  console.log('Database seeding completed successfully!');
}
