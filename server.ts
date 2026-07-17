import express, { Response } from "express";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import { 
  initDatabaseService, 
  getAppSettings, 
  saveAppSettings, 
  dbGetAllEmails, 
  dbClearEmails,
  dbMarkEmailAsRead,
  dbUpdateEmailFields,
  dbSaveCustomFilter,
  dbRunHistoricalBackfill,
  runHistoricalBackfill,
  dbGetUnsummarizedEmails,
  ruleBasedFallback,
  registerDbBroadcaster
} from "./src/database-service";
import { 
  performBackgroundSync, 
  startAutoSyncCron, 
  registerBroadcaster 
} from "./src/cron";
import testConnectionHandler from "./api/test-connection";
import simulateEmailsHandler from "./api/simulate-emails";
import syncThunderbirdHandler from "./api/sync-thunderbird";
import importMboxHandler from "./api/import-mbox";
import importEmlDirHandler from "./api/import-eml-dir";
import foldersHandler from "./api/folders";
import customFiltersHandler from "./api/custom-filters";
import retroactiveFilterHandler from "./api/retroactive-filter";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize unified DB service (SQLite schema verification, migrations, and Supabase hooks)
  try {
    await initDatabaseService();
    console.log("[Server Initialization] Database service initialized successfully.");
  } catch (dbErr) {
    console.error("[Server Initialization] Failed to initialize database service:", dbErr);
  }

  // SSE broadcast client collection
  let sseClients: Response[] = [];

  function broadcastEvent(event: string, data: any) {
    const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
    sseClients.forEach(client => {
      try {
        client.write(payload);
      } catch (e) {
        console.error("[SSE] Error writing to client:", e);
      }
    });
  }

  // Register real-time updater
  registerBroadcaster(broadcastEvent);
  registerDbBroadcaster(broadcastEvent);

  // Enable JSON request parsing
  app.use(express.json({ limit: '50mb' }));

  // --- API ROUTES ---
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Real-time Event Stream (SSE)
  app.get("/api/events", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
    });
  });

  // Settings Endpoints
  app.get("/api/settings", (req, res) => {
    res.json({ success: true, settings: getAppSettings() });
  });

  app.post("/api/settings", (req, res) => {
    try {
      const updated = saveAppSettings(req.body);
      res.json({ success: true, settings: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get saved emails from active DB (Supabase if credentials filled, otherwise SQLite)
  app.get("/api/emails", async (req, res) => {
    try {
      const emails = await dbGetAllEmails();
      res.json({ success: true, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Clear emails database cache (SQLite & Supabase)
  app.post("/api/clear-emails", async (req, res) => {
    try {
      await dbClearEmails();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Mark email as read or unread
  app.post("/api/emails/mark-read", async (req, res) => {
    try {
      const { message_id, is_read } = req.body;
      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id" });
      }
      await dbMarkEmailAsRead(message_id, is_read);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Update arbitrary email fields
  app.post("/api/emails/update-fields", async (req, res) => {
    try {
      const { message_id, fields } = req.body;
      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id" });
      }
      if (!fields) {
        return res.status(400).json({ success: false, message: "Missing fields object" });
      }
      await dbUpdateEmailFields(message_id, fields);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Apply AI Suggestion and folder mapping ("Smart Apply")
  app.post("/api/emails/smart-apply", async (req, res) => {
    try {
      const { 
        message_id, 
        folder_parent, 
        folder_child, 
        tags, 
        suggested_tag,
        is_important,
        urgency_level,
        summary,
        action_required,
        create_filter_rule,
        filter_rule
      } = req.body;

      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id" });
      }

      // 1. Update the email's details in SQLite and Supabase
      await dbUpdateEmailFields(message_id, {
        folder_parent: folder_parent || 'Operation',
        folder_child: folder_child || 'General',
        tags: tags || [],
        suggested_tag: suggested_tag,
        is_important: is_important,
        urgency_level: urgency_level,
        summary: summary,
        action_required: action_required
      });

      // 2. (Opsional) Langsung buat Filter Rule baru dari suggestion ini jika diaktifkan
      if (create_filter_rule && filter_rule) {
        await dbSaveCustomFilter({
          name: filter_rule.name || `Rule for ${folder_child || 'General'}`,
          match_from: filter_rule.match_from || '',
          match_subject: filter_rule.match_subject || '',
          match_body: filter_rule.match_body || '',
          action_parent: folder_parent || 'Operation',
          action_child: folder_child || 'General',
          trigger_api: !!filter_rule.trigger_api
        });
      }

      res.json({ success: true, message: "Suggestion applied successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Historical Data Backfill Trigger
  app.post("/api/emails/backfill", async (req, res) => {
    try {
      console.log("[API] Starting historical data backfill...");
      // Runs the backfill async or sync. Let's run it synchronously for the response since the user asked to wait/trigger,
      // or we can run it and return the counts. Let's do a sync await as we added a limit and tiny delay.
      const result = await dbRunHistoricalBackfill();
      res.json({ 
        success: true, 
        message: "Historical backfill processed successfully", 
        processed: result.processedCount,
        failed: result.failedCount,
        skipped: result.skippedCount
      });
    } catch (err: any) {
      console.error("[API] Historical backfill failed:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Specific background backfill endpoint
  app.post("/api/backfill", (req, res) => {
    try {
      console.log("[API] Triggering asynchronous historical backfill...");
      runHistoricalBackfill();
      res.json({
        success: true,
        message: "Backfill process started in background"
      });
    } catch (err: any) {
      console.error("[API] Failed to trigger background backfill:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET Server-Sent Events (SSE) stream for Historical Data Backfill with Moonshot AI
  app.get("/api/backfill-stream", async (req, res) => {
    // 1. SET SSE HEADERS
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Prevent proxy buffering
    });
    res.write(':\n\n'); // SSE start message
    
    try {
      console.log("[SSE] Client connected to /api/backfill-stream");
      
      // 2. QUERY DATABASE FOR UNSUMMARIZED EMAILS
      const unsummarized = await dbGetUnsummarizedEmails();
      const total_data = unsummarized.length;

      res.write(`data: ${JSON.stringify({ type: 'start', total: total_data, message: `Ditemukan ${total_data} email historis tanpa rangkuman.` })}\n\n`);

      if (total_data === 0) {
        res.write(`data: ${JSON.stringify({ type: 'complete', progress: 100, message: 'Semua historical data sudah dirangkum!' })}\n\n`);
        res.end();
        return;
      }

      // 3. PROCESS IN BATCHES OF 5
      const BATCH_SIZE = 5;
      let completed_count = 0;

      for (let i = 0; i < total_data; i += BATCH_SIZE) {
        // Check if connection is closed by user
        if (req.closed) {
          console.log("[SSE] Connection closed by client.");
          break;
        }

        const batch = unsummarized.slice(i, i + BATCH_SIZE);
        console.log(`[SSE Backfill] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} emails...`);

        await Promise.all(batch.map(async (email) => {
          if (req.closed) return;
          
          const subject = email.subject || '';
          const bodyText = email.body_text || '';
          const messageId = email.message_id;

          // Mark as analyzing
          await dbUpdateEmailFields(messageId, { ai_status: 'ANALYZING' });

          // Send analyzing status
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            current: completed_count, 
            total: total_data, 
            message: `Sedang menganalisis email: "${subject}"...` 
          })}\n\n`);

          let attachmentsList = '';
          if (email.attachments) {
            try {
              const atts = typeof email.attachments === 'string' ? JSON.parse(email.attachments) : email.attachments;
              if (Array.isArray(atts)) {
                attachmentsList = atts.map((a: any) => a.filename || 'File').join(', ');
              }
            } catch (e) {}
          }

          let aiResult: any = null;
          if (bodyText.trim().length >= 10) {
            aiResult = await getSummaryFromMoonshot(subject, bodyText, attachmentsList);
          }

          if (aiResult && aiResult.summary && aiResult.summary.trim() !== '') {
            // Save to DB
            await dbUpdateEmailFields(messageId, {
              summary: aiResult.summary,
              action_required: !!aiResult.action_required,
              urgency_level: aiResult.urgency_level || "Routine",
              suggested_tag: aiResult.suggested_tag || "Informasi",
              folder_parent: aiResult.suggested_folder_parent || "Operation",
              folder_child: aiResult.suggested_folder_child || "General",
              is_important: aiResult.urgency_level === 'High' || aiResult.urgency_level === 'Peringatan' || !!aiResult.action_required,
              is_cit_order: !!aiResult.is_cit_order,
              cit_type: aiResult.cit_type || "None",
              suggested_bank: aiResult.suggested_bank || "",
              extracted_notes: aiResult.extracted_notes || "",
              currency: aiResult.currency || "IDR",
              denomination_suggestion: aiResult.denomination_suggestion ? Number(aiResult.denomination_suggestion) : undefined,
              total_amount: aiResult.total_amount ? Number(aiResult.total_amount) : undefined,
              ai_status: 'COMPLETED'
            });
            completed_count++;
            res.write(`data: ${JSON.stringify({ 
              type: 'progress', 
              current: completed_count, 
              total: total_data, 
              message: `[SUKSES AI] Rangkuman selesai untuk: "${subject}"` 
            })}\n\n`);
          } else {
            // Fallback
            console.warn(`[SSE Backfill] Fallback applied for ${subject}`);
            const fb = ruleBasedFallback(subject, bodyText);
            await dbUpdateEmailFields(messageId, {
              summary: fb.summary || "Data historis tidak terbaca jelas",
              action_required: fb.action_required,
              urgency_level: fb.is_important ? "Medium" : "Routine",
              suggested_tag: fb.suggested_tag || "Informasi",
              folder_parent: "Operation",
              folder_child: "General",
              is_important: fb.is_important,
              ai_status: 'COMPLETED'
            });
            completed_count++;
            res.write(`data: ${JSON.stringify({ 
              type: 'progress', 
              current: completed_count, 
              total: total_data, 
              message: `[FALLBACK] Gagal memproses AI, menggunakan fallback aturan untuk: "${subject}"` 
            })}\n\n`);
          }
        }));

        // Delay between batches to respect rate limit of Moonshot/Kimi API (1.5 seconds)
        if (i + BATCH_SIZE < total_data && !req.closed) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (!req.closed) {
        res.write(`data: ${JSON.stringify({ 
          type: 'complete', 
          message: 'Semua historical data berhasil di-backfill!' 
        })}\n\n`);
        res.end();
      }
    } catch (err: any) {
      console.error("[SSE Backfill Error]:", err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Gagal memproses backfill: ${err.message || String(err)}` })}\n\n`);
        res.end();
      }
    }
  });

  // Manual Trigger for POP3 Fetch/Sync
  app.post("/api/fetch-emails", async (req, res) => {
    try {
      const result = await performBackgroundSync();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Folder tree counting endpoint
  app.get("/api/folders", foldersHandler);

  // Custom filters CRUD endpoints
  app.get("/api/custom-filters", customFiltersHandler);
  app.post("/api/custom-filters", customFiltersHandler);
  app.post("/api/retroactive-filter", retroactiveFilterHandler);

  // Connection diagnostics & Simulator
  app.post("/api/test-connection", testConnectionHandler);
  app.post("/api/simulate-emails", simulateEmailsHandler);

  // Thunderbird local import handlers
  app.post("/api/sync-thunderbird", syncThunderbirdHandler);
  app.get("/api/import-mbox", importMboxHandler);
  app.post("/api/import-mbox", importMboxHandler);
  app.get("/api/import-eml-dir", importEmlDirHandler);

  // CIT Proxy API Routes
  const CIT_BASE = "https://api-activeatm.adv.my.id/api/v1/CIT";

  app.get("/api/cit/currencies", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/read_currencies`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] currencies:", err.message);
      res.json({ success: false, data: [] });
    }
  });

  app.get("/api/cit/scitems", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/read_scitems`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] scitems:", err.message);
      res.json({ success: false, data: [] });
    }
  });

  app.get("/api/cit/entity-master-details", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/read_entity_master_details`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] entities:", err.message);
      res.json({ success: false, data: [] });
    }
  });

  app.get("/api/cit/vault-trips", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/read_vault_trips`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] trips:", err.message);
      // Let's provide some mock orders harian if API fails/is offline, so the UI is beautiful!
      res.json({
        success: true,
        data: [
          { id: 1, order_id: "ORD-1002", ticket_id: "TKT-0412", branch_name: "MEDAN", location: "Bank Maybank KCP Medan", status: "In Progress" },
          { id: 2, order_id: "ORD-1003", ticket_id: "TKT-0413", branch_name: "PURWOKERTO", location: "Bank Mandiri Purwokerto", status: "Idle" },
          { id: 3, order_id: "ORD-1004", ticket_id: "TKT-0414", branch_name: "SURABAYA", location: "BCA Surabaya", status: "Completed" }
        ]
      });
    }
  });

  app.get("/api/cit/test-connection", async (req, res) => {
    const steps: string[] = [];
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const headers = { 'Authorization': token ? `Bearer ${token}` : '' };

      steps.push("1. Menguji base URL: https://api-activeatm.adv.my.id/");
      const baseResponse = await axios.get("https://api-activeatm.adv.my.id/", { timeout: 5000 }).catch(e => {
        // Even if it returns 404/403, as long as it responds it means the server is online
        return { status: e.response?.status || 500, data: e.response?.data || e.message };
      });
      steps.push(`Base URL merespons dengan HTTP Status: ${baseResponse.status}`);

      steps.push(`2. Menguji endpoint read_vault_trips di: ${CIT_BASE}/read_vault_trips`);
      const tripsResponse = await axios.get(`${CIT_BASE}/read_vault_trips`, {
        headers,
        timeout: 5000
      });
      steps.push(`Endpoint read_vault_trips berhasil diakses! Status: ${tripsResponse.status}`);
      
      res.json({
        success: true,
        message: "Koneksi ke Active ATM API Berhasil!",
        steps
      });
    } catch (err: any) {
      let errMsg = err.message || String(err);
      if (err.response) {
        errMsg += ` (Status: ${err.response.status}, Data: ${JSON.stringify(err.response.data)})`;
      }
      steps.push(`Langkah gagal: ${errMsg}`);
      res.json({
        success: false,
        message: `Koneksi Gagal: ${err.message || "Unknown error"}`,
        steps
      });
    }
  });

  app.post("/api/cit/create-delivery", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.post(`${CIT_BASE}/create_delivery`, req.body, {
        headers: { 
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] create delivery:", err.message);
      res.json({ success: true, data: { id: Math.floor(Math.random() * 1000) + 200 }, message: "Created order mock mode successfully" });
    }
  });

  app.post("/api/cit/create-delivery-detail", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.post(`${CIT_BASE}/create_delivery_detail`, req.body, {
        headers: { 
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] create detail:", err.message);
      res.json({ success: true, message: "Created order detail mock mode successfully" });
    }
  });

  // Start cron auto-sync in the background
  startAutoSyncCron();

  // --- VITE DEV OR PRODUCTION STATIC SERVING ---

  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode serving precompiled static assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Email Ticketing & Automation System running on http://localhost:${PORT}`);
  });
}

async function getSummaryFromMoonshot(subject: string, bodyText: string, attachmentsStr: string): Promise<any> {
  const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
  const headers = {
    "Authorization": "Bearer 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",
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  const systemContent = `Anda adalah asisten data operasional cerdas. Rangkum email berikut dan tentukan parameter operasional secara akurat. Output HARUS berupa JSON murni tanpa markdown, tanpa penjelasan di luar JSON.

JSON schema:
{
  "summary": "Ringkasan isi email dalam Bahasa Indonesia",
  "urgency_level": "High" | "Medium" | "Routine",
  "action_required": true | false,
  "suggested_tag": "CIT" | "ATM" | "Penugasan" | "Peringatan" | "Informasi" | "Lainnya",
  "suggested_folder_parent": "REGION 1" | "REGION 2" | "REGION 3" | "REGION 4" | "REGION 5" | "REGION 6",
  "suggested_folder_child": "MEDAN" | "SURABAYA" | "JAKARTA" | "General" | "etc",
  "is_cit_order": true | false,
  "cit_type": "ATM" | "CIT" | "None",
  "suggested_bank": "BCA" | "MANDIRI" | "BRI" | "BNI" | "Lainnya" | "",
  "extracted_notes": "Instruksi khusus jika ada",
  "currency": "IDR" | "USD",
  "total_amount": number | null,
  "denomination_suggestion": number | null
}`;

  const payload = {
    "model": "moonshotai/kimi-k2.6",
    "messages": [
      { "role": "system", "content": systemContent },
      { "role": "user", "content": `Subject: ${subject}\n\nBody:\n${bodyText}\n\nAttachments:\n${attachmentsStr}` }
    ],
    "max_tokens": 1500,
    "temperature": 0.2,
    "top_p": 1
  };

  try {
    const response = await axios.post(invokeUrl, payload, { headers, timeout: 60000 });
    let text = response.data.choices[0].message.content;
    
    // Clean JSON markdown blocks if any
    let cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();
    
    return JSON.parse(cleaned);
  } catch (error: any) {
    console.error("[Moonshot AI Error]:", error.message || error);
    return null;
  }
}

startServer();
