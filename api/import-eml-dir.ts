import fs from 'fs';
import path from 'path';
import { simpleParser } from 'mailparser';
import { upsertEmail, classifyFolder } from '../src/sqlite-db';

export default async function handler(req: any, res: any) {
  const customPath = req.query.path || '';
  
  // Set headers for Server-Sent Events (SSE) streaming IMMEDIATELY
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevent buffering in proxies like Nginx
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!customPath.trim()) {
    sendEvent({
      status: 'error',
      log: `Error: Please specify a valid folder path.`
    });
    res.end();
    return;
  }

  // Handle absolute path resolution using path.resolve()
  const resolvedPath = path.resolve(customPath);

  // Check file system accessibility on the actual target folder
  if (!fs.existsSync(resolvedPath)) {
    sendEvent({
      status: 'error',
      log: `Error: Directory path does not exist: "${resolvedPath}"`
    });
    res.end();
    return;
  }

  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      sendEvent({
        status: 'error',
        log: `Error: Path is not a directory: "${resolvedPath}"`
      });
      res.end();
      return;
    }
  } catch (err: any) {
    sendEvent({
      status: 'error',
      log: `Error checking path: ${err.message || String(err)}`
    });
    res.end();
    return;
  }

  try {
    const files = fs.readdirSync(resolvedPath);
    // Filter ONLY files that end with .eml or .EML (case-insensitive)
    const emlFiles = files.filter(f => f.toLowerCase().endsWith('.eml'));

    if (emlFiles.length === 0) {
      sendEvent({
        status: 'complete',
        percentage: 100,
        parsedCount: 0,
        log: `No .eml files found in the directory "${resolvedPath}".`
      });
      res.end();
      return;
    }

    sendEvent({
      status: 'processing',
      percentage: 0,
      parsedCount: 0,
      log: `Found ${emlFiles.length} real EML files in directory. Starting parsing...`
    });

    let parsedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < emlFiles.length; i++) {
      const fileName = emlFiles[i];
      const filePath = path.join(resolvedPath, fileName);

      try {
        // Use fs.createReadStream(filePath)
        const stream = fs.createReadStream(filePath);
        const parsed = await simpleParser(stream);
        
        const msgId = parsed.messageId || `eml_msg_${Date.now()}_${i}_${Math.floor(Math.random() * 100000)}`;
        const subject = parsed.subject || '(No Subject)';
        
        const fromObj = parsed.from as any;
        const toObj = parsed.to as any;
        
        // Format sender to hold "Name <address>" format if both exist
        let sender = '';
        if (fromObj?.value?.[0]) {
          const first = fromObj.value[0];
          if (first.name && first.address) {
            sender = `"${first.name}" <${first.address}>`;
          } else if (first.name) {
            sender = first.name;
          } else if (first.address) {
            sender = first.address;
          }
        }
        if (!sender) {
          sender = fromObj?.text || 'unknown@advantagescm.com';
        }
        
        let receiver = '';
        if (toObj?.value?.[0]) {
          const first = toObj.value[0];
          if (first.name && first.address) {
            receiver = `"${first.name}" <${first.address}>`;
          } else if (first.name) {
            receiver = first.name;
          } else if (first.address) {
            receiver = first.address;
          }
        }
        if (!receiver) {
          receiver = toObj?.text || 'fachrul.wisnu@advantagescm.com';
        }

        const dateStr = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
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
              console.log(`[EML Import] Skipped Base64 storage for ${att.filename || 'Attachment'} because its size (${size} bytes) exceeds 3MB limit.`);
            }
          }
          return {
            filename: att.filename || 'Attachment',
            contentType: att.contentType || '',
            size: size,
            fileData: fileData
          };
        });

        // Classify folder_parent and folder_child
        const { folder_parent, folder_child } = classifyFolder(sender, subject);

        // Upsert to sqlite-db
        await upsertEmail({
          message_id: msgId,
          subject,
          sender,
          receiver,
          date: dateStr,
          body_text: bodyText,
          html_body: htmlBody,
          tags: [],
          folder_parent,
          folder_child,
          attachments: parsedAttachments
        });

        parsedCount++;

        const percentage = Math.round(((i + 1) / emlFiles.length) * 100);
        sendEvent({
          status: 'processing',
          percentage,
          parsedCount,
          log: `Parsed [${i + 1}/${emlFiles.length}]: "${fileName}" - Subject: "${subject.substring(0, 50)}"`
        });

      } catch (err: any) {
        skippedCount++;
        sendEvent({
          status: 'error_item',
          log: `Failed to import EML "${fileName}": ${err.message || String(err)}`
        });
      }
    }

    sendEvent({
      status: 'complete',
      percentage: 100,
      parsedCount,
      log: `Batch EML folder import completed successfully! Processed: ${parsedCount} saved, ${skippedCount} skipped.`
    });
    res.end();

  } catch (err: any) {
    console.error('[Import EML Dir API] Fatal:', err);
    sendEvent({
      status: 'error',
      log: `Fatal directory read error: ${err.message || String(err)}`
    });
    res.end();
  }
}
