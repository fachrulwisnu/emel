import { syncThunderbirdInbox } from '../src/thunderbird-sync';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  const { customPath } = req.body || {};

  try {
    const result = await syncThunderbirdInbox(customPath);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('API Error in /api/sync-thunderbird:', err);
    return res.status(500).json({
      success: false,
      message: err.message || String(err),
      count: 0,
      fallback: false
    });
  }
}
