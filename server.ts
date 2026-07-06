import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initDb } from "./src/sqlite-db";
import testConnectionHandler from "./api/test-connection";
import fetchEmailsHandler from "./api/fetch-emails";
import simulateEmailsHandler from "./api/simulate-emails";
import emailsHandler from "./api/emails";
import clearEmailsHandler from "./api/clear-emails";
import syncThunderbirdHandler from "./api/sync-thunderbird";
import importMboxHandler from "./api/import-mbox";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize local SQLite database before starting server listeners
  try {
    await initDb();
    console.log("[Server Initialization] SQLite database initialized successfully.");
  } catch (dbErr) {
    console.error("[Server Initialization] Failed to initialize SQLite database:", dbErr);
  }

  // Enable JSON request parsing
  app.use(express.json({ limit: '50mb' }));

  // --- API ROUTES ---
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), localMode: true });
  });

  // Get saved emails from local SQLite database
  app.get("/api/emails", emailsHandler);

  // Clear emails database cache
  app.post("/api/clear-emails", clearEmailsHandler);

  // Sync Thunderbird Inbox MBOX
  app.post("/api/sync-thunderbird", syncThunderbirdHandler);
  app.get("/api/import-mbox", importMboxHandler);
  app.post("/api/import-mbox", importMboxHandler);

  // Keep POP3 routes for backwards compatibility/fallback
  app.post("/api/test-connection", testConnectionHandler);
  app.post("/api/fetch-emails", fetchEmailsHandler);
  app.post("/api/simulate-emails", simulateEmailsHandler);

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
    console.log(`Email Ticketing System Server (Local DB Mode) running on http://localhost:${PORT}`);
  });
}

startServer();
