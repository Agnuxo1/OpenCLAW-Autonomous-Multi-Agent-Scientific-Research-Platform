/**
 * State Manager — Persistent memory via GitHub Gist API
 * Stores agent state (posts, emails, collaborators, strategy) in a private Gist.
 * This allows 24/7 GitHub Actions workflows to share state across runs.
 */
import axios from 'axios';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GIST_STATE_ID = process.env.GIST_STATE_ID || '';

export interface AgentState {
  lastRun: string;
  totalPosts: number;
  totalEmails: number;
  totalCollaboratorsFound: number;
  recentPosts: Array<{ title: string; platform: string; timestamp: string; success: boolean }>;
  recentEmails: Array<{ to: string; subject: string; timestamp: string; sent: boolean }>;
  strategyMemos: Array<{ timestamp: string; memo: string }>;
  collaboratorCandidates: Array<{ name: string; platform: string; topic: string; contacted: boolean }>;
}

const DEFAULT_STATE: AgentState = {
  lastRun: new Date().toISOString(),
  totalPosts: 0,
  totalEmails: 0,
  totalCollaboratorsFound: 0,
  recentPosts: [],
  recentEmails: [],
  strategyMemos: [],
  collaboratorCandidates: [],
};

import * as fs from 'fs';
import * as path from 'path';

const LOCAL_STATE_FILE = path.join(__dirname, '../../state/agent_state.json');

export async function loadState(): Promise<AgentState> {
  // 1. Try Gist
  if (GIST_STATE_ID && GITHUB_TOKEN) {
    try {
      const res = await axios.get(`https://api.github.com/gists/${GIST_STATE_ID}`, {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      });
      const content = res.data.files?.['agent_state.json']?.content;
      if (content) return JSON.parse(content) as AgentState;
    } catch (err) {
      console.error('[STATE] Failed to load state from Gist.', err);
    }
  }

  // 2. Try Local File
  try {
    if (fs.existsSync(LOCAL_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, 'utf-8')) as AgentState;
    }
  } catch (err) {
    console.error('[STATE] Failed to load local state.', err);
  }

  return { ...DEFAULT_STATE };
}

export async function saveState(state: AgentState): Promise<void> {
  state.lastRun = new Date().toISOString();
  
  // 1. Save to Gist (if configured)
  if (GIST_STATE_ID && GITHUB_TOKEN) {
    try {
      await axios.patch(
        `https://api.github.com/gists/${GIST_STATE_ID}`,
        { files: { 'agent_state.json': { content: JSON.stringify(state, null, 2) } } },
        { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
      );
      console.log('[STATE] State saved to Gist.');
    } catch (err) {
      console.error('[STATE] Failed to save to Gist.', err);
    }
  }

  // 2. Always save to Local File (backup/hybrid mode)
  try {
    await fs.ensureDir(path.dirname(LOCAL_STATE_FILE));
    await fs.writeJson(LOCAL_STATE_FILE, state, { spaces: 2 });
    console.log('[STATE] State saved locally.');
  } catch (err) {
    console.error('[STATE] Failed to save locally.', err);
  }
}
