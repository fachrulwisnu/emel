import { dbGetAllEmails } from '../src/database-service';

export default async function handler(req: any, res: any) {
  try {
    const emails = await dbGetAllEmails();
    
    // Aggregate folder_parent and folder_child counts in memory
    const countsMap = new Map<string, number>();
    
    emails.forEach(email => {
      const parent = email.folder_parent || 'Lainnya';
      const child = email.folder_child || 'Uncategorized';
      const key = `${parent}|||${child}`;
      countsMap.set(key, (countsMap.get(key) || 0) + 1);
    });

    const folders = Array.from(countsMap.entries()).map(([key, count]) => {
      const [folder_parent, folder_child] = key.split('|||');
      return {
        folder_parent,
        folder_child,
        count
      };
    }).sort((a, b) => {
      const pComp = a.folder_parent.localeCompare(b.folder_parent);
      if (pComp !== 0) return pComp;
      return a.folder_child.localeCompare(b.folder_child);
    });

    res.json({ success: true, folders });
  } catch (err: any) {
    console.error('API Error in /api/folders:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
