import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initDb, getAllEmails, clearAllEmails } from "./src/db";
import { testConnection, fetchEmails } from "./src/pop3";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable JSON request parsing with high limit in case of rich payloads
  app.use(express.json({ limit: '10mb' }));

  // Initialize JSON Database
  try {
    await initDb();
    console.log("Local JSON database initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize JSON database:", err);
  }

  // --- API ROUTES ---

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Get all fetched emails
  app.get("/api/emails", async (req, res) => {
    try {
      const emails = await getAllEmails();
      res.json({ success: true, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // Test POP3 connection
  app.post("/api/test-connection", async (req, res) => {
    const { host, port, username, password } = req.body;
    
    if (!host || !port || !username || !password) {
      return res.status(400).json({
        success: false,
        error: "Missing required connection parameters: host, port, username, password."
      });
    }

    try {
      const statusMessage = await testConnection(host, Number(port), username, password);
      const isSuccess = statusMessage.startsWith("SUCCESS");
      res.json({ success: isSuccess, message: statusMessage });
    } catch (err: any) {
      res.json({ success: false, message: `FAILED: ${err.message || String(err)}` });
    }
  });

  // Fetch emails from POP3 and store to database
  app.post("/api/fetch-emails", async (req, res) => {
    const { host, port, username, password, limit } = req.body;

    if (!host || !port || !username || !password) {
      return res.status(400).json({
        success: false,
        error: "Missing required connection parameters: host, port, username, password."
      });
    }

    try {
      const result = await fetchEmails(host, Number(port), username, password, limit || 30);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err), fetchedCount: 0 });
    }
  });

  // Clear database cached emails
  app.post("/api/clear-emails", async (req, res) => {
    try {
      await clearAllEmails();
      res.json({ success: true, message: "All local email records cleared successfully." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // Simulate incoming POP3 emails with tagging and local persistence
  app.post("/api/simulate-emails", async (req, res) => {
    try {
      const branches = ["TEGAL", "YOGYAKARTA", "SOLO", "SEMARANG", "BANDUNG", "SURABAYA", "CILACAP", "CIREBON"];
      const docTypes = ["UAT", "FSD", "SIT"];
      const appNames = ["Procurement App", "Delivery Tracking", "Payment Gateway Integration", "Inventory Management", "HR Payroll Sync"];
      const senders = [
        { name: "Dewi Lestari", email: "dewi.l@advantagescm.com" },
        { name: "Budi Setiawan", email: "budi.s@advantagescm.com" },
        { name: "Siti Rahma", email: "siti.r@advantagescm.com" },
        { name: "NOC Automated Agent", email: "agent-noc@advantagescm.com" },
        { name: "Fachrul Wisnu", email: "fachrul.wisnu@advantagescm.com" }
      ];

      const simulatedCount = Math.floor(Math.random() * 2) + 2; // Generate 2 or 3 emails
      const { saveEmail } = await import("./src/db");
      const { getAutoTags } = await import("./src/tags");

      for (let i = 0; i < simulatedCount; i++) {
        const isSpeedtest = Math.random() > 0.5;
        const uid = `sim_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        // Slightly spread timestamps
        const date = new Date(Date.now() - i * 12 * 60 * 1000).toISOString();

        if (isSpeedtest) {
          const branch = branches[Math.floor(Math.random() * branches.length)];
          const dl = (Math.random() * 85 + 15).toFixed(1);
          const ul = (Math.random() * 75 + 10).toFixed(1);
          const ping = Math.floor(Math.random() * 45) + 4;
          const status = ping > 30 ? "WARNING" : "EXCELLENT";

          const subject = `SPEEDTEST RUTIN CABANG ${branch}`;
          const body = `Hi Team,\n\nHere is the speedtest routine report for CABANG ${branch}:\n- Download: ${dl} Mbps\n- Upload: ${ul} Mbps\n- Latency: ${ping}ms\n- Status: ${status}\n\nGenerated automatically by SLA Monitor.`;
          const bodyHtml = `<p>Hi Team,</p><p>Here is the speedtest routine report for <strong>CABANG ${branch}</strong>:</p><ul><li>Download: <strong>${dl} Mbps</strong></li><li>Upload: <strong>${ul} Mbps</strong></li><li>Latency: <strong>${ping}ms</strong></li><li>Status: <span style="color: ${status === "WARNING" ? "#f59e0b" : "#10b981"};"><strong>${status}</strong></span></li></ul><p>Generated automatically by SLA Monitor.</p>`;

          const tags = getAutoTags(subject, body);
          await saveEmail({
            uid,
            subject,
            fromName: "Network Operation Center",
            fromAddress: "noc@advantagescm.com",
            date,
            body,
            bodyHtml,
            tags
          });
        } else {
          const sender = senders[Math.floor(Math.random() * senders.length)];
          const docType = docTypes[Math.floor(Math.random() * docTypes.length)];
          const appName = appNames[Math.floor(Math.random() * appNames.length)];

          const subject = `Approval requested: ${docType} Signoff for ${appName}`;
          const body = `Dear Team,\n\nI have finalized and uploaded the ${docType} documents for ${appName}.\n\nPlease review the test cases and grant your Approval so we can transition to the next phase.\n\nBest regards,\n${sender.name}`;
          const bodyHtml = `<p>Dear Team,</p><p>I have finalized and uploaded the <strong>${docType}</strong> documents for <strong>${appName}</strong>.</p><p>Please review the test cases and grant your <strong>Approval</strong> so we can transition to the next phase.</p><p>Best regards,<br/><strong>${sender.name}</strong></p>`;

          const tags = getAutoTags(subject, body);
          await saveEmail({
            uid,
            subject,
            fromName: sender.name,
            fromAddress: sender.email,
            date,
            body,
            bodyHtml,
            tags
          });
        }
      }

      res.json({ success: true, message: `Successfully simulated and tag-synced ${simulatedCount} new emails into local JSON database!`, fetchedCount: simulatedCount });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

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
    console.log(`Email Ticketing System Server running on http://localhost:${PORT}`);
  });
}

startServer();
