import PostalMime from 'postal-mime';
import { Pop3Client, parsePop3Message } from '../src/pop3';
import { getAutoTags } from '../src/tags';
import { getAllEmails, upsertEmail } from '../src/sqlite-db';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  const { host, port, username, password } = req.body;

  if (!host || !port || !username) {
    return res.status(400).json({ success: false, message: 'Missing connection details.' });
  }

  const client = new Pop3Client();
  let existingEmails: any[] = [];
  try {
    existingEmails = await getAllEmails();
  } catch (dbErr) {
    console.error('Failed to query existing emails:', dbErr);
  }
  
  const existingSet = new Set<string>(existingEmails.map(e => e.uid));
  const existingSubjectDates = new Set<string>(existingEmails.map(e => `${e.subject?.trim()}|||${e.date}`));

  console.log(`\n--- [LOCAL POP3 FULL SYNC START] ---`);
  console.log(`Target POP3 Server : ${host}:${port}`);
  console.log(`Username           : "${username}"`);
  console.log(`Local SQLite DB size: ${existingEmails.length}`);

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

    // UIDL Command to get all message numbers & UIDs on the server
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

    // Sort ascending by msgNum (from 1 to N, oldest to newest)
    serverUids.sort((a, b) => a.msgNum - b.msgNum);

    const totalMessages = serverUids.length;
    const mailParser = new PostalMime();

    console.log(`[POP3 Sync] Found ${totalMessages} total emails on server.`);

    let fetchedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < totalMessages; i++) {
      const item = serverUids[i];
      const currentNumber = i + 1;

      // Progress logging
      if (currentNumber === 1 || currentNumber === totalMessages || currentNumber % 10 === 0) {
        console.log(`Fetching message ${currentNumber} of ${totalMessages}...`);
      }

      // Check if server UID is already known locally
      if (existingSet.has(item.uid)) {
        skippedCount++;
        continue;
      }

      try {
        // RETR command to retrieve message
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

        // Check based on Subject + Date to prevent duplicates if Message-IDs aren't set
        const subjectDateKey = `${subject.trim()}|||${date}`;
        if (existingSubjectDates.has(subjectDateKey)) {
          console.log(`[POP3 Sync] Skipping duplicate Subject + Date: "${subject}"`);
          skippedCount++;
          continue;
        }

        existingSubjectDates.add(subjectDateKey);

        const tags = getAutoTags(subject, body);
        const senderStr = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

        // Upsert directly into SQLite
        await upsertEmail({
          message_id: item.uid,
          subject,
          sender: senderStr,
          receiver: username,
          date,
          body_text: body,
          html_body: bodyHtml,
          tags
        });

        fetchedCount++;
        
        // Add artificial small delay to avoid overwhelming the server or rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err: any) {
        console.error(`Error processing message ${item.msgNum}:`, err.message || String(err));
      }
    }

    // Release POP3 session safely
    await client.sendCommand('QUIT');

    console.log(`[POP3 Sync Completed] Fetched: ${fetchedCount}, Skipped/Duplicates: ${skippedCount}, Total scanned: ${totalMessages}`);

    return res.status(200).json({
      success: true,
      message: `Sync successful. Scanned ${totalMessages} emails. Fetched ${fetchedCount} new emails, skipped ${skippedCount} duplicate/existing emails.`,
      fetchedCount
    });
  } catch (err: any) {
    console.error(`[POP3 Sync Failed]`, err.message || String(err));
    return res.status(500).json({
      success: false,
      message: `Sync failed: ${err.message || String(err)}`,
      fetchedCount: 0
    });
  } finally {
    client.close();
  }
}
