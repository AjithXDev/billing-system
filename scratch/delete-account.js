/**
 * ONE-TIME SCRIPT: Delete account mhdsafiq2430@gmail.com
 * and all associated shop data from Supabase.
 * 
 * Usage: node scratch/delete-account.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TARGET_EMAIL = 'mhdsafiq2430@gmail.com';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function deleteAccount() {
  console.log(`\n🔍 Searching for account: ${TARGET_EMAIL}\n`);

  // 1. Find shops owned by this email
  const { data: shops, error: shopErr } = await supabase
    .from('shops')
    .select('id, name, owner_name, owner_email, mobile_number')
    .eq('owner_email', TARGET_EMAIL);

  if (shopErr) {
    console.error('❌ Error finding shops:', shopErr.message);
    return;
  }

  // 2. Also check paired_devices for this email
  const { data: devices } = await supabase
    .from('paired_devices')
    .select('shop_id, user_email, device_name')
    .eq('user_email', TARGET_EMAIL);

  // Collect all shop IDs to delete
  const shopIds = new Set();
  if (shops) shops.forEach(s => shopIds.add(s.id));
  if (devices) devices.forEach(d => shopIds.add(d.shop_id));

  if (shopIds.size === 0) {
    console.log('⚠️  No shops found for this email.');
    console.log('   The account may have already been deleted, or the email');
    console.log('   was never linked to a shop via owner_email or paired_devices.');
    return;
  }

  console.log(`📋 Found ${shopIds.size} shop(s) to delete:\n`);
  
  for (const id of shopIds) {
    const shop = shops?.find(s => s.id === id);
    console.log(`  🏪 Shop ID: ${id}`);
    if (shop) {
      console.log(`     Name: ${shop.name}`);
      console.log(`     Owner: ${shop.owner_name}`);
      console.log(`     Email: ${shop.owner_email}`);
      console.log(`     Mobile: ${shop.mobile_number}`);
    }
    console.log('');
  }

  // 3. Delete each shop (CASCADE handles all related data)
  for (const id of shopIds) {
    console.log(`🗑️  Deleting shop ${id}...`);
    
    // Delete shop_stats
    const { error: e1 } = await supabase.from('shop_stats').delete().eq('shop_id', id);
    if (e1) console.log(`   ⚠️  shop_stats: ${e1.message}`);
    else console.log('   ✅ shop_stats deleted');

    // Delete notifications
    const { error: e2 } = await supabase.from('notifications').delete().eq('shop_id', id);
    if (e2) console.log(`   ⚠️  notifications: ${e2.message}`);
    else console.log('   ✅ notifications deleted');

    // Delete products
    const { error: e3 } = await supabase.from('products').delete().eq('shop_id', id);
    if (e3) console.log(`   ⚠️  products: ${e3.message}`);
    else console.log('   ✅ products deleted');

    // Delete invoices
    const { error: e4 } = await supabase.from('invoices').delete().eq('shop_id', id);
    if (e4) console.log(`   ⚠️  invoices: ${e4.message}`);
    else console.log('   ✅ invoices deleted');

    // Delete paired_devices
    const { error: e5 } = await supabase.from('paired_devices').delete().eq('shop_id', id);
    if (e5) console.log(`   ⚠️  paired_devices: ${e5.message}`);
    else console.log('   ✅ paired_devices deleted');

    // Delete pairing_codes
    const { error: e6 } = await supabase.from('pairing_codes').delete().eq('shop_id', id);
    if (e6) console.log(`   ⚠️  pairing_codes: ${e6.message}`);
    else console.log('   ✅ pairing_codes deleted');

    // Delete the shop itself
    const { error: e7 } = await supabase.from('shops').delete().eq('id', id);
    if (e7) console.log(`   ⚠️  shops: ${e7.message}`);
    else console.log('   ✅ shop deleted');

    console.log('');
  }

  // 4. Try to delete from Supabase Auth (needs service_role key)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    try {
      const adminSb = createClient(SUPABASE_URL, serviceKey);
      const { data: { users } } = await adminSb.auth.admin.listUsers();
      const authUser = users.find(u => u.email === TARGET_EMAIL);
      if (authUser) {
        await adminSb.auth.admin.deleteUser(authUser.id);
        console.log(`✅ Supabase Auth user ${TARGET_EMAIL} deleted`);
      } else {
        console.log(`ℹ️  No Supabase Auth user found for ${TARGET_EMAIL}`);
      }
    } catch(e) {
      console.log(`⚠️  Could not delete auth user: ${e.message}`);
    }
  } else {
    console.log('═══════════════════════════════════════════════');
    console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY not found in .env');
    console.log('   To fully delete the auth account, either:');
    console.log('   1. Add SUPABASE_SERVICE_ROLE_KEY to your .env file and re-run');
    console.log('   2. Delete manually from Supabase Dashboard → Authentication → Users');
    console.log('═══════════════════════════════════════════════');
  }

  console.log('\n🏁 Cleanup complete!\n');
}

deleteAccount().catch(console.error);
