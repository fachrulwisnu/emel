import fs from 'fs';
import path from 'path';
import mboxParser from 'node-mbox';
import { simpleParser } from 'mailparser';
import { getAutoTags } from './tags';
import { upsertEmail } from './sqlite-db';

// The exact path requested by the user
export const THUNDERBIRD_MBOX_PATH = `C:\\Users\\HP\\AppData\\Roaming\\Thunderbird\\Profiles\\xr2b9r9p.default-release\\Mail\\mail.advantagescm.com\\Inbox`;

interface SyncResult {
  success: boolean;
  message: string;
  count: number;
  fallback: boolean;
}

/**
 * Synchronizes email data from Thunderbird MBOX or fallback simulated source.
 */
export async function syncThunderbirdInbox(customPath?: string): Promise<SyncResult> {
  const targetPath = customPath || THUNDERBIRD_MBOX_PATH;
  
  console.log(`[Thunderbird Sync] Attempting to sync MBOX from path: ${targetPath}`);

  // Check if file exists
  if (!fs.existsSync(targetPath)) {
    console.warn(`[Thunderbird Sync] File not found at: ${targetPath}. Generating simulated local emails to SQLite as fallback...`);
    const count = await generateSimulatedToSqlite();
    return {
      success: true,
      message: `Thunderbird MBOX file not found at local path. Automatically fell back to generating ${count} simulated local emails into SQLite database.`,
      count,
      fallback: true
    };
  }

  return new Promise<SyncResult>((resolve) => {
    try {
      const messages: Buffer[] = [];
      const mboxStream = fs.createReadStream(targetPath);
      
      // Handle node-mbox class mapping dynamically for CJS/ESM compatibility
      const MboxClass = (mboxParser as any).Mbox || (mboxParser as any).default?.Mbox || mboxParser;
      if (typeof MboxClass !== 'function') {
        throw new Error('Mbox is not a constructor or function');
      }
      
      const mbox = new MboxClass(mboxStream);
      let ended = false;

      mbox.on('message', (msg: Buffer) => {
        messages.push(msg);
      });

      const processEnd = async () => {
        if (ended) return;
        ended = true;

        console.log(`[Thunderbird Sync] Found ${messages.length} raw messages in MBOX file. Parsing now...`);
        let parsedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < messages.length; i++) {
          const rawMsg = messages[i];
          const currentNumber = i + 1;

          // Process and log progress every 10 or 20 messages to prevent perception of freezing
          if (currentNumber === 1 || currentNumber === messages.length || currentNumber % 10 === 0) {
            console.log(`Parsing and upserting email ${currentNumber} of ${messages.length}...`);
          }

          try {
            const parsed = await simpleParser(rawMsg);
            
            // Build unique message ID. If missing, create one from Subject + Date
            const msgId = parsed.messageId || `mbox_msg_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            const subject = parsed.subject || '(No Subject)';
            
            const fromObj = parsed.from as any;
            const toObj = parsed.to as any;
            const sender = fromObj?.text || fromObj?.value?.[0]?.address || 'unknown@advantagescm.com';
            const receiver = toObj?.text || toObj?.value?.[0]?.address || 'fachrul.wisnu@advantagescm.com';
            
            const date = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
            const bodyText = parsed.text || '';
            const htmlBody = parsed.html || parsed.textAsHtml || '';

            const parsedAttachments = (parsed.attachments || []).map((att: any) => {
              let fileData: string | null = null;
              const size = att.size || (att.content ? att.content.length : 0);
              if (att.content) {
                if (size <= 3 * 1024 * 1024) { // 3MB limit
                  fileData = Buffer.isBuffer(att.content)
                    ? att.content.toString('base64')
                    : Buffer.from(att.content).toString('base64');
                } else {
                  console.log(`[Thunderbird Sync] Skipped Base64 storage for ${att.filename || 'Attachment'} because its size (${size} bytes) exceeds 3MB limit.`);
                }
              }
              return {
                filename: att.filename || 'Attachment',
                contentType: att.contentType || '',
                size: size,
                fileData: fileData
              };
            });

            // Apply Business Rules tagging logic
            const tags = getAutoTags(subject, bodyText);

            // Upsert into SQLite
            await upsertEmail({
              message_id: msgId,
              subject,
              sender,
              receiver,
              date,
              body_text: bodyText,
              html_body: htmlBody,
              tags,
              attachments: parsedAttachments
            });

            parsedCount++;
          } catch (err: any) {
            console.error(`[Thunderbird Sync] Error parsing message ${currentNumber}:`, err.message || err);
            skippedCount++;
          }
        }

        resolve({
          success: true,
          message: `Successfully synchronized. Parsed and upserted ${parsedCount} emails into local SQLite. Skipped ${skippedCount} messages due to parsing errors.`,
          count: parsedCount,
          fallback: false
        });
      };

      mbox.on('end', () => {
        processEnd();
      });

      mbox.on('error', (err: any) => {
        console.error('[Thunderbird Sync] MBOX Stream parsing/format error (continuing if possible):', err.message || err);
        // Process any successfully read messages up to this point
        if (messages.length > 0) {
          processEnd();
        } else if (!ended) {
          ended = true;
          resolve({
            success: false,
            message: `MBOX stream error: ${err.message || String(err)}`,
            count: 0,
            fallback: false
          });
        }
      });

    } catch (err: any) {
      console.error('[Thunderbird Sync] Initialization/Synchronization failed:', err);
      resolve({
        success: false,
        message: `Sync failed: ${err.message || String(err)}`,
        count: 0,
        fallback: false
      });
    }
  });
}

/**
 * Generates simulated emails and upserts them directly into SQLite when MBOX file is not found (for demonstration/preview).
 */
async function generateSimulatedToSqlite(): Promise<number> {
  const branches = ["TEGAL", "PURWOKERTO", "SOLO", "SEMARANG", "BANDUNG", "SURABAYA", "CILACAP", "CIREBON", "SENEN"];
  const docTypes = ["UAT", "FSD", "SIT"];
  const appNames = ["Procurement App", "Delivery Tracking", "Payment Gateway Integration", "Inventory Management", "HR Payroll Sync"];
  
  const senders = [
    { name: "Dewi Lestari", email: "dewi.l@advantagescm.com" },
    { name: "Budi Setiawan", email: "budi.s@advantagescm.com" },
    { name: "Siti Rahma", email: "siti.r@advantagescm.com" },
    { name: "NOC Automated Agent", email: "noc@advantagescm.com" },
    { name: "Fachrul Wisnu", email: "fachrul.wisnu@advantagescm.com" },
    { name: "Rian Wijaya", email: "rian.w@advantagescm.com" },
    { name: "Mega Sari", email: "mega.s@advantagescm.com" }
  ];

  const simulatedCount = 12; // Generate plenty of diverse data for a rich dashboard look
  let count = 0;

  for (let i = 0; i < simulatedCount; i++) {
    const isSpeedtest = i % 2 === 0;
    const msgId = `sim_mbox_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`;
    const date = new Date(Date.now() - i * 4 * 60 * 60 * 1000).toISOString(); // spread over past 2 days

    const sender = senders[i % senders.length];
    const receiver = "fachrul.wisnu@advantagescm.com";

    let subject = "";
    let bodyText = "";
    let htmlBody = "";

    if (isSpeedtest) {
      const branch = branches[i % branches.length];
      const dl = (Math.random() * 85 + 15).toFixed(1);
      const ul = (Math.random() * 75 + 10).toFixed(1);
      const ping = Math.floor(Math.random() * 45) + 4;
      const status = ping > 30 ? "WARNING" : "EXCELLENT";

      subject = `SPEEDTEST RUTIN CABANG ${branch}`;
      bodyText = `Hi Team,\n\nHere is the speedtest routine report for CABANG ${branch}:\n- Download: ${dl} Mbps\n- Upload: ${ul} Mbps\n- Latency: ${ping}ms\n- Status: ${status}\n\nGenerated automatically by SLA Monitor.`;
      htmlBody = `<p>Hi Team,</p><p>Here is the speedtest routine report for <strong>CABANG ${branch}</strong>:</p><ul><li>Download: <strong>${dl} Mbps</strong></li><li>Upload: <strong>${ul} Mbps</strong></li><li>Latency: <strong>${ping}ms</strong></li><li>Status: <span style="color: ${status === "WARNING" ? "#f59e0b" : "#10b981"};"><strong>${status}</strong></span></li></ul><p>Generated automatically by SLA Monitor.</p>`;
    } else {
      const docType = docTypes[i % docTypes.length];
      const appName = appNames[i % appNames.length];

      subject = `Approval requested: ${docType} Signoff for ${appName}`;
      bodyText = `Dear Team,\n\nI have finalized and uploaded the ${docType} documents for ${appName}.\n\nPlease review the test cases and grant your Approval so we can transition to the next phase.\n\nBest regards,\n${sender.name}`;
      htmlBody = `<p>Dear Team,</p><p>I have finalized and uploaded the <strong>${docType}</strong> documents for <strong>${appName}</strong>.</p><p>Please review the test cases and grant your <strong>Approval</strong> so we can transition to the next phase.</p><p>Best regards,<br/><strong>${sender.name}</strong></p>`;
    }

    const tags = getAutoTags(subject, bodyText);

    try {
      await upsertEmail({
        message_id: msgId,
        subject,
        sender: `${sender.name} <${sender.email}>`,
        receiver,
        date,
        body_text: bodyText,
        html_body: htmlBody,
        tags
      });
      count++;
    } catch (err) {
      console.error('Error generating simulated email:', err);
    }
  }

  return count;
}
