// ============================================================
//  Discord Bot — Giveaways + Accounts + Link Guard
//               Word Filter + Music (YouTube + Spotify) + Tickets
//               Blacklist + KeyAuth Redeem
//  Single file | discord.js v14
//
//  First run / register commands:
//    node bot.js --deploy
//
//  Normal run:
//    node bot.js
// ============================================================

// ============================================================
//  AUTO-INSTALL
// ============================================================
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }); } catch {}
  process.stdout.setEncoding('utf8');
}

const DEPS = [
  'discord.js',
  '@discordjs/voice',
  '@discordjs/opus',
  'play-dl',
  'ffmpeg-static',
  'tweetnacl',        // voice encryption — REQUIRED or audio silently fails
  'opusscript',
  'axios',            // HTTP requests for KeyAuth API
  'dotenv',           // Load environment variables from .env
  'express',          // HTTP API server for license verification
  'canvafy',          // Welcome/Goodbye images
  'gamedig',          // FiveM server status
];

function isInstalled(pkg) {
  try { require.resolve(pkg); return true; } catch { return false; }
}

const missing = DEPS.filter(d => !isInstalled(d));
if (missing.length) {
  console.log('[PKG] Installing:', missing.join(', '));
  try {
    execSync(`npm install ${missing.join(' ')}`, { stdio: 'inherit' });
    console.log('[OK]  Done. Starting bot...');
  } catch (e) {
    console.error('[ERR] Install failed:', e.message);
    process.exit(1);
  }
} else {
  console.log('[OK]  All dependencies installed.');
}

// ── CRITICAL: Load .env FIRST before anything else ──
require('dotenv').config();

// ── CRITICAL: Load .env BEFORE any config access ────────────
require('dotenv').config();

// ── CRITICAL: tell ffmpeg-static where ffmpeg is BEFORE @discordjs/voice loads ──
process.env.FFMPEG_PATH = require('ffmpeg-static');

// ============================================================
//  IMPORTS
// ============================================================
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
} = require('discord.js');

const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, getVoiceConnection, entersState, VoiceConnectionStatus,
} = require('@discordjs/voice');

const play  = require('play-dl');
const axios = require('axios');
const express = require('express');

// ============================================================
//  CONFIG (loaded from .env)
// ============================================================
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN not found in .env file. Copy .env.example to .env and add your token.');
  process.exit(1);
}

const CONFIG = {
  token:    process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || '1492516234527375410',

  allowedCommandRoles:  [],
  accountGiveawayRoles: [],

  logChannelId:           process.env.LOG_CHANNEL_ID || '1488875092812369980',
  timeoutDurationMinutes: 5,
  allowedLinkRoles:       [],

  blacklistedWords:      [
    'badword1', 'badword2',
    // ── Raid protect ──────────────────────────────────────────
    '.gg/brats-gen',
    '.gg/bratsmenu',
    'discord.gg/ZCmUKXU3MF',
    'discord.gg/brats-gen',
    'honzajelaska',
  ],
  wordFilterExemptRoles: [],

  giveawayBotName: 'WeirdDonkey7',
  giveawayColor:   0xFF69B4,

  mentionTimeoutMinutes: 10,
  allowedMentionRoles:   [],

  maxQueueSize: 50,

  // Spotify — leave blank to disable. Get creds at developer.spotify.com
  spotify: {
    clientId:     process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || '',
    market:       'US',
  },

  ticket: {
    categoryId:   null,
    supportRoles: [],
    logChannelId: process.env.TICKET_LOG_CHANNEL_ID || null,
    panelTitle:   'Support Tickets',
    panelDesc:    'Click **Create Ticket** below to open a private support ticket.\nOur staff will be with you shortly.',
  },

  // ── Blacklist ──────────────────────────────────────────────
  blacklist: {
    // Channel where the public blacklist embed is posted (set via /blacklist-setup or hardcode)
    announceChannelId: null,
    // Log channel for blacklist actions
    logChannelId:      process.env.BLACKLIST_LOG_CHANNEL_ID || null,
    // Optional: role ID to assign to blacklisted users (e.g. a muted/restricted role)
    roleId:            null,
    // The "bonus title" shown in the embed
    bonusTitle:        "Největší KOKOT dne",
  },

  // ── KeyAuth ────────────────────────────────────────────────
  keyauth: {
    // Your KeyAuth application name
    appName:      process.env.KEYAUTH_APP_NAME || '',
    // Your KeyAuth owner ID (from dash.keyauth.win)
    ownerId:      process.env.KEYAUTH_OWNER_ID || '',
    // Your KeyAuth app version
    version:      process.env.KEYAUTH_VERSION || '1.0',
    // Role ID to give upon successful redeem
    rewardRoleId: process.env.DISCORD_ROLE_ID || null,
    // Channel to log redeem events (duplicate key attempts, expiries, etc.)
    logChannelId: process.env.KEYAUTH_LOG_CHANNEL_ID || null,
    // Optional: Webhook URL for KeyAuth logging
    webhookUrl:   process.env.KEYAUTH_WEBHOOK_URL || null,
  },

  // ── Discord OAuth2 (for FiveM menu authentication) ────────
  oauth2: {
    clientSecret: process.env.CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri:  process.env.DISCORD_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
  },

  // ── Economy ────────────────────────────────────────────────
  economy: {
    dailyReward: 500,
    xpPerMessage: { min: 5, max: 15 },
    xpCooldownMs: 60000,
  },

  // ── FiveM Server ───────────────────────────────────────────
  fivemServer: {
    ip: process.env.FIVEM_IP || '127.0.0.1',
    port: process.env.FIVEM_PORT || '30120',
  },

  // ── Welcome/Goodbye ────────────────────────────────────────
  welcome: {
    channelId: process.env.WELCOME_CHANNEL_ID || null,
    backgroundUrl: process.env.WELCOME_BG_URL || 'https://i.imgur.com/4mXtF9Z.png',
  },

  // ── Moderation ─────────────────────────────────────────────
  moderation: {
    maxWarnings: 3, // Auto-action after this many warnings
  },
};

// ============================================================
//  DATA DIRS
// ============================================================
const DATA_DIR     = path.join(__dirname, 'data');
const ACCOUNTS_DIR = path.join(__dirname, 'accounts');
[DATA_DIR, ACCOUNTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const GIVEAWAYS_FILE  = path.join(DATA_DIR, 'giveaways.json');
const TICKETS_FILE    = path.join(DATA_DIR, 'tickets.json');
const BLACKLIST_FILE  = path.join(DATA_DIR, 'blacklist.json');
const KEYAUTH_FILE    = path.join(DATA_DIR, 'keyauth_redemptions.json');
const VERIFICATIONS_FILE = path.join(DATA_DIR, 'verifications.json');
const WARNINGS_FILE   = path.join(DATA_DIR, 'warnings.json');
const ECONOMY_FILE    = path.join(DATA_DIR, 'economy.json');
const POOL_FILES      = {
  steam:   path.join(ACCOUNTS_DIR, 'steam.txt'),
  discord: path.join(ACCOUNTS_DIR, 'discord.txt'),
  fivem:   path.join(ACCOUNTS_DIR, 'fivem.txt'),
};

// ============================================================
//  SPOTIFY INIT
// ============================================================
let spotifyReady = false;

async function initSpotify() {
  const { clientId, clientSecret, refreshToken, market } = CONFIG.spotify;
  if (!clientId || !clientSecret || !refreshToken) {
    console.log('[SP]  Spotify credentials not set — Spotify URLs disabled.');
    return;
  }
  try {
    await play.setToken({ spotify: { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, market } });
    spotifyReady = true;
    console.log('[OK]  Spotify ready.');
  } catch (e) { console.error('[ERR] Spotify init:', e.message); }
}

// ============================================================
//  ACCOUNT POOLS
// ============================================================
const accountPools = { steam: [], discord: [], fivem: [] };

function loadPoolsFromDisk() {
  for (const type of ['steam', 'discord', 'fivem']) {
    if (!fs.existsSync(POOL_FILES[type])) fs.writeFileSync(POOL_FILES[type], '', 'utf8');
    const lines = fs.readFileSync(POOL_FILES[type], 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    accountPools[type] = lines;
    console.log(`[DB]  ${type}: ${lines.length} account(s)`);
  }
}
function savePoolToDisk(type) {
  fs.writeFileSync(POOL_FILES[type], accountPools[type].join('\n') + (accountPools[type].length ? '\n' : ''), 'utf8');
}
function addAccountsToPool(type, lines) {
  accountPools[type].push(...lines);
  fs.appendFileSync(POOL_FILES[type], lines.join('\n') + '\n', 'utf8');
}
function takeAccount(type) {
  if (!accountPools[type].length) return null;
  const a = accountPools[type].shift();
  savePoolToDisk(type);
  return a;
}

// ============================================================
//  GIVEAWAY PERSISTENCE
// ============================================================
const giveaways = new Map();

function saveGiveaways() {
  const data = {};
  for (const [id, g] of giveaways) data[id] = { ...g, entrants: [...g.entrants] };
  fs.writeFileSync(GIVEAWAYS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadGiveaways(client) {
  if (!fs.existsSync(GIVEAWAYS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(GIVEAWAYS_FILE, 'utf8'));
    let n = 0;
    for (const [id, g] of Object.entries(data)) {
      g.entrants = new Set(g.entrants);
      g.endsAt   = new Date(g.endsAt);
      giveaways.set(id, g);
      n++;
      if (!g.ended) {
        const remaining = g.endsAt.getTime() - Date.now();
        if (remaining <= 0) endGiveaway(id, client);
        else setTimeout(() => endGiveaway(id, client), remaining);
      }
    }
    console.log(`[DB]  ${n} giveaway(s) restored.`);
  } catch (e) { console.error('[ERR] loadGiveaways:', e.message); }
}

// ============================================================
//  TICKET PERSISTENCE
// ============================================================
const activeTickets = new Map();
let ticketCounter = 0;

function saveTickets() {
  const data = { _counter: ticketCounter };
  for (const [k, v] of activeTickets) data[k] = v;
  fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function loadTickets() {
  if (!fs.existsSync(TICKETS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
    if (data._counter) { ticketCounter = data._counter; delete data._counter; }
    for (const [k, v] of Object.entries(data)) activeTickets.set(k, v);
    console.log(`[DB]  ${activeTickets.size} ticket(s) restored. Counter: ${ticketCounter}`);
  } catch (e) { console.error('[ERR] loadTickets:', e.message); }
}

// ============================================================
//  BLACKLIST PERSISTENCE
// ============================================================
// Structure: Map<userId, { userId, username, reason, addedBy, addedByTag, guildId, addedAt }>
const blacklistMap = new Map();

function saveBlacklist() {
  const data = {};
  for (const [k, v] of blacklistMap) data[k] = v;
  fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadBlacklist() {
  if (!fs.existsSync(BLACKLIST_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    for (const [k, v] of Object.entries(data)) blacklistMap.set(k, v);
    console.log(`[DB]  ${blacklistMap.size} blacklist entry(ies) restored.`);
  } catch (e) { console.error('[ERR] loadBlacklist:', e.message); }
}

// ============================================================
//  KEYAUTH REDEMPTION PERSISTENCE
// ============================================================
// Structure: Map<licenseKey, { key, userId, username, guildId, redeemedAt, expiresAt, roleId }>
const keyauthRedemptions = new Map();

function saveKeyauthRedemptions() {
  const data = {};
  for (const [k, v] of keyauthRedemptions) data[k] = v;
  fs.writeFileSync(KEYAUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadKeyauthRedemptions() {
  if (!fs.existsSync(KEYAUTH_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(KEYAUTH_FILE, 'utf8'));
    for (const [k, v] of Object.entries(data)) keyauthRedemptions.set(k, v);
    console.log(`[DB]  ${keyauthRedemptions.size} KeyAuth redemption(s) restored.`);
  } catch (e) { console.error('[ERR] loadKeyauthRedemptions:', e.message); }
}

// ============================================================
//  LICENSE VERIFICATION (FOR FIVEM SCRIPT AUTH)
// ============================================================
// Structure: Map<code, { code, discordId, username, verifiedAt, expiresAt, licenseKey }>
const verificationCodes = new Map();

function saveVerifications() {
  const data = {};
  for (const [k, v] of verificationCodes) data[k] = v;
  fs.writeFileSync(VERIFICATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadVerifications() {
  if (!fs.existsSync(VERIFICATIONS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(VERIFICATIONS_FILE, 'utf8'));
    for (const [k, v] of Object.entries(data)) verificationCodes.set(k, v);
    // Clean up expired codes
    const now = Date.now();
    for (const [code, info] of verificationCodes) {
      if (info.expiresAt && now > info.expiresAt) {
        verificationCodes.delete(code);
      }
    }
    saveVerifications();
    console.log(`[DB]  ${verificationCodes.size} verification code(s) loaded.`);
  } catch (e) { console.error('[ERR] loadVerifications:', e.message); }
}

// ============================================================
//  WARNINGS PERSISTENCE
// ============================================================
// Structure: Map<userId, [ { reason, adminTag, timestamp } ]>
const warningsMap = new Map();

function saveWarnings() {
  const data = {};
  for (const [k, v] of warningsMap) data[k] = v;
  fs.writeFileSync(WARNINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadWarnings() {
  if (!fs.existsSync(WARNINGS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));
    for (const [k, v] of Object.entries(data)) warningsMap.set(k, v);
    let count = 0;
    for (const v of warningsMap.values()) count += v.length;
    console.log(`[DB]  ${count} warning(s) restored across ${warningsMap.size} user(s).`);
  } catch (e) { console.error('[ERR] loadWarnings:', e.message); }
}

// ============================================================
//  ECONOMY PERSISTENCE
// ============================================================
// Structure: Map<userId, { balance, xp, level, lastXp, lastDaily }>
const economyMap = new Map();

function saveEconomy() {
  const data = {};
  for (const [k, v] of economyMap) data[k] = v;
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadEconomy() {
  if (!fs.existsSync(ECONOMY_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(ECONOMY_FILE, 'utf8'));
    for (const [k, v] of Object.entries(data)) economyMap.set(k, v);
    console.log(`[DB]  ${economyMap.size} economy profile(s) restored.`);
  } catch (e) { console.error('[ERR] loadEconomy:', e.message); }
}

// Generate random 8-character verification code
function generateVerificationCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================
//  DISCORD OAUTH2 SESSION MANAGEMENT (for FiveM menu auth)
// ============================================================
// Structure: Map<state, { state, sessionId, createdAt, authorized, discordId, expiresAt }>
const oauth2Sessions = new Map();

// Session cleanup — remove expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, session] of oauth2Sessions.entries()) {
    if (now > session.expiresAt) {
      oauth2Sessions.delete(state);
    }
  }
}, 5 * 60 * 1000);

// ============================================================
//  PERMISSIONS
// ============================================================
const hasCommandPerm         = m => m && (m.permissions?.has(PermissionFlagsBits.Administrator) || (CONFIG.allowedCommandRoles.length && CONFIG.allowedCommandRoles.some(id => m.roles?.cache?.has(id))));
const hasAccountGiveawayPerm = m => m && (m.permissions?.has(PermissionFlagsBits.Administrator) || (CONFIG.accountGiveawayRoles.length && CONFIG.accountGiveawayRoles.some(id => m.roles?.cache?.has(id))));
const hasTicketPerm          = m => m && (m.permissions?.has(PermissionFlagsBits.Administrator) || m.permissions?.has(PermissionFlagsBits.ManageChannels) || CONFIG.ticket.supportRoles.some(id => m.roles?.cache?.has(id)));
const hasLinkPerm            = m => m && (m.permissions?.has(PermissionFlagsBits.Administrator) || m.permissions?.has(PermissionFlagsBits.ManageMessages) || CONFIG.allowedLinkRoles.some(id => m.roles?.cache?.has(id)));
const hasWordFilterExempt    = m => m && (m.permissions?.has(PermissionFlagsBits.Administrator) || m.permissions?.has(PermissionFlagsBits.ManageMessages) || CONFIG.wordFilterExemptRoles.some(id => m.roles?.cache?.has(id)));
const hasMentionPerm         = m => m && (m.permissions?.has(PermissionFlagsBits.Administrator) || m.permissions?.has(PermissionFlagsBits.MentionEveryone) || CONFIG.allowedMentionRoles.some(id => m.roles?.cache?.has(id)));

// ============================================================
//  UTILITIES
// ============================================================
function parseDuration(str) {
  const m = str.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  return parseInt(m[1]) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
}
async function sendLog(guild, embed) {
  if (!CONFIG.logChannelId) return;
  guild.channels.cache.get(CONFIG.logChannelId)?.send({ embeds: [embed] }).catch(() => {});
}
async function sendTicketLog(guild, embed) {
  if (!CONFIG.ticket.logChannelId) return;
  guild.channels.cache.get(CONFIG.ticket.logChannelId)?.send({ embeds: [embed] }).catch(() => {});
}
async function sendBlacklistLog(guild, embed) {
  const chId = CONFIG.blacklist.logChannelId || CONFIG.logChannelId;
  if (!chId) return;
  guild.channels.cache.get(chId)?.send({ embeds: [embed] }).catch(() => {});
}
async function sendKeyauthLog(guild, embed) {
  const chId = CONFIG.keyauth.logChannelId || CONFIG.logChannelId;
  const webhook = CONFIG.keyauth.webhookUrl;
  
  // Try webhook first if configured
  if (webhook) {
    try {
      await axios.post(webhook, {
        embeds: [embed.toJSON ? embed.toJSON() : embed.data || embed],
      });
      return;
    } catch (e) {
      console.error('[ERR] Webhook log failed:', e.message);
      // Fall through to channel logging
    }
  }
  
  // Fallback to channel
  if (!chId) return;
  guild.channels.cache.get(chId)?.send({ embeds: [embed] }).catch(() => {});
}
function parseAccountLines(raw) { return raw.split('\n').map(l => l.trim()).filter(Boolean); }
function toChannelName(u) { return u.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 90); }
const LINK_RE = /(?:https?:\/\/|www\.)\S+|discord\.gg\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;

// ============================================================
//  EMOJI CONSTANTS  (Unicode escapes — immune to Windows encoding issues)
// ============================================================
const EMOJI = {
  party:  '\u{1F389}', game:   '\u{1F3AE}', speech: '\u{1F4AC}',
  car:    '\u{1F697}', pkg:    '\u{1F4E6}', chart:  '\u{1F4CA}',
  tada:   '\u{1F38A}', people: '\u{1F465}', sad:    '\u{1F614}',
  ticket: '\u{1F3AB}', mail:   '\u{1F4E9}', lock:   '\u{1F512}',
  dice:   '\u{1F3B2}', notes:  '\u{1F3B5}', headph: '\u{1F3A7}',
  check:  '\u2705',    cross:  '\u274C',    warn:   '\u26A0\uFE0F',
  link:   '\u{1F517}', pin:    '\u{1F4CC}', person: '\u{1F464}',
  trash:  '\u{1F5D1}', search: '\u{1F50D}', inbox:  '\u{1F4EC}',
  empty:  '\u{1F4ED}', play:   '\u25B6\uFE0F', skip: '\u23ED\uFE0F',
  stop:   '\u23F9\uFE0F', pause:'\u23F8\uFE0F', loop: '\u{1F501}',
  ban:    '\u{1F6AB}', speaker:'\u{1F4E3}', clock:  '\u{1F552}',
  folder: '\u{1F4C1}', shield: '\u{1F6E1}', list:   '\u{1F4CB}',
  key:    '\u{1F511}', crown:  '\u{1F451}', star:   '\u2B50',
  trophy: '\u{1F3C6}', fire:   '\u{1F525}', red:    '\u{1F534}',
  green:  '\u{1F7E2}', hammer: '\u{1F528}', eyes:   '\u{1F440}',
};

// ============================================================
//  GIVEAWAY HELPERS
// ============================================================
const TYPE_META = {
  normal:  { label: `${EMOJI.party} GIVEAWAY!`,          color: 0xF0B132, emoji: EMOJI.party },
  steam:   { label: `${EMOJI.game} STEAM GIVEAWAY!`,     color: 0x1B2838, emoji: EMOJI.game },
  discord: { label: `${EMOJI.speech} DISCORD GIVEAWAY!`, color: 0x5865F2, emoji: EMOJI.speech },
  fivem:   { label: `${EMOJI.car} FIVEM GIVEAWAY!`,      color: 0xF84F4F, emoji: EMOJI.car },
  bundle:  { label: `${EMOJI.pkg} BUNDLE GIVEAWAY!`,     color: 0xF0B132, emoji: EMOJI.pkg },
};

function buildGiveawayEmbed(g) {
  const ts   = Math.floor(new Date(g.endsAt).getTime() / 1000);
  const meta = TYPE_META[g.type] || TYPE_META.normal;
  const tl   = { steam: `**Type:** ${EMOJI.game} Steam Account\n`, discord: `**Type:** ${EMOJI.speech} Discord Account\n`, fivem: `**Type:** ${EMOJI.car} FiveM Account\n`, bundle: `**Type:** ${EMOJI.pkg} Bundle\n` };
  return new EmbedBuilder()
    .setColor(g.ended ? 0x57F287 : meta.color)
    .setTitle(meta.label)
    .setDescription(`**Prize:** ${g.prize}\n${tl[g.type] || ''}**Ends:** ${g.ended ? '**Ended**' : `<t:${ts}:R>`}\n${g.description ? `\n${g.description}\n` : ''}\nClick the button to enter!`)
    .setFooter({ text: `${EMOJI.people} Participants: ${g.entrants.size} \u2022 Powered by ${CONFIG.giveawayBotName}` })
    .setTimestamp();
}
function buildGiveawayRow(id, disabled = false) {
  const meta = (giveaways.get(id) ? TYPE_META[giveaways.get(id).type] : null) || TYPE_META.normal;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_enter:${id}`).setLabel(`${meta.emoji}  Enter Giveaway`).setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

async function endGiveaway(id, client) {
  const g = giveaways.get(id);
  if (!g || g.ended) return;
  g.ended = true;
  saveGiveaways();
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(g.messageId).catch(() => null);
  if (!message) return;
  const pool = [...g.entrants];
  const winners = [];
  for (let i = 0; i < g.winnersCount && pool.length; i++)
    winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const mentions = winners.length ? winners.map(u => `<@${u}>`).join(', ') : `No valid entrants ${EMOJI.sad}`;
  await message.edit({
    embeds: [new EmbedBuilder().setColor(0x57F287)
      .setTitle(`${EMOJI.tada} ${(TYPE_META[g.type] || TYPE_META.normal).label.replace('!', ' ENDED!')}`)
      .setDescription(`**Prize:** ${g.prize}\n**Winner(s):** ${mentions}\n**Total Entries:** ${g.entrants.size}\n\nThanks everyone!`)
      .setFooter({ text: `${EMOJI.people} Participants: ${g.entrants.size} \u2022 Powered by ${CONFIG.giveawayBotName}` }).setTimestamp()],
    components: [buildGiveawayRow(id, true)],
  }).catch(() => {});
  await channel.send(winners.length
    ? `${EMOJI.tada} Congratulations ${mentions}! You won **${g.prize}**!`
    : `${EMOJI.sad} The giveaway for **${g.prize}** ended with no valid entrants.`
  );
}

// ============================================================
//  ACCOUNT HELPER
// ============================================================
async function sendAccountsToUser(interaction, type) {
  if (!hasAccountGiveawayPerm(interaction.member))
    return interaction.reply({ content: '❌ No permission to use account commands.', flags: 64 });
  await interaction.deferReply({ flags: 64 });
  const count      = interaction.options.getInteger('count') ?? 1;
  const checkPools = type === 'bundle' ? ['steam', 'discord', 'fivem'] : [type];
  const empty      = checkPools.filter(t => !accountPools[t].length);
  if (empty.length) return interaction.editReply(`❌ Empty pool(s): ${empty.map(t => `**${t}**`).join(', ')}`);
  const dmLines = [];
  for (let i = 0; i < count; i++) {
    if (type === 'bundle') {
      const s = takeAccount('steam'), d = takeAccount('discord'), f = takeAccount('fivem');
      dmLines.push(`**Bundle #${i + 1}**`);
      if (s) dmLines.push(`${EMOJI.game} Steam:\n\`\`\`${s}\`\`\``);
      if (d) dmLines.push(`${EMOJI.speech} Discord:\n\`\`\`${d}\`\`\``);
      if (f) dmLines.push(`${EMOJI.car} FiveM:\n\`\`\`${f}\`\`\``);
    } else {
      const a = takeAccount(type);
      if (!a) { dmLines.push(`*(Pool ran out at #${i + 1})*`); break; }
      const e = { steam: EMOJI.game, discord: EMOJI.speech, fivem: EMOJI.car }[type];
      dmLines.push(`${e} **${type} #${i + 1}:**\n\`\`\`${a}\`\`\``);
    }
  }
  try { await interaction.user.send(`${EMOJI.pkg} Your **${type}** account(s) from **${interaction.guild.name}**:\n\n${dmLines.join('\n')}`); }
  catch { return interaction.editReply('❌ Could not DM you. Enable DMs from server members.'); }
  await interaction.editReply(`✅ **${count}** ${type} account(s) sent to your DMs! 📬`);
}

// ============================================================
//  MUSIC (FIXED)
// ============================================================
const musicQueues = new Map();

function getQueue(guildId) {
  if (!musicQueues.has(guildId))
    musicQueues.set(guildId, { queue: [], player: null, connection: null, currentSong: null, loop: false });
  return musicQueues.get(guildId);
}

async function resolveSongs(query, requestedBy) {
  const spType = spotifyReady ? play.sp_validate(query) : false;
  if (spType && spType !== 'search') {
    const sp = await play.spotify(query);
    if (spType === 'track') {
      const r = await play.search(`${sp.name} ${sp.artists[0].name}`, { limit: 1, source: { youtube: 'video' } });
      if (!r.length) throw new Error('No YouTube match for that Spotify track.');
      return [{ title: `${sp.name} — ${sp.artists[0].name}`, url: r[0].url, duration: r[0].durationRaw, requestedBy, source: 'spotify' }];
    }
    if (spType === 'playlist' || spType === 'album') {
      const tracks = spType === 'playlist' ? await sp.all_tracks() : sp.tracks;
      const songs = [];
      for (const t of tracks.slice(0, 50)) {
        const r = await play.search(`${t.name} ${t.artists[0].name}`, { limit: 1, source: { youtube: 'video' } }).catch(() => []);
        if (r.length) songs.push({ title: `${t.name} — ${t.artists[0].name}`, url: r[0].url, duration: r[0].durationRaw, requestedBy, source: 'spotify' });
      }
      return songs;
    }
  }

  if (play.yt_validate(query) === 'playlist') {
    const pl  = await play.playlist_info(query, { incomplete: true });
    const vids = await pl.all_videos();
    return vids.map(v => ({ title: v.title, url: v.url, duration: v.durationRaw, requestedBy, source: 'youtube' }));
  }

  if (play.yt_validate(query) === 'video') {
    const info = await play.video_info(query);
    return [{ title: info.video_details.title, url: query, duration: info.video_details.durationRaw, requestedBy, source: 'youtube' }];
  }

  const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
  if (!results.length) throw new Error('No results found.');
  return [{ title: results[0].title, url: results[0].url, duration: results[0].durationRaw, requestedBy, source: 'youtube' }];
}

async function playSong(guildId, client) {
  const q = getQueue(guildId);

  if (!q.queue.length && !q.loop) {
    q.currentSong = null;
    console.log('[MUSIC] Queue empty.');
    setTimeout(() => {
      const conn = getVoiceConnection(guildId);
      if (conn && !getQueue(guildId).currentSong) { conn.destroy(); musicQueues.delete(guildId); }
    }, 30_000);
    return;
  }

  const song    = q.loop && q.currentSong ? q.currentSong : q.queue.shift();
  q.currentSong = song;
  console.log(`[MUSIC] Playing: ${song.title}`);

  try {
    const streamed = await play.stream(song.url, { discordPlayerCompatibility: true });
    const resource = createAudioResource(streamed.stream, {
      inputType: streamed.type,
      inlineVolume: false,
    });
    q.player.play(resource);
  } catch (err) {
    console.error('[ERR] Stream failed:', err.message);
    q.currentSong = null;
    if (q.queue.length) setTimeout(() => playSong(guildId, client), 1500);
  }
}

async function createMusicPlayer(guildId, vc, client) {
  const q = getQueue(guildId);

  q.connection = joinVoiceChannel({
    channelId:      vc.id,
    guildId:        guildId,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf:       true,
  });

  try {
    await entersState(q.connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`[VC]  Ready in: ${vc.name}`);
  } catch {
    q.connection.destroy();
    throw new Error('Could not connect to the voice channel in time. Check bot permissions.');
  }

  q.player = createAudioPlayer();
  q.connection.subscribe(q.player);

  q.player.on(AudioPlayerStatus.Idle, () => playSong(guildId, client));
  q.player.on('error', err => {
    console.error('[ERR] AudioPlayer:', err.message);
    q.currentSong = null;
    playSong(guildId, client);
  });

  q.connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(q.connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(q.connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      q.connection.destroy();
      musicQueues.delete(guildId);
    }
  });
}

// ============================================================
//  TICKET HELPERS
// ============================================================
function buildTicketPanel() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x2F3136)
      .setTitle(CONFIG.ticket.panelTitle)
      .setDescription(CONFIG.ticket.panelDesc)
      .setFooter({ text: `${CONFIG.giveawayBotName} \u2022 Ticketing` })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_create').setLabel('Create ticket').setEmoji(EMOJI.mail).setStyle(ButtonStyle.Primary)
    )],
  };
}

function buildTicketWelcome(user) {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${EMOJI.ticket} Ticket Opened`)
      .setDescription(`Welcome ${user}!\n\nA staff member will assist you shortly.\nPlease describe your issue in detail.`)
      .setFooter({ text: 'Click Close Ticket when your issue is resolved.' })
      .setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji(EMOJI.lock).setStyle(ButtonStyle.Danger)
    )],
  };
}

async function openTicket(guild, user, member, replyFn) {
  if (!CONFIG.ticket.categoryId)
    return replyFn('❌ Ticket system not set up. Ask an admin to run `/ticket-setup`.');

  for (const [, info] of activeTickets) {
    if (info.userId === user.id && info.guildId === guild.id)
      return replyFn('❌ You already have an open ticket! Please use your existing ticket channel.');
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
    ...CONFIG.ticket.supportRoles.map(roleId => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    })),
  ];

  let ticketChannel;
  try {
    ticketCounter++;
    ticketChannel = await guild.channels.create({
      name:                 `ticket-${String(ticketCounter).padStart(4, '0')}-${toChannelName(user.username)}`,
      type:                 ChannelType.GuildText,
      parent:               CONFIG.ticket.categoryId,
      permissionOverwrites: overwrites,
      topic:                `Ticket for ${user.tag} | ${new Date().toUTCString()}`,
    });
  } catch (e) {
    console.error('[ERR] Create ticket channel:', e.message);
    return replyFn('❌ Failed to create ticket channel. Check bot permissions and the category ID.');
  }

  activeTickets.set(ticketChannel.id, { userId: user.id, username: user.tag, guildId: guild.id, createdAt: new Date().toISOString() });
  saveTickets();

  await ticketChannel.send({ content: `${user}`, ...buildTicketWelcome(user) });

  await sendTicketLog(guild, new EmbedBuilder().setTitle('🎫 Ticket Opened').setColor(0x5865F2)
    .addFields(
      { name: '👤 User',      value: `${user} (${user.tag})`,                      inline: true },
      { name: '📌 Channel',   value: `${ticketChannel}`,                           inline: true },
      { name: '🕐 Opened',    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,     inline: true },
    ).setTimestamp());

  return replyFn(`✅ Your ticket has been created: ${ticketChannel}`);
}

async function closeTicket(channel, closedBy, guild) {
  const ticket = activeTickets.get(channel.id);
  if (!ticket) return false;
  
  // Fetch all messages and create transcript
  let transcriptText = `TICKET TRANSCRIPT\n=====================================\nTicket: #${channel.name}\nOpened by: ${ticket.username}\nClosed by: ${closedBy.tag}\nClosed at: ${new Date().toUTCString()}\n\n--- Messages ---\n`;
  
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = [...messages.values()].reverse();
    for (const msg of sortedMessages) {
      const timestamp = new Date(msg.createdTimestamp).toLocaleString();
      transcriptText += `[${timestamp}] ${msg.author.tag}: ${msg.content || '(embedded content)'}\n`;
      if (msg.attachments.size > 0) {
        msg.attachments.forEach(att => {
          transcriptText += `  [Attachment: ${att.name}]\n`;
        });
      }
    }
  } catch (e) {
    transcriptText += `\n[Error fetching messages: ${e.message}]\n`;
  }
  
  // Post transcript to log channel
  if (CONFIG.ticket.logChannelId) {
    try {
      const logChannel = guild.channels.cache.get(CONFIG.ticket.logChannelId);
      if (logChannel) {
        const filename = `ticket-${channel.id}-${Date.now()}.txt`;
        const buffer = Buffer.from(transcriptText, 'utf8');
        await logChannel.send({
          content: `📋 Transcript for ${channel}`,
          files: [{ attachment: buffer, name: filename }],
        });
      }
    } catch (e) {
      console.error('[ERR] Failed to post transcript:', e.message);
    }
  }
  
  await sendTicketLog(guild, new EmbedBuilder().setTitle('🔒 Ticket Closed').setColor(0xE74C3C)
    .addFields(
      { name: '👤 Opened By', value: `<@${ticket.userId}> (${ticket.username})`, inline: true },
      { name: '❌ Closed By', value: `${closedBy}`,                              inline: true },
      { name: '📌 Channel',   value: `#${channel.name}`,                         inline: true },
    ).setTimestamp());
  setTimeout(async () => {
    activeTickets.delete(channel.id);
    saveTickets();
    await channel.delete(`Closed by ${closedBy.tag}`).catch(() => {});
  }, 5000);
  return true;
}

// ============================================================
//  BLACKLIST HELPERS
// ============================================================

/**
 * Build the public blacklist embed (matches the style in the screenshot).
 * @param {object} opts
 * @param {string} opts.targetTag   - e.g. "@.filipfos.exe"
 * @param {string} opts.reason      - reason written by admin
 * @param {string} opts.adminTag    - e.g. "Dxda | Admin"
 * @param {string} opts.adminId     - discord user ID of admin
 * @param {string} opts.bonusTitle  - the "bonus" title (from CONFIG)
 */
function buildBlacklistEmbed({ targetTag, reason, adminTag, adminId, bonusTitle }) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`${targetTag} byl/a úspěšně přidán/a na náš blacklist! 🚫`)
    .addFields(
      { name: '**Důvod**',  value: reason,                                                        inline: false },
      { name: '**Bonus**',  value: `Gratulujeme, právě jsi získal/a titul '**${bonusTitle}**'! 🏆😎`, inline: false },
    )
    .setFooter({ text: `${adminTag} • ${adminId}` })
    .setTimestamp();
}

/**
 * Build the staff-only blacklist log embed.
 */
function buildBlacklistLogEmbed({ action, target, targetTag, reason, adminTag, guildId }) {
  const isAdd = action === 'add';
  return new EmbedBuilder()
    .setColor(isAdd ? 0xFF0000 : 0x57F287)
    .setTitle(isAdd ? `${EMOJI.ban} User Blacklisted` : `${EMOJI.check} User Removed from Blacklist`)
    .addFields(
      { name: `${EMOJI.person} Target`,   value: `<@${target}> (${targetTag})`, inline: true  },
      { name: `${EMOJI.hammer} Admin`,    value: adminTag,                       inline: true  },
      { name: `${EMOJI.shield} Guild`,    value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      ...(isAdd ? [{ name: `${EMOJI.speech} Reason`, value: reason, inline: false }] : []),
    )
    .setTimestamp();
}

// ============================================================
//  KEYAUTH HELPERS  (FIXED — two-step: init session, then license)
// ============================================================

/**
 * Call the KeyAuth API to validate a license key.
 * Step 1: Initialize a session to get a sessionid.
 * Step 2: Use that sessionid to validate the license key.
 * Returns the full API response object from step 2.
 * Optionally validates Discord ID if provided in the response.
 */
async function checkKeyAuth(licenseKey, expectedDiscordId = null) {
  const { appName, ownerId, version } = CONFIG.keyauth;
  if (!appName || !ownerId) throw new Error('KeyAuth is not configured. Set CONFIG.keyauth.appName and CONFIG.keyauth.ownerId.');

  // ── Step 1: Initialize session ────────────────────────────
  const initParams = new URLSearchParams({
    type:    'init',
    name:    appName,
    ownerid: ownerId,
    ver:     version,
  });

  const initRes = await axios.post('https://keyauth.win/api/1.2/', initParams.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });

  const initData = initRes.data;
  if (!initData.sessionid) {
    throw new Error(`KeyAuth init failed: ${initData.message || 'No session ID returned. Check your appName and ownerId.'}`);
  }

  // ── Step 2: Validate license key using the session ID ─────
  const licenseParams = new URLSearchParams({
    type:      'license',
    key:       licenseKey,
    sessionid: initData.sessionid,
    name:      appName,
    ownerid:   ownerId,
  });

  const licenseRes = await axios.post('https://keyauth.win/api/1.2/', licenseParams.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });

  const result = licenseRes.data;

  // ── Optional Discord ID validation (if both key has Discord linked AND we have an expected ID) ──
  if (result.success && expectedDiscordId && result.info?.discordid) {
    if (result.info.discordid !== expectedDiscordId && result.info.discordid !== '') {
      // Discord ID is linked to a different account
      result.success = false;
      result.message = `This key is linked to a different Discord account (${result.info.discordid}). Keys cannot be shared between accounts.`;
    }
  }

  return result;
}

/**
 * Periodically checks all active KeyAuth redemptions and removes expired roles.
 */
async function keyauthExpiryCheck(client) {
  const now = Date.now();
  for (const [key, redemption] of keyauthRedemptions) {
    if (!redemption.expiresAt) continue;
    const expiresAt = new Date(redemption.expiresAt).getTime();
    if (expiresAt > now) continue;

    // Subscription expired — remove role
    console.log(`[KeyAuth] Key expired: ${key} (user ${redemption.username})`);
    try {
      const guild = await client.guilds.fetch(redemption.guildId).catch(() => null);
      if (!guild) continue;
      const member = await guild.members.fetch(redemption.userId).catch(() => null);
      if (member && redemption.roleId) {
        await member.roles.remove(redemption.roleId, 'KeyAuth subscription expired').catch(() => {});
      }

      // Log expiry
      await sendKeyauthLog(guild, new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle(`${EMOJI.key} KeyAuth Subscription Expired`)
        .addFields(
          { name: `${EMOJI.person} User`,     value: `<@${redemption.userId}> (${redemption.username})`, inline: true },
          { name: `${EMOJI.key} Key`,          value: `\`${key}\``,                                      inline: true },
          { name: `${EMOJI.clock} Expired At`, value: `<t:${Math.floor(expiresAt / 1000)}:F>`,           inline: true },
        )
        .setFooter({ text: 'Role has been removed.' })
        .setTimestamp()
      );
    } catch (e) {
      console.error('[ERR] keyauthExpiryCheck:', e.message);
    }

    // Remove from map
    keyauthRedemptions.delete(key);
    saveKeyauthRedemptions();
  }
}

// ============================================================
//  SLASH COMMANDS
// ============================================================
const commands = [

  // ══════════════════════════════════════════════════════════
  //  /blacklist
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('blacklist')
      .setDescription('Manage the server blacklist')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('Add a user to the blacklist')
        .addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for blacklisting').setRequired(true))
        .addStringOption(o => o.setName('bonus').setDescription('Custom bonus title override (optional)').setRequired(false))
      )
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('Remove a user from the blacklist')
        .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
      )
      .addSubcommand(s => s
        .setName('list')
        .setDescription('Show all blacklisted users')
      )
      .addSubcommand(s => s
        .setName('check')
        .setDescription('Check if a user is blacklisted')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
      )
      .addSubcommand(s => s
        .setName('setup')
        .setDescription('Configure the blacklist announce channel')
        .addChannelOption(o => o.setName('announce-channel').setDescription('Channel to post public blacklist embeds').setRequired(true))
        .addChannelOption(o => o.setName('log-channel').setDescription('Channel for blacklist staff logs').setRequired(false))
        .addRoleOption(o => o.setName('restrict-role').setDescription('Role to assign to blacklisted users (optional)').setRequired(false))
        .addStringOption(o => o.setName('bonus-title').setDescription('Default bonus title shown in embeds').setRequired(false))
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      if (!hasCommandPerm(interaction.member))
        return interaction.reply({ content: '❌ No permission.', flags: 64 });

      const sub = interaction.options.getSubcommand();

      // ── setup ────────────────────────────────────────────
      if (sub === 'setup') {
        const ach  = interaction.options.getChannel('announce-channel');
        const lch  = interaction.options.getChannel('log-channel');
        const role = interaction.options.getRole('restrict-role');
        const bt   = interaction.options.getString('bonus-title');

        CONFIG.blacklist.announceChannelId = ach.id;
        if (lch)  CONFIG.blacklist.logChannelId = lch.id;
        if (role) CONFIG.blacklist.roleId       = role.id;
        if (bt)   CONFIG.blacklist.bonusTitle   = bt;

        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Blacklist Configured')
            .addFields(
              { name: '📢 Announce Channel', value: `${ach}`,                      inline: true },
              { name: '📋 Log Channel',      value: lch  ? `${lch}`  : 'Not set', inline: true },
              { name: '🛡️ Restrict Role',   value: role ? `${role}` : 'None',    inline: true },
              { name: '🏆 Bonus Title',      value: CONFIG.blacklist.bonusTitle,   inline: false },
            )],
          flags: 64,
        });
      }

      // ── add ──────────────────────────────────────────────
      if (sub === 'add') {
        const target     = interaction.options.getUser('user');
        const reason     = interaction.options.getString('reason');
        const bonusTitle = interaction.options.getString('bonus') ?? CONFIG.blacklist.bonusTitle;

        if (blacklistMap.has(target.id))
          return interaction.reply({ content: `⚠️ **${target.tag}** is already blacklisted.`, flags: 64 });

        // Store entry
        blacklistMap.set(target.id, {
          userId:     target.id,
          username:   target.tag,
          reason,
          addedBy:    interaction.user.id,
          addedByTag: interaction.user.tag,
          guildId:    interaction.guild.id,
          addedAt:    new Date().toISOString(),
          bonusTitle,
        });
        saveBlacklist();

        // Assign restrict role if configured
        if (CONFIG.blacklist.roleId) {
          const member = interaction.guild.members.cache.get(target.id);
          if (member) await member.roles.add(CONFIG.blacklist.roleId, `Blacklisted: ${reason}`).catch(() => {});
        }

        // Post public blacklist embed
        const publicEmbed = buildBlacklistEmbed({
          targetTag:  `@${target.username}`,
          reason,
          adminTag:   `${interaction.user.username} | Admin`,
          adminId:    interaction.user.id,
          bonusTitle,
        });

        const announceChId = CONFIG.blacklist.announceChannelId;
        if (announceChId) {
          const ch = interaction.guild.channels.cache.get(announceChId);
          if (ch) await ch.send({ embeds: [publicEmbed] }).catch(() => {});
        }

        // Staff log
        await sendBlacklistLog(interaction.guild, buildBlacklistLogEmbed({
          action:    'add',
          target:    target.id,
          targetTag: target.tag,
          reason,
          adminTag:  `${interaction.user.tag} (${interaction.user.id})`,
          guildId:   interaction.guild.id,
        }));

        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle(`${EMOJI.ban} User Blacklisted`)
            .setDescription(`**${target.tag}** has been added to the blacklist.`)
            .addFields(
              { name: 'Reason',   value: reason,         inline: false },
              { name: 'Announce', value: announceChId ? `Embed posted in <#${announceChId}>` : '⚠️ No announce channel set — run `/blacklist setup` first.', inline: false },
            )],
          flags: 64,
        });
      }

      // ── remove ───────────────────────────────────────────
      if (sub === 'remove') {
        const target = interaction.options.getUser('user');
        if (!blacklistMap.has(target.id))
          return interaction.reply({ content: `⚠️ **${target.tag}** is not blacklisted.`, flags: 64 });

        blacklistMap.delete(target.id);
        saveBlacklist();

        // Remove restrict role if configured
        if (CONFIG.blacklist.roleId) {
          const member = interaction.guild.members.cache.get(target.id);
          if (member) await member.roles.remove(CONFIG.blacklist.roleId, 'Removed from blacklist').catch(() => {});
        }

        // Staff log
        await sendBlacklistLog(interaction.guild, buildBlacklistLogEmbed({
          action:    'remove',
          target:    target.id,
          targetTag: target.tag,
          reason:    '',
          adminTag:  `${interaction.user.tag} (${interaction.user.id})`,
          guildId:   interaction.guild.id,
        }));

        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x57F287)
            .setTitle(`${EMOJI.check} Removed from Blacklist`)
            .setDescription(`**${target.tag}** has been removed from the blacklist.`)],
          flags: 64,
        });
      }

      // ── list ─────────────────────────────────────────────
      if (sub === 'list') {
        const guildEntries = [...blacklistMap.values()].filter(e => e.guildId === interaction.guild.id);
        if (!guildEntries.length)
          return interaction.reply({ content: `${EMOJI.check} No users are currently blacklisted.`, flags: 64 });

        const desc = guildEntries
          .map((e, i) => `**${i + 1}.** <@${e.userId}> \`${e.username}\`\n> **Reason:** ${e.reason}\n> **By:** ${e.addedByTag} • <t:${Math.floor(new Date(e.addedAt).getTime() / 1000)}:D>`)
          .join('\n\n')
          .slice(0, 4000);

        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFF0000)
            .setTitle(`${EMOJI.ban} Blacklisted Users (${guildEntries.length})`)
            .setDescription(desc)
            .setTimestamp()],
          flags: 64,
        });
      }

      // ── check ────────────────────────────────────────────
      if (sub === 'check') {
        const target = interaction.options.getUser('user');
        const entry  = blacklistMap.get(target.id);
        if (!entry)
          return interaction.reply({ content: `${EMOJI.green} **${target.tag}** is NOT blacklisted.`, flags: 64 });

        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFF0000)
            .setTitle(`${EMOJI.ban} User is Blacklisted`)
            .setDescription(`**${target.tag}** is on the blacklist.`)
            .addFields(
              { name: 'Reason',       value: entry.reason,   inline: false },
              { name: 'Blacklisted By', value: entry.addedByTag, inline: true },
              { name: 'Since',        value: `<t:${Math.floor(new Date(entry.addedAt).getTime() / 1000)}:F>`, inline: true },
            )],
          flags: 64,
        });
      }
    },
  },

  // ══════════════════════════════════════════════════════════
  //  /redeem  (KeyAuth)
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('redeem')
      .setDescription('Redeem a KeyAuth license key to unlock your subscription role')
      .addStringOption(o => o.setName('key').setDescription('Your license key').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const licenseKey = interaction.options.getString('key').trim();
      const { rewardRoleId } = CONFIG.keyauth;

      // ── Check if key is already redeemed by SOMEONE ELSE ──
      const existing = keyauthRedemptions.get(licenseKey);
      if (existing && existing.userId !== interaction.user.id) {
        // LOG duplicate attempt
        await sendKeyauthLog(interaction.guild, new EmbedBuilder()
          .setColor(0xFF6600)
          .setTitle(`${EMOJI.warn} Duplicate Key Attempt Detected!`)
          .setDescription('Two different users tried to use the same license key.')
          .addFields(
            { name: `${EMOJI.person} Original Owner`, value: `<@${existing.userId}> (${existing.username})`, inline: true },
            { name: `${EMOJI.eyes} Attempted By`,     value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
            { name: `${EMOJI.key} Key`,               value: `\`${licenseKey}\``,                           inline: false },
            { name: `${EMOJI.clock} Attempt Time`,    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,      inline: true },
          )
          .setFooter({ text: 'Possible key sharing or account compromise.' })
          .setTimestamp()
        );

        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`${EMOJI.cross} Key Already In Use`)
            .setDescription('This license key is already linked to another account.\nThis attempt has been **logged and reported** to staff.')
            .setFooter({ text: 'If you believe this is an error, open a support ticket.' })],
        });
      }

      // ── Key belongs to this user and is still active — re-give role without hitting KeyAuth again ──
      if (existing && existing.userId === interaction.user.id) {
        const storedExpiry    = existing.expiresAt ? new Date(existing.expiresAt) : null;
        const isExpired       = storedExpiry ? storedExpiry.getTime() < Date.now() : false;

        if (!isExpired) {
          // Re-give the role silently (covers rejoins, role loss, etc.)
          let roleGiven = false;
          if (rewardRoleId) {
            try {
              await interaction.member.roles.add(rewardRoleId, 'KeyAuth key re-activated');
              roleGiven = true;
            } catch (e) {
              console.error('[ERR] Give role (re-activate):', e.message);
            }
          }

          const expiryMs = storedExpiry ? storedExpiry.getTime() : null;

          return interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle(`${EMOJI.check} Subscription Restored!`)
              .setDescription(`Your key is still active, **${interaction.user.username}**. Your role has been restored.`)
              .addFields(
                { name: `${EMOJI.crown} Role`,    value: roleGiven && rewardRoleId ? `<@&${rewardRoleId}> granted!` : 'No reward role configured.', inline: true },
                { name: `${EMOJI.clock} Expires`, value: expiryMs ? `<t:${Math.floor(expiryMs / 1000)}:R>` : 'Lifetime', inline: true },
              )
              .setFooter({ text: 'Your role will be removed automatically when your subscription expires.' })
              .setTimestamp()],
          });
        }
        // If expired, fall through and call KeyAuth API to re-validate
      }

      // ── Call KeyAuth API ───────────────────────────────────
      let apiResult;
      try {
        apiResult = await checkKeyAuth(licenseKey, interaction.user.id);
      } catch (e) {
        console.error('[ERR] KeyAuth API:', e.message);
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`${EMOJI.cross} KeyAuth Error`)
            .setDescription(`Could not reach the KeyAuth API.\n\`${e.message}\``)],
        });
      }

      // ── Handle invalid/expired key ─────────────────────────
      if (!apiResult.success) {
        console.log(`[KeyAuth] Failed: ${licenseKey} — ${apiResult.message}`);
        
        // Special handling for "No Discord linked" error
        const message = apiResult.message || 'The key is invalid or has expired.';
        const isNoDiscordLinked = message.toLowerCase().includes('no discord linked');
        
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(isNoDiscordLinked ? 0xFF9900 : 0xFF0000)
            .setTitle(isNoDiscordLinked ? `${EMOJI.warn} Discord Account Not Linked` : `${EMOJI.cross} Invalid Key`)
            .setDescription(isNoDiscordLinked 
              ? `**Your Discord account is not linked to this license key.**\n\n` +
                `To fix this:\n` +
                `1. Go to https://keyauth.win/dashboard\n` +
                `2. Log in with your KeyAuth account\n` +
                `3. Find your license key\n` +
                `4. Link your Discord ID (\`${interaction.user.id}\`)\n` +
                `5. Try redeeming again\n\n` +
                `**Current Discord ID:** \`${interaction.user.tag}\` (\`${interaction.user.id}\`)`
              : `**${message}**`)
            .setFooter({ text: isNoDiscordLinked ? 'Need help? Open a support ticket.' : 'Purchase a valid key or contact support.' })],
        });
      }

      // ── Valid key — parse expiry correctly from KeyAuth response ──
      // KeyAuth returns expiry as a Unix timestamp string (seconds), or "Never" / missing for lifetime keys
      const rawExpiry       = apiResult.info?.expiry;
      const expiryTimestamp = rawExpiry && rawExpiry !== 'Never' && !isNaN(parseInt(rawExpiry))
        ? parseInt(rawExpiry) * 1000
        : null;
      const expiresAt       = expiryTimestamp ? new Date(expiryTimestamp).toISOString() : null;

      // Save / update redemption with fresh expiry from KeyAuth
      keyauthRedemptions.set(licenseKey, {
        key:         licenseKey,
        userId:      interaction.user.id,
        username:    interaction.user.tag,
        guildId:     interaction.guild.id,
        redeemedAt:  new Date().toISOString(),
        expiresAt,
        roleId:      rewardRoleId,
      });
      saveKeyauthRedemptions();

      // Give role
      let roleGiven = false;
      if (rewardRoleId) {
        try {
          await interaction.member.roles.add(rewardRoleId, `KeyAuth key redeemed`);
          roleGiven = true;
        } catch (e) {
          console.error('[ERR] Give role:', e.message);
        }
      }

      // Log success
      await sendKeyauthLog(interaction.guild, new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(`${EMOJI.key} Key Successfully Redeemed`)
        .addFields(
          { name: `${EMOJI.person} User`,       value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: `${EMOJI.key} Key`,            value: `\`${licenseKey}\``,                                  inline: true },
          { name: `${EMOJI.crown} Role Given`,   value: roleGiven && rewardRoleId ? `<@&${rewardRoleId}>` : 'None configured', inline: true },
          { name: `${EMOJI.clock} Expires`,      value: expiryTimestamp ? `<t:${Math.floor(expiryTimestamp / 1000)}:F>` : 'Lifetime', inline: true },
        )
        .setTimestamp()
      );

      // Reply to user
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(`${EMOJI.check} Key Redeemed Successfully!`)
          .setDescription(`Welcome, **${interaction.user.username}**! Your subscription is now active.`)
          .addFields(
            { name: `${EMOJI.crown} Role`,    value: roleGiven && rewardRoleId ? `<@&${rewardRoleId}> granted!` : 'No reward role configured.', inline: true },
            { name: `${EMOJI.clock} Expires`, value: expiresAt ? `<t:${Math.floor(expiryTimestamp / 1000)}:R>` : 'Lifetime',                    inline: true },
          )
          .setFooter({ text: 'Your role will be removed automatically when your subscription expires.' })
          .setTimestamp()],
      });
    },
  },

  // ══════════════════════════════════════════════════════════
  //  /keyauth-setup
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('keyauth-setup')
      .setDescription('Configure the KeyAuth redemption system')
      .addStringOption(o => o.setName('app-name').setDescription('KeyAuth application name').setRequired(true))
      .addStringOption(o => o.setName('owner-id').setDescription('KeyAuth owner ID').setRequired(true))
      .addRoleOption(o => o.setName('reward-role').setDescription('Role to give on successful redeem').setRequired(true))
      .addStringOption(o => o.setName('version').setDescription('App version (default: 1.0)').setRequired(false))
      .addChannelOption(o => o.setName('log-channel').setDescription('Channel for KeyAuth logs').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      if (!hasCommandPerm(interaction.member))
        return interaction.reply({ content: '❌ No permission.', flags: 64 });

      CONFIG.keyauth.appName      = interaction.options.getString('app-name');
      CONFIG.keyauth.ownerId      = interaction.options.getString('owner-id');
      CONFIG.keyauth.rewardRoleId = interaction.options.getRole('reward-role').id;
      const ver = interaction.options.getString('version');
      if (ver) CONFIG.keyauth.version = ver;
      const logCh = interaction.options.getChannel('log-channel');
      if (logCh) CONFIG.keyauth.logChannelId = logCh.id;

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`${EMOJI.key} KeyAuth Configured`)
          .addFields(
            { name: 'App Name',     value: CONFIG.keyauth.appName,                                            inline: true },
            { name: 'Owner ID',     value: CONFIG.keyauth.ownerId,                                            inline: true },
            { name: 'Version',      value: CONFIG.keyauth.version,                                            inline: true },
            { name: 'Reward Role',  value: `<@&${CONFIG.keyauth.rewardRoleId}>`,                              inline: true },
            { name: 'Log Channel',  value: CONFIG.keyauth.logChannelId ? `<#${CONFIG.keyauth.logChannelId}>` : 'Global log', inline: true },
          )],
        flags: 64,
      });
    },
  },

  // ══════════════════════════════════════════════════════════
  //  /verify — FiveM Script License Verification
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Verify your FiveM script license using a verification code')
      .addStringOption(o => o.setName('code').setDescription('8-character verification code from the script').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const code = interaction.options.getString('code').trim().toUpperCase();
      const verification = verificationCodes.get(code);

      if (!verification) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`${EMOJI.cross} Invalid Code`)
            .setDescription('This verification code does not exist or has expired.')
            .setFooter({ text: 'Copy the code from your script startup screen.' })],
        });
      }

      // Check if code is already verified
      if (verification.discordId && verification.discordId !== interaction.user.id) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xFF6600)
            .setTitle(`${EMOJI.warn} Code Already Verified`)
            .setDescription(`This code was already verified by <@${verification.discordId}>.`)
            .setFooter({ text: 'Generate a new code in your script.' })],
        });
      }

      // Mark code as verified with this user
      verification.discordId = interaction.user.id;
      verification.username = interaction.user.tag;
      verification.verifiedAt = new Date().toISOString();
      verificationCodes.set(code, verification);
      saveVerifications();

      // Check if the license key is valid in our redemptions
      const licenseKey = verification.licenseKey;
      const redemption = licenseKey ? keyauthRedemptions.get(licenseKey) : null;
      
      let validityInfo = '';
      if (redemption && redemption.expiresAt) {
        const expireDate = new Date(redemption.expiresAt);
        const now = new Date();
        const daysLeft = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysLeft > 0) {
          validityInfo = `**${EMOJI.check} Your license is valid for ${daysLeft} more day(s)!**\n\nExpires: <t:${Math.floor(expireDate.getTime() / 1000)}:F>`;
        } else {
          validityInfo = `**${EMOJI.cross} Your license has expired.**\n\nExpired: <t:${Math.floor(expireDate.getTime() / 1000)}:F>`;
        }
      } else if (redemption) {
        validityInfo = `**${EMOJI.check} Your license is valid forever (Lifetime)!**`;
      } else {
        validityInfo = `**${EMOJI.warn} License key not found in our system.**`;
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(`${EMOJI.check} Verification Successful!`)
          .setDescription(`Your FiveM script license has been verified.\n\n${validityInfo}`)
          .addFields(
            { name: `${EMOJI.key} Code`, value: `\`${code}\``, inline: true },
            { name: `${EMOJI.person} User`, value: `${interaction.user.tag}`, inline: true },
          )
          .setFooter({ text: 'Your script can now load the menu.' })
          .setTimestamp()],
      });
    },
  },

  // ══════════════════════════════════════════════════════════
  //  ECONOMY & LEVELING
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Check your or another user\'s level and XP')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    async execute(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      if (target.bot) return interaction.reply({ content: '❌ Bots do not have ranks.', flags: 64 });

      const profile = economyMap.get(target.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };
      const nextLevelXp = (profile.level + 1) * 100;

      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`${EMOJI.star} ${target.username}'s Rank`)
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: 'Level', value: `\`${profile.level}\``, inline: true },
            { name: 'XP', value: `\`${profile.xp} / ${nextLevelXp}\``, inline: true },
          )],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Check your coin balance')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    async execute(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      if (target.bot) return interaction.reply({ content: '❌ Bots do not have a balance.', flags: 64 });

      const profile = economyMap.get(target.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };

      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle(`💰 ${target.username}'s Balance`)
          .setDescription(`**Balance:** ${profile.balance} coins`)],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('daily')
      .setDescription('Claim your daily coins'),
    async execute(interaction) {
      const profile = economyMap.get(interaction.user.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      if (now - profile.lastDaily < oneDay) {
        const remaining = profile.lastDaily + oneDay - now;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        return interaction.reply({ content: `⏱️ You already claimed your daily reward! Try again in **${hours}h ${minutes}m**.`, flags: 64 });
      }

      profile.balance += CONFIG.economy.dailyReward;
      profile.lastDaily = now;
      economyMap.set(interaction.user.id, profile);
      saveEconomy();

      await interaction.reply({ content: `✅ You claimed your daily reward of **${CONFIG.economy.dailyReward} coins**! Your new balance is **${profile.balance} coins**.`, flags: 64 });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('addmoney')
      .setDescription('Add money to a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const profile = economyMap.get(target.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };
      profile.balance += amount;
      economyMap.set(target.id, profile);
      saveEconomy();

      await interaction.reply({ content: `✅ Added **${amount} coins** to ${target.tag}. New balance: **${profile.balance} coins**.`, flags: 64 });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('removemoney')
      .setDescription('Remove money from a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const profile = economyMap.get(target.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };
      profile.balance = Math.max(0, profile.balance - amount);
      economyMap.set(target.id, profile);
      saveEconomy();

      await interaction.reply({ content: `✅ Removed **${amount} coins** from ${target.tag}. New balance: **${profile.balance} coins**.`, flags: 64 });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('Gamble your coins in a coinflip')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true))
      .addStringOption(o => o.setName('choice').setDescription('Heads or Tails').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),
    async execute(interaction) {
      const amount = interaction.options.getInteger('amount');
      const choice = interaction.options.getString('choice');
      if (amount <= 0) return interaction.reply({ content: '❌ Bet must be greater than 0.', flags: 64 });

      const profile = economyMap.get(interaction.user.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };
      if (profile.balance < amount) return interaction.reply({ content: `❌ You only have **${profile.balance} coins**.`, flags: 64 });

      const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
      if (outcome === choice) {
        profile.balance += amount;
        await interaction.reply(`🎉 You guessed **${choice}** and won **${amount} coins**! New balance: **${profile.balance} coins**.`);
      } else {
        profile.balance -= amount;
        await interaction.reply(`😔 It was **${outcome}**. You lost **${amount} coins**. New balance: **${profile.balance} coins**.`);
      }
      economyMap.set(interaction.user.id, profile);
      saveEconomy();
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('shop')
      .setDescription('View the shop'),
    async execute(interaction) {
      if (!CONFIG.economy.shopItems.length) return interaction.reply({ content: '❌ The shop is empty.', flags: 64 });

      const desc = CONFIG.economy.shopItems.map(item => `**ID:** \`${item.id}\` | **${item.name}**\n> ${item.description}\n> **Price:** 💰 ${item.price} coins`).join('\n\n');

      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('🛒 Server Shop')
          .setDescription(desc)
          .setFooter({ text: 'Use /buy <id> to purchase an item' })],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('buy')
      .setDescription('Buy an item from the shop')
      .addStringOption(o => o.setName('id').setDescription('Item ID from the shop').setRequired(true)),
    async execute(interaction) {
      const id = interaction.options.getString('id');
      const item = CONFIG.economy.shopItems.find(i => i.id === id);
      if (!item) return interaction.reply({ content: '❌ Item not found in the shop.', flags: 64 });

      const profile = economyMap.get(interaction.user.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };
      if (profile.balance < item.price) return interaction.reply({ content: `❌ You need **${item.price} coins** to buy this. You have **${profile.balance} coins**.`, flags: 64 });

      if (item.roleId) {
        if (!interaction.guild.roles.cache.has(item.roleId)) return interaction.reply({ content: '❌ The role for this item does not exist in the server.', flags: 64 });
        if (interaction.member.roles.cache.has(item.roleId)) return interaction.reply({ content: '❌ You already have this role.', flags: 64 });

        try {
          await interaction.member.roles.add(item.roleId, 'Bought from shop');
        } catch (e) {
          return interaction.reply({ content: '❌ Could not give you the role. Please check my permissions.', flags: 64 });
        }

        profile.balance -= item.price;
        economyMap.set(interaction.user.id, profile);
        saveEconomy();
        return interaction.reply(`✅ You successfully bought **${item.name}** for **${item.price} coins**!`);
      } else if (item.type) {
        // Test DM before taking account from pool
        try {
          // Send an initial message to see if we can DM them
          await interaction.user.send(`${EMOJI.pkg} Preparing your **${item.type}** account...`);
        } catch (e) {
          return interaction.reply({ content: '❌ Please enable your DMs to receive the account.', flags: 64 });
        }

        const acc = takeAccount(item.type);
        if (!acc) return interaction.reply({ content: '❌ Out of stock.', flags: 64 });

        try {
          await interaction.user.send(`Here is your account:\n\`\`\`${acc}\`\`\``);
        } catch (e) {
          // Fallback, technically already checked but if it fails we push back
          addAccountsToPool(item.type, [acc]);
          return interaction.reply({ content: '❌ Something went wrong sending your DM. Account was refunded.', flags: 64 });
        }

        profile.balance -= item.price;
        economyMap.set(interaction.user.id, profile);
        saveEconomy();
        return interaction.reply(`✅ You successfully bought **${item.name}** for **${item.price} coins**! Check your DMs.`);
      }

      interaction.reply({ content: '❌ Item is not configured correctly.', flags: 64 });
    },
  },

  // ══════════════════════════════════════════════════════════
  //  FIVEM SERVER STATUS
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('serverstatus')
      .setDescription('Check the FiveM server status'),
    async execute(interaction) {
      await interaction.deferReply();
      const { ip, port } = CONFIG.fivemServer;
      const baseUrl = `http://${ip}:${port}`;

      try {
        const infoRes = await axios.get(`${baseUrl}/info.json`, { timeout: 5000 });
        const playersRes = await axios.get(`${baseUrl}/players.json`, { timeout: 5000 });

        const info = infoRes.data;
        const players = playersRes.data;

        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(`${EMOJI.car} FiveM Server Status`)
          .setDescription(`**${info.vars?.sv_projectName || 'FiveM Server'}**`)
          .addFields(
            { name: 'Status', value: `${EMOJI.check} Online`, inline: true },
            { name: 'Players', value: `${players.length} / ${info.vars?.sv_maxClients || 'Unknown'}`, inline: true },
            { name: 'Connect', value: `\`connect ${ip}:${port}\``, inline: false }
          )
          .setFooter({ text: `Game: ${info.server?.name || 'GTA V'}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (e) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle(`${EMOJI.car} FiveM Server Status`)
            .setDescription(`**Status:** ${EMOJI.cross} Offline\n\nCould not connect to the server at \`${ip}:${port}\`.`)
            .setTimestamp()]
        });
      }
    },
  },

  // ══════════════════════════════════════════════════════════
  //  MODERATION
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Warn a user')
      .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');

      if (target.id === interaction.user.id || target.bot) return interaction.reply({ content: '❌ Invalid target.', flags: 64 });

      const warnings = warningsMap.get(target.id) || [];
      warnings.push({ reason, adminTag: interaction.user.tag, timestamp: new Date().toISOString() });
      warningsMap.set(target.id, warnings);
      saveWarnings();

      let actionText = '';
      if (warnings.length >= CONFIG.moderation.maxWarnings) {
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member && member.kickable) {
          try {
            await member.kick(`Reached ${CONFIG.moderation.maxWarnings} warnings`);
            actionText = `\n\n🚨 **User was automatically kicked for reaching ${CONFIG.moderation.maxWarnings} warnings.**`;
            warningsMap.delete(target.id);
            saveWarnings();
          } catch (e) {
            actionText = `\n\n⚠️ Could not kick user automatically.`;
          }
        }
      }

      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle(`${EMOJI.warn} User Warned`)
          .setDescription(`**${target.tag}** has been warned.\n**Reason:** ${reason}${actionText}`)
          .setFooter({ text: `Total Warnings: ${warningsMap.has(target.id) ? warningsMap.get(target.id).length : 0}` })],
      });
      try { await target.send(`⚠️ You were warned in **${interaction.guild.name}** for: **${reason}**`); } catch {}
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('List warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const target = interaction.options.getUser('user');
      const warnings = warningsMap.get(target.id) || [];

      if (!warnings.length) return interaction.reply({ content: `${EMOJI.check} **${target.tag}** has no warnings.`, flags: 64 });

      const desc = warnings.map((w, i) => `**${i + 1}.** ${w.reason}\n> By: ${w.adminTag} • <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:R>`).join('\n\n');
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle(`${EMOJI.warn} Warnings for ${target.tag}`)
          .setDescription(desc)],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('clearwarnings')
      .setDescription('Clear all warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('User to clear').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const target = interaction.options.getUser('user');
      warningsMap.delete(target.id);
      saveWarnings();
      await interaction.reply({ content: `${EMOJI.check} Cleared all warnings for **${target.tag}**.`, flags: 64 });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member')
      .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for kicking').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ Member not found.', flags: 64 });
      if (!member.kickable) return interaction.reply({ content: '❌ Cannot kick this member.', flags: 64 });

      try { await target.send(`🛑 You were kicked from **${interaction.guild.name}** for: **${reason}**`); } catch {}
      await member.kick(reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle(`${EMOJI.hammer} Member Kicked`).setDescription(`**${target.tag}** was kicked.\n**Reason:** ${reason}`)] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member')
      .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for banning').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      try { await target.send(`🔨 You were banned from **${interaction.guild.name}** for: **${reason}**`); } catch {}
      await interaction.guild.members.ban(target, { reason }).catch(() => null);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle(`${EMOJI.ban} Member Banned`).setDescription(`**${target.tag}** was banned.\n**Reason:** ${reason}`)] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Delete a specified number of messages')
      .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const amount = interaction.options.getInteger('amount');
      const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
      if (!deleted) return interaction.reply({ content: '❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted.', flags: 64 });
      await interaction.reply({ content: `${EMOJI.trash} Deleted **${deleted.size}** messages.`, flags: 64 });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
    },
  },

  // ══════════════════════════════════════════════════════════
  //  TICKETS
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Open a support ticket'),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });
      await openTicket(interaction.guild, interaction.user, interaction.member, msg => interaction.editReply(msg));
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('ticket-setup')
      .setDescription('Post the ticket panel and configure the ticket system')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post the panel in').setRequired(true))
      .addStringOption(o => o.setName('category-id').setDescription('Category ID where ticket channels are created').setRequired(true))
      .addRoleOption(o => o.setName('support-role').setDescription('Role that can see all tickets'))
      .addStringOption(o => o.setName('log-channel-id').setDescription('Channel ID to log ticket events'))
      .addStringOption(o => o.setName('panel-title').setDescription('Title shown on the panel'))
      .addStringOption(o => o.setName('panel-description').setDescription('Description shown on the panel'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      const panelCh = interaction.options.getChannel('channel');
      const catId   = interaction.options.getString('category-id');
      const sRole   = interaction.options.getRole('support-role');
      const logChId = interaction.options.getString('log-channel-id');
      const pTitle  = interaction.options.getString('panel-title');
      const pDesc   = interaction.options.getString('panel-description');

      const cat = interaction.guild.channels.cache.get(catId);
      if (!cat || cat.type !== ChannelType.GuildCategory)
        return interaction.reply({ content: '❌ Invalid category ID. Right-click a Category channel → Copy ID.', flags: 64 });

      CONFIG.ticket.categoryId = catId;
      if (sRole && !CONFIG.ticket.supportRoles.includes(sRole.id)) CONFIG.ticket.supportRoles.push(sRole.id);
      if (logChId) CONFIG.ticket.logChannelId = logChId;
      if (pTitle)  CONFIG.ticket.panelTitle   = pTitle;
      if (pDesc)   CONFIG.ticket.panelDesc    = pDesc;

      await panelCh.send(buildTicketPanel());
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Ticket System Configured')
          .addFields(
            { name: '📌 Panel Channel',   value: `${panelCh}`,                          inline: true },
            { name: '📁 Ticket Category', value: cat.name,                              inline: true },
            { name: '🛡️ Support Role',   value: sRole ? `${sRole}` : 'None',           inline: true },
            { name: '📋 Log Channel',     value: logChId ? `<#${logChId}>` : 'None',   inline: true },
          )],
        flags: 64,
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('ticket-close')
      .setDescription('Close the current ticket channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
      const ticket = activeTickets.get(interaction.channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This channel is not a ticket.', flags: 64 });
      if (!hasTicketPerm(interaction.member) && interaction.user.id !== ticket.userId)
        return interaction.reply({ content: '❌ Only the ticket owner or staff can close this.', flags: 64 });
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
      await closeTicket(interaction.channel, interaction.user, interaction.guild);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('ticket-add')
      .setDescription('Add a user to the current ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
      if (!activeTickets.has(interaction.channel.id)) return interaction.reply({ content: '❌ Not a ticket channel.', flags: 64 });
      if (!hasTicketPerm(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      await interaction.reply(`✅ Added ${user} to the ticket.`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('ticket-remove')
      .setDescription('Remove a user from the current ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
      if (!activeTickets.has(interaction.channel.id)) return interaction.reply({ content: '❌ Not a ticket channel.', flags: 64 });
      if (!hasTicketPerm(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
      await interaction.reply(`✅ Removed ${user} from the ticket.`);
    },
  },

  // ══════════════════════════════════════════════════════════
  //  GIVEAWAYS
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('giveaway-start').setDescription('Start a standard giveaway')
      .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('e.g. 10m 1h 2d').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
      .addStringOption(o => o.setName('description').setDescription('Extra description'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, client) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const prize    = interaction.options.getString('prize');
      const ms       = parseDuration(interaction.options.getString('duration'));
      if (!ms) return interaction.reply({ content: '❌ Invalid duration. Use 10m, 2h, 1d.', flags: 64 });
      const winCount = interaction.options.getInteger('winners') ?? 1;
      const desc     = interaction.options.getString('description') ?? '';
      const id       = `${interaction.channel.id}-${Date.now()}`;
      const endsAt   = new Date(Date.now() + ms);
      const giveaway = { id, messageId: null, channelId: interaction.channel.id, guildId: interaction.guild.id, prize, description: desc, type: 'normal', winnersCount: winCount, hostedBy: interaction.user.id, endsAt: endsAt.toISOString(), entrants: new Set(), ended: false };
      const msg = await interaction.channel.send({ embeds: [buildGiveawayEmbed(giveaway)], components: [buildGiveawayRow(id)] });
      giveaway.messageId = msg.id;
      giveaways.set(id, giveaway);
      saveGiveaways();
      setTimeout(() => endGiveaway(id, client), ms);
      await interaction.reply({ content: `✅ Giveaway started in ${interaction.channel}!`, flags: 64 });
    },
  },

  {
    data: new SlashCommandBuilder().setName('giveaway-end').setDescription('End a giveaway early')
      .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction, client) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const g = giveaways.get(interaction.options.getString('id'));
      if (!g) return interaction.reply({ content: '❌ Not found.', flags: 64 });
      if (g.ended) return interaction.reply({ content: '❌ Already ended.', flags: 64 });
      await endGiveaway(g.id, client);
      await interaction.reply({ content: '✅ Ended!', flags: 64 });
    },
  },

  {
    data: new SlashCommandBuilder().setName('giveaway-reroll').setDescription('Reroll winners')
      .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('How many to reroll').setMinValue(1))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const g = giveaways.get(interaction.options.getString('id'));
      const count = interaction.options.getInteger('winners') ?? 1;
      if (!g) return interaction.reply({ content: '❌ Not found.', flags: 64 });
      if (!g.ended) return interaction.reply({ content: '❌ Still running.', flags: 64 });
      const pool = [...g.entrants];
      if (!pool.length) return interaction.reply({ content: '😔 No entrants.', flags: 64 });
      const winners = [];
      for (let i = 0; i < count && pool.length; i++)
        winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      await interaction.reply(`🎲 **Reroll!** New winner(s) for **${g.prize}**: ${winners.map(u => `<@${u}>`).join(', ')} 🎉`);
    },
  },

  {
    data: new SlashCommandBuilder().setName('giveaway-list').setDescription('List active giveaways')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const active = [...giveaways.values()].filter(g => g.guildId === interaction.guild.id && !g.ended);
      if (!active.length) return interaction.reply({ content: '📋 No active giveaways.', flags: 64 });
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎉 Active Giveaways').setColor(CONFIG.giveawayColor).setDescription(active.map(g => `**${g.prize}** [${g.type.toUpperCase()}]\nID: \`${g.id}\` | Entries: ${g.entrants.size} | Winners: ${g.winnersCount}\nEnds: <t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R>`).join('\n\n'))], flags: 64 });
    },
  },

  // ══════════════════════════════════════════════════════════
  //  ACCOUNT GIVEAWAYS
  // ══════════════════════════════════════════════════════════
  { data: new SlashCommandBuilder().setName('gsteam').setDescription('DMs you Steam account(s)').addIntegerOption(o => o.setName('count').setDescription('How many').setMinValue(1).setMaxValue(20)), async execute(i) { await sendAccountsToUser(i, 'steam'); } },
  { data: new SlashCommandBuilder().setName('gdiscord').setDescription('DMs you Discord account(s)').addIntegerOption(o => o.setName('count').setDescription('How many').setMinValue(1).setMaxValue(20)), async execute(i) { await sendAccountsToUser(i, 'discord'); } },
  { data: new SlashCommandBuilder().setName('gfivem').setDescription('DMs you FiveM account(s)').addIntegerOption(o => o.setName('count').setDescription('How many').setMinValue(1).setMaxValue(20)), async execute(i) { await sendAccountsToUser(i, 'fivem'); } },
  { data: new SlashCommandBuilder().setName('gbundle').setDescription('DMs you a bundle').addIntegerOption(o => o.setName('count').setDescription('How many').setMinValue(1).setMaxValue(20)), async execute(i) { await sendAccountsToUser(i, 'bundle'); } },

  {
    data: new SlashCommandBuilder().setName('accounts').setDescription('Manage account pools')
      .addSubcommand(s => s.setName('add').setDescription('Add accounts (one per line)').addStringOption(o => o.setName('type').setRequired(true).setDescription('Pool').addChoices({ name: '🎮 Steam', value: 'steam' }, { name: '💬 Discord', value: 'discord' }, { name: '🚗 FiveM', value: 'fivem' })).addStringOption(o => o.setName('accounts').setRequired(true).setDescription('One per line')))
      .addSubcommand(s => s.setName('list').setDescription('Show counts').addStringOption(o => o.setName('type').setDescription('Pool (blank = all)').addChoices({ name: '🎮 Steam', value: 'steam' }, { name: '💬 Discord', value: 'discord' }, { name: '🚗 FiveM', value: 'fivem' })))
      .addSubcommand(s => s.setName('clear').setDescription('Clear a pool').addStringOption(o => o.setName('type').setRequired(true).setDescription('Pool').addChoices({ name: '🎮 Steam', value: 'steam' }, { name: '💬 Discord', value: 'discord' }, { name: '🚗 FiveM', value: 'fivem' })))
      .addSubcommand(s => s.setName('peek').setDescription('Preview accounts').addStringOption(o => o.setName('type').setRequired(true).setDescription('Pool').addChoices({ name: '🎮 Steam', value: 'steam' }, { name: '💬 Discord', value: 'discord' }, { name: '🚗 FiveM', value: 'fivem' })).addIntegerOption(o => o.setName('count').setDescription('How many to preview').setMinValue(1).setMaxValue(25)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      if (!hasAccountGiveawayPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const sub = interaction.options.getSubcommand();
      const type = interaction.options.getString('type');

      if (sub === 'add') {
        const raw   = interaction.options.getString('accounts');
        const lines = parseAccountLines(raw);
        if (!lines.length) return interaction.reply({ content: '❌ No valid accounts found.', flags: 64 });
        addAccountsToPool(type, lines);
        return interaction.reply({ content: `✅ Added **${lines.length}** account(s) to **${type}** pool. Total: **${accountPools[type].length}**`, flags: 64 });
      }

      if (sub === 'list') {
        const types = type ? [type] : ['steam', 'discord', 'fivem'];
        const lines = types.map(t => `**${t}:** ${accountPools[t].length} account(s)`);
        return interaction.reply({ content: lines.join('\n'), flags: 64 });
      }

      if (sub === 'clear') {
        accountPools[type] = [];
        savePoolToDisk(type);
        return interaction.reply({ content: `✅ Cleared **${type}** pool.`, flags: 64 });
      }

      if (sub === 'peek') {
        const count   = interaction.options.getInteger('count') ?? 5;
        const preview = accountPools[type].slice(0, count);
        if (!preview.length) return interaction.reply({ content: `❌ **${type}** pool is empty.`, flags: 64 });
        return interaction.reply({ content: `**${type}** pool preview (${preview.length}/${accountPools[type].length}):\n\`\`\`\n${preview.join('\n')}\n\`\`\``, flags: 64 });
      }
    },
  },

  // ══════════════════════════════════════════════════════════
  //  WORD FILTER
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder().setName('wordfilter').setDescription('Manage word filter')
      .addSubcommand(s => s.setName('add').setDescription('Add a word').addStringOption(o => o.setName('word').setDescription('Word to blacklist').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a word').addStringOption(o => o.setName('word').setDescription('Word to remove').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('Show all blacklisted words'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') { const w = interaction.options.getString('word').toLowerCase(); if (CONFIG.blacklistedWords.includes(w)) return interaction.reply({ content: `⚠️ Already blacklisted.`, flags: 64 }); CONFIG.blacklistedWords.push(w); return interaction.reply({ content: `✅ Added \`${w}\`.`, flags: 64 }); }
      if (sub === 'remove') { const w = interaction.options.getString('word').toLowerCase(); const i = CONFIG.blacklistedWords.indexOf(w); if (i === -1) return interaction.reply({ content: `⚠️ Not blacklisted.`, flags: 64 }); CONFIG.blacklistedWords.splice(i, 1); return interaction.reply({ content: `✅ Removed \`${w}\`.`, flags: 64 }); }
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚫 Blacklisted Words').setColor(0xE74C3C).setDescription(CONFIG.blacklistedWords.length ? CONFIG.blacklistedWords.map(w => `\`${w}\``).join(', ') : 'None.')], flags: 64 });
    },
  },

  // ══════════════════════════════════════════════════════════
  //  MUSIC
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song — YouTube URL/search or Spotify track/playlist')
      .addStringOption(o => o.setName('query').setDescription('YouTube URL, search term, or Spotify URL').setRequired(true)),

    async execute(interaction, client) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const vc = interaction.member.voice.channel;
      if (!vc) return interaction.reply({ content: '❌ Join a voice channel first!', flags: 64 });

      await interaction.deferReply();
      const query = interaction.options.getString('query');
      const q     = getQueue(interaction.guild.id);

      let songs;
      try { songs = await resolveSongs(query, interaction.user.tag); }
      catch (e) { return interaction.editReply(`❌ ${e.message}`); }
      if (!songs.length) return interaction.editReply('❌ No playable results found.');

      const available = CONFIG.maxQueueSize - q.queue.length;
      if (available <= 0) return interaction.editReply(`❌ Queue is full (max ${CONFIG.maxQueueSize}).`);
      const toAdd = songs.slice(0, available);
      q.queue.push(...toAdd);

      const needsJoin = !q.connection || q.connection.state.status === VoiceConnectionStatus.Destroyed;
      if (needsJoin) {
        try {
          await createMusicPlayer(interaction.guild.id, vc, client);
          await playSong(interaction.guild.id, client);
        } catch (e) {
          console.error('[ERR]', e.message);
          return interaction.editReply(`❌ ${e.message}`);
        }
      } else if (!q.currentSong || q.player?.state?.status === AudioPlayerStatus.Idle) {
        await playSong(interaction.guild.id, client);
      }

      if (toAdd.length === 1) {
        const song = toAdd[0];
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(song.source === 'spotify' ? 0x1DB954 : 0xFF0000)
            .setTitle(needsJoin ? (song.source === 'spotify' ? '🎧 Now Playing' : '▶️ Now Playing') : (song.source === 'spotify' ? '🎧 Added to Queue' : '▶️ Added to Queue'))
            .setDescription(`**[${song.title}](${song.url})**`)
            .addFields({ name: '⏱️ Duration', value: song.duration || 'Unknown', inline: true }, { name: '📋 Queue', value: `${q.queue.length} song(s)`, inline: true }, { name: '👤 Requested by', value: song.requestedBy, inline: true })],
        });
      } else {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x1DB954)
            .setTitle(`📋 Added ${toAdd.length} Songs to Queue`)
            .setDescription(toAdd.slice(0, 10).map((s, i) => `**${i + 1}.** ${s.title}`).join('\n') + (toAdd.length > 10 ? `\n*...and ${toAdd.length - 10} more*` : ''))
            .setFooter({ text: `Queue: ${q.queue.length} total` })],
        });
      }
    },
  },

  { data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
    async execute(interaction, client) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const q = getQueue(interaction.guild.id);
      if (!q.player || !q.currentSong) return interaction.reply({ content: '❌ Nothing is playing.', flags: 64 });
      q.loop = false; q.player.stop();
      await interaction.reply('⏭️ Skipped!');
    },
  },

  { data: new SlashCommandBuilder().setName('stop').setDescription('Stop music and clear the queue'),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const q = getQueue(interaction.guild.id);
      q.queue = []; q.currentSong = null; q.loop = false;
      if (q.player) q.player.stop();
      getVoiceConnection(interaction.guild.id)?.destroy();
      musicQueues.delete(interaction.guild.id);
      await interaction.reply('⏹️ Stopped and queue cleared.');
    },
  },

  { data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current song'),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      getQueue(interaction.guild.id).player?.pause();
      await interaction.reply('⏸️ Paused.');
    },
  },

  { data: new SlashCommandBuilder().setName('resume').setDescription('Resume the paused song'),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      getQueue(interaction.guild.id).player?.unpause();
      await interaction.reply('▶️ Resumed.');
    },
  },

  { data: new SlashCommandBuilder().setName('queue').setDescription('Show the music queue'),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const q = getQueue(interaction.guild.id);
      if (!q.currentSong) return interaction.reply({ content: '📋 Queue is empty.', flags: 64 });
      const upcoming = q.queue.slice(0, 10).map((s, i) => `**${i + 1}.** ${s.title} \`${s.duration}\``).join('\n') || 'Nothing up next.';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎵 Music Queue').setColor(0x1DB954).addFields({ name: '▶️ Now Playing', value: `${q.currentSong.title} \`${q.currentSong.duration}\`` }, { name: `📋 Up Next (${q.queue.length})`, value: upcoming }).setFooter({ text: `Loop: ${q.loop ? 'ON' : 'OFF'}` })], flags: 64 });
    },
  },

  { data: new SlashCommandBuilder().setName('loop').setDescription('Toggle loop for the current song'),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const q = getQueue(interaction.guild.id); q.loop = !q.loop;
      await interaction.reply(`🔁 Loop is now **${q.loop ? 'ON' : 'OFF'}**.`);
    },
  },

  { data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the currently playing song'),
    async execute(interaction) {
      if (!hasCommandPerm(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      const q = getQueue(interaction.guild.id);
      if (!q.currentSong) return interaction.reply({ content: '❌ Nothing is playing.', flags: 64 });
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎵 Now Playing').setColor(0x1DB954).setDescription(`**[${q.currentSong.title}](${q.currentSong.url})**`).addFields({ name: '⏱️ Duration', value: q.currentSong.duration || 'Unknown', inline: true }, { name: '👤 Requested by', value: q.currentSong.requestedBy || 'Unknown', inline: true }, { name: '🔁 Loop', value: q.loop ? 'ON' : 'OFF', inline: true })] });
    },
  },

  // ══════════════════════════════════════════════════════════
  //  /embed
  // ══════════════════════════════════════════════════════════
  {
    data: new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Post a custom embed')
      .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
      .addStringOption(o => o.setName('color').setDescription('Hex color (e.g. FF0000 for red)').setRequired(false))
      .addStringOption(o => o.setName('image').setDescription('Image URL').setRequired(false))
      .addStringOption(o => o.setName('footer').setDescription('Footer text').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      if (!hasCommandPerm(interaction.member))
        return interaction.reply({ content: '❌ No permission to use this command.', flags: 64 });

      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('description');
      const colorStr = interaction.options.getString('color') || 'FF69B4';
      const imageUrl = interaction.options.getString('image');
      const footer = interaction.options.getString('footer');

      let colorInt = parseInt(colorStr.replace('#', ''), 16);
      if (isNaN(colorInt)) colorInt = 0xFF69B4;

      const embed = new EmbedBuilder()
        .setColor(colorInt)
        .setTitle(title)
        .setDescription(desc);

      if (imageUrl) embed.setImage(imageUrl);
      if (footer) embed.setFooter({ text: footer });
      embed.setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      return interaction.reply({ content: '✅ Embed posted!', flags: 64 });
    },
  },
];

// ============================================================
//  CLIENT SETUP
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

loadPoolsFromDisk();
loadTickets();
loadBlacklist();
loadKeyauthRedemptions();
loadVerifications();
loadWarnings();
loadEconomy();

client.once('clientReady', async () => {
  await initSpotify();
  loadGiveaways(client);
  console.log('=========================================');
  console.log(`[OK]  ${client.user.tag} online`);
  console.log(`[OK]  ${client.guilds.cache.size} server(s)`);
  console.log(`[OK]  Spotify: ${spotifyReady ? 'enabled' : 'disabled (no credentials)'}`);
  console.log('[OK]  Tickets | Giveaways | Music | Guards | Blacklist | KeyAuth');
  console.log('=========================================');
  client.guilds.cache.forEach(g => console.log(`  >> ${g.name} (${g.memberCount} members)`));
  client.user.setActivity('Native Menu Susano Api Powered');

  // Auto-save giveaways every 60 s
  setInterval(() => { try { saveGiveaways(); } catch {} }, 60_000);

  // KeyAuth expiry checker — runs every 5 minutes
  setInterval(() => keyauthExpiryCheck(client).catch(e => console.error('[ERR] keyauthExpiryCheck:', e.message)), 5 * 60_000);

  // Run once on startup to handle any expirations that occurred while bot was offline
  keyauthExpiryCheck(client).catch(() => {});
});

// ============================================================
//  MEMBER JOIN/LEAVE LOGGING
// ============================================================
const { Welcome, Leave } = require('canvafy');
const { AttachmentBuilder } = require('discord.js');

client.on('guildMemberAdd', async member => {
  if (!CONFIG.logChannelId && !CONFIG.welcome.channelId) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`${EMOJI.person} Member Joined`)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: `${EMOJI.person} Member`, value: `${member.user.tag}`, inline: true },
        { name: `${EMOJI.shield} ID`, value: member.user.id, inline: true },
        { name: `${EMOJI.clock} Account Created`, value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: `${EMOJI.people} Server Members`, value: `${member.guild.memberCount}`, inline: true },
      )
      .setTimestamp();
    await sendLog(member.guild, embed);

    if (CONFIG.welcome.channelId) {
      const welcomeChannel = member.guild.channels.cache.get(CONFIG.welcome.channelId);
      if (welcomeChannel) {
        const welcome = await new Welcome()
          .setAvatar(member.user.displayAvatarURL({ forceStatic: true, extension: 'png' }))
          .setBackground('image', CONFIG.welcome.backgroundUrl)
          .setTitle('Welcome')
          .setDescription(`Welcome to ${member.guild.name}!`)
          .setBorder('#2a2e35')
          .setAvatarBorder('#2a2e35')
          .setOverlayOpacity(0.3)
          .build();

        const attachment = new AttachmentBuilder(welcome, { name: `welcome-${member.id}.png` });
        await welcomeChannel.send({ content: `Welcome to the server, ${member}!`, files: [attachment] });
      }
    }
  } catch (e) {
    console.error('[ERR] guildMemberAdd:', e.message);
  }
});

client.on('guildMemberRemove', async member => {
  if (!CONFIG.logChannelId && !CONFIG.welcome.channelId) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle(`${EMOJI.ban} Member Left`)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: `${EMOJI.person} Member`, value: `${member.user.tag}`, inline: true },
        { name: `${EMOJI.shield} ID`, value: member.user.id, inline: true },
        { name: `${EMOJI.clock} Joined At`, value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
        { name: `${EMOJI.people} Server Members`, value: `${member.guild.memberCount}`, inline: true },
      )
      .setTimestamp();
    await sendLog(member.guild, embed);

    if (CONFIG.welcome.channelId) {
      const welcomeChannel = member.guild.channels.cache.get(CONFIG.welcome.channelId);
      if (welcomeChannel) {
        const leave = await new Leave()
          .setAvatar(member.user.displayAvatarURL({ forceStatic: true, extension: 'png' }))
          .setBackground('image', CONFIG.welcome.backgroundUrl)
          .setTitle('Goodbye')
          .setDescription(`Sad to see you go!`)
          .setBorder('#2a2e35')
          .setAvatarBorder('#2a2e35')
          .setOverlayOpacity(0.3)
          .build();

        const attachment = new AttachmentBuilder(leave, { name: `leave-${member.id}.png` });
        await welcomeChannel.send({ content: `Goodbye, **${member.user.tag}**.`, files: [attachment] });
      }
    }
  } catch (e) {
    console.error('[ERR] guildMemberRemove:', e.message);
  }
});

// ============================================================
//  HTTP API SERVER (FOR FIVEM LICENSE VERIFICATION)
// ============================================================
const app = express();
app.use(express.json());
const API_PORT = process.env.API_PORT || 3000;

// ── OAuth2 Endpoints ──────────────────────────────────────
/**
 * POST /api/auth/start
 * Initiates Discord OAuth2 flow
 * Returns: { success: bool, authUrl: string, state: string, sessionId: string }
 */
app.post('/api/auth/start', (req, res) => {
  try {
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const sessionId = state;

    const authUrl = `https://discord.com/api/oauth2/authorize?` +
      `client_id=${CONFIG.clientId}` +
      `&redirect_uri=${encodeURIComponent(CONFIG.oauth2.redirectUri)}` +
      `&response_type=code` +
      `&scope=identify+email` +
      `&state=${state}`;

    // Store session (expires in 15 minutes)
    oauth2Sessions.set(state, {
      sessionId: sessionId,
      createdAt: Date.now(),
      authorized: false,
      discordId: null,
      expiresAt: Date.now() + 15 * 60 * 1000
    });

    res.json({
      success: true,
      authUrl: authUrl,
      state: state,
      sessionId: sessionId
    });

    console.log(`[OAuth2] Started authorization flow: state=${state}`);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/auth/check/:state
 * Checks if user has authorized the OAuth2 request
 * Returns: { success: bool, authorized: bool, validityDays: int, isLifetime: bool }
 */
app.get('/api/auth/check/:state', (req, res) => {
  try {
    const state = req.params.state;
    const session = oauth2Sessions.get(state);

    if (!session) {
      return res.json({
        success: false,
        authorized: false,
        message: "Invalid or expired state"
      });
    }

    if (!session.authorized) {
      return res.json({
        success: true,
        authorized: false,
        message: "Awaiting authorization"
      });
    }

    // Get license info from redemptions (if user redeemed a key via /redeem)
    const licenseInfo = keyauthRedemptions.size > 0 
      ? Array.from(keyauthRedemptions.values()).find(r => r.userId === session.discordId)
      : null;

    const validityDays = licenseInfo?.expiresAt 
      ? Math.ceil((new Date(licenseInfo.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24))
      : 999999;

    res.json({
      success: true,
      authorized: true,
      validityDays: Math.max(0, validityDays),
      isLifetime: !licenseInfo?.expiresAt || licenseInfo.isLifetime
    });

    console.log(`[OAuth2] Authorization check passed: state=${state}, discordId=${session.discordId}`);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/auth/callback
 * Discord OAuth2 callback endpoint
 */
app.get('/api/auth/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;

    if (!code || !state) {
      return res.send('<h1>❌ Authorization Failed</h1><p>Missing code or state parameter</p>');
    }

    const session = oauth2Sessions.get(state);
    if (!session) {
      return res.send('<h1>❌ Authorization Failed</h1><p>Invalid or expired state</p>');
    }

    // Exchange code for access token (Discord requires form-urlencoded data)
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.append('client_id', CONFIG.clientId);
    urlSearchParams.append('client_secret', CONFIG.oauth2.clientSecret);
    urlSearchParams.append('code', code);
    urlSearchParams.append('grant_type', 'authorization_code');
    urlSearchParams.append('redirect_uri', CONFIG.oauth2.redirectUri);
    urlSearchParams.append('scope', 'identify email');

    const tokenResponse = await axios.post('https://discord.com/api/v10/oauth2/token', urlSearchParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const accessToken = tokenResponse.data.access_token;

    // Get user info
    const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const discordId = userResponse.data.id;
    const username = userResponse.data.username;

    // Mark session as authorized
    session.authorized = true;
    session.discordId = discordId;

    console.log(`[OAuth2] Authorization successful: discordId=${discordId}, username=${username}`);

    // Return success page
    res.send(`
      <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { text-align: center; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
          h1 { color: #2ecc71; margin: 0; }
          p { color: #555; margin: 10px 0 0 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Authorization Successful!</h1>
          <p>Welcome, <strong>${username}</strong>!</p>
          <p>You can close this window and return to the menu.</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('[OAuth2] Error during authorization:', error.message);
    res.send(`
      <html>
      <head>
        <title>Authorization Failed</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { text-align: center; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
          h1 { color: #e74c3c; margin: 0; }
          p { color: #555; margin: 10px 0 0 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Authorization Failed</h1>
          <p>Error: ${error.message}</p>
          <p>Please try again.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// ── Legacy Endpoints (for backward compatibility) ────────

// Generate verification code
app.post('/api/generate-code', (req, res) => {
  try {
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minute expiration
    
    verificationCodes.set(code, {
      code,
      discordId: null,
      username: null,
      verifiedAt: null,
      expiresAt: expiresAt.toISOString(),
      licenseKey: req.body.licenseKey || null,
    });
    saveVerifications();
    
    res.json({
      success: true,
      code,
      expiresAt,
      discordInvite: process.env.DISCORD_INVITE_URL || 'https://discord.gg/yourinvite',
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Check verification status
app.get('/api/check-verification/:code', (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const verification = verificationCodes.get(code);
    
    if (!verification) {
      return res.json({
        success: false,
        verified: false,
        message: 'Code not found or expired',
      });
    }
    
    // Check if verified
    if (!verification.discordId) {
      return res.json({
        success: true,
        verified: false,
        message: 'Awaiting verification in Discord',
        expiresAt: verification.expiresAt,
      });
    }
    
    // Get license validity info
    const licenseKey = verification.licenseKey;
    const redemption = licenseKey ? keyauthRedemptions.get(licenseKey) : null;
    
    let validityDays = -1;
    let expiresAt = null;
    let isLifetime = false;
    
    if (redemption && redemption.expiresAt) {
      const expireDate = new Date(redemption.expiresAt);
      const now = new Date();
      validityDays = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
      expiresAt = expireDate.toISOString();
    } else if (redemption) {
      isLifetime = true;
      validityDays = 999999;
    }
    
    return res.json({
      success: true,
      verified: true,
      discordUser: verification.username,
      discordId: verification.discordId,
      validityDays: Math.max(0, validityDays),
      isLifetime,
      expiresAt,
      verifiedAt: verification.verifiedAt,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Web Dashboard ─────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const stats = {
    servers: client.guilds.cache.size,
    users: client.users.cache.size,
    giveaways: giveaways.size,
    activeTickets: activeTickets.size,
    blacklisted: blacklistMap.size,
    keyauthRedemptions: keyauthRedemptions.size,
    uptime: client.uptime,
    steamAccounts: accountPools.steam.length,
    discordAccounts: accountPools.discord.length,
    fivemAccounts: accountPools.fivem.length,
  };
  res.json(stats);
});

app.get('/api/config', (req, res) => {
  res.json({
    logChannelId: CONFIG.logChannelId,
    giveawayColor: CONFIG.giveawayColor.toString(16),
    giveawayBotName: CONFIG.giveawayBotName,
    blacklistedWords: CONFIG.blacklistedWords,
    spotify: CONFIG.spotify,
    ticket: CONFIG.ticket,
    blacklist: CONFIG.blacklist,
    keyauth: CONFIG.keyauth,
    oauth2: CONFIG.oauth2,
    allowedLinkRoles: CONFIG.allowedLinkRoles,
    wordFilterExemptRoles: CONFIG.wordFilterExemptRoles,
  });
});

app.post('/api/config/update', (req, res) => {
  try {
    const { key, value } = req.body;
    const keys = key.split('.');
    let target = CONFIG;
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
    res.json({ success: true, message: 'Config updated!' });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/blacklist-words/add', (req, res) => {
  try {
    const { word } = req.body;
    if (!word) return res.json({ success: false, error: 'Word is required' });
    if (!CONFIG.blacklistedWords.includes(word)) {
      CONFIG.blacklistedWords.push(word);
    }
    res.json({ success: true, words: CONFIG.blacklistedWords });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/blacklist-words/remove', (req, res) => {
  try {
    const { word } = req.body;
    CONFIG.blacklistedWords = CONFIG.blacklistedWords.filter(w => w !== word);
    res.json({ success: true, words: CONFIG.blacklistedWords });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ── FULL INTERACTIVE DASHBOARD (Tickets + Blacklist + Giveaways Live) ───────────────────────
app.get('/', (req, res) => {
  const stats = {
    servers: client.guilds.cache.size,
    users: client.users.cache.size,
    giveaways: giveaways.size,
    activeTickets: activeTickets.size,
    blacklisted: blacklistMap.size,
    keyauthRedemptions: keyauthRedemptions.size,
    uptime: client.uptime || 0,
    steamAccounts: accountPools.steam.length,
    discordAccounts: accountPools.discord.length,
    fivemAccounts: accountPools.fivem.length,
  };

  // Prepare data for tickets, blacklist, giveaways
  const activeGiveawaysData = [...giveaways.values()]
    .filter(g => !g.ended)
    .map(g => ({
      id: g.id,
      prize: g.prize,
      type: g.type,
      entrants: g.entrants.size,
      endsAt: g.endsAt
    }));

  const activeTicketsData = [...activeTickets.values()].map(t => ({
    channelId: t.channelId || 'Unknown',
    user: t.username,
    opened: t.createdAt
  }));

  const blacklistData = [...blacklistMap.values()].map(b => ({
    userId: b.userId,
    username: b.username,
    reason: b.reason,
    addedAt: b.addedAt
  }));

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susano Bot • Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body { font-family: 'Inter', system-ui, sans-serif; }
    .glass { background: rgba(255,255,255,0.06); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); }
    .card-hover:hover { transform: translateY(-8px); box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.4); }
    .nav-link { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .nav-link:hover, .nav-link.active { background: rgba(99, 102, 241, 0.25); color: #c4d0ff; border-left: 4px solid #6366f1; }
    .stat-value { font-size: 2.75rem; font-weight: 700; background: linear-gradient(90deg, #a5b4fc, #e0e7ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  </style>
</head>
<body class="bg-gradient-to-br from-[#0a0a14] via-[#111827] to-[#1e2937] text-slate-200 min-h-screen">
  <div class="flex min-h-screen">
    <!-- Sidebar -->
    <div class="w-72 glass border-r border-white/10 h-screen fixed overflow-y-auto">
      <div class="p-8">
        <div class="flex items-center gap-4 mb-12">
          <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl flex items-center justify-center text-4xl shadow-xl">🛡️</div>
          <div>
            <h1 class="text-3xl font-bold tracking-tighter">Susano Bot</h1>
            <p class="text-indigo-400 text-sm">Native Menu • Powered</p>
          </div>
        </div>
        <nav class="space-y-2">
          <a href="#" onclick="switchTab(0)" class="nav-link flex items-center gap-3 px-6 py-4 rounded-2xl font-medium active"><i class="fas fa-tachometer-alt w-6"></i> Overview</a>
          <a href="#" onclick="switchTab(1)" class="nav-link flex items-center gap-3 px-6 py-4 rounded-2xl font-medium"><i class="fas fa-cogs w-6"></i> General</a>
          <a href="#" onclick="switchTab(2)" class="nav-link flex items-center gap-3 px-6 py-4 rounded-2xl font-medium"><i class="fas fa-shield-alt w-6"></i> Security</a>
          <a href="#" onclick="switchTab(3)" class="nav-link flex items-center gap-3 px-6 py-4 rounded-2xl font-medium"><i class="fas fa-ticket w-6"></i> Tickets</a>
          <a href="#" onclick="switchTab(4)" class="nav-link flex items-center gap-3 px-6 py-4 rounded-2xl font-medium"><i class="fas fa-gift w-6"></i> Giveaways</a>
          <a href="#" onclick="switchTab(5)" class="nav-link flex items-center gap-3 px-6 py-4 rounded-2xl font-medium"><i class="fas fa-ban w-6"></i> Blacklist</a>
        </nav>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 ml-72">
      <header class="glass border-b border-white/10 px-10 py-6 flex justify-between items-center sticky top-0 z-50">
        <h2 class="text-4xl font-semibold tracking-tight" id="pageTitle">Overview</h2>
        <div class="flex items-center gap-6">
          <div class="bg-emerald-500/20 text-emerald-400 px-5 py-2 rounded-3xl flex items-center gap-3">
            <div class="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div> ONLINE
          </div>
          <span id="lastUpdate" class="text-slate-400"></span>
        </div>
      </header>

      <div class="p-10 max-w-7xl mx-auto space-y-12">

        <!-- OVERVIEW -->
        <div id="tab-0" class="tab-content">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-6" id="statsGrid"></div>
        </div>

        <!-- SECURITY -->
        <div id="tab-2" class="tab-content hidden">
          <div class="glass rounded-3xl p-10">
            <h3 class="text-2xl font-bold mb-8">Security & Protection</h3>
            <div class="mb-12">
              <h4 class="font-semibold mb-4">Word Filter</h4>
              <div class="flex gap-3 mb-6">
                <input id="newWord" placeholder="Add word or phrase" class="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-5">
                <button onclick="addBlacklistWord()" class="bg-indigo-600 px-10 rounded-2xl">Add</button>
              </div>
              <div id="wordsList" class="grid grid-cols-3 gap-3"></div>
            </div>
          </div>
        </div>

        <!-- TICKETS -->
        <div id="tab-3" class="tab-content hidden">
          <div class="glass rounded-3xl p-10">
            <h3 class="text-2xl font-bold mb-6">Active Tickets (${activeTicketsData.length})</h3>
            <div class="space-y-4" id="ticketsList">
              ${activeTicketsData.length ? activeTicketsData.map(t => `
                <div class="glass p-5 rounded-2xl flex justify-between items-center">
                  <div>
                    <strong>${t.user}</strong><br>
                    <small class="text-slate-400">#${t.channelId}</small>
                  </div>
                  <div class="text-right text-sm text-slate-400">
                    Opened: ${new Date(t.opened).toLocaleDateString()}
                  </div>
                </div>
              `).join('') : '<p class="text-slate-400">No active tickets.</p>'}
            </div>
          </div>
        </div>

        <!-- GIVEAWAYS -->
        <div id="tab-4" class="tab-content hidden">
          <div class="glass rounded-3xl p-10">
            <h3 class="text-2xl font-bold mb-6">Active Giveaways (${activeGiveawaysData.length})</h3>
            <div class="space-y-4" id="giveawaysList">
              ${activeGiveawaysData.length ? activeGiveawaysData.map(g => `
                <div class="glass p-5 rounded-2xl">
                  <div class="flex justify-between">
                    <div><strong>${g.prize}</strong> <span class="text-indigo-400">(${g.type})</span></div>
                    <div class="text-sm text-slate-400">${g.entrants} entrants</div>
                  </div>
                  <small class="text-slate-400">Ends: ${new Date(g.endsAt).toLocaleString()}</small>
                </div>
              `).join('') : '<p class="text-slate-400">No active giveaways.</p>'}
            </div>
          </div>
        </div>

        <!-- BLACKLIST -->
        <div id="tab-5" class="tab-content hidden">
          <div class="glass rounded-3xl p-10">
            <h3 class="text-2xl font-bold mb-6">Blacklisted Users (${blacklistData.length})</h3>
            <div class="space-y-4" id="blacklistList">
              ${blacklistData.length ? blacklistData.map(b => `
                <div class="glass p-5 rounded-2xl">
                  <strong>${b.username}</strong><br>
                  <small class="text-red-400">${b.reason}</small>
                </div>
              `).join('') : '<p class="text-slate-400">No blacklisted users.</p>'}
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <script>
    let currentStats = ${JSON.stringify(stats)};

    function renderStats() {
      const html = \`
        <div class="glass rounded-3xl p-8 card-hover"><div class="flex justify-between"><div><p class="text-slate-400">Servers</p><p class="stat-value">\${currentStats.servers}</p></div><i class="fas fa-server text-6xl text-indigo-400/30"></i></div></div>
        <div class="glass rounded-3xl p-8 card-hover"><div class="flex justify-between"><div><p class="text-slate-400">Users</p><p class="stat-value">\${currentStats.users.toLocaleString()}</p></div><i class="fas fa-users text-6xl text-purple-400/30"></i></div></div>
        <div class="glass rounded-3xl p-8 card-hover"><div class="flex justify-between"><div><p class="text-slate-400">Uptime</p><p class="stat-value">\${formatUptime(currentStats.uptime)}</p></div><i class="fas fa-clock text-6xl text-emerald-400/30"></i></div></div>
        <div class="glass rounded-3xl p-8 card-hover"><div class="flex justify-between"><div><p class="text-slate-400">Blacklisted</p><p class="stat-value text-red-400">\${currentStats.blacklisted}</p></div><i class="fas fa-ban text-6xl text-red-400/30"></i></div></div>
      \`;
      document.getElementById('statsGrid').innerHTML = html;
    }

    function formatUptime(ms) {
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      return d ? \`\${d}d \${h}h\` : \`\${h}h\`;
    }

    async function refreshStats() {
      try {
        const res = await fetch('/api/stats');
        currentStats = await res.json();
        renderStats();
      } catch(e) {}
    }

    function switchTab(n) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.getElementById('tab-' + n).classList.remove('hidden');
      const titles = ['Overview','General','Security','Tickets','Giveaways','Blacklist','KeyAuth','Accounts'];
      document.getElementById('pageTitle').textContent = titles[n];
    }

    // Word Filter functions
    async function addBlacklistWord() {
      const word = document.getElementById('newWord').value.trim();
      if (!word) return;
      await fetch('/api/blacklist-words/add', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({word})});
      loadWords();
      document.getElementById('newWord').value = '';
    }

    async function loadWords() {
      const res = await fetch('/api/config');
      const data = await res.json();
      const container = document.getElementById('wordsList');
      container.innerHTML = data.blacklistedWords.map(w => 
        \`<div class="bg-white/5 px-5 py-4 rounded-2xl flex justify-between"><span>\${w}</span><button onclick="removeWord('\${w}')" class="text-red-400 text-xl">×</button></div>\`
      ).join('');
    }

    async function removeWord(word) {
      await fetch('/api/blacklist-words/remove', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({word})});
      loadWords();
    }

    // Init
    renderStats();
    loadWords();
    setInterval(refreshStats, 7000);
    setInterval(() => document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString(), 10000);
  </script>
</body>
</html>`;

  res.send(html);
});

function formatUptime(ms) {
  if (!ms) return 'Just started';
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

app.listen(API_PORT, () => {
  console.log(`[HTTP] API server listening on port ${API_PORT}`);
  console.log(`[HTTP] Dashboard available at http://localhost:${API_PORT}`);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`[!]   ${signal} received — saving data...`);
  try { saveGiveaways(); }             catch {}
  try { saveTickets(); }               catch {}
  try { saveBlacklist(); }             catch {}
  try { saveKeyauthRedemptions(); }    catch {}
  try { saveVerifications(); }         catch {}
  for (const type of ['steam', 'discord', 'fivem']) { try { savePoolToDisk(type); } catch {} }
  process.exit(0);
}
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', err => {
  console.error('[FATAL]', err);
  try { saveGiveaways(); }          catch {}
  try { saveTickets(); }            catch {}
  try { saveBlacklist(); }          catch {}
  try { saveKeyauthRedemptions(); } catch {}
  try { saveVerifications(); }      catch {}
});

// ============================================================
//  INTERACTIONS
// ============================================================
client.on('interactionCreate', async interaction => {

  // Giveaway button
  if (interaction.isButton() && interaction.customId.startsWith('giveaway_enter:')) {
    const id = interaction.customId.split(':')[1];
    const g  = giveaways.get(id);
    if (!g || g.ended) return interaction.reply({ content: '❌ This giveaway has ended.', flags: 64 });
    if (g.entrants.has(interaction.user.id)) { g.entrants.delete(interaction.user.id); await interaction.reply({ content: '🚪 You left the giveaway.', flags: 64 }); }
    else { g.entrants.add(interaction.user.id); await interaction.reply({ content: '✅ You entered! Good luck 🎉', flags: 64 }); }
    saveGiveaways();
    await interaction.message.edit({ embeds: [buildGiveawayEmbed(g)], components: [buildGiveawayRow(id)] }).catch(() => {});
    return;
  }

  // Ticket create button
  if (interaction.isButton() && interaction.customId === 'ticket_create') {
    await interaction.deferReply({ flags: 64 });
    await openTicket(interaction.guild, interaction.user, interaction.member, msg => interaction.editReply(msg));
    return;
  }

  // Ticket close button
  if (interaction.isButton() && interaction.customId === 'ticket_close') {
    const ticket = activeTickets.get(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Not a ticket channel.', flags: 64 });
    if (!hasTicketPerm(interaction.member) && interaction.user.id !== ticket.userId)
      return interaction.reply({ content: '❌ Only the ticket owner or staff can close this.', flags: 64 });
    await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
    await closeTicket(interaction.channel, interaction.user, interaction.guild);
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.find(c => c.data.name === interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction, client);
  } catch (err) {
    console.error(`[ERR] /${interaction.commandName}:`, err);
    const r = { content: `❌ Error: \`${err.message}\``, flags: 64 };
    if (interaction.replied || interaction.deferred) interaction.followUp(r);
    else interaction.reply(r);
  }
});

// ============================================================
//  MESSAGE GUARD & XP SYSTEM
// ============================================================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const member = message.member;
  if (!member) return;
  const content = message.content;

  // ── XP System ───────────────────────────────────────────────
  const profile = economyMap.get(message.author.id) || { balance: 0, xp: 0, level: 0, lastXp: 0, lastDaily: 0 };
  const now = Date.now();
  if (now - profile.lastXp > CONFIG.economy.xpCooldownMs) {
    const { min, max } = CONFIG.economy.xpPerMessage;
    const xpEarned = Math.floor(Math.random() * (max - min + 1)) + min;
    profile.xp += xpEarned;
    profile.lastXp = now;

    const nextLevelXp = (profile.level + 1) * 100;
    if (profile.xp >= nextLevelXp) {
      profile.xp -= nextLevelXp;
      profile.level += 1;
      try {
        await message.channel.send(`${EMOJI.tada} Congratulations ${message.author}, you leveled up to **Level ${profile.level}**!`);
      } catch (e) {}
    }
    economyMap.set(message.author.id, profile);
    saveEconomy(); // Consider debouncing in a production env
  }

  // Word filter
  if (!hasWordFilterExempt(member) && CONFIG.blacklistedWords.length) {
    const matched = CONFIG.blacklistedWords.find(w => content.toLowerCase().includes(w));
    if (matched) {
      try { await message.delete(); } catch {}
      try { await message.author.send(`⚠️ Your message in **${message.guild.name}** was deleted — blacklisted word.`); } catch {}
      await sendLog(message.guild, new EmbedBuilder().setTitle('🚫 Blacklisted Word').setColor(0xE74C3C).addFields({ name: '👤 User', value: `${message.author} (${message.author.tag})`, inline: true }, { name: '📌 Channel', value: `${message.channel}`, inline: true }, { name: '🚫 Word', value: `\`${matched}\``, inline: true }, { name: 'Message', value: content.slice(0, 1024) }).setTimestamp().setFooter({ text: 'Word Filter' }));
      return;
    }
  }

  // Mention guard
  if ((message.mentions.everyone || message.mentions.roles.size > 0) && !hasMentionPerm(member)) {
    try { await message.delete(); } catch {}
    let timedOut = false;
    try { await member.timeout(CONFIG.mentionTimeoutMinutes * 60_000, 'Unauthorised mass mention'); timedOut = true; } catch {}
    try { await message.author.send(`⚠️ Mass mentions not allowed in **${message.guild.name}**.${timedOut ? ` Timed out for ${CONFIG.mentionTimeoutMinutes} min.` : ''}`); } catch {}
    await sendLog(message.guild, new EmbedBuilder().setTitle('📣 Unauthorised Mention').setColor(0x9B59B6).addFields({ name: '👤 User', value: `${message.author} (${message.author.tag})`, inline: true }, { name: '📌 Channel', value: `${message.channel}`, inline: true }, { name: 'Message', value: content.slice(0, 1024) }, { name: '⏱️ Timeout', value: timedOut ? `${CONFIG.mentionTimeoutMinutes} min` : 'No', inline: true }).setTimestamp().setFooter({ text: 'Mention Guard' }));
    return;
  }

  // Link guard
  LINK_RE.lastIndex = 0;
  if (LINK_RE.test(content) && !hasLinkPerm(member)) {
    try { await message.delete(); } catch {}
    let timedOut = false;
    try { await member.timeout(CONFIG.timeoutDurationMinutes * 60_000, 'Unauthorised link'); timedOut = true; } catch {}
    try { await message.author.send(`⚠️ Links not allowed in **${message.guild.name}**.${timedOut ? ` Timed out for ${CONFIG.timeoutDurationMinutes} min.` : ''}`); } catch {}
    await sendLog(message.guild, new EmbedBuilder().setTitle('🔗 Unauthorised Link').setColor(0xE67E22).addFields({ name: '👤 User', value: `${message.author} (${message.author.tag})`, inline: true }, { name: '📌 Channel', value: `${message.channel}`, inline: true }, { name: 'Message', value: content.slice(0, 1024) }, { name: '⏱️ Timeout', value: timedOut ? `${CONFIG.timeoutDurationMinutes} min` : 'No', inline: true }).setTimestamp().setFooter({ text: 'Link Guard' }));
  }
});

// ============================================================
//  DEPLOY  →  node bot.js --deploy
// ============================================================
if (process.argv.includes('--deploy')) {
  (async () => {
    const rest = new REST({ version: '10' }).setToken(CONFIG.token);
    console.log('[...] Registering slash commands...');
    await rest.put(Routes.applicationCommands(CONFIG.clientId), { body: commands.map(c => c.data.toJSON()) });
    console.log('[OK]  Commands registered! Run: node bot.js');
    process.exit(0);
  })();
} else {
  client.login(CONFIG.token);
}