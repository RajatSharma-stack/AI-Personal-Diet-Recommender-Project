/**
 * Simple Node/Express proxy to keep your API key secret.
 * Uses Groq's OpenAI-compatible Chat Completions endpoint.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken'
import { db } from './component/db.js';


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

// ===== AUTH MIDDLEWARE =====
function authRequired(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ===== LOGGER =====
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ===== AUTH ROUTES =====
app.post('/auth/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'email & password required' });

  const hash = bcrypt.hashSync(password, 10);
  const sql = `INSERT INTO users (email, password_hash) VALUES (?, ?)`;

  db.run(sql, [email.toLowerCase(), hash], function (err) {
    if (err) {
      if (String(err).includes('UNIQUE'))
        return res.status(409).json({ error: 'email already registered' });
      return res.status(500).json({ error: 'db error' });
    }

    const token = jwt.sign(
      { id: this.lastID, email: email.toLowerCase() },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token });
  });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'email & password required' });

  db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()], (err, row) => {
    if (err) return res.status(500).json({ error: 'db error' });
    if (!row) return res.status(401).json({ error: 'invalid credentials' });

    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = jwt.sign({ id: row.id, email: row.email }, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token });
  });
});

// ===== MEAL PLAN =====
app.post('/api/mealplan', authRequired, async (req, res) => {
  try {
    const { userPrompt, systemPrompt, targetCalories } = req.body;
    if (!GROQ_API_KEY)
      return res.status(500).json({ error: 'Missing GROQ_API_KEY in .env' });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: userPrompt || '' },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log('Groq status:', response.status);
      console.log('Groq error body:', errText);
      return res.status(response.status).json({ error: errText });
    }

    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content || '';

    // save history
    db.run(
      `INSERT INTO history (user_id, prompt, result, target_calories) VALUES (?, ?, ?, ?)`,
      [req.user.id, userPrompt, text, targetCalories ? Math.round(targetCalories) : null],
      (err) => {
        if (err) console.log('history save error', err);
      }
    );

    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== HISTORY =====
app.get('/api/history', authRequired, (req, res) => {
  db.all(
    `SELECT id, prompt, result, target_calories, datetime(created_at,'localtime') as created_at
     FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'db error' });
      res.json({ items: rows });
    }
  );
});

// ===== HEALTH =====
app.get('/health', (_req, res) => res.json({ ok: true }));

// ===== STATIC FRONTEND =====
app.use(express.static('.'));

// ===== SERVER START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
