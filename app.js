const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function readJsonBody(req) {
  let body = '';

  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
  }

  try {
    return JSON.parse(body || '{}');
  } catch (error) {
    error.statusCode = 400;
    error.message = 'Request body must be valid JSON.';
    throw error;
  }
}

function clean(value) {
  return String(value || '').trim();
}

function validateBooking(input) {
  const booking = {
    name: clean(input.name),
    phone: clean(input.phone),
    contactMethod: clean(input.contactMethod || 'line'),
    contact: clean(input.contact),
    plate: clean(input.plate),
    car: clean(input.car),
    service: clean(input.service),
    pickup: clean(input.pickup),
    sameDropoff: Boolean(input.sameDropoff),
    dropoff: clean(input.dropoff),
    date: clean(input.date),
    slot: clean(input.slot),
    notes: clean(input.notes)
  };

  const required = ['name', 'phone', 'contact', 'plate', 'car', 'service', 'pickup', 'date', 'slot'];
  const missing = required.filter((field) => !booking[field]);

  if (!booking.sameDropoff && !booking.dropoff) {
    missing.push('dropoff');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)) {
    missing.push('valid date');
  }

  if (booking.contactMethod !== 'line' && booking.contactMethod !== 'email') {
    missing.push('valid contact method');
  }

  if (missing.length) {
    const error = new Error(`Missing required booking fields: ${missing.join(', ')}`);
    error.statusCode = 422;
    throw error;
  }

  return booking;
}

function makeReference(date) {
  const datePart = date.replace(/-/g, '').slice(2);
  const randomPart = crypto.randomInt(1000, 10000);
  return `PP-${datePart}-${randomPart}`;
}

async function saveBooking(booking) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let bookings = [];
  try {
    bookings = JSON.parse(await fs.readFile(BOOKINGS_FILE, 'utf8'));
    if (!Array.isArray(bookings)) bookings = [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const saved = {
    id: crypto.randomUUID(),
    reference: makeReference(booking.date),
    createdAt: new Date().toISOString(),
    ...booking
  };

  bookings.push(saved);
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
  return saved;
}

async function handleBooking(req, res) {
  try {
    const input = await readJsonBody(req);
    const booking = validateBooking(input);
    const saved = await saveBooking(booking);

    sendJson(res, 201, {
      ok: true,
      reference: saved.reference,
      booking: {
        name: saved.name,
        car: saved.car,
        contactMethod: saved.contactMethod,
        contact: saved.contact,
        date: saved.date,
        slot: saved.slot
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.statusCode ? error.message : 'Unable to save booking right now.'
    });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let requestedPath = '/index.html';

  try {
    requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  } catch (error) {
    sendText(res, 400, 'Bad request');
    return;
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  const relativePath = path.relative(PUBLIC_DIR, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    res.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const indexFile = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.html'],
        'Cache-Control': 'no-cache'
      });
      res.end(indexFile);
      return;
    }

    sendText(res, 500, 'Server error');
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/bookings') {
    await handleBooking(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
});

server.listen(PORT, HOST, () => {
  console.log(`Papapick web app listening on http://${HOST}:${PORT}`);
});
