import { api } from '@/api/client';

export const STAGES = [
  { value: 'idea', label: 'Idea', hint: 'A direction, not a build yet', pill: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30' },
  { value: 'prototype', label: 'Prototype', hint: 'Rough, but alive', pill: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-200 dark:border-orange-500/30' },
  { value: 'mvp', label: 'MVP', hint: 'Works, still rough around the edges', pill: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-200 dark:border-teal-500/30' },
  { value: 'live', label: 'Live', hint: 'In front of real users', pill: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30' },
  { value: 'earning', label: 'Earning', hint: 'Making money today', pill: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30' },
];

export const DEAL_TYPES = [
  { value: 'full_sale', label: 'Full sale', hint: 'Buy it outright', pill: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30' },
  { value: 'license', label: 'Non-exclusive license', hint: 'Use it, keep building on it', pill: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/30' },
  { value: 'collaborator', label: 'Looking for a collaborator', hint: 'Build it together', pill: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-200 dark:border-cyan-500/30' },
  { value: 'finish_it', label: 'Needs finishing', hint: 'Take it over the line', pill: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-200 dark:border-fuchsia-500/30' },
  { value: 'free_adoption', label: 'Free to adopt', hint: 'Yours if you want it', pill: 'bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-500/15 dark:text-lime-200 dark:border-lime-500/30' },
];

export const CATEGORIES = [
  { value: 'web_app', label: 'Web app' },
  { value: 'mobile_app', label: 'Mobile app' },
  { value: 'saas', label: 'SaaS' },
  { value: 'game', label: 'Game' },
  { value: 'website', label: 'Website / landing page' },
  { value: 'script_tool', label: 'Script or tool' },
  { value: 'extension', label: 'Browser extension' },
  { value: 'template', label: 'Template / starter' },
  { value: 'api', label: 'API / backend' },
  { value: 'ai_agent', label: 'AI agent' },
  { value: 'other', label: 'Something else' },
];

export const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP'];
export const CURRENCY_SYMBOL = { AUD: 'A$', USD: '$', EUR: '€', GBP: '£' };

export const REACTIONS = [
  { value: 'love', label: 'Love it', emoji: '🔥' },
  { value: 'great_idea', label: 'Great idea', emoji: '💡' },
  { value: 'could_finish', label: 'I could finish this', emoji: '🛠️' },
];

export const REPORT_REASONS = [
  'Scam or fraud',
  'Not what was described',
  'Someone else\u2019s work',
  'Offensive or unsafe content',
  'Spam',
  'Something else',
];

export const BUILDER_CODE = [
  'Say what actually works, and what does not. Both are selling points.',
  'Price the project, not the dream.',
  'No ghosting. Answer every offer, even to say no.',
  'Hand over clean: repo, accounts, keys, domains and docs.',
  'Feedback is a gift. Be gentle, be useful, be specific.',
  'Only sell what is yours to sell.',
];

export const stageMeta = (value) => STAGES.find((s) => s.value === value) || STAGES[0];
export const dealMeta = (value) => DEAL_TYPES.find((d) => d.value === value) || DEAL_TYPES[0];
export const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label || 'Something else';
export const currencySymbol = (code) => CURRENCY_SYMBOL[code] || '$';
export const reactionMeta = (value) => REACTIONS.find((r) => r.value === value) || REACTIONS[0];

export const asItems = (res) => (Array.isArray(res) ? res : res?.items ?? []);

export const formatPrice = (listing) => {
  if (!listing) return '';
  if (listing.deal_type === 'free_adoption') return 'Free to adopt';
  if (!listing.price) {
    if (listing.deal_type === 'collaborator' || listing.deal_type === 'finish_it') return 'Open to proposals';
    return 'Open to offers';
  }
  return `${currencySymbol(listing.currency)}${Number(listing.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

export const formatAmount = (amount, currency) => {
  if (amount === 0 || amount === null || amount === undefined) return 'No amount set';
  return `${currencySymbol(currency)}${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

export const completeness = (listing) => {
  if (!listing) return { score: 0, missing: [] };
  const checks = [
    ['a title and a one-line pitch', Boolean(listing.title && listing.tagline)],
    ['a cover image', Boolean(listing.cover_image)],
    ['two or more gallery items', (listing.gallery?.length || 0) >= 2],
    ['a proper story (120+ characters)', (listing.description?.length || 0) >= 120],
    ['the AI tools you built it with', (listing.ai_tools?.length || 0) >= 1],
    ['your tech stack', (listing.tech_stack?.length || 0) >= 2],
    ['what works today', Boolean(listing.what_works)],
    ['known issues', Boolean(listing.known_issues)],
    ['what is included (2+ items)', (listing.included?.length || 0) >= 2],
    ['monthly running costs', Boolean(listing.monthly_costs)],
  ];
  const passed = checks.filter((c) => c[1]).length;
  return {
    score: Math.round((passed / checks.length) * 100),
    missing: checks.filter((c) => !c[1]).map((c) => c[0]),
  };
};

export const timeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

export const initials = (name) =>
  (name || 'B')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'B';

export const participantKey = (a, b) => [a, b].sort().join('|');

// Media rules: images up to 10MB, clips up to 50MB and 60 seconds.
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 50;
export const MAX_VIDEO_SECONDS = 60;

const videoDuration = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });

// Returns an error string if the file breaks the media rules, otherwise null.
export const checkMediaFile = async (file) => {
  const mb = file.size / (1024 * 1024);
  if (file.type?.startsWith('video')) {
    if (mb > MAX_VIDEO_MB) return `${file.name} is ${mb.toFixed(0)}MB — clips need to be under ${MAX_VIDEO_MB}MB.`;
    const seconds = await videoDuration(file);
    if (seconds && Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) {
      return `${file.name} runs ${Math.round(seconds)}s — keep clips to ${MAX_VIDEO_SECONDS} seconds or less.`;
    }
    return null;
  }
  if (file.type?.startsWith('image')) {
    if (mb > MAX_IMAGE_MB) return `${file.name} is ${mb.toFixed(0)}MB — images need to be under ${MAX_IMAGE_MB}MB.`;
    return null;
  }
  return `${file.name} isn't an image or video.`;
};

// Phrases that usually mean someone wants to move payment off-platform / skip escrow.
const OFF_PLATFORM_PAYMENT = /paypal\.me|pay(?:ing)?\s+(?:you\s+|me\s+)?(?:outside|off[-\s]?platform|directly)|western\s+union|moneygram|gift\s?cards?|wire\s+(?:transfer|me|the)|bank\s+transfer|(?:send|transfer)\s+(?:the\s+)?(?:money|payment|funds|crypto|usdt|btc|eth|bitcoin)|wallet\s+address|cash\s?app|venmo|zelle|(?:skip|without|no\s+need\s+for)\s+(?:the\s+)?escrow|whats\s?app\s+me|telegram\s+me/i;

export const looksLikeOffPlatformPayment = (text) => Boolean(text && OFF_PLATFORM_PAYMENT.test(text));

export const pushNotification = async (payload) => {
  try {
    await api.entities.Notification.create(payload);
  } catch (error) {
    // notifications are a side effect; never block the action that triggered them
  }
};

export const loadMyProfile = async (userId) => {
  if (!userId) return null;
  const res = await api.entities.BuilderProfile.filter({ user_id: userId }, { limit: 1 });
  return asItems(res)[0] || null;
};

export const findOrCreateConversation = async ({ me, otherId, listing, myName, myAvatar }) => {
  const key = participantKey(me, otherId);
  const existing = await api.entities.Conversation.filter({ participant_key: key, listing_id: listing?.id || '' }, { limit: 1 });
  const found = asItems(existing)[0];
  if (found) return found;
  return api.entities.Conversation.create({
    participant_key: key,
    participants: [me, otherId],
    // explicit fields so row-level security can match either party with plain equality
    participant_a: me,
    participant_b: otherId,
    listing_id: listing?.id || '',
    listing_title: listing?.title || '',
    listing_cover: listing?.cover_image || '',
    last_message: '',
    last_message_at: new Date().toISOString(),
    last_sender_id: me,
  });
};