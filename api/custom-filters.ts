import { 
  dbGetCustomFilters, 
  dbSaveCustomFilter, 
  dbDeleteCustomFilter 
} from '../src/database-service';

export default async function handler(req: any, res: any) {
  const { method } = req;

  try {
    if (method === 'GET') {
      const filters = await dbGetCustomFilters();
      return res.json({ success: true, filters });
    }

    if (method === 'POST') {
      const { action, filter, id } = req.body || {};

      if (action === 'delete') {
        if (!id) {
          return res.status(400).json({ success: false, message: 'Missing filter ID for deletion' });
        }
        await dbDeleteCustomFilter(id);
        return res.json({ success: true, message: 'Filter deleted successfully' });
      }

      if (!filter) {
        return res.status(400).json({ success: false, message: 'Missing filter body' });
      }

      await dbSaveCustomFilter(filter);
      return res.json({ success: true, message: 'Filter saved successfully' });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err: any) {
    console.error('Error in /api/custom-filters endpoint:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
