import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  getPrice,
  getTokenBalance,
  sendTokensToUser,
  verifyTransferToAdmin,
  calculateTryAmount,
  getAdminAddress
} from "../services/blockchain.js";
import { ethers } from "ethers";

const router = Router();

router.get("/price", async (req, res) => {
  try {
    const price = await getPrice();
    res.json(price);
  } catch (err) {
    res.status(500).json({ error: "Fiyat alınamadı" });
  }
});

router.get("/balance", authMiddleware, async (req, res) => {
  try {
    const user = db.prepare("SELECT wallet_address, try_balance FROM users WHERE id = ?").get(req.user.id);
    if (!user || !user.wallet_address) {
      return res.status(400).json({ error: "Cüzdan bağlı değil" });
    }

    const tokenBalance = await getTokenBalance(user.wallet_address);

    res.json({
      try_balance: user.try_balance,
      token_balance: tokenBalance
    });
  } catch (err) {
    res.status(500).json({ error: "Bakiye alınamadı" });
  }
});

router.post("/buy", authMiddleware, async (req, res) => {
  const { tokenAmount } = req.body;
  if (!tokenAmount || Number(tokenAmount) <= 0) {
    return res.status(400).json({ error: "Geçerli bir tokenAmount gerekli" });
  }

  const user = db.prepare("SELECT wallet_address, try_balance FROM users WHERE id = ?").get(req.user.id);
  if (!user || !user.wallet_address) {
    return res.status(400).json({ error: "Cüzdan bağlı değil" });
  }

  try {
    const price = await getPrice();
    const tryNeeded = Number(tokenAmount) * price.formatted;

    if (user.try_balance < tryNeeded) {
      return res.status(400).json({ error: "Yetersiz TRY bakiyesi", needed: tryNeeded, current: user.try_balance });
    }

    const txId = db.prepare(
      "INSERT INTO transactions (user_id, type, token_amount, try_amount, price, status) VALUES (?, 'buy', ?, ?, ?, 'pending')"
    ).run(req.user.id, tokenAmount, tryNeeded, price.raw).lastInsertRowid;

    const result = await sendTokensToUser(user.wallet_address, tokenAmount);

    db.prepare("UPDATE users SET try_balance = try_balance - ? WHERE id = ?").run(tryNeeded, req.user.id);
    db.prepare("UPDATE transactions SET tx_hash = ?, status = 'completed' WHERE id = ?").run(result.txHash, txId);

    const updatedUser = db.prepare("SELECT try_balance FROM users WHERE id = ?").get(req.user.id);

    res.json({
      message: "Token alımı başarılı",
      tx_hash: result.txHash,
      token_amount: tokenAmount,
      try_spent: tryNeeded,
      try_balance: updatedUser.try_balance
    });
  } catch (err) {
    db.prepare("UPDATE transactions SET status = 'failed' WHERE user_id = ? AND status = 'pending'").run(req.user.id);
    res.status(500).json({ error: "Token alım hatası" });
  }
});

router.post("/sell", authMiddleware, async (req, res) => {
  const { txHash } = req.body;
  if (!txHash) {
    return res.status(400).json({ error: "txHash gerekli" });
  }

  const user = db.prepare("SELECT wallet_address, try_balance FROM users WHERE id = ?").get(req.user.id);
  if (!user || !user.wallet_address) {
    return res.status(400).json({ error: "Cüzdan bağlı değil" });
  }

  const existingTx = db.prepare("SELECT id FROM transactions WHERE tx_hash = ?").get(txHash);
  if (existingTx) {
    return res.status(409).json({ error: "Bu işlem zaten kaydedilmiş" });
  }

  try {
    const transfer = await verifyTransferToAdmin(txHash);
    if (!transfer) {
      return res.status(400).json({ error: "Geçerli bir transfer bulunamadı" });
    }

    if (transfer.from.toLowerCase() !== user.wallet_address.toLowerCase()) {
      return res.status(403).json({ error: "Bu transfer size ait değil" });
    }

    const tryAmount = await calculateTryAmount(transfer.amount);
    const decimals = Number(process.env.TOKEN_DECIMALS);
    const tokenAmount = ethers.formatUnits(transfer.amount, decimals);
    const price = await getPrice();

    db.prepare(
      "INSERT INTO transactions (user_id, type, token_amount, try_amount, price, tx_hash, status) VALUES (?, 'sell', ?, ?, ?, ?, 'completed')"
    ).run(req.user.id, tokenAmount, tryAmount, price.raw, txHash);

    db.prepare("UPDATE users SET try_balance = try_balance + ? WHERE id = ?").run(tryAmount, req.user.id);

    const updatedUser = db.prepare("SELECT try_balance FROM users WHERE id = ?").get(req.user.id);

    res.json({
      message: "Token satışı başarılı",
      token_amount: tokenAmount,
      try_earned: tryAmount,
      try_balance: updatedUser.try_balance
    });
  } catch (err) {
    res.status(500).json({ error: "Token satış hatası" });
  }
});

router.get("/history", authMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE user_id = ?").get(req.user.id).count;
  const transactions = db.prepare(
    "SELECT id, type, token_amount, try_amount, price, tx_hash, status, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).all(req.user.id, limit, offset);

  res.json({
    transactions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

router.get("/preview/buy/:amount", async (req, res) => {
  try {
    const tokenAmount = Number(req.params.amount);
    if (!tokenAmount || tokenAmount <= 0) {
      return res.status(400).json({ error: "Geçerli bir miktar gerekli" });
    }
    const price = await getPrice();
    const tryCost = tokenAmount * price.formatted;
    res.json({ token_amount: tokenAmount, try_cost: tryCost, price: price.formatted });
  } catch (err) {
    res.status(500).json({ error: "Hesaplama hatası" });
  }
});

router.get("/preview/sell/:amount", async (req, res) => {
  try {
    const tokenAmount = Number(req.params.amount);
    if (!tokenAmount || tokenAmount <= 0) {
      return res.status(400).json({ error: "Geçerli bir miktar gerekli" });
    }
    const price = await getPrice();
    const tryEarned = tokenAmount * price.formatted;
    res.json({ token_amount: tokenAmount, try_earned: tryEarned, price: price.formatted });
  } catch (err) {
    res.status(500).json({ error: "Hesaplama hatası" });
  }
});

export default router;
