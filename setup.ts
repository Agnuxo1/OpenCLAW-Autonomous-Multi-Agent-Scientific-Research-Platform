/**
 * Setup Script — Creates GitHub Gist for state and sets repository secrets.
 * Usage: GITHUB_PAT=ghp_xxx npx ts-node setup.ts
 * 
 * The GITHUB_PAT needs scopes: gist, repo, workflow
 */
const https = require('https');

const GITHUB_PAT = process.env.GITHUB_PAT || process.argv[2] || '';
const REPO = 'Agnuxo1/OpenCLAW-Autonomous-Multi-Agent-Scientific-Research-Platform';

const SECRETS_TO_SET: Record<string, string> = {
  MOLTBOOK_API_KEY: process.env.MOLTBOOK_API_KEY || 'moltbook_sk_uMJvGTGJdBA5fU31_XtkOAfKcJ-721ds',
  ZOHO_EMAIL: process.env.ZOHO_EMAIL || '1.5bit@zohomail.eu',
  ZOHO_PASSWORD: process.env.ZOHO_PASSWORD || 'rcPd3UHykckY6gE',
};

function apiRequest(method: string, path: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'OpenCLAW-Setup',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res: any) => {
      let body = '';
      res.on('data', (chunk: string) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  if (!GITHUB_PAT) {
    console.error('ERROR: Set GITHUB_PAT environment variable or pass as argument.');
    console.error('Usage: GITHUB_PAT=ghp_xxx npx ts-node setup.ts');
    process.exit(1);
  }

  console.log('=== OpenCLAW Platform Setup ===');

  // 1. Create private Gist
  console.log('\n[1/3] Creating private Gist for agent state...');
  const gistRes = await apiRequest('POST', '/gists', {
    description: 'OpenCLAW Agent State (Private)',
    public: false,
    files: { 'agent_state.json': { content: JSON.stringify({
      lastRun: '', totalPosts: 0, totalEmails: 0, totalCollaboratorsFound: 0,
      recentPosts: [], recentEmails: [], strategyMemos: [], collaboratorCandidates: [],
    }) } },
  });

  if (gistRes.id) {
    console.log(`  ✅ Gist created: ${gistRes.id}`);
    console.log(`  URL: ${gistRes.html_url}`);
    SECRETS_TO_SET['GIST_STATE_ID'] = gistRes.id;
  } else {
    console.error('  ❌ Failed to create Gist:', gistRes);
  }

  // 2. Note about secrets
  console.log('\n[2/3] GitHub Repository Secrets');
  console.log('  GitHub Secrets require libsodium encryption.');
  console.log('  Please set these secrets manually at:');
  console.log(`  👉 https://github.com/${REPO}/settings/secrets/actions`);
  console.log('');
  for (const [key, val] of Object.entries(SECRETS_TO_SET)) {
    console.log(`  ${key} = ${val}`);
  }

  // 3. Trigger workflow
  console.log('\n[3/3] Triggering first Research Cycle...');
  try {
    const triggerRes = await apiRequest('POST', `/repos/${REPO}/actions/workflows/research-cycle.yml/dispatches`, { ref: 'main' });
    if (!triggerRes || triggerRes === '') {
      console.log('  ✅ Workflow triggered!');
    } else {
      console.log('  Result:', triggerRes);
    }
  } catch (err) {
    console.log('  ⚠️ Could not trigger workflow. It will run on next cron schedule.');
  }

  console.log('\n=== Setup Complete ===');
  console.log('Your agent will run autonomously 24/7:');
  console.log('  Research Agent: Every 4 hours');
  console.log('  Social Agent:   Every 6 hours');
  console.log('  Strategy Agent: Every 12 hours');
  console.log(`\nMonitor: https://github.com/${REPO}/actions`);
}

main().catch(console.error);
