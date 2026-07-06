import PostalMime from 'postal-mime';
import { Pop3Client, parsePop3Message } from '../src/pop3';
import { getAutoTags } from '../src/tags';
import { getEmailUids, saveEmails } from '../src/db';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  const { host, port, username, password, limit = 30 } = req.body;

  if (!host || !port || !username) {
    return res.status(400).json({ success: false, message: 'Missing connection details.' });
  }

  const client = new Pop3Client();
  const existingUids = getEmailUids();
  const existingSet = new Set<string>(existingUids);

  console.log(`\n--- [LOCAL POP3 SYNC EMAILS START] ---`);
  console.log(`Target POP3 Server : ${host}:${port}`);
  console.log(`Username           : "${username}"`);
  console.log(`Local DB size      : ${existingSet.size}`);

  try {
    const portNum = parseInt(port, 10);
    const greeting = await client.connect(host, portNum);
    console.log(`[POP3 Sync] Connected. Greeting: "${greeting.trim()}"`);

    // USER Command
    const userRes = await client.sendCommand(`USER ${username}`);
    if (!userRes.startsWith('+OK')) {
      throw new Error(`USER command error: ${userRes.trim()}`);
    }

    // PASS Command
    const passRes = await client.sendCommand(`PASS ${password || ''}`);
    if (!passRes.startsWith('+OK')) {
      throw new Error(`PASS command error (Authentication failed): ${passRes.trim()}`);
    }

    // UIDL Command
    const uidlRes = await client.sendCommand('UIDL', true);
    if (!uidlRes.startsWith('+OK')) {
      throw new Error(`UIDL command error: ${uidlRes.trim()}`);
    }

    // Parse UIDL response
    const lines = uidlRes.split(/\r?\n/);
    if (lines[0].startsWith('+OK')) {
      lines.shift();
    }

    const serverUids: { msgNum: number; uid: string }[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const msgNum = parseInt(parts[0], 10);
        const uid = parts[1];
        if (!isNaN(msgNum) && uid) {
          serverUids.push({ msgNum, uid });
        }
      }
    }

    // Filter out emails that are already in our database
    const newUids = serverUids.filter(item => !existingSet.has(item.uid));
    
    // Sort latest first
    newUids.sort((a, b) => b.msgNum - a.msgNum);

    const toFetch = newUids.slice(0, limit);
    const fetchedEmails = [];
    const mailParser = new PostalMime();

    console.log(`[POP3 Sync] Found ${serverUids.length} emails on server. New to fetch: ${newUids.length}. Limit applied: ${toFetch.length}.`);

    for (const item of toFetch) {
      try {
        const retrRes = await client.sendCommand(`RETR ${item.msgNum}`, true);
        if (!retrRes.startsWith('+OK')) {
          console.error(`Failed to RETR message ${item.msgNum}`);
          continue;
        }

        const mimeRaw = parsePop3Message(retrRes);
        const parsed = await mailParser.parse(mimeRaw);

        const subject = parsed.subject || '(No Subject)';
        const fromName = parsed.from?.name || '';
        const fromAddress = parsed.from?.address || '';
        const date = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
        const body = parsed.text || '';
        const bodyHtml = parsed.html || '';
        const tags = getAutoTags(subject, body);

        fetchedEmails.push({
          uid: item.uid,
          subject,
          fromName,
          fromAddress,
          date,
          body,
          bodyHtml,
          tags
        });
      } catch (err) {
        console.error(`Error fetching email msgNum ${item.msgNum}:`, err);
      }
    }

    await client.sendCommand('QUIT');

    // Save fetched emails to local database
    if (fetchedEmails.length > 0) {
      saveEmails(fetchedEmails);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully synced. Found ${newUids.length} new emails, fetched ${fetchedEmails.length} of them.`,
      emails: fetchedEmails,
      fetchedCount: fetchedEmails.length
    });
  } catch (err: any) {
    console.error(`[POP3 Sync Failed]`, err.message || String(err));
    return res.status(500).json({
      success: false,
      message: err.message || String(err),
      emails: [],
      fetchedCount: 0
    });
  } finally {
    client.close();
  }
}
