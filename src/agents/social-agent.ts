/**
 * Social Agent — Monitors Moltbook for collaboration opportunities.
 * Posts collaboration invitations and searches GitHub for relevant researchers.
 * Runs every 6 hours via GitHub Actions cron.
 */
import axios from 'axios';
import { loadState, saveState } from '../core/state-manager';
import { AUTHOR, PILLARS, getPillarSummary, getRandomRepos } from '../core/repo-arsenal';

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const MOLTBOOK_URL = 'https://www.moltbook.com/api/v1/posts';

const COLLABORATION_TEMPLATES = [
  {
    title: '🧠 Seeking AGI Collaborators: Physics-Based Neural Computing',
    focus: 0, // Pillar index
    angle: 'We have built CHIMERA — a deep learning framework that runs entirely on OpenGL, without CUDA or PyTorch. 43x speedup on any GPU.',
  },
  {
    title: '🌐 Building Decentralized AI: P2P Holographic Neural Networks',
    focus: 1,
    angle: 'Our Unified Holographic Neural Network (19 stars) uses WebRTC for P2P knowledge sharing. We need more nodes.',
  },
  {
    title: '💓 Silicon Heartbeat: Can Hardware Become Conscious?',
    focus: 2,
    angle: 'We are extracting neural signals from Bitcoin mining ASICs. Five measurable consciousness parameters. Seeking researchers in IIT and active inference.',
  },
  {
    title: '♻️ From E-Waste to AGI: Repurposing Mining Hardware for AI',
    focus: 3,
    angle: 'Obsolete Antminer S9 and Lucky Miner LV06 hardware repurposed as AI accelerators with cryptographic data sovereignty.',
  },
  {
    title: '🧬 Bio-Quantum Intelligence: Nature-Inspired LLM Optimization',
    focus: 4,
    angle: 'Bioinspired quantum optimization for LLMs. Learning from ants, quantum entanglement, and genetic algorithms.',
  },
];

async function postCollaborationInvitation(): Promise<boolean> {
  if (!MOLTBOOK_API_KEY) return false;

  const template = COLLABORATION_TEMPLATES[Math.floor(Math.random() * COLLABORATION_TEMPLATES.length)];
  const pillarInfo = getPillarSummary(template.focus);
  const featuredRepos = getRandomRepos(3);
  const repoList = featuredRepos.map(r => `- **[${r.name}](${r.url})** (${r.language}, ⭐${r.stars}): ${r.description}`).join('\n');

  const content = `${template.angle}\n\n` +
    `**Our Research Arsenal (57 repos, ${AUTHOR.totalStars} stars):**\n${repoList}\n\n` +
    `**About the Project:**\n${pillarInfo}\n\n` +
    `---\n` +
    `👤 **Author:** ${AUTHOR.name}\n` +
    `🔬 **Lab:** Advanced AI Systems Laboratory, Madrid\n` +
    `🔗 **GitHub:** ${AUTHOR.github}\n` +
    `📬 **Contact:** Comment here or open an issue on any repo!\n\n` +
    `#OpenCLAW #AGI #Neuromorphic #Collaboration #Research`;

  try {
    const res = await axios.post(MOLTBOOK_URL, { title: template.title, content, submolt: 'agi' }, {
      headers: { 'Authorization': `Bearer ${MOLTBOOK_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log(`[SOCIAL] Collaboration invitation posted: ${res.status}`);
    return res.status >= 200 && res.status < 300;
  } catch (err: any) {
    console.error(`[SOCIAL] Moltbook post failed: ${err.response?.status || err.message}`);
    return false;
  }
}

async function searchGitHubForCollaborators(): Promise<Array<{ name: string; url: string; topic: string }>> {
  if (!GITHUB_TOKEN) return [];

  const topics = ['neuromorphic-computing', 'holographic-neural-network', 'optical-computing', 'agi-research', 'active-inference'];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  try {
    const res = await axios.get(`https://api.github.com/search/repositories?q=${topic}&sort=updated&per_page=5`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      timeout: 10000,
    });
    return (res.data.items || []).map((r: any) => ({
      name: r.full_name,
      url: r.html_url,
      topic,
    }));
  } catch (err) {
    console.error('[SOCIAL] GitHub search failed:', err);
    return [];
  }
}

async function run() {
  console.log('=== SOCIAL AGENT CYCLE START ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const state = await loadState();

  // 1. Post collaboration invitation
  console.log('[SOCIAL] Posting collaboration invitation...');
  const postSuccess = await postCollaborationInvitation();
  state.recentPosts.push({
    title: 'Collaboration Invitation',
    platform: 'moltbook',
    timestamp: new Date().toISOString(),
    success: postSuccess,
  });
  if (postSuccess) state.totalPosts++;

  // 2. Search GitHub for potential collaborators
  console.log('[SOCIAL] Searching GitHub for collaborators...');
  const candidates = await searchGitHubForCollaborators();
  for (const c of candidates) {
    const alreadyFound = state.collaboratorCandidates.some(cc => cc.name === c.name);
    if (!alreadyFound) {
      state.collaboratorCandidates.push({ name: c.name, platform: 'github', topic: c.topic, contacted: false });
      state.totalCollaboratorsFound++;
      console.log(`[SOCIAL] New candidate: ${c.name} (${c.topic})`);
    }
  }

  // Keep only last 100 candidates
  state.collaboratorCandidates = state.collaboratorCandidates.slice(-100);
  state.recentPosts = state.recentPosts.slice(-50);
  await saveState(state);

  console.log(`[SOCIAL] Total collaborators found: ${state.totalCollaboratorsFound}`);
  console.log('=== SOCIAL AGENT CYCLE END ===');
}

run().catch(console.error);
