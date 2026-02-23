import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db.js";

const router = Router();

router.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username ve password gerekli" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "Bu kullanıcı zaten var" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);

  const token = jwt.sign(
    { id: result.lastInsertRowid, username, is_admin: 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(201).json({ token, user: { id: result.lastInsertRowid, username } });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username ve password gerekli" });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Geçersiz kimlik bilgileri" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      wallet_address: user.wallet_address,
      try_balance: user.try_balance,
      is_admin: user.is_admin
    }
  });
});

router.get("/me", (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Token gerekli" });

  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    const user = db.prepare("SELECT id, username, wallet_address, try_balance, is_admin, created_at FROM users WHERE id = ?").get(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json(user);
  } catch {
    res.status(401).json({ error: "Geçersiz token" });
  }
});

export default router;
