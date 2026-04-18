const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('better-sqlite3');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 4000;
const JWT_SECRET = 'iva_admin_super_secret_2026';

// ── ADMIN DB SETUP ──
const db = new sqlite3(path.join(__dirname, 'admin.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    otp TEXT,
    otp_expires_at DATETIME
  );
`);

// Check if an admin exists, if not create default
const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
if (adminCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admins (email, password) VALUES (?, ?)').run('admin@iva.com', hash);
  console.log('✅ Default Admin created: admin@iva.com / admin123');
}

// ── SUPABASE CLIENT ──
const getSupabase = () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
        throw new Error("Supabase URL and Key are required in .env");
    }
    return createClient(url, key);
};

// ── AUTH MIDDLEWARE ──
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminId = decoded.adminId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── ROUTES: AUTH ──

// Login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ adminId: admin.id }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forgot Password -> Generate OTP
app.post('/api/admin/forgot-password', (req, res) => {
  const { email } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin) return res.status(400).json({ error: 'Email not found' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 mins
  
  db.prepare('UPDATE admins SET otp = ?, otp_expires_at = ? WHERE email = ?').run(otp, expiresAt, email);
  
  // In a real app, send this via Nodemailer. For now, log it.
  console.log(`\n📧 [EMAIL SIMULATION] Sent to ${email}\n🔐 Your Admin Reset OTP is: ${otp}\n`);
  
  res.json({ success: true, message: 'OTP sent to email (check terminal for now)' });
});

// Reset Password
app.post('/api/admin/reset-password', (req, res) => {
  const { email, otp, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || admin.otp !== otp || new Date() > new Date(admin.otp_expires_at)) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password = ?, otp = NULL, otp_expires_at = NULL WHERE email = ?').run(hash, email);
  res.json({ success: true, message: 'Password reset successfully' });
});

// ── ROUTES: SHOPS ──

app.get('/api/shops', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: shops, error } = await supabase
      .from('shops')
      .select('*, shop_stats(updated_at, stats_json)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(shops);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Shop Status
app.post('/api/shops/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('shops')
      .update({ is_active })
      .eq('id', id);
      
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Payment Status & Renew Validity
app.post('/api/shops/:id/toggle-payment', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_paid } = req.body;
    const supabase = getSupabase();
    
    if (is_paid) {
      // Renew for 30 days
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 86400000);
      const { error } = await supabase
        .from('shops')
        .update({ 
          is_paid: true, 
          is_active: true,
          validity_start: now.toISOString(),
          validity_end: end.toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      res.json({ success: true, validity_end: end.toISOString() });
    } else {
      const { error } = await supabase
        .from('shops')
        .update({ is_paid: false })
        .eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Validity Info for a specific shop
app.get('/api/shops/:id/validity', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('shops')
      .select('is_active, is_paid, validity_start, validity_end')
      .eq('id', id)
      .single();
    if (error) throw error;
    
    const now = new Date();
    const end = data.validity_end ? new Date(data.validity_end) : null;
    const daysLeft = end ? Math.ceil((end - now) / 86400000) : null;
    
    res.json({ 
      ...data, 
      daysLeft: daysLeft !== null ? Math.max(0, daysLeft) : null,
      warningPhase: daysLeft !== null && daysLeft <= 7 && daysLeft > 0,
      expired: daysLeft !== null && daysLeft <= 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE Shop + Owner Account ──
app.delete('/api/shops/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    
    // 1. Get shop details (owner email for auth cleanup)
    const { data: shop, error: fetchErr } = await supabase
      .from('shops')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchErr || !shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const ownerEmail = shop.owner_email;
    
    // 2. Delete shop — CASCADE handles: shop_stats, pairing_codes, paired_devices, invoices, products, notifications
    const { error: delErr } = await supabase
      .from('shops')
      .delete()
      .eq('id', id);
    
    if (delErr) throw delErr;
    
    // 3. Try to delete owner's Supabase Auth account (needs service_role key)
    let authDeleted = false;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && ownerEmail) {
      try {
        const adminSb = createClient(process.env.SUPABASE_URL, serviceKey);
        const { data: { users } } = await adminSb.auth.admin.listUsers();
        const authUser = users.find(u => u.email === ownerEmail);
        if (authUser) {
          await adminSb.auth.admin.deleteUser(authUser.id);
          authDeleted = true;
          console.log(`✅ Auth user ${ownerEmail} deleted`);
        }
      } catch (authErr) {
        console.warn(`⚠️ Could not delete auth user ${ownerEmail}:`, authErr.message);
      }
    }
    
    console.log(`🗑️ Shop ${shop.name} (${id}) deleted completely`);
    res.json({ 
      success: true, 
      message: `Shop "${shop.name}" and all data deleted`,
      authDeleted,
      ownerEmail
    });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get comprehensive analytics across all shops
app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: shops, error } = await supabase.from('shops').select('id, is_active');
    if (error) throw error;
    
    const { data: stats } = await supabase.from('shop_stats').select('stats_json');
    
    let totalRevenue = 0;
    let totalBills = 0;
    
    stats?.forEach(s => {
      if (s.stats_json?.overallSales) totalRevenue += Number(s.stats_json.overallSales);
      if (s.stats_json?.overallBills) totalBills += Number(s.stats_json.overallBills);
    });

    res.json({
      totalShops: shops.length,
      activeShops: shops.filter(s => s.is_active).length,
      totalRevenue,
      totalBills
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Admin Panel Backend running on http://localhost:${PORT}`);
});
