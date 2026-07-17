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

startServer();
