import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import db from "./db.js";
import { initBlockchain } from "./services/blockchain.js";
import { startEventListeners } from "./listeners/events.js";
import authRoutes from "./routes/auth.js";
import walletRoutes from "./routes/wallet.js";
import tradeRoutes from "./routes/trade.js";
import adminRoutes from "./routes/admin.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/trade", tradeRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Sunucu hatası" });
});

const PORT = process.env.PORT || 3000;

function seedAdmin() {
  const admin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!admin) {
    const hash = bcrypt.hashSync("admin123", 10);
    db.prepare("INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)").run(hash);
    console.log("[SEED] Admin kullanıcı oluşturuldu (admin / admin123)");
  }
}

async function start() {
  seedAdmin();

  try {
    initBlockchain();
    console.log("[BLOCKCHAIN] Bağlantı kuruldu");
    startEventListeners();
  } catch (err) {
    console.warn("[BLOCKCHAIN] Bağlantı kurulamadı, sadece DB modunda çalışıyor");
  }

  app.listen(PORT, () => {
    console.log(`[SERVER] http://localhost:${PORT}`);
  });
}

start();
