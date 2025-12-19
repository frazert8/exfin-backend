const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
// Check for PORT in environment, otherwise default to 3000
const port = process.env.PORT || 3000;

// Base URLs
const SERVER_URL = process.env.SERVER_URL || 'https://exfin-backend.onrender.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://exfin-frontend.vercel.app';

// 1. Admin setup
const supabaseUrl = 'https://cuaskddjuqvxwqjjgcuw.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1YXNrZGRqdXF2eHdxampnY3V3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTUzMjEwOCwiZXhwIjoyMDgxMTA4MTA4fQ.3qGIHy4OMrQIC1v_aci4Ju6f1-exRO0szBhsT07FMv0';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configuration for GitHub OAuth
const OAUTH_CONFIG = {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  redirectUri: `${SERVER_URL}/callback`,
  authUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: 'user:email repo'
};

// 2. Trigger the flow
app.get('/auth/connect', (req, res) => {
  const userId = req.query.userId;
  
  if (!userId) return res.status(400).send('Missing userId');

  // We pass userId in "state" so we know who is connecting
  const state = JSON.stringify({ userId });
  
  const authUri = `${OAUTH_CONFIG.authUrl}?client_id=${OAUTH_CONFIG.clientId}&scope=${OAUTH_CONFIG.scopes}&redirect_uri=${OAUTH_CONFIG.redirectUri}&state=${state}`;

  res.redirect(authUri);
});

// 3. The Callback
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) return res.status(400).send('Invalid callback parameters');

  try {
    const stateStr = typeof state === 'string' ? state : String(state);
    const { userId } = JSON.parse(stateStr);

    // A. Exchange code for Access Token
    const tokenResponse = await axios.post(
      OAUTH_CONFIG.tokenUrl,
      {
        client_id: OAUTH_CONFIG.clientId,
        client_secret: OAUTH_CONFIG.clientSecret,
        code: code,
        redirect_uri: OAUTH_CONFIG.redirectUri
      },
      {
        headers: { 'Accept': 'application/json' }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!access_token) {
        console.error('GitHub Response:', tokenResponse.data);
        throw new Error('No access_token returned from GitHub');
    }

    // B. Save tokens to Supabase
    const { error } = await supabase
      .from('integrations')
      .upsert({
        user_id: userId,
        provider: 'github',
        access_token: access_token,
        refresh_token: refresh_token || null,
        token_expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, provider' });

    if (error) throw error;

    // C. Redirect back to frontend
    res.redirect(`${FRONTEND_URL}/dashboard?status=success`);

  } catch (error) {
    console.error('OAuth Error:', error.message);
    res.redirect(`${FRONTEND_URL}/dashboard?status=error`);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});