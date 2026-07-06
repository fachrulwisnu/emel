import { clearDatabase } from '../src/db';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  try {
    clearDatabase();
    return res.status(200).json({
      success: true,
      message: 'Local database cleared successfully.'
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || String(err)
    });
  }
}
