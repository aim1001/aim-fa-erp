import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { pool } from "./db";

// 자동 DB 마이그레이션 - 새 테이블/컬럼이 없으면 추가
async function runAutoMigrations() {
  const migrations = [
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS default_payment_terms text`,
    `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS category_discounts text`,
    `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS quotation_category_order text`,
    `CREATE TABLE IF NOT EXISTS purchase_order_invoice_links (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_order_id varchar NOT NULL,
      purchase_invoice_id varchar NOT NULL,
      note text,
      created_at timestamp DEFAULT now()
    )`,
  ];
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (e: any) {
      console.warn(`Migration warning: ${e.message}`);
    }
  }
  console.log("DB auto-migrations completed");
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.set("trust proxy", 1);

const PgStore = connectPgSimple(session);
app.use(
  session({
    secret: process.env.SESSION_SECRET || "sales-manager-session-secret-2026",
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  await runAutoMigrations();

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions =
    process.platform === "win32"
      ? { port, host: "0.0.0.0" }
      : { port, host: "0.0.0.0", reusePort: true };

  httpServer.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
