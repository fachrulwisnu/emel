import { getDynamicFolders } from '../src/sqlite-db';

export default async function handler(req: any, res: any) {
  try {
    const folders = await getDynamicFolders();
    res.json({ success: true, folders });
  } catch (err: any) {
    console.error('API Error in /api/folders:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
