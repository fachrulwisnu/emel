import { testConnection } from '../src/pop3';

export default async function handler(req: any, res: any) {
  // Support both GET (for simple ping) and POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  const { host, port, username, password } = req.body;

  if (!host || !port || !username) {
    return res.status(400).json({ success: false, message: 'Missing required connection details.' });
  }

  try {
    const portNum = parseInt(port, 10);
    const result = await testConnection(host, portNum, username, password || '');
    if (result.startsWith('SUCCESS')) {
      return res.status(200).json({ success: true, message: result });
    } else {
      return res.status(401).json({ success: false, message: result });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `FAILED: Connection error. ${err.message || String(err)}` });
  }
}
