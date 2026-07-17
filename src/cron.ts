import cron from 'node-cron';
import { simpleParser } from 'mailparser';
import { Pop3Client, parsePop3Message } from './pop3';
import { 
  getAppSettings, 
  dbGetAllEmails, 
  dbUpsertEmail, 
  dbGetCustomFilters,
  Email,
  syncAndAnalyzeEmail
} from './database-service';
import { triggerCitApiWorkflow } from './cit-api-service';

// Import broadcastEvent dynamically from server to prevent circular dependencies
let broadcastEventFn: ((event: string, data: any) => void) | null = null;

export function registerBroadcaster(fn: (event: string, data: any) => void) {
  broadcastEventFn = fn;
}

let isSyncing = false;

/**
 * Performs POP3 fetch, dynamic tagging, parsing, CIT API automation triggering, and DB saving.
 */
export async function performBackgroundSync(): Promise<{ success: boolean; count: number; message: string }> {
  if (isSyncing) {
    console.log('[Cron Sync] Sync already in progress, skipping...');
    return { success: false, count: 0, message: 'Sync already in progress' };
  }

  isSyncing = true;
  console.log(`\n=== [BACKGROUND POP3 AUTO-SYNC START] ===`);

  const client = new Pop3Client();

  try {
    const settings = getAppSettings();
    const { pop3Host, pop3Port, pop3User, pop3Pass } = settings;

    if (!pop3Host || !pop3User) {
      console.warn('[Cron Sync] POP3 Host or User not configured in settings. Skipping background sync.');
      return { success: false, count: 0, message: 'POP3 settings not fully configured' };
    }

    let existingEmails: Email[] = [];
    try {
      existingEmails = await dbGetAllEmails();
    } catch (dbErr) {
      console.error('[Cron Sync] Failed to query existing emails:', dbErr);
    }

    const existingMessageIds = new Set<string>(existingEmails.map(e => e.message_id).filter(Boolean));
    let addedCount = 0;

    try {
      console.log(`[Cron Sync] Connecting to POP3 server: ${pop3Host}:${pop3Port}`);
      const greeting = await client.connect(pop3Host, pop3Port);
      console.log(`[Cron Sync] Connected! Greeting: "${greeting.trim()}"`);

      // USER & PASS Authentications
      await client.sendCommand(`USER ${pop3User}`);
      const authRes = await client.sendCommand(`PASS ${pop3Pass}`);
      if (!authRes.startsWith('+OK')) {
        throw new Error(`POP3 Authentication failed: ${authRes.trim()}`);
      }
      console.log('[Cron Sync] POP3 Authentication successful.');

      // UIDL Command to get message IDs
      const uidlRes = await client.sendCommand('UIDL', true);
      if (!uidlRes.startsWith('+OK')) {
        throw new Error(`UIDL command error: ${uidlRes.trim()}`);
      }

      const lines = uidlRes.split(/\r?\n/);
      if (lines[0].startsWith('+OK')) {
        lines.shift();
      }

      const emailItems: { msgNum: number; uid: string }[] = [];
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const msgNum = parseInt(parts[0], 10);
          const uid = parts[1];
          if (!isNaN(msgNum) && uid) {
            emailItems.push({ msgNum, uid });
          }
        }
      }

      console.log(`[Cron Sync] Server reports ${emailItems.length} total messages.`);

      // Check which ones are new
      const newItems = emailItems.filter(item => !existingMessageIds.has(item.uid));
      console.log(`[Cron Sync] Found ${newItems.length} new messages to fetch.`);

      const BATCH_SIZE = 50;

      // 1. Fetch Phase (Sequential raw POP3 RETR and simpleParser)
      const fetchedEmails: Array<{
        item: { msgNum: number; uid: string };
        parsed: any;
        subject: string;
        dateStr: string;
        senderStr: string;
        receiverStr: string;
        bodyText: string;
        htmlBody: string;
        parsedAttachments: any[];
      }> = [];

      console.log(`[Cron Sync] Downloading and parsing ${newItems.length} emails from POP3 server...`);
      for (const item of newItems) {
        try {
          console.log(`[Cron Sync] Fetching message #${item.msgNum} (UID: ${item.uid})...`);
          const retrRes = await client.sendCommand(`RETR ${item.msgNum}`, true);
          const rawEmail = parsePop3Message(retrRes);

          // Parse with mailparser
          const parsed = await simpleParser(rawEmail);

          const subject = parsed.subject || '(No Subject)';
          const dateStr = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
          
          const fromVal = (parsed.from as any)?.value?.[0] || (parsed.from as any)?.[0] || {};
          const senderStr = fromVal.name 
            ? `${fromVal.name} <${fromVal.address}>` 
            : (fromVal.address || 'Unknown Sender');

          // FILTER SPAM EASYGO
          if (subject.toLowerCase().includes('easygo') || senderStr.toLowerCase().includes('easygo')) {
            console.log(`[Cron Sync] Skipping easygo spam email: Subject="${subject}", Sender="${senderStr}"`);
            continue;
          }

          const toVal = (parsed.to as any)?.value?.[0] || (parsed.to as any)?.[0] || {};
          const receiverStr = toVal.address || 'fachrul.wisnu@advantagescm.com';

          const bodyText = parsed.text || '';
          const htmlBody = parsed.textAsHtml || parsed.html || '';

          const parsedAttachments = (parsed.attachments || []).map((att: any) => {
            let fileData: string | null = null;
            const size = att.size || (att.content ? att.content.length : 0);
            if (att.content) {
              if (size <= 3 * 1024 * 1024) { // 3MB limit
                fileData = Buffer.isBuffer(att.content)
                  ? att.content.toString('base64')
                  : Buffer.from(att.content).toString('base64');
              } else {
                console.log(`[Cron Sync] Skipped Base64 storage for ${att.filename || 'Attachment'} because its size (${size} bytes) exceeds 3MB limit.`);
              }
            }
            return {
              filename: att.filename || 'Attachment',
              contentType: att.contentType || '',
              size: size,
              fileData: fileData
            };
          });

          fetchedEmails.push({
            item,
            parsed,
            subject,
            dateStr,
            senderStr,
            receiverStr,
            bodyText,
            htmlBody,
            parsedAttachments
          });
        } catch (emailErr: any) {
          console.error(`[Cron Sync] Failed to fetch/parse message #${item.msgNum} (UID: ${item.uid}):`, emailErr);
        }
      }

      console.log(`[Cron Sync] Downloaded ${fetchedEmails.length} messages. Commencing Parallel AI Processing (Batch Size: 5)...`);

      // 2. Parallel Processing Phase (AI + Supabase/SQLite in batches of 5)
      const PROCESS_BATCH_SIZE = 5;
      for (let i = 0; i < fetchedEmails.length; i += PROCESS_BATCH_SIZE) {
        const batch = fetchedEmails.slice(i, i + PROCESS_BATCH_SIZE);
        console.log(`[Cron Sync] Processing AI batch ${Math.floor(i / PROCESS_BATCH_SIZE) + 1}/${Math.ceil(fetchedEmails.length / PROCESS_BATCH_SIZE)} (Items ${i + 1} to ${Math.min(i + PROCESS_BATCH_SIZE, fetchedEmails.length)} of ${fetchedEmails.length})...`);

        await Promise.all(batch.map(async (emailJob) => {
          const { item, parsed, subject, dateStr, senderStr, receiverStr, bodyText, htmlBody, parsedAttachments } = emailJob;
          try {
            // Determine tags
            const tags: string[] = [];
            const subjUpper = subject.toUpperCase();
            if (subjUpper.includes('SPEEDTEST')) tags.push('Speedtest');
            if (subjUpper.includes('APPROVAL')) tags.push('Approval');
            if (subjUpper.includes('UAT')) tags.push('UAT');
            if (subjUpper.includes('FSD')) tags.push('FSD');
            if (subjUpper.includes('SIT')) tags.push('SIT');
            if (tags.length === 0) tags.push('Other');

            // Match custom filters with logic AND on filled fields
            let matchedFolderParent = '';
            let matchedFolderChild = '';
            let triggerApiWorkflow = false;

            const filters = await dbGetCustomFilters();
            for (const filter of filters) {
              if (!filter.match_from && !filter.match_subject && !filter.match_body) {
                continue;
              }
              let isMatch = true;
              if (filter.match_from && !senderStr.toLowerCase().includes(filter.match_from.toLowerCase())) isMatch = false;
              if (filter.match_subject && !subject.toLowerCase().includes(filter.match_subject.toLowerCase())) isMatch = false;
              if (filter.match_body && !bodyText.toLowerCase().includes(filter.match_body.toLowerCase())) isMatch = false;

              if (isMatch) {
                matchedFolderParent = filter.action_parent;
                matchedFolderChild = filter.action_child;
                triggerApiWorkflow = !!filter.trigger_api;
                break;
              }
            }

            // Trigger CIT API Automation Workflow if matched parent is 'Bank Order' or trigger_api is true
            let apiWorkflowStatus = 'none';
            let apiWorkflowLog = '';

            if (matchedFolderParent === 'Bank Order' || triggerApiWorkflow) {
              apiWorkflowStatus = 'pending';
              console.log(`[Cron Sync] Triggering CIT API Workflow for Bank Order: "${subject}"`);
              try {
                const workflowResult = await triggerCitApiWorkflow(item.uid, subject, bodyText);
                apiWorkflowStatus = workflowResult.success ? 'triggered' : 'failed';
                apiWorkflowLog = workflowResult.log;
              } catch (wfErr: any) {
                apiWorkflowStatus = 'failed';
                apiWorkflowLog = `CIT API Automation Exception: ${wfErr.message || String(wfErr)}`;
              }
            }

            const newEmail: Email = {
              message_id: item.uid,
              subject,
              sender: senderStr,
              receiver: receiverStr,
              date: dateStr,
              body_text: bodyText,
              html_body: htmlBody,
              tags,
              folder_parent: matchedFolderParent || undefined,
              folder_child: matchedFolderChild || undefined,
              api_workflow_status: apiWorkflowStatus,
              api_workflow_log: apiWorkflowLog,
              attachments: parsedAttachments
            };

            // Save to DB (SQLite and Supabase) and analyze with NVIDIA AI
            try {
              console.log(`Memproses summary untuk email: [${subject}]`);
              await syncAndAnalyzeEmail(newEmail);
              addedCount++;
            } catch (apiOrDbErr: any) {
              console.error(`[Cron Sync] Error in NVIDIA AI or Supabase Upsert for message #${item.msgNum} (UID: ${item.uid}):`, apiOrDbErr);
              return;
            }

            // Broadcast to React frontend in real-time
            if (broadcastEventFn) {
              broadcastEventFn('email_synced', {
                email: {
                  ...newEmail,
                  fromName: parsed.from?.value[0]?.name || parsed.from?.value[0]?.address || 'Unknown Sender',
                  fromAddress: parsed.from?.value[0]?.address || '',
                  body: bodyText,
                  bodyHtml: htmlBody,
                  folderParent: newEmail.folder_parent,
                  folderChild: newEmail.folder_child
                },
                message: `New email synced: "${subject}" tagged as "${newEmail.folder_parent || 'Lainnya'} > ${newEmail.folder_child || 'Uncategorized'}"`
              });
            }
          } catch (jobErr: any) {
            console.error(`[Cron Sync] Error processing AI/DB job for message #${item.msgNum} (UID: ${item.uid}):`, jobErr);
          }
        }));

        // Memory cleanup: trigger GC if available
        if (typeof global !== 'undefined' && (global as any).gc) {
          try {
            (global as any).gc();
          } catch (gcErr) {}
        }
      }

      console.log(`[Cron Sync] Successfully synced POP3 emails. Added count: ${addedCount}`);
      await client.sendCommand('QUIT');
      return { success: true, count: addedCount, message: `Synced ${addedCount} new emails successfully.` };

    } catch (syncErr: any) {
      console.error('[Cron Sync] Sync failed during connection/UIDL processing:', syncErr);
      return { success: false, count: 0, message: `Sync failed: ${syncErr.message || String(syncErr)}` };
    }
  } catch (err: any) {
    console.error('[Cron Sync] Critical error in sync workflow:', err);
    return { success: false, count: 0, message: `Critical error: ${err.message || String(err)}` };
  } finally {
    try {
      client.close();
    } catch (closeErr) {
      console.warn('[Cron Sync] Warning: Error closing POP3 client:', closeErr);
    }
    isSyncing = false;
    console.log(`=== [BACKGROUND POP3 AUTO-SYNC END] ===\n`);
  }
}

// Start cron job every 3 minutes
export function startAutoSyncCron() {
  console.log('[Cron] Initializing auto-sync cron job (every 3 minutes: "*/3 * * * *")...');
  cron.schedule('*/3 * * * *', async () => {
    console.log('[Cron] Triggering POP3 background auto-sync...');
    await performBackgroundSync();
  });
}
