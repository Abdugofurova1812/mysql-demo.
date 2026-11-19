import mysql from 'mysql2/promise';

let pool;
let tableReady;

function getPool() {
  if (!pool) {
    const missing = ['DB_HOST', 'DB_USER', 'DB_PASS'].filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`Muhit o'zgaruvchilari topilmadi: ${missing.join(', ')}`);
    }
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 4000),
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME || 'test',
      // TiDB Cloud Serverless requires TLS
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionLimit: 3,
      connectTimeout: 10000,
      enableKeepAlive: true,
    });
  }
  return pool;
}

// Create the notes table on first use so a fresh TiDB database works out of the box
function ensureTable(db) {
  if (!tableReady) {
    tableReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS notes (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      )
      .catch((err) => {
        tableReady = undefined;
        throw err;
      });
  }
  return tableReady;
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/api/notes') {
    return Response.json({ error: 'Topilmadi' }, { status: 404 });
  }

  try {
    const db = getPool();
    await ensureTable(db);

    if (req.method === 'GET') {
      const [rows] = await db.query(
        'SELECT id, name, created_at FROM notes ORDER BY id DESC LIMIT 100'
      );
      return Response.json(rows);
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const name = String(body.name || '').trim().slice(0, 100);
      if (!name) {
        return Response.json({ error: 'Ism kiritilmadi' }, { status: 400 });
      }
      const [result] = await db.execute('INSERT INTO notes (name) VALUES (?)', [name]);
      return Response.json({ ok: true, id: result.insertId }, { status: 201 });
    }

    return Response.json({ error: 'Ruxsat etilmagan metod' }, { status: 405 });
  } catch (err) {
    console.error('DB error:', err);
    return Response.json({ error: err.message || 'Server xatosi' }, { status: 500 });
  }
};

// Serve this function directly at /api/* (replaces the netlify.toml redirect)
export const config = {
  path: '/api/*',
};
