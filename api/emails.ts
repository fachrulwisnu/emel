import { getAllEmails, initDb } from '../src/sqlite-db';

export default async function handler(req: any, res: any) {
  try {
    // Ensure the SQLite database is initialized
    await initDb();
    
    const emails = await getAllEmails();
    return res.status(200).json({
      success: true,
      emails
    });
  } catch (err: any) {
    console.error('API Error in /api/emails:', err);
    return res.status(500).json({
      success: false,
      message: err.message || String(err)
    });
  }
}
