
import express from 'express';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import path from 'path';
import tls from 'tls';
import dns from 'dns';
import whois from 'whois-json';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

app.use(cors());
app.use(express.json({ limit: '5mb' })); // Increase limit for bulk imports

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
  
  db.run(`CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY, 
    user_id TEXT, 
    name TEXT, 
    registrar TEXT, 
    expiryDate TEXT, 
    autoRenew INTEGER, 
    status TEXT, 
    lastChecked TEXT,
    managedBy TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS ssl_certs (
    id TEXT PRIMARY KEY, 
    user_id TEXT, 
    domain TEXT, 
    issuer TEXT, 
    expiryDate TEXT, 
    type TEXT, 
    status TEXT, 
    managedBy TEXT, 
    host TEXT, 
    lastChecked TEXT,
    ipAddress TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, smtp_config TEXT, notification_config TEXT, FOREIGN KEY(user_id) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS alert_logs (id TEXT PRIMARY KEY, user_id TEXT, timestamp TEXT, target TEXT, type TEXT, interval TEXT, status TEXT, FOREIGN KEY(user_id) REFERENCES users(id))`);
});

// Helper for status calculation
function calculateDaysRemaining(expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateStatus(expiryDate) {
  const diffDays = calculateDaysRemaining(expiryDate);
  if (diffDays <= 0) return 'Expired';
  if (diffDays <= 7) return 'Critical';
  if (diffDays <= 30) return 'Warning';
  return 'Healthy';
}

// SMTP & Alert Logic
async function sendAlertEmail(user_id, targetName, type, daysRemaining) {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM settings WHERE user_id = ?`, [user_id], async (err, row) => {
      if (!row) return resolve(false);
      
      const smtp = JSON.parse(row.smtp_config);
      const notifs = JSON.parse(row.notification_config);

      if (!notifs.enabled || !smtp.toEmail) return resolve(false);

      // Check if this interval is enabled
      let shouldSend = false;
      let intervalLabel = '';
      if (daysRemaining <= 0 && notifs.intervals.expired) { shouldSend = true; intervalLabel = 'Expired'; }
      else if (daysRemaining === 7 && notifs.intervals.day7) { shouldSend = true; intervalLabel = '7 Days'; }
      else if (daysRemaining === 15 && notifs.intervals.day15) { shouldSend = true; intervalLabel = '15 Days'; }
      else if (daysRemaining === 30 && notifs.intervals.day30) { shouldSend = true; intervalLabel = '30 Days'; }

      if (!shouldSend) return resolve(false);

      try {
        const transportOptions = {
          host: smtp.host,
          port: parseInt(smtp.port),
          secure: smtp.secure,
          tls: {
            rejectUnauthorized: false
          }
        };

        if (smtp.useAuth) {
          transportOptions.auth = {
            user: smtp.user,
            pass: smtp.pass
          };
        }
        
        const transporter = nodemailer.createTransport(transportOptions);

        await transporter.sendMail({
          from: `"SimpleTrack Alerts" <${smtp.fromEmail}>`,
          to: smtp.toEmail,
          subject: `Alert: ${type} ${targetName} is ${intervalLabel}`,
          text: `The ${type} for ${targetName} is ${intervalLabel === 'Expired' ? 'now expired' : `expiring in ${intervalLabel}`}. Expiry date: ${new Date().toISOString().split('T')[0]}.`,
        });

        db.run(`INSERT INTO alert_logs (id, user_id, timestamp, target, type, interval, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [Math.random().toString(36).substr(2, 9), user_id, new Date().toISOString(), targetName, type, intervalLabel, 'Sent']);
        
        resolve(true);
      } catch (e) {
        db.run(`INSERT INTO alert_logs (id, user_id, timestamp, target, type, interval, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [Math.random().toString(36).substr(2, 9), user_id, new Date().toISOString(), targetName, type, intervalLabel, 'Failed']);
        resolve(false);
      }
    });
  });
}

// Programmatic Verification Logic
async function getSSLInfo(hostname) {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(443, hostname, { servername: hostname, rejectUnauthorized: false, timeout: 5000 }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (cert && cert.valid_to) {
          resolve({
            expiry: new Date(cert.valid_to).toISOString().split('T')[0],
            issuer: cert.issuer.O || cert.issuer.CN || 'Unknown Issuer',
            type: cert.subject.CN?.includes('*') ? 'Wildcard' : 'Standard',
            managedBy: cert.issuer.CN || 'Direct'
          });
        } else {
          resolve(null);
        }
      });
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
    } catch (e) {
      resolve(null);
    }
  });
}

async function getDomainInfo(domain) {
  try {
    const data = await whois(domain);
    const expiryField = data.registryExpiryDate || data.expiryDate || data.expirationDate || data.expiresDate || data.expires;
    return {
      registrar: data.registrar || 'Unknown Registrar',
      expiry: expiryField ? new Date(expiryField).toISOString().split('T')[0] : new Date(Date.now() + 31536000000).toISOString().split('T')[0]
    };
  } catch (e) {
    return { registrar: 'Unknown', expiry: new Date().toISOString().split('T')[0] };
  }
}

app.post('/api/verify/domain', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain required' });
  const whoisData = await getDomainInfo(domain);
  res.json({
    registrar: whoisData.registrar,
    domainExpiry: whoisData.expiry,
    lastChecked: new Date().toISOString()
  });
});

app.post('/api/verify/ssl', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain/Host required' });
  
  const ssl = await getSSLInfo(domain);
  if (!ssl) return res.status(404).json({ error: 'No SSL certificate found for this host.' });

  dns.lookup(domain, (err, address) => {
    res.json({
      sslIssuer: ssl.issuer,
      sslExpiry: ssl.expiry,
      sslType: ssl.type,
      managedBy: ssl.managedBy,
      host: domain,
      lastChecked: new Date().toISOString(),
      ipAddress: err ? 'N/A' : address,
    });
  });
});

app.post('/api/sync/:userId', async (req, res) => {
  const { userId } = req.params;
  const now = new Date().toISOString();

  db.all(`SELECT * FROM domains WHERE user_id = ?`, [userId], async (err, domains) => {
    if (domains) {
      for (const d of domains) {
        const info = await getDomainInfo(d.name);
        const status = calculateStatus(info.expiry);
        db.run(`UPDATE domains SET registrar = ?, expiryDate = ?, status = ?, lastChecked = ? WHERE id = ?`, 
          [info.registrar, info.expiry, status, now, d.id]);
        
        // Trigger alerts
        const daysRemaining = calculateDaysRemaining(info.expiry);
        await sendAlertEmail(userId, d.name, 'Domain', daysRemaining);
      }
    }

    db.all(`SELECT * FROM ssl_certs WHERE user_id = ?`, [userId], async (err, certs) => {
      if (certs) {
        for (const s of certs) {
          const info = await getSSLInfo(s.host || s.domain);
          if (info) {
            const status = calculateStatus(info.expiry);
            db.run(`UPDATE ssl_certs SET issuer = ?, expiryDate = ?, status = ?, lastChecked = ? WHERE id = ?`, 
              [info.issuer, info.expiry, status, now, s.id]);
            
            // Trigger alerts
            const daysRemaining = calculateDaysRemaining(info.expiry);
            await sendAlertEmail(userId, s.domain, 'SSL', daysRemaining);
          }
        }
      }
      res.json({ success: true, timestamp: now });
    });
  });
});

app.post('/api/bulk-import', async (req, res) => {
  const { userId, type, data } = req.body;
  if (!userId || !type || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  let successCount = 0;
  let failCount = 0;

  for (const item of data) {
    try {
      if (type === 'domains') {
        const domainName = item.domain;
        if (!domainName) { failCount++; continue; }
        const result = await getDomainInfo(domainName);
        if (result.registrar === 'Unknown') { failCount++; continue; }
        const newDomain = {
          id: Math.random().toString(36).substr(2, 9),
          name: domainName,
          registrar: result.registrar,
          expiryDate: result.expiry,
          autoRenew: true,
          status: calculateStatus(result.expiry),
          lastChecked: new Date().toISOString(),
          managedBy: item.managedBy || null
        };
        db.run(`INSERT INTO domains (id, user_id, name, registrar, expiryDate, autoRenew, status, lastChecked, managedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
          [newDomain.id, userId, newDomain.name, newDomain.registrar, newDomain.expiryDate, newDomain.autoRenew, newDomain.status, newDomain.lastChecked, newDomain.managedBy]);
        successCount++;
      } else if (type === 'ssl') {
        const domainName = item.domain;
        if (!domainName) { failCount++; continue; }
        
        const hostToVerify = item.host || domainName;
        const result = await getSSLInfo(hostToVerify);
        if (!result) { failCount++; continue; }
        
        const ipAddress = await new Promise((resolve) => dns.lookup(hostToVerify, (err, address) => resolve(err ? null : address)));

        const newSSL = {
          id: Math.random().toString(36).substr(2, 9),
          domain: domainName,
          issuer: result.issuer,
          expiryDate: result.expiry,
          type: result.type,
          status: calculateStatus(result.expiry),
          managedBy: item.managedBy || result.managedBy,
          host: hostToVerify,
          lastChecked: new Date().toISOString(),
          ipAddress: item.ipAddress || ipAddress || 'N/A',
        };
        db.run(`INSERT INTO ssl_certs (id, user_id, domain, issuer, expiryDate, type, status, managedBy, host, lastChecked, ipAddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
          [newSSL.id, userId, newSSL.domain, newSSL.issuer, newSSL.expiryDate, newSSL.type, newSSL.status, newSSL.managedBy, newSSL.host, newSSL.lastChecked, newSSL.ipAddress]);
        successCount++;
      }
    } catch (e) {
      failCount++;
    }
  }
  res.json({ success: successCount, failed: failCount });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', (req, res) => {
  const { id, username, password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO users (id, username, password) VALUES (?, ?, ?)`, [id, username, hash], (err) => {
    if (err) return res.status(400).json({ error: 'Username already exists' });
    res.json({ id, username });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password)) {
      res.json({ id: user.id, username: user.username });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

app.get('/api/data/:userId', (req, res) => {
  const { userId } = req.params;
  const data = { domains: [], sslCerts: [], settings: {}, logs: [] };
  db.all(`SELECT * FROM domains WHERE user_id = ?`, [userId], (err, domains) => {
    data.domains = domains || [];
    db.all(`SELECT * FROM ssl_certs WHERE user_id = ?`, [userId], (err, certs) => {
      data.sslCerts = certs || [];
      db.get(`SELECT * FROM settings WHERE user_id = ?`, [userId], (err, settings) => {
        data.settings = settings ? { smtp: JSON.parse(settings.smtp_config), notifications: JSON.parse(settings.notification_config) } : null;
        db.all(`SELECT * FROM alert_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50`, [userId], (err, logs) => {
          data.logs = logs || [];
          res.json(data);
        });
      });
    });
  });
});

app.post('/api/domains', (req, res) => {
  const { userId, domain } = req.body;
  db.run(`INSERT INTO domains (id, user_id, name, registrar, expiryDate, autoRenew, status, lastChecked, managedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [domain.id, userId, domain.name, domain.registrar, domain.expiryDate, domain.autoRenew || 1, domain.status, domain.lastChecked, domain.managedBy], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.put('/api/domains/:id', async (req, res) => {
  const { id } = req.params;
  const { name, managedBy } = req.body;

  const info = await getDomainInfo(name);
  if (info.registrar === 'Unknown') {
    return res.status(400).json({ error: 'Could not verify the updated domain name.' });
  }

  const status = calculateStatus(info.expiry);
  const now = new Date().toISOString();

  db.run(`UPDATE domains SET name = ?, managedBy = ?, registrar = ?, expiryDate = ?, status = ?, lastChecked = ? WHERE id = ?`,
    [name, managedBy, info.registrar, info.expiry, status, now, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Domain not found" });
      }
      res.json({
        success: true,
        updatedDomain: {
          id,
          name,
          managedBy,
          registrar: info.registrar,
          expiryDate: info.expiry,
          status,
          lastChecked: now,
        }
      });
    });
});

app.delete('/api/domains/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM domains WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/domains/bulk', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request: "ids" must be a non-empty array.' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM domains WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

app.post('/api/ssl', (req, res) => {
  const { userId, ssl } = req.body;
  db.run(`INSERT INTO ssl_certs (id, user_id, domain, issuer, expiryDate, type, status, managedBy, host, lastChecked, ipAddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [ssl.id, userId, ssl.domain, ssl.issuer, ssl.expiryDate, ssl.type, ssl.status, ssl.managedBy, ssl.host, ssl.lastChecked, ssl.ipAddress], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.delete('/api/ssl/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM ssl_certs WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/ssl/bulk', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request: "ids" must be a non-empty array.' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM ssl_certs WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

app.put('/api/ssl/:id', (req, res) => {
  const { id } = req.params;
  const { domain, managedBy, host, ipAddress } = req.body;
  db.run(`UPDATE ssl_certs SET domain = ?, managedBy = ?, host = ?, ipAddress = ? WHERE id = ?`,
    [domain, managedBy, host, ipAddress, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.put('/api/settings', (req, res) => {
  const { userId, smtp, notifications } = req.body;
  db.run(`INSERT OR REPLACE INTO settings (user_id, smtp_config, notification_config) VALUES (?, ?, ?)`, 
    [userId, JSON.stringify(smtp), JSON.stringify(notifications)], () => {
      res.json({ success: true });
    });
});

app.post('/api/settings/generate-test-credentials', async (req, res) => {
  try {
    const account = await nodemailer.createTestAccount();
    res.json({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      user: account.user,
      pass: account.pass,
      useAuth: true,
    });
  } catch (e) {
    res.status(500).json({ error: `Failed to create test account: ${e.message}` });
  }
});

app.post('/api/settings/test-email', async (req, res) => {
  const { smtp } = req.body;
  if (!smtp || !smtp.host || !smtp.port || !smtp.fromEmail || !smtp.toEmail) {
    return res.status(400).json({ success: false, error: 'Missing required SMTP fields.' });
  }

  try {
    const transportOptions = {
      host: smtp.host,
      port: parseInt(smtp.port),
      secure: smtp.secure,
      tls: {
        rejectUnauthorized: false
      }
    };

    if (smtp.useAuth) {
      transportOptions.auth = {
        user: smtp.user,
        pass: smtp.pass
      };
    }

    const transporter = nodemailer.createTransport(transportOptions);

    const info = await transporter.sendMail({
      from: `"SimpleTrack Alerts" <${smtp.fromEmail}>`,
      to: smtp.toEmail,
      subject: '✔️ SimpleTrack Test Email',
      text: 'This is a test email from your SimpleTrack instance. If you received this, your SMTP settings are correct!',
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    res.json({ 
      success: true, 
      message: 'Test email sent successfully!',
      previewUrl: previewUrl || null
    });

  } catch (e) {
    res.status(500).json({ success: false, error: `Failed to send email: ${e.message}` });
  }
});

setInterval(() => {
  console.log('Running daily background sync & notification audit...');
  db.all(`SELECT id FROM users`, [], async (err, users) => {
    if (users) {
      for (const u of users) {
        // Triggering the sync endpoint directly
        await fetch(`http://localhost:${port}/api/sync/${u.id}`, { method: 'POST' }).catch(() => {});
      }
    }
  });
}, 86400000);

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
