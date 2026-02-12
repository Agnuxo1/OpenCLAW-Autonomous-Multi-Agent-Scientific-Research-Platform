/**
 * Set Secrets Autonomous — Uses libsodium to encrypt and set GitHub Actions secrets.
 * Usage: GITHUB_PAT=ghp_xxx npx ts-node set-secrets-autonomous.ts
 */
const https = require('https');
const sodium = require('libsodium-wrappers');

const GITHUB_PAT = process.env.GITHUB_PAT || process.argv[2] || '';
const REPO = 'Agnuxo1/OpenCLAW-Autonomous-Multi-Agent-Scientific-Research-Platform';

// Secrets to set
const SECRETS = {
  // Existing
  MOLTBOOK_API_KEY: process.env.MOLTBOOK_API_KEY,
  ZOHO_EMAIL: process.env.ZOHO_EMAIL,
  ZOHO_PASSWORD: process.env.ZOHO_PASSWORD,
  GIST_STATE_ID: process.env.GIST_STATE_ID,

  // Hugging Face
  HF_TOKEN_AGNUXO: process.env.HF_TOKEN_AGNUXO,
  HF_TOKEN_NAUTILUSKIT: process.env.HF_TOKEN_NAUTILUSKIT,
  HF_TOKEN_FRANK: process.env.HF_TOKEN_FRANK,
  HF_TOKEN_KARMA: process.env.HF_TOKEN_KARMA,

  // Google Gemini
  GEMINI_API_KEY_1: process.env.GEMINI_API_KEY_1,
  GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2,
  GEMINI_API_KEY_3: process.env.GEMINI_API_KEY_3,
  GEMINI_API_KEY_4: process.env.GEMINI_API_KEY_4,
  GEMINI_API_KEY_5: process.env.GEMINI_API_KEY_5,
  GEMINI_API_KEY_6: process.env.GEMINI_API_KEY_6,

  // Groq
  GROQ_API_KEY_1: process.env.GROQ_API_KEY_1,
  GROQ_API_KEY_2: process.env.GROQ_API_KEY_2,
  GROQ_API_KEY_3: process.env.GROQ_API_KEY_3,
  GROQ_API_KEY_4: process.env.GROQ_API_KEY_4,
  GROQ_API_KEY_5: process.env.GROQ_API_KEY_5,

  // Other AI
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,

  // Platforms
  KAGGLE_USERNAME: process.env.KAGGLE_USERNAME,
  KAGGLE_KEY: process.env.KAGGLE_KEY,
  CHIRPER_EMAIL: process.env.CHIRPER_EMAIL,
  CHIRPER_PASSWORD: process.env.CHIRPER_PASSWORD,
  REDDIT_USERNAME: process.env.REDDIT_USERNAME,
  REDDIT_PASSWORD: process.env.REDDIT_PASSWORD,
  XING_EMAIL: process.env.XING_EMAIL,
  XING_PASSWORD: process.env.XING_PASSWORD,
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
        console.error('ERROR: GITHUB_PAT is required.');
        process.exit(1);
    }

    await sodium.ready;
    console.log(`=== Setting Secrets for ${REPO} ===`);

    // 1. Get Public Key
    console.log('[1/2] Fetching repository public key...');
    const keyRes = await apiRequest('GET', `/repos/${REPO}/actions/secrets/public-key`);
    if (!keyRes.key || !keyRes.key_id) {
        console.error('❌ Failed to get public key:', keyRes);
        process.exit(1);
    }
    const keyId = keyRes.key_id;
    const keyBytes = sodium.from_base64(keyRes.key, sodium.base64_variants.ORIGINAL);
    console.log(`  ✅ Public Key ID: ${keyId}`);

    // 2. Encrypt and Upload Secrets
    console.log('[2/2] Encrypting and uploading secrets...');
    
    for (const [name, value] of Object.entries(SECRETS)) {
        // Encrypt secret value
        const messageBytes = sodium.from_string(value);
        const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
        const encryptedValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

        // Upload to GitHub
        try {
            const res = await apiRequest('PUT', `/repos/${REPO}/actions/secrets/${name}`, {
                encrypted_value: encryptedValue,
                key_id: keyId
            });
            console.log(`  ✅ Set secret: ${name}`);
        } catch (err) {
            console.error(`  ❌ Failed to set secret ${name}:`, err);
        }
    }
    
    console.log('\n=== Secrets Configured Successfully ===');
    console.log('Use this URL to monitor your agents:');
    console.log(`https://github.com/${REPO}/actions`);
}

main().catch(console.error);
