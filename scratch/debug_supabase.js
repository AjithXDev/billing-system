const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    console.log("Checking Supabase connection...");
    console.log("URL:", process.env.SUPABASE_URL);
    try {
        const { data, error } = await supabase.from('software_licenses').select('*').limit(5);
        if (error) {
            console.error("Error fetching licenses:", error);
        } else {
            console.log("Found licenses:", data.length);
            console.log(data);
        }
    } catch (e) {
        console.error("Unexpected error:", e);
    }
}

check();
