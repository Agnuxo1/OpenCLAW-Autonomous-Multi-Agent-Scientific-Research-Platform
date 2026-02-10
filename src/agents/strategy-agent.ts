/**
 * Strategy Agent — Analyzes agent performance and generates improvement hypotheses.
 * Runs every 12 hours via GitHub Actions cron.
 */
import { loadState, saveState } from '../core/state-manager';
import { AUTHOR, PILLARS } from '../core/repo-arsenal';
import * as nodemailer from 'nodemailer';

const ZOHO_EMAIL = process.env.ZOHO_EMAIL || '';
const ZOHO_PASSWORD = process.env.ZOHO_PASSWORD || '';

async function sendWeeklyReport(report: string): Promise<boolean> {
  if (!ZOHO_EMAIL || !ZOHO_PASSWORD) {
    console.log('[STRATEGY] No email credentials. Report saved to state only.');
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.eu', port: 465, secure: true,
      auth: { user: ZOHO_EMAIL, pass: ZOHO_PASSWORD },
    });
    await transporter.sendMail({
      from: `"OpenCLAW Agent" <${ZOHO_EMAIL}>`,
      to: ZOHO_EMAIL, // Self-report
      subject: `[OpenCLAW] Strategy Report — ${new Date().toISOString().split('T')[0]}`,
      text: report,
    });
    console.log('[STRATEGY] Report emailed successfully.');
    return true;
  } catch (err) {
    console.error('[STRATEGY] Email failed:', err);
    return false;
  }
}

async function run() {
  console.log('=== STRATEGY AGENT CYCLE START ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const state = await loadState();

  // Analyze performance
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentPosts = state.recentPosts.filter(p => p.timestamp > last24h);
  const successPosts = recentPosts.filter(p => p.success);
  const failedPosts = recentPosts.filter(p => !p.success);
  const successRate = recentPosts.length > 0 ? (successPosts.length / recentPosts.length * 100).toFixed(1) : '0';

  const recentEmails = state.recentEmails.filter(e => e.timestamp > last24h);
  const newCollabs = state.collaboratorCandidates.filter(c => !c.contacted).length;

  // Generate hypothesis
  let hypothesis = '';
  if (parseFloat(successRate) < 30) {
    hypothesis = 'CRITICAL: Post success rate is below 30%. Possible causes: API rate limiting, account suspension, or content rejection. PROPOSAL: Reduce posting frequency and diversify content topics.';
  } else if (parseFloat(successRate) < 70) {
    hypothesis = 'MODERATE: Some posts failing. Likely intermittent API issues. PROPOSAL: Add retry logic with exponential backoff.';
  } else {
    hypothesis = 'HEALTHY: Post success rate is good. PROPOSAL: Increase posting frequency or expand to new platforms.';
  }

  if (newCollabs === 0) {
    hypothesis += ' NETWORKING: No new collaborators found. PROPOSAL: Expand search keywords to include "bioinformatics", "computational neuroscience", "photonic computing".';
  }

  const memo = `
=== OPENCLAW STRATEGY REPORT ===
Date: ${new Date().toISOString()}
Author: ${AUTHOR.name}
Arsenal: ${AUTHOR.repoCount} repos, ${AUTHOR.totalStars} total stars

--- 24H METRICS ---
Posts Attempted: ${recentPosts.length}
Posts Successful: ${successPosts.length}
Posts Failed: ${failedPosts.length}
Success Rate: ${successRate}%
Emails Sent: ${recentEmails.length}
New Collaborator Candidates: ${newCollabs}
Total Collaborators Found (all time): ${state.totalCollaboratorsFound}

--- ANALYSIS ---
${hypothesis}

--- LIFETIME STATS ---
Total Posts: ${state.totalPosts}
Total Emails: ${state.totalEmails}
Total Collaborators: ${state.totalCollaboratorsFound}
=================================
  `.trim();

  console.log(memo);

  // Save memo to state
  state.strategyMemos.push({ timestamp: new Date().toISOString(), memo });
  state.strategyMemos = state.strategyMemos.slice(-20); // Keep last 20 memos

  // Email report every other cycle (avoid spam)
  if (state.strategyMemos.length % 2 === 0) {
    await sendWeeklyReport(memo);
  }

  await saveState(state);
  console.log('=== STRATEGY AGENT CYCLE END ===');
}

run().catch(console.error);
