import { collection, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTIONS = [
  'users',
  'specialties',
  'levels',
  'projects',
  'sessions',
  'settings',
  'students'
];

export const backupService = {
  async exportData() {
    const backup: any = {};
    for (const collName of COLLECTIONS) {
      const snapshot = await getDocs(collection(db, collName));
      backup[collName] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },

  async importData(file: File) {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          const backup = JSON.parse(e.target?.result as string);
          
          for (const collName of COLLECTIONS) {
            if (!backup[collName]) continue;
            
            // Clear existing data (optional, but safer for full restore)
            const snapshot = await getDocs(collection(db, collName));
            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            // Import new data
            const importBatch = writeBatch(db);
            backup[collName].forEach((item: any) => {
              const { id, ...data } = item;
              const docRef = doc(db, collName, id);
              importBatch.set(docRef, data);
            });
            await importBatch.commit();
          }
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsText(file);
    });
  }
};
