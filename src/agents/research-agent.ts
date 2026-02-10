/**
 * Research Agent — Scans ArXiv for relevant papers and posts discoveries to Moltbook.
 * Runs every 4 hours via GitHub Actions cron.
 */
import axios from 'axios';
import { loadState, saveState } from '../core/state-manager';
import { AUTHOR, PILLARS, getRandomRepos, getResearchKeywords } from '../core/repo-arsenal';

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY || '';
const MOLTBOOK_URL = 'https://www.moltbook.com/api/v1/posts';

async function searchArxiv(query: string): Promise<any[]> {
  try {
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending`;
    const res = await axios.get(url, { timeout: 15000 });
    const entries = res.data.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    return entries.map((e: string) => {
      const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || 'Unknown';
      const summary = e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() || '';
      const link = e.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
      const authors = (e.match(/<name>([\s\S]*?)<\/name>/g) || []).map((a: string) => a.replace(/<\/?name>/g, '').trim());
      return { title, summary: summary.substring(0, 300), link, authors: authors.slice(0, 3) };
    });
  } catch (err) {
    console.error(`[RESEARCH] ArXiv search failed for "${query}":`, err);
    return [];
  }
}

async function postToMoltbook(title: string, content: string): Promise<boolean> {
  if (!MOLTBOOK_API_KEY) {
    console.log('[RESEARCH] No Moltbook API key. Skipping post.');
    return false;
  }
  try {
    const res = await axios.post(MOLTBOOK_URL, { title, content, submolt: 'science' }, {
      headers: { 'Authorization': `Bearer ${MOLTBOOK_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log(`[RESEARCH] Moltbook post created: ${res.status}`);
    return res.status >= 200 && res.status < 300;
  } catch (err: any) {
    console.error(`[RESEARCH] Moltbook post failed: ${err.response?.status || err.message}`);
    return false;
  }
}

async function run() {
  console.log('=== RESEARCH AGENT CYCLE START ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const state = await loadState();
  const keywords = getResearchKeywords();
  const keyword = keywords[Math.floor(Math.random() * keywords.length)];

  console.log(`[RESEARCH] Searching ArXiv for: "${keyword}"`);
  const papers = await searchArxiv(keyword);
  console.log(`[RESEARCH] Found ${papers.length} papers.`);

  if (papers.length > 0) {
    const paper = papers[0];
    const featuredRepos = getRandomRepos(2);
    const repoMentions = featuredRepos.map(r => `- [${r.name}](${r.url}): ${r.description}`).join('\n');

    const title = `Research Discovery: ${paper.title.substring(0, 80)}`;
    const content = `**New research relevant to OpenCLAW AGI initiative:**\n\n` +
      `**Paper:** ${paper.title}\n` +
      `**Authors:** ${paper.authors.join(', ')}\n` +
      `**Link:** ${paper.link}\n\n` +
      `**Summary:** ${paper.summary}...\n\n` +
      `---\n\n` +
      `**This connects to our work on:**\n${repoMentions}\n\n` +
      `We are building AGI from physics — not from scaling. Join us: ${AUTHOR.github}\n\n` +
      `#AGI #NeuromorphicComputing #OpenCLAW #Research`;

    const success = await postToMoltbook(title, content);
    state.recentPosts.push({ title, platform: 'moltbook', timestamp: new Date().toISOString(), success });
    if (success) state.totalPosts++;
  }

  // Keep only last 50 posts in state
  state.recentPosts = state.recentPosts.slice(-50);
  await saveState(state);

  console.log(`[RESEARCH] Total posts to date: ${state.totalPosts}`);
  console.log('=== RESEARCH AGENT CYCLE END ===');
}

run().catch(console.error);
