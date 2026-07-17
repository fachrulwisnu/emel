import { dbApplyRetroactiveFilter } from '../src/database-service';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { filter } = req.body || {};
    if (!filter) {
      return res.status(400).json({ success: false, message: 'Missing filter payload' });
    }

    const matchedCount = await dbApplyRetroactiveFilter(filter);
    return res.json({ success: true, matchedCount });
  } catch (err: any) {
    console.error('Error in retroactive filter:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
