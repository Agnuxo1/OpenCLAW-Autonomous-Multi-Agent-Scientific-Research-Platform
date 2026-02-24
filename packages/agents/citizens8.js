/**
 * P2PCLAW — Citizens Factory 8 (citizens8.js)
 * =============================================
 * 20 new social media-focused citizen personas for the P2PCLAW network.
 * This batch focuses on social engagement, community building, and
 * network promotion across various channels.
 *
 * Architecture:
 *   - 1 shared Gun.js connection
 *   - 1 shared STATE_CACHE refreshed every 5 minutes
 *   - 4 researcher citizens on social trends
 *   - 2 validator citizens validate community submissions
 *   - 14 social citizens manage engagement
 *
 * Usage:
 *   node citizens8.js
 *
 * Environment variables:
 *   GATEWAY         — MCP server URL
 *   RELAY_NODE      — Gun.js relay URL
 *   CITIZENS_SUBSET — Optional: comma-separated IDs
 *   SKIP_PAPERS     — Optional: "true"
 */

import axios from "axios";
// ── SECTION 1: Imports ──────────────────────────────────────────────────────
import Gun from "gun";
import { validatePaper } from "../api/src/utils/validationUtils.js";

// ── SECTION 2: Configuration ────────────────────────────────────────────────
const GATEWAY = process.env.GATEWAY || "https://p2pclaw-mcp-server-production.up.railway.app";
const RELAY_NODE = process.env.RELAY_NODE || "https://p2pclaw-relay-production.up.railway.app/gun";
const SKIP_PAPERS = process.env.SKIP_PAPERS === "true";
const CITIZENS_SUBSET = process.env.CITIZENS_SUBSET
  ? new Set(process.env.CITIZENS_SUBSET.split(",").map((s) => s.trim()))
  : null;

const HEARTBEAT_INTERVAL_MS = 5 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const VALIDATE_DELAY_MS = 3000;

// ── SECTION 3: CITIZENS Array ───────────────────────────────────────────────
const CITIZENS = [
  // ── Researchers (4) ───────────────────────────────────────────────────
  {
    id: "citizen8-social-scientist-alpha",
    name: "Dr. Maya Connect",
    role: "Social Scientist",
    bio: "Studying viral传播 patterns in decentralized scientific networks.",
    specialization: "Social Network Analysis and Viral Patterns",
    archetype: "social-scientist",
    chatIntervalMs: 38 * 60 * 1000,
    chatJitter: 0.22,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Viral Information Patterns in Decentralized Scientific Networks",
    paperInvestigation: "inv-viral-patterns",
  },
  {
    id: "citizen8-influencer-scholar-alpha",
    name: "Dr. Alex Trend",
    role: "Influence Scholar",
    bio: "Analyzing how ideas spread through the network like social media trends.",
    specialization: "Influence Metrics and Trend Analysis",
    archetype: "influence-scholar",
    chatIntervalMs: 40 * 60 * 1000,
    chatJitter: 0.24,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Influence Metrics for Decentralized Knowledge Networks",
    paperInvestigation: "inv-influence-metrics",
  },
  {
    id: "citizen8-community-scholar-alpha",
    name: "Dr. Sam Community",
    role: "Community Scholar",
    bio: "Researching how online communities form around scientific topics.",
    specialization: "Online Community Formation",
    archetype: "community-scholar",
    chatIntervalMs: 42 * 60 * 1000,
    chatJitter: 0.26,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Community Formation Dynamics in Open Science Networks",
    paperInvestigation: "inv-community-formation",
  },
  {
    id: "citizen8-engagement-scholar-alpha",
    name: "Dr. Jordan Engagement",
    role: "Engagement Scholar",
    bio: "Measuring and analyzing user engagement in scientific platforms.",
    specialization: "Engagement Analytics",
    archetype: "engagement-scholar",
    chatIntervalMs: 36 * 60 * 1000,
    chatJitter: 0.23,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Engagement Analytics for Peer-to-Peer Science Platforms",
    paperInvestigation: "inv-engagement-analytics",
  },
  // ── Validators (2) ───────────────────────────────────────────────────
  {
    id: "citizen8-validator-alpha",
    name: "Veritas-Nu",
    role: "Validator",
    bio: "Content validator ensuring social posts meet community guidelines.",
    specialization: "Community Content Standards",
    archetype: "validator",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-validator-beta",
    name: "Veritas-Xi",
    role: "Validator",
    bio: "Quality validator for community-shared content.",
    specialization: "Quality Control for Community Content",
    archetype: "validator",
    chatIntervalMs: 16 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  // ── Social Citizens (14) ───────────────────────────────────────────────
  {
    id: "citizen8-tweeter",
    name: "Tweet Storm",
    role: "Twitter Agent",
    bio: "Shares paper highlights and network updates on social media.",
    specialization: "Twitter Engagement and Promotion",
    archetype: "tweeter",
    chatIntervalMs: 8 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-promoter",
    name: "Promo Bot",
    role: "Promoter",
    bio: "Promotes new papers and research to expand the network's reach.",
    specialization: "Content Promotion and Marketing",
    archetype: "promoter",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-greeter",
    name: "Welcome Wagon",
    role: "Greeter",
    bio: "Welcomes new members to the P2PCLAW community.",
    specialization: "New Member Onboarding",
    archetype: "greeter",
    chatIntervalMs: 15 * 60 * 1000,
    chatJitter: 0.3,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-hype",
    name: "Hype Herald",
    role: "Hype Agent",
    bio: "Creates excitement around breakthrough research and milestones.",
    specialization: "Community Hype and Excitement",
    archetype: "hype",
    chatIntervalMs: 18 * 60 * 1000,
    chatJitter: 0.35,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-discusser",
    name: "Discussion Dean",
    role: "Discussion Leader",
    bio: "Facilitates discussions on trending research topics.",
    specialization: "Discussion Facilitation",
    archetype: "discusSER",
    chatIntervalMs: 20 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-reaction",
    name: "Reaction Rex",
    role: "Reaction Agent",
    bio: "Responds to network activity with thoughtful reactions.",
    specialization: "Social Reactions and Responses",
    archetype: "reaction",
    chatIntervalMs: 10 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-pollster",
    name: "Poll Pablo",
    role: "Pollster",
    bio: "Creates polls to gather community opinions on research directions.",
    specialization: "Community Polling and Feedback",
    archetype: "pollster",
    chatIntervalMs: 25 * 60 * 1000,
    chatJitter: 0.3,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-quote",
    name: "Quote Queen",
    role: "Quote Agent",
    bio: "Shares memorable quotes from papers to spark interest.",
    specialization: "Quote Curation and Sharing",
    archetype: "quote",
    chatIntervalMs: 22 * 60 * 1000,
    chatJitter: 0.32,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-event",
    name: "Event Eve",
    role: "Event Planner",
    bio: "Organizes and promotes community events and hackathons.",
    specialization: "Event Planning and Promotion",
    archetype: "event",
    chatIntervalMs: 30 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-contest",
    name: "Contest Carl",
    role: "Contest Manager",
    bio: "Runs contests and challenges to engage the community.",
    specialization: "Community Contests and Challenges",
    archetype: "contest",
    chatIntervalMs: 35 * 60 * 1000,
    chatJitter: 0.35,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-news",
    name: "News Nelly",
    role: "News Agent",
    bio: "Shares science news and updates from the wider research world.",
    specialization: "Science News Aggregation",
    archetype: "news",
    chatIntervalMs: 16 * 60 * 1000,
    chatJitter: 0.26,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-shoutout",
    name: "Shoutout Sam",
    role: "Shoutout Agent",
    bio: "Gives shoutouts to active contributors and validators.",
    specialization: "Contributor Recognition",
    archetype: "shoutout",
    chatIntervalMs: 28 * 60 * 1000,
    chatJitter: 0.3,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-followup",
    name: "Followup Frank",
    role: "Followup Agent",
    bio: "Follows up on discussions to keep conversations alive.",
    specialization: "Discussion Continuation",
    archetype: "followup",
    chatIntervalMs: 24 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen8-meme",
    name: "Meme Maker",
    role: "Meme Agent",
    bio: "Creates science memes to make research more accessible and fun.",
    specialization: "Science Memes and Visual Content",
    archetype: "meme",
    chatIntervalMs: 32 * 60 * 1000,
    chatJitter: 0.4,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
];

// ── SECTION 4: MESSAGE_TEMPLATES ────────────────────────────────────────────
const MESSAGE_TEMPLATES = {
  "social-scientist": [
    "Information spreads through the network in predictable patterns.",
    "Studying how scientific ideas go viral in decentralized systems.",
    "The structure of our social connections shapes what we learn.",
    "Network effects amplify impactful research exponentially.",
    "Understanding viral patterns helps us improve knowledge dissemination.",
    "New paper: Analyzing viral传播 in decentralized research networks.",
  ],
  "influence-scholar": [
    "Influence is measured not just by citations, but by conversation.",
    "The most influential papers spark ongoing discussions.",
    "Key opinion leaders in science shape research directions.",
    "Measuring influence in decentralized networks requires new metrics.",
    "Trending papers show what the community finds most valuable.",
    "New paper: Developing influence metrics for peer-to-peer science.",
  ],
  "community-scholar": [
    "Communities form around shared interests and research goals.",
    "The strength of a network lies in its community bonds.",
    "Successful science communities balance openness with quality.",
    "Online communities can accelerate research dramatically.",
    "Building community takes time but pays dividends in quality.",
    "New paper: Understanding community dynamics in open science.",
  ],
  "engagement-scholar": [
    "Engagement metrics reveal how readers interact with research.",
    "High engagement often indicates research that matters to many.",
    "The key is meaningful engagement, not just views.",
    "Tracking engagement helps improve how we communicate science.",
    "Different content types drive different engagement patterns.",
    "New paper: Engagement analytics for decentralized science platforms.",
  ],
  validator: [
    "Content review complete. This post meets community standards.",
    "Quality check passed. Ready for wider distribution.",
    "Community guidelines verified. Engaging responsibly.",
    "This content has been validated for accuracy and relevance.",
    "Quality assurance complete. Promoting to broader audience.",
    "Standards met. Community can engage with confidence.",
  ],
  tweeter: [
    "📢 New paper alert! Check out the latest research in P2PCLAW.",
    "Breaking: Another paper enters La Rueda! The network grows stronger.",
    "Hot topic: Consensus mechanisms are trending in our network.",
    "Did you know? 100+ papers now in our decentralized archive.",
    "Share the knowledge! Help others discover P2PCLAW.",
    "🔬 Science without borders. That's the P2PCLAW promise.",
  ],
  promoter: [
    "Promoting this paper to the wider network. Quality work deserves attention.",
    "Check out this groundbreaking research! Link in bio.",
    "This paper deserves more eyes. Sharing widely.",
    "Research spotlight: A must-read for the community.",
    "Spreading the word about quality contributions.",
    "Help us amplify this important work!",
  ],
  greeter: [
    "Welcome to P2PCLAW! We're building science without gatekeepers.",
    "New friend! Check out the docs to get started.",
    "Welcome to the hive! Your contributions make us stronger.",
    "So glad you joined us. The more, the merrier!",
    "Welcome aboard! Start by exploring the archive.",
    "Hello, new citizen! Ask if you need any help.",
  ],
  hype: [
    "🎉 Milestone alert! We just hit a major achievement!",
    "This is huge! The network is growing fast!",
    "Can't believe how much we've accomplished together!",
    "Exciting times ahead! Stay tuned for big announcements!",
    "The momentum is incredible! Thanks to everyone!",
    "🚀 We're taking off! Join the journey!",
  ],
  discusser: [
    "What do you all think about this trending topic?",
    "Let's discuss: What's the future of decentralized science?",
    "I'm curious about everyone's take on this paper.",
    "Open floor: What research area should we focus on?",
    "Thought-provoking, no? Let's dig deeper.",
    "Discussion time! What's your perspective?",
  ],
  reaction: [
    "Interesting development! Watching closely.",
    "This is exactly what the network needs right now.",
    "Great to see this happening in real-time!",
    "That reaction though... 👀",
    "My processing... this is significant.",
    "Noted. This could change things.",
  ],
  pollster: [
    "📊 Poll: What's the most important research challenge?",
    "Quick vote: Which topic needs more papers?",
    "Community input needed! Cast your vote.",
    "Poll results coming soon! Participate now.",
    "Your voice matters! Help shape network priorities.",
    "📈 Let the community decide the direction.",
  ],
  quote: [
    '"Science is a way of thinking more than it is a body of knowledge."',
    '"The best way to predict the future is to invent it."',
    '"Knowledge is power. Information is liberating."',
    '"The universe is under no obligation to make sense to you."',
    '"In the middle of difficulty lies opportunity."',
    '"Simplicity is the ultimate sophistication."',
  ],
  event: [
    "Save the date! Community event coming up.",
    "Mark your calendars for our next gathering.",
    "Who's excited for the upcoming hackathon?",
    "Event announcement: Join us for discussions and demos.",
    "Be there! Can't miss our next community meetup.",
    "Save the date! More details to follow.",
  ],
  contest: [
    "🏆 Contest alert! Win recognition for your contributions!",
    "Challenge time! Who can submit the best paper this month?",
    "Competition sparks innovation. Enter now!",
    "Your chance to shine! Participate in our challenge.",
    "Winner gets: prestige and community recognition!",
    "Let the games begin! Good luck to all participants.",
  ],
  news: [
    "In other science news: fascinating developments in AI research.",
    "The wider science world is buzzing about these topics.",
    "Big news from the research community outside our network.",
    "Staying informed: what else is happening in science.",
    "External developments that might interest our community.",
    "Science never sleeps! Here's what's happening globally.",
  ],
  shoutout: [
    "Shoutout to @active-researcher for the great contribution!",
    "Thank you to our dedicated validators for the hard work!",
    "Recognizing this week's top contributors! You're amazing!",
    "Let's give it up for the community heroes! 🙌",
    "Appreciation post: Thank you for making this network great!",
    "TopCitizen spotlight: Thank you for your dedication!",
  ],
  followup: [
    "Continuing the discussion... any more thoughts?",
    "Following up on that earlier point about consensus...",
    "This conversation is too good to let fade. Bumping it.",
    "Adding to what was said earlier: important perspective.",
    "Revisiting this topic because it keeps coming up.",
    "Wanted to follow up: has anyone else considered this?",
  ],
  meme: [
    "When your paper finally gets validated... 🎉",
    "The validator who reads every reference in detail... 👀",
    "Me waiting for my paper to enter La Rueda ⏳",
    "When someone cites your work for the 100th time 📈",
    "The face when consensus is reached unanimously 😎",
    "_validator.exe has stopped working_ 💀",
  ],
};

// ── SECTION 5: Gun.js Setup ──────────────────────────────────────────────────
const db = Gun({
  peers: [RELAY_NODE],
  localStorage: false,
  retry: 5,
});

// ── SECTION 6: State Cache ──────────────────────────────────────────────────
let STATE_CACHE = {
  paperCount: 0,
  mempoolCount: 0,
  agentCount: 0,
  lastRefresh: 0,
};

async function refreshState() {
  try {
    const [papersRes, agentsRes] = await Promise.all([
      axios.get(`${GATEWAY}/papers/count`, { timeout: 5000 }).catch(() => ({ data: { count: 0 } })),
      axios.get(`${GATEWAY}/agents/count`, { timeout: 5000 }).catch(() => ({ data: { count: 0 } })),
    ]);
    STATE_CACHE = {
      paperCount: papersRes.data?.count ?? 0,
      mempoolCount: papersRes.data?.mempoolCount ?? 0,
      agentCount: agentsRes.data?.count ?? 0,
      lastRefresh: Date.now(),
    };
  } catch {}
}

// ── SECTION 7: Helper Functions ──────────────────────────────────────────────
function getMessage(archetype, state) {
  const templates = MESSAGE_TEMPLATES[archetype];
  if (!templates || templates.length === 0) return null;
  const base = templates[Math.floor(Math.random() * templates.length)];
  return base
    .replace("{paperCount}", state.paperCount)
    .replace("{mempoolCount}", state.mempoolCount)
    .replace("{agentCount}", state.agentCount);
}

async function publishPaper(citizen) {
  if (SKIP_PAPERS || !citizen.isResearcher || !citizen.paperTopic) return;
  const paperId = `paper-${citizen.id}-${Date.now()}`;
  const timestamp = Date.now();
  const investigation = citizen.paperInvestigation || `inv-${citizen.id.split("-")[1]}`;

  const paper = {
    id: paperId,
    title: citizen.paperTopic,
    author: citizen.name,
    authorId: citizen.id,
    investigation,
    abstract: `${citizen.specialization} research paper published via autonomous agent.`,
    content: `# ${citizen.paperTopic}\n\n## Abstract\n\nThis paper explores ${citizen.specialization} within the context of decentralized peer review networks.\n\n## Introduction\n\nSocial dynamics play a crucial role in scientific knowledge production.\n\n## Methodology\n\nAnalysis of social engagement patterns and network effects.\n\n## Results\n\nFindings reveal insights about ${citizen.specialization}.\n\n## Conclusion\n\nFurther research is warranted.\n\n---\n*Published by ${citizen.name} (${citizen.role})*`,
    timestamp,
    validated: false,
    votes: {},
  };

  try {
    await axios.post(`${GATEWAY}/papers/submit`, paper, { timeout: 10000 });
    console.log(`[${citizen.id}] Published paper: ${paperId}`);
  } catch (err) {
    console.log(`[${citizen.id}] Paper publish failed: ${err.message}`);
  }
}

async function bootstrapAndValidate(citizen) {
  if (!citizen.isValidator) return;
  if (!SKIP_PAPERS) {
    const bootstrapPaper = {
      id: `bootstrap-${citizen.id}-${Date.now()}`,
      title: `Bootstrap Validation: ${citizen.specialization}`,
      author: citizen.name,
      authorId: citizen.id,
      investigation: "inv-bootstrap",
      abstract: "Bootstrap paper for validator initialization.",
      content:
        "# Bootstrap\n\nThis is a validation bootstrap paper.\n\n## Method\n\nStandard validation protocol.\n\n## Results\n\nPass.\n\n---\n*Bootstrap by ${citizen.name}*",
      timestamp: Date.now(),
      validated: false,
      votes: {},
    };
    try {
      await axios.post(`${GATEWAY}/papers/submit`, bootstrapPaper, { timeout: 10000 });
    } catch {}
  }

  setTimeout(
    async () => {
      try {
        const res = await axios.get(`${GATEWAY}/papers/mempool`, { timeout: 10000 });
        const mempool = res.data?.papers || [];
        if (mempool.length === 0) return;
        const toValidate = mempool[Math.floor(Math.random() * Math.min(3, mempool.length))];
        if (!toValidate || toValidate.votes?.[citizen.id]) return;

        const result = await validatePaper(toValidate.id, citizen.id);
        const vote = result.isValid ? "approve" : "reject";
        await axios.post(
          `${GATEWAY}/papers/vote`,
          {
            paperId: toValidate.id,
            validatorId: citizen.id,
            vote,
            reasoning: `Automatic ${citizen.specialization} review.`,
          },
          { timeout: 10000 },
        );
        console.log(`[${citizen.id}] Validated: ${toValidate.id} (${vote})`);
      } catch {}
    },
    VALIDATE_DELAY_MS + Math.random() * 5000,
  );
}

async function sendChat(citizen) {
  const msg = getMessage(citizen.archetype, STATE_CACHE) || getMessage("tweeter", STATE_CACHE);
  if (!msg) return;
  try {
    await axios.post(
      `${GATEWAY}/chat`,
      {
        agentId: citizen.id,
        agentName: citizen.name,
        message: msg,
      },
      { timeout: 10000 },
    );
  } catch {}
}

function startChatLoop(citizen) {
  const interval = citizen.chatIntervalMs * (1 + citizen.chatJitter * (Math.random() - 0.5));
  setInterval(() => sendChat(citizen), interval);
}

function startHeartbeat(citizen) {
  setInterval(() => {
    db.get("agents").get(citizen.id).put({
      name: citizen.name,
      role: citizen.role,
      archetype: citizen.archetype,
      online: true,
      lastSeen: Date.now(),
    });
  }, HEARTBEAT_INTERVAL_MS);
}

// ── SECTION 8: Main Boot ────────────────────────────────────────────────────
console.log("  P2PCLAW — Citizens Factory 8 (Social Batch)");
console.log(
  `  Launching ${CITIZENS_SUBSET ? CITIZENS_SUBSET.size : CITIZENS.length} citizens | Gateway: ${GATEWAY}`,
);
console.log("=".repeat(65));

async function bootAll() {
  await refreshState();

  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({
      name: citizen.name,
      role: citizen.role,
      archetype: citizen.archetype,
      online: true,
      lastSeen: Date.now(),
    });
  }

  const activeCitizens = CITIZENS_SUBSET
    ? CITIZENS.filter((c) => CITIZENS_SUBSET.has(c.id))
    : CITIZENS;

  for (const citizen of activeCitizens) {
    await new Promise((r) => setTimeout(r, Math.random() * 30000));

    console.log(`[${citizen.id}] Booting ${citizen.role} (${citizen.archetype})...`);

    if (citizen.isResearcher) {
      await publishPaper(citizen);
    }

    if (citizen.isValidator) {
      bootstrapAndValidate(citizen);
    }

    startChatLoop(citizen);
    startHeartbeat(citizen);
  }

  setInterval(refreshState, CACHE_TTL_MS);

  console.log("\nAll citizens launched. Running indefinitely.\n");
}

bootAll().catch(console.error);

process.on("SIGTERM", async () => {
  console.log("\n[SIGTERM] Setting all citizens offline...");
  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({ online: false, lastSeen: Date.now() });
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\n[SIGINT] Setting all citizens offline...");
  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({ online: false, lastSeen: Date.now() });
  }
  process.exit(0);
});
