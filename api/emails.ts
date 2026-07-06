import { getEmails } from '../src/db';

export default async function handler(req: any, res: any) {
  try {
    const emails = getEmails();
    return res.status(200).json({
      success: true,
      emails
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || String(err)
    });
  }
}
