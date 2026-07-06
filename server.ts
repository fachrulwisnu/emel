import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import testConnectionHandler from "./api/test-connection";
import fetchEmailsHandler from "./api/fetch-emails";
import simulateEmailsHandler from "./api/simulate-emails";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable JSON request parsing
  app.use(express.json({ limit: '10mb' }));

  // --- API ROUTES (Delegated to Vercel Serverless Function Handlers) ---
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), serverlessReady: true });
  });

  // POP3 Test Connection
  app.post("/api/test-connection", testConnectionHandler);

  // POP3 Fetch Emails (Stateless)
  app.post("/api/fetch-emails", fetchEmailsHandler);

  // POP3 Simulate Emails (Stateless)
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
    console.log(`Email Ticketing System Server (Serverless-Proxy Mode) running on http://localhost:${PORT}`);
  });
}

startServer();
