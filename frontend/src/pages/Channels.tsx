import { useState, useEffect, useCallback, useRef } from 'react'
import {
  RefreshCw,
  Trash2,
  AlertCircle,
  Settings,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Save,
  CheckCircle,
  Smartphone,
  PlugZap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type {
  ChannelsStatusResult,
  ChannelAccountSnapshot,
} from '../lib/api'
import {
  getChannelsStatus,
  getConfiguredChannels,
  getChannelConfig,
  saveChannelConfig,
  deleteChannelConfig,
  getAccessToken,
  listPlugins,
} from '../lib/api'

// Static channel catalog — only real OpenClaw-supported channels
const CHANNEL_CATALOG: Array<{ id: string; label: string; description: string; icon: string }> = [
  { id: 'weixin', label: 'WeChat', description: 'Liaison par QR code via le plugin openclaw-weixin ; un QR code s\'affiche à la première connexion', icon: '🟩' },
  { id: 'telegram', label: 'Telegram', description: 'Intégration via un bot Telegram', icon: '✈️' },
  { id: 'discord', label: 'Discord', description: 'Intégration via un bot Discord', icon: '🎮' },
  { id: 'whatsapp', label: 'WhatsApp', description: 'Intégration via WhatsApp Web (Baileys)', icon: '📱' },
  { id: 'slack', label: 'Slack', description: 'Intégration de l\'espace de travail via un bot Slack', icon: '💜' },
  { id: 'signal', label: 'Signal', description: 'Intégration via le démon signal-cli', icon: '🔒' },
  { id: 'imessage', label: 'iMessage', description: 'Intégration via iMessage sur macOS', icon: '💬' },
  { id: 'web', label: 'Web', description: 'Boîte de dialogue web intégrée', icon: '🌐' },
  { id: 'googlechat', label: 'Google Chat', description: 'Intégration via l\'API Google Chat', icon: '💚' },
  { id: 'msteams', label: 'Microsoft Teams', description: 'Accès à Teams via Azure Bot', icon: '🟦' },
  { id: 'feishu', label: 'Feishu / Lark', description: 'Intégration via le robot Feishu/Lark', icon: '📘' },
  { id: 'matrix', label: 'Matrix', description: 'Intégration du protocole Matrix (avec E2EE)', icon: '🔷' },
  { id: 'mattermost', label: 'Mattermost', description: 'Intégration via un bot Mattermost', icon: '🔵' },
  { id: 'irc', label: 'IRC', description: 'Intégration via le protocole IRC', icon: '📡' },
  { id: 'nostr', label: 'Nostr', description: 'Intégration du protocole décentralisé Nostr', icon: '🟣' },
  { id: 'bluebubbles', label: 'BlueBubbles', description: 'Accès iMessage via BlueBubbles', icon: '🫧' },
  { id: 'twitch', label: 'Twitch', description: 'Intégration du chat live via Twitch IRC', icon: '💜' },
  { id: 'nextcloud-talk', label: 'Nextcloud Talk', description: 'Intégration via le bot Nextcloud Talk', icon: '☁️' },
  { id: 'synology-chat', label: 'Synology Chat', description: 'Intégration via le bot Synology Chat', icon: '🟢' },
  { id: 'zalo', label: 'Zalo', description: 'Intégration via l\'API Zalo OA', icon: '🔵' },
  { id: 'qqbot', label: 'QQ', description: 'Intégration via un bot QQ (nécessite le plugin QQBot)', icon: '🐧' },
  { id: 'wecom', label: 'WeCom (WeChat Entreprise)', description: 'Intégration via WebSocket du bot IA WeCom (nécessite le plugin WeCom)', icon: '💼' },
  { id: 'dingtalk', label: 'DingTalk', description: 'Intégration via le robot entreprise DingTalk (nécessite le plugin DingTalk)', icon: '💙' },
]

const CHANNEL_ICONS: Record<string, string> = Object.fromEntries(
  CHANNEL_CATALOG.map((ch) => [ch.id, ch.icon]),
)

const WEIXIN_CHANNEL_ID = 'weixin'
const WEIXIN_PLUGIN_NAME = 'openclaw-weixin'
const WEIXIN_LOGIN_COMMAND = `openclaw channels login --channel ${WEIXIN_PLUGIN_NAME}`

function base64UrlDecode(value: string): string {
  const base = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base.length % 4 === 0 ? '' : '='.repeat(4 - (base.length % 4))
  return atob(base + pad)
}

function getTokenSubject(token: string): string {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return 'anonymous'
    const payload = JSON.parse(base64UrlDecode(parts[1]))
    const sub = String(payload?.sub ?? '').trim()
    return sub || 'anonymous'
  } catch {
    return 'anonymous'
  }
}

function getWeixinTerminalSessionKey(token: string, attempt: number): string {
  return `weixin-login:${window.location.host}:${getTokenSubject(token)}:${attempt}`
}

// DM policy options shared across channels
const DM_POLICY_OPTIONS = [
  { value: 'pairing', label: 'pairing — vérification d\'appairage requise' },
  { value: 'allowlist', label: 'allowlist — utilisateurs en liste blanche uniquement' },
  { value: 'open', label: 'open — accessible à tous' },
  { value: 'disabled', label: 'disabled — messages privés désactivés' },
]

const GROUP_POLICY_OPTIONS = [
  { value: 'open', label: 'open — tous les groupes' },
  { value: 'allowlist', label: 'allowlist — groupes en liste blanche uniquement' },
  { value: 'disabled', label: 'disabled — discussions de groupe désactivées' },
]

const STREAMING_OPTIONS = [
  { value: '', label: '(Par défaut)' },
  { value: 'off', label: 'off — streaming désactivé' },
  { value: 'partial', label: 'partial — streaming partiel' },
  { value: 'block', label: 'block — streaming par blocs' },
  { value: 'progress', label: 'progress — indicateur de progression' },
]

type FieldType = 'text' | 'password' | 'boolean' | 'select' | 'textarea' | 'number'

interface ChannelField {
  key: string
  label: string
  type: FieldType
  hint?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
}

// Channel config fields based on actual OpenClaw source (types.*.ts)
const CHANNEL_CONFIG_FIELDS: Record<string, ChannelField[]> = {
  telegram: [
    { key: 'botToken', label: 'Bot Token', type: 'password', required: true, hint: 'Token du bot obtenu auprès de @BotFather' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS, hint: 'Contrôle qui peut discuter en privé avec le bot' },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs Telegram (numériques) séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'groupAllowFrom', label: 'Groupes autorisés', type: 'text', hint: 'IDs de groupes séparés par des virgules' },
    { key: 'streaming', label: 'Sortie en streaming', type: 'select', options: STREAMING_OPTIONS },
  ],
  discord: [
    { key: 'token', label: 'Bot Token', type: 'password', required: true, hint: 'Token du bot depuis le Discord Developer Portal' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs Discord séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'streaming', label: 'Sortie en streaming', type: 'select', options: STREAMING_OPTIONS },
    { key: 'ackReaction', label: 'Emoji d\'accusé de réception', type: 'text', hint: 'Emoji renvoyé à la réception d\'un message, ex. 👀' },
  ],
  slack: [
    { key: 'botToken', label: 'Bot Token', type: 'password', required: true, hint: 'Token du bot au format xoxb-...' },
    { key: 'appToken', label: 'App Token', type: 'password', required: true, hint: 'Format xapp-... (nécessaire pour le Socket Mode)' },
    { key: 'mode', label: 'Mode de connexion', type: 'select', options: [
      { value: 'socket', label: 'socket — Socket Mode (recommandé)' },
      { value: 'http', label: 'http — Webhook HTTP' },
    ] },
    { key: 'signingSecret', label: 'Signing Secret', type: 'password', hint: 'Requis en mode HTTP' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs Slack séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'streaming', label: 'Sortie en streaming', type: 'select', options: STREAMING_OPTIONS },
  ],
  whatsapp: [
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Numéros autorisés', type: 'text', hint: 'Numéros au format E.164 séparés par des virgules, ex. +33612345678' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'groupAllowFrom', label: 'Groupes autorisés', type: 'text', hint: 'IDs de groupes séparés par des virgules' },
    { key: 'selfChatMode', label: 'Mode auto-conversation', type: 'boolean', hint: 'Discuter avec le même numéro de téléphone' },
    { key: 'debounceMs', label: 'Anti-rebond des messages (ms)', type: 'number', hint: 'Délai en millisecondes pour fusionner les messages rapides consécutifs' },
  ],
  signal: [
    { key: 'account', label: 'Numéro du compte', type: 'text', required: true, hint: 'Numéro au format E.164, ex. +33612345678' },
    { key: 'httpUrl', label: 'Adresse HTTP signal-cli', type: 'text', hint: 'Ex. http://localhost:8080 — adresse du démon signal-cli' },
    { key: 'autoStart', label: 'Démarrage automatique du démon', type: 'boolean' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Numéros autorisés', type: 'text', hint: 'Numéros au format E.164 séparés par des virgules' },
  ],
  imessage: [
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'cliPath', label: 'Chemin de imsg', type: 'text', hint: 'Chemin vers le binaire imsg' },
    { key: 'dbPath', label: 'Chemin de la base de données', type: 'text', hint: 'Chemin de la base Messages.app (remplacement optionnel)' },
    { key: 'service', label: 'Type de service', type: 'select', options: [
      { value: 'auto', label: 'auto — sélection automatique' },
      { value: 'imessage', label: 'iMessage' },
      { value: 'sms', label: 'SMS' },
    ] },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Contacts autorisés', type: 'text', hint: 'Handles ou chat_id séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'includeAttachments', label: 'Inclure les pièces jointes', type: 'boolean' },
  ],
  web: [
    { key: 'enabled', label: 'Activé', type: 'boolean' },
  ],
  googlechat: [
    { key: 'serviceAccountFile', label: 'Fichier de compte de service', type: 'text', required: true, hint: 'Chemin vers le fichier JSON du Service Account' },
    { key: 'audienceType', label: 'Type d\'audience', type: 'select', options: [
      { value: 'app-url', label: 'app-url — URL de l\'application' },
      { value: 'project-number', label: 'project-number — numéro de projet' },
    ] },
    { key: 'audience', label: 'Audience', type: 'text', hint: 'URL de l\'application ou numéro de projet GCP' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs ou e-mails séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
  ],
  msteams: [
    { key: 'appId', label: 'Azure Bot App ID', type: 'text', required: true, hint: 'App ID de l\'inscription Azure Bot' },
    { key: 'appPassword', label: 'App Password', type: 'password', required: true, hint: 'App Password / Client Secret du bot Azure' },
    { key: 'tenantId', label: 'Tenant ID', type: 'text', hint: 'Tenant ID Azure AD (optionnel, restreint au locataire)' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'AAD Object ID ou UPN séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'requireMention', label: '@ requis en groupe', type: 'boolean', hint: 'Le bot doit-il être mentionné (@) dans un groupe pour répondre' },
  ],
  feishu: [
    { key: 'appId', label: 'App ID', type: 'text', required: true, hint: 'App ID de la plateforme ouverte Feishu' },
    { key: 'appSecret', label: 'App Secret', type: 'password', required: true, hint: 'App Secret de la plateforme ouverte Feishu' },
    { key: 'verificationToken', label: 'Verification Token', type: 'password', hint: 'Token de vérification des abonnements aux événements' },
    { key: 'encryptKey', label: 'Encrypt Key', type: 'password', hint: 'Clé de chiffrement des messages (optionnel)' },
    { key: 'domain', label: 'Domaine', type: 'select', options: [
      { value: 'feishu', label: 'feishu — Feishu (Chine)' },
      { value: 'lark', label: 'lark — Lark (international)' },
    ] },
    { key: 'connectionMode', label: 'Mode de connexion', type: 'select', options: [
      { value: 'websocket', label: 'WebSocket (recommandé)' },
      { value: 'webhook', label: 'Webhook' },
    ] },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
  ],
  matrix: [
    { key: 'homeserver', label: 'Homeserver URL', type: 'text', required: true, hint: 'Ex. https://matrix.org' },
    { key: 'userId', label: 'ID utilisateur', type: 'text', required: true, hint: 'Ex. @bot:matrix.org' },
    { key: 'accessToken', label: 'Access Token', type: 'password', hint: 'Fournir directement un Access Token (alternative au mot de passe)' },
    { key: 'password', label: 'Mot de passe', type: 'password', hint: 'Pour récupérer le token automatiquement (alternative à l\'Access Token)' },
    { key: 'encryption', label: 'Chiffrement de bout en bout (E2EE)', type: 'boolean' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'autoJoin', label: 'Adhésion automatique', type: 'select', options: [
      { value: 'off', label: 'off — pas d\'adhésion automatique' },
      { value: 'allowlist', label: 'allowlist — salons en liste blanche uniquement' },
      { value: 'always', label: 'always — rejoindre toutes les invitations' },
    ] },
  ],
  mattermost: [
    { key: 'botToken', label: 'Bot Token', type: 'password', required: true, hint: 'Token du bot Mattermost' },
    { key: 'baseUrl', label: 'Adresse du serveur', type: 'text', required: true, hint: 'Ex. https://mattermost.example.com' },
    { key: 'chatmode', label: 'Mode de déclenchement', type: 'select', options: [
      { value: 'oncall', label: 'oncall — déclenché par @mention' },
      { value: 'onmessage', label: 'onmessage — déclenché par tout message' },
      { value: 'onchar', label: 'onchar — déclenché par un préfixe spécifique' },
    ] },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs ou @username séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'requireMention', label: '@mention requise', type: 'boolean' },
  ],
  irc: [
    { key: 'host', label: 'Adresse du serveur', type: 'text', required: true, hint: 'Nom d\'hôte du serveur IRC' },
    { key: 'port', label: 'Port', type: 'number', hint: '6697 par défaut avec TLS, 6667 sans TLS' },
    { key: 'tls', label: 'Utiliser TLS', type: 'boolean' },
    { key: 'nick', label: 'Pseudonyme', type: 'text', required: true, hint: 'Pseudo IRC du bot' },
    { key: 'username', label: 'Nom d\'utilisateur', type: 'text', hint: 'Nom d\'utilisateur du champ IRC USER' },
    { key: 'password', label: 'Mot de passe du serveur', type: 'password' },
    { key: 'channels', label: 'Salons', type: 'text', hint: 'Noms de salons séparés par des virgules, ex. #general,#bot' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'Pseudonymes IRC séparés par des virgules' },
  ],
  nostr: [
    { key: 'privateKey', label: 'Clé privée', type: 'password', required: true, hint: 'Clé privée Nostr (format hex)' },
    { key: 'relays', label: 'Adresses des relais', type: 'text', required: true, hint: 'URL de relais séparées par des virgules, ex. wss://relay.damus.io' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'Clés publiques ou npub séparés par des virgules' },
  ],
  bluebubbles: [
    { key: 'serverUrl', label: 'URL du serveur', type: 'text', required: true, hint: 'Adresse de l\'API BlueBubbles' },
    { key: 'password', label: 'Mot de passe API', type: 'password', required: true, hint: 'Mot de passe de l\'API BlueBubbles' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'Identifiants séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
  ],
  twitch: [
    { key: 'username', label: 'Nom d\'utilisateur', type: 'text', required: true, hint: 'Nom d\'utilisateur Twitch' },
    { key: 'accessToken', label: 'Access Token', type: 'password', required: true, hint: 'OAuth Access Token' },
    { key: 'clientId', label: 'Client ID', type: 'text', required: true, hint: 'Client ID de l\'application Twitch' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', hint: 'Requis pour le rafraîchissement du token' },
    { key: 'refreshToken', label: 'Refresh Token', type: 'password', hint: 'Rafraîchissement automatique du token' },
    { key: 'channel', label: 'Nom du salon', type: 'text', required: true, hint: 'Nom du salon Twitch à rejoindre' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'requireMention', label: '@mention requise', type: 'boolean' },
  ],
  'nextcloud-talk': [
    { key: 'baseUrl', label: 'URL Nextcloud', type: 'text', required: true, hint: 'Ex. https://cloud.example.com' },
    { key: 'botSecret', label: 'Bot Secret', type: 'password', required: true, hint: 'Secret partagé du bot' },
    { key: 'apiUser', label: 'Utilisateur API', type: 'text', hint: 'Nom d\'utilisateur pour les requêtes de salons' },
    { key: 'apiPassword', label: 'Mot de passe API', type: 'password', hint: 'Mot de passe de l\'utilisateur API' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
  ],
  'synology-chat': [
    { key: 'token', label: 'Bot Token', type: 'password', required: true },
    { key: 'incomingUrl', label: 'Incoming Webhook URL', type: 'text', required: true, hint: 'URL du webhook entrant de Synology Chat' },
    { key: 'nasHost', label: 'Nom d\'hôte du NAS', type: 'text', required: true, hint: 'Adresse du NAS' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: [
      { value: 'open', label: 'open — accessible à tous' },
      { value: 'allowlist', label: 'allowlist — liste blanche uniquement' },
      { value: 'disabled', label: 'disabled — désactivé' },
    ] },
    { key: 'botName', label: 'Nom affiché du bot', type: 'text' },
  ],
  zalo: [
    { key: 'botToken', label: 'Bot Token', type: 'password', required: true, hint: 'Token du bot Zalo OA' },
    { key: 'webhookUrl', label: 'Webhook URL', type: 'text', hint: 'HTTPS requis' },
    { key: 'webhookSecret', label: 'Webhook Secret', type: 'password' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs Zalo séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
  ],
  qqbot: [
    { key: 'appId', label: 'App ID', type: 'text', required: true, hint: 'App ID du bot sur la plateforme ouverte QQ' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, hint: 'Clé secrète du bot sur la plateforme ouverte QQ' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs séparés par des virgules ; * signifie tout le monde' },
  ],
  wecom: [
    { key: 'botId', label: 'Bot ID', type: 'text', required: true, hint: 'Bot ID du bot IA WeCom' },
    { key: 'secret', label: 'Bot Secret', type: 'password', required: true, hint: 'Secret du bot IA WeCom' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'websocketUrl', label: 'Adresse WebSocket', type: 'text', hint: 'Par défaut wss://openws.work.weixin.qq.com' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS, hint: 'Contrôle qui peut discuter en privé avec le bot' },
    { key: 'allowFrom', label: 'Utilisateurs autorisés', type: 'text', hint: 'IDs d\'utilisateurs WeCom séparés par des virgules' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'groupAllowFrom', label: 'Groupes autorisés', type: 'text', hint: 'IDs de groupes séparés par des virgules' },
    { key: 'sendThinkingMessage', label: 'Envoyer un message « réflexion en cours »', type: 'boolean', hint: 'Affiche un message indicatif avant la réponse' },
  ],
  dingtalk: [
    { key: 'clientId', label: 'Client ID', type: 'text', required: true, hint: 'Client ID (AppKey) de l\'application sur la plateforme ouverte DingTalk' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, hint: 'Client Secret (AppSecret) de l\'application sur la plateforme ouverte DingTalk' },
    { key: 'robotCode', label: 'Robot Code', type: 'text', required: true, hint: 'robotCode du robot DingTalk' },
    { key: 'corpId', label: 'Corp ID', type: 'text', hint: 'corpId de l\'entreprise' },
    { key: 'agentId', label: 'Agent ID', type: 'text', hint: 'agentId de l\'application DingTalk' },
    { key: 'enabled', label: 'Activé', type: 'boolean' },
    { key: 'dmPolicy', label: 'Stratégie de messages privés', type: 'select', options: DM_POLICY_OPTIONS, hint: 'Contrôle qui peut discuter en privé avec le robot' },
    { key: 'groupPolicy', label: 'Stratégie de groupes', type: 'select', options: GROUP_POLICY_OPTIONS },
    { key: 'messageType', label: 'Type de message', type: 'select', options: [
      { value: 'text', label: 'text — texte brut' },
      { value: 'markdown', label: 'markdown — format Markdown' },
    ], hint: 'Format des messages renvoyés par le robot' },
    { key: 'debug', label: 'Mode debug', type: 'boolean', hint: 'Active la sortie de logs détaillés' },
  ],
}

export default function Channels() {
  const [status, setStatus] = useState<ChannelsStatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Config modal state
  const [configChannel, setConfigChannel] = useState<string | null>(null)
  const [configData, setConfigData] = useState<Record<string, unknown>>({})
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)

  // Expanded account details
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Channels configured in openclaw.json (may not have gateway accounts yet)
  const [configuredTypes, setConfiguredTypes] = useState<string[]>([])

  // Show restart hint after saving channel config
  const [showRestartHint, setShowRestartHint] = useState(false)
  const [weixinBindOpen, setWeixinBindOpen] = useState(false)
  const navigate = useNavigate()

  const fetchStatus = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [statusResult, configuredResult] = await Promise.all([
        getChannelsStatus(true),
        getConfiguredChannels(),
      ])
      setStatus(statusResult)
      if (configuredResult.success && configuredResult.channels) {
        setConfiguredTypes(configuredResult.channels)
      }
    } catch (err: any) {
      setError(err?.message || 'Échec de la récupération de l\'état des canaux')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus(true)
  }, [fetchStatus])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchStatus()
  }

  const openConfig = async (channelType: string) => {
    if (channelType === WEIXIN_CHANNEL_ID) {
      setWeixinBindOpen(true)
      return
    }
    setConfigChannel(channelType)
    setConfigLoading(true)
    try {
      const result = await getChannelConfig(channelType)
      setConfigData(result.config || {})
    } catch {
      setConfigData({})
    } finally {
      setConfigLoading(false)
    }
  }

  const handleSaveConfig = async (dataOverride?: Record<string, unknown>) => {
    if (!configChannel) return
    setConfigSaving(true)
    try {
      await saveChannelConfig(configChannel, dataOverride ?? configData)
      setConfigChannel(null)
      setShowRestartHint(true)
      // Refresh status after config change
      await fetchStatus()
    } catch (err: any) {
      setError(err?.message || 'Échec de la sauvegarde de la configuration')
    } finally {
      setConfigSaving(false)
    }
  }

  const handleDeleteChannel = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteChannelConfig(deleteTarget)
      setConfiguredTypes((prev) => prev.filter((t) => t !== deleteTarget))
      setDeleteTarget(null)
      await fetchStatus()
    } catch (err: any) {
      setError(err?.message || 'Échec de la suppression du canal')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-accent-blue" />
      </div>
    )
  }

  // Build channel list from status data + config + static catalog
  const channelAccounts = status?.channelAccounts || {}
  const channelLabels = status?.channelLabels || {}

  // Channels with gateway accounts (actively running/configured in gateway)
  const gatewayChannels = (status?.channelOrder || []).filter(
    (ch) => channelAccounts[ch] && channelAccounts[ch].length > 0,
  )

  // Merge: channels from gateway + channels configured in openclaw.json
  const allConfiguredIds = new Set([...gatewayChannels, ...configuredTypes])
  const configuredChannels = Array.from(allConfiguredIds)

  // Available = static catalog entries not yet configured
  const availableChannels = CHANNEL_CATALOG.filter(
    (ch) => !allConfiguredIds.has(ch.id),
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Gestion des canaux</h1>
          <p className="mt-1 text-sm text-dark-text-secondary">
            Gérez les canaux de messagerie de vos agents IA
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text-secondary hover:text-dark-text transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Rafraîchir
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {showRestartHint && (
        <div className="mb-4 rounded-lg bg-accent-green/10 p-3 text-sm text-accent-green flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} />
            <span>Configuration du canal enregistrée — un redémarrage de la passerelle est nécessaire pour l'appliquer</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="rounded-lg bg-accent-green px-3 py-1 text-xs font-medium text-white hover:bg-accent-green/90 transition-colors"
            >
              Aller aux paramètres système pour redémarrer la passerelle
            </button>
            <button
              onClick={() => setShowRestartHint(false)}
              className="text-accent-green/60 hover:text-accent-green transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Configured channels */}
      {configuredChannels.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-dark-text-secondary uppercase tracking-wider mb-3">
            Canaux connectés
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configuredChannels.map((channelId) => {
              const accounts = channelAccounts[channelId] || []
              const catalogEntry = CHANNEL_CATALOG.find((c) => c.id === channelId)
              const label = channelLabels[channelId] || catalogEntry?.label || channelId
              const icon = CHANNEL_ICONS[channelId] || catalogEntry?.icon || '💬'
              const isExpanded = expandedChannel === channelId

              return (
                <div
                  key={channelId}
                  className="rounded-xl border border-dark-border bg-dark-card overflow-hidden"
                >
                  {/* Channel header */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-bg text-xl">
                        {icon}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-dark-text">{label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {accounts.length > 0 ? (
                            accounts.map((acc) => (
                              <AccountStatusBadge key={acc.accountId} account={acc} />
                            ))
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-dark-text-secondary">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400" />
                              Configuré (redémarrez la passerelle pour l'activer)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openConfig(channelId)}
                        className="rounded-lg p-1.5 text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg transition-colors"
                        title="Configurer"
                      >
                        <Settings size={15} />
                      </button>
                      <button
                        onClick={() => setExpandedChannel(isExpanded ? null : channelId)}
                        className="rounded-lg p-1.5 text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg transition-colors"
                        title="Détails"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(channelId)}
                        className="rounded-lg p-1.5 text-dark-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded account details */}
                  {isExpanded && (
                    <div className="border-t border-dark-border bg-dark-bg/30 px-4 py-3">
                      {accounts.map((acc) => (
                        <AccountDetail key={acc.accountId} account={acc} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available channels (not yet configured) */}
      {availableChannels.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-text-secondary uppercase tracking-wider mb-3">
            Canaux disponibles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => openConfig(ch.id)}
                className="flex items-center gap-3 rounded-xl border border-dark-border bg-dark-card p-4 text-left hover:bg-dark-bg/50 transition-colors group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-bg text-xl opacity-50 group-hover:opacity-80 transition-opacity">
                  {ch.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-dark-text">{ch.label}</div>
                  <div className="text-xs text-dark-text-secondary mt-0.5 truncate">
                    {ch.description}
                  </div>
                </div>
                <Plus size={16} className="text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No channels at all (shouldn't happen with static catalog, but just in case) */}
      {configuredChannels.length === 0 && availableChannels.length === 0 && !error && (
        <div className="text-center py-20 text-dark-text-secondary text-sm">
          Chargement...
        </div>
      )}

      {/* Config modal */}
      {configChannel && (
        <ChannelConfigModal
          channelType={configChannel}
          channelLabel={channelLabels[configChannel] || CHANNEL_CATALOG.find((c) => c.id === configChannel)?.label || configChannel}
          configData={configData}
          loading={configLoading}
          saving={configSaving}
          onConfigChange={setConfigData}
          onSave={handleSaveConfig}
          onClose={() => setConfigChannel(null)}
        />
      )}

      {weixinBindOpen && (
        <WeixinBindModal
          onClose={() => setWeixinBindOpen(false)}
          onBound={() => {
            setWeixinBindOpen(false)
            void fetchStatus()
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-xl bg-dark-card border border-dark-border p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-dark-text mb-2">Confirmer la suppression</h3>
            <p className="text-sm text-dark-text-secondary mb-4">
              Voulez-vous vraiment supprimer la configuration du canal <span className="font-medium text-dark-text">{channelLabels[deleteTarget] || CHANNEL_CATALOG.find((c) => c.id === deleteTarget)?.label || deleteTarget}</span> ? Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-dark-border px-4 py-1.5 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteChannel}
                disabled={deleting}
                className="rounded-lg bg-accent-red px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-red/90 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface WeixinBindModalProps {
  onClose: () => void
  onBound: () => void
}

function WeixinBindModal({ onClose, onBound }: WeixinBindModalProps) {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const [pluginReady, setPluginReady] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const outputRef = useRef<HTMLDivElement | null>(null)
  const hadSessionRef = useRef(false)

  useEffect(() => {
    if (!outputRef.current) return
    outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [output])

  useEffect(() => {
    let disposed = false
    let nextWs: WebSocket | null = null

    const connect = async () => {
      const token = getAccessToken()
      if (!token) {
        setError('Non connecté ou token expiré')
        return
      }

      setError('')
      setConnected(false)
      setRunning(true)
      setPluginReady(false)
      hadSessionRef.current = false

      try {
        const plugins = await listPlugins()
        if (disposed) return
        const installed = plugins.some((plugin) => plugin.name === WEIXIN_PLUGIN_NAME)
        if (!installed) {
          setRunning(false)
          setError('Plugin WeChat non détecté. Cette page lance uniquement la connexion par QR code — utilisez d\'abord une image bridge préinstallée avec openclaw-weixin.')
          return
        }
        setPluginReady(true)
      } catch (err: any) {
        if (disposed) return
        setRunning(false)
        setError(err?.message || 'Échec de la récupération de la liste des plugins')
        return
      }

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const wsUrl = `${proto}://${window.location.host}/api/openclaw/terminal/ws?token=${encodeURIComponent(token)}`
      nextWs = new WebSocket(wsUrl)
      const sessionKey = getWeixinTerminalSessionKey(token, attempt)

      nextWs.onopen = () => {
        if (disposed) return
        setConnected(true)
        setRunning(true)
        nextWs?.send(JSON.stringify({
          type: 'init',
          session_key: sessionKey,
          command: WEIXIN_LOGIN_COMMAND,
        }))
      }

      nextWs.onclose = (event) => {
        if (disposed) return
        setConnected(false)
        setRunning(false)
        setWs((current) => (current === nextWs ? null : current))
        if (!hadSessionRef.current) {
          const reason = event.reason?.trim()
          setError(reason ? `Terminal de liaison WeChat non prêt : ${reason}` : 'Terminal de liaison WeChat non prêt')
        }
      }

      nextWs.onerror = () => {
        if (disposed) return
        setOutput((prev) => `${prev}\n[error] terminal websocket error\n`)
      }

      nextWs.onmessage = (evt) => {
        if (disposed) return
        try {
          const msg = JSON.parse(String(evt.data))
          if (msg.type === 'session') {
            hadSessionRef.current = true
            const reused = Boolean(msg.reused)
            setOutput((prev) => `${prev}[session] ${String(msg.session_key ?? '')} ${reused ? '(reused)' : '(new)'}\n`)
          } else if (msg.type === 'output') {
            const chunk = String(msg.data ?? '')
            setOutput((prev) => prev + chunk)
          } else if (msg.type === 'started') {
            setOutput((prev) => `${prev}[started] ${String(msg.command ?? '')}\n`)
          } else if (msg.type === 'exit') {
            setRunning(false)
            setOutput((prev) => `${prev}\n[exit] code=${String(msg.code)} signal=${String(msg.signal)}\n`)
            if (String(msg.code ?? '') === '0') {
              onBound()
            }
          } else if (msg.type === 'error') {
            setRunning(false)
            setError(String(msg.message ?? 'Échec de la liaison WeChat'))
          }
        } catch {
          setOutput((prev) => prev + String(evt.data))
        }
      }

      setWs(nextWs)
    }

    void connect()

    return () => {
      disposed = true
      try { nextWs?.close() } catch { /* ignore */ }
    }
  }, [attempt, onBound])

  const handleClose = () => {
    try { ws?.close() } catch { /* ignore */ }
    onClose()
  }

  const qrLinkMatch = output.match(/https:\/\/liteapp\.weixin\.qq\.com\/q\/[^\s]+/)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-xl bg-dark-card border border-dark-border max-w-3xl w-full mx-4 shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-accent-green" />
            <div>
              <h3 className="text-base font-semibold text-dark-text">Lier le canal WeChat</h3>
              <p className="text-xs text-dark-text-secondary mt-0.5">
                Lance directement la connexion WeChat et affiche le QR code à scanner, sans réinstaller le plugin
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-dark-border bg-dark-bg/40 shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className={`inline-flex items-center gap-1 ${connected ? 'text-accent-green' : 'text-dark-text-secondary'}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-accent-green' : 'bg-gray-500'}`} />
              {connected ? 'Terminal connecté' : 'Terminal non connecté'}
            </span>
            <span className={`inline-flex items-center gap-1 ${running ? 'text-accent-yellow' : 'text-dark-text-secondary'}`}>
              <PlugZap size={12} />
              {running ? 'Processus de scan en cours' : 'En attente de relance'}
            </span>
            <span className={`inline-flex items-center gap-1 ${pluginReady ? 'text-accent-green' : 'text-dark-text-secondary'}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${pluginReady ? 'bg-accent-green' : 'bg-gray-500'}`} />
              {pluginReady ? 'Plugin WeChat prêt' : 'Vérification du plugin WeChat...'}
            </span>
            <code className="rounded bg-dark-card px-2 py-1 text-[11px] text-dark-text-secondary">{WEIXIN_LOGIN_COMMAND}</code>
          </div>
          {qrLinkMatch && (
            <div className="mt-3 rounded-lg bg-accent-green/10 p-3 text-sm text-accent-green">
              Lien QR code pour le navigateur :
              <a
                href={qrLinkMatch[0]}
                target="_blank"
                rel="noreferrer"
                className="ml-1 underline break-all"
              >
                {qrLinkMatch[0]}
              </a>
            </div>
          )}
          {error && (
            <div className="mt-3 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>

        <div
          ref={outputRef}
          className="flex-1 overflow-auto whitespace-pre-wrap bg-black px-5 py-4 font-mono text-xs leading-none text-green-200"
        >
          {output || 'Connexion au terminal de liaison WeChat...'}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-dark-border shrink-0">
          <button
            onClick={() => {
              try { ws?.close() } catch { /* ignore */ }
              setOutput('')
              setError('')
              setAttempt((value) => value + 1)
            }}
            className="rounded-lg border border-dark-border px-4 py-1.5 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            Régénérer le QR code
          </button>
          <button
            onClick={() => setOutput('')}
            className="rounded-lg border border-dark-border px-4 py-1.5 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            Effacer la sortie
          </button>
          <button
            onClick={handleClose}
            className="rounded-lg bg-accent-blue px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Sub components ---

function AccountStatusBadge({ account }: { account: ChannelAccountSnapshot }) {
  const hasRecentTraffic = Boolean(account.lastInboundAt || account.lastOutboundAt)
  const probeOk =
    typeof account.probe === 'object' &&
    account.probe !== null &&
    'ok' in account.probe &&
    (account.probe as { ok?: unknown }).ok === true
  const isConnected = account.connected === true || hasRecentTraffic || probeOk
  const isRunning = account.running
  const hasError = !!account.lastError

  let color = 'bg-gray-500'
  let label = 'Inconnu'

  if (hasError) {
    color = 'bg-accent-red'
    label = 'Erreur'
  } else if (isConnected) {
    color = 'bg-accent-green'
    label = 'Connecté'
  } else if (isRunning) {
    color = 'bg-accent-yellow animate-pulse'
    label = 'Connexion...'
  } else if (account.configured) {
    color = 'bg-gray-400'
    label = 'Configuré'
  } else {
    label = 'Non configuré'
  }

  return (
    <span className="flex items-center gap-1 text-xs text-dark-text-secondary">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
      {account.name || account.accountId}: {label}
    </span>
  )
}

function AccountDetail({ account }: { account: ChannelAccountSnapshot }) {
  const fields: Array<[string, unknown]> = []

  if (account.name) fields.push(['Nom', account.name])
  fields.push(['ID du compte', account.accountId])
  if (account.mode) fields.push(['Mode', account.mode])
  if (account.enabled !== undefined && account.enabled !== null) fields.push(['Activé', account.enabled ? 'Oui' : 'Non'])
  if (account.configured !== undefined && account.configured !== null) fields.push(['Configuré', account.configured ? 'Oui' : 'Non'])
  if (account.connected !== undefined && account.connected !== null) fields.push(['Connecté', account.connected ? 'Oui' : 'Non'])
  if (account.running !== undefined && account.running !== null) fields.push(['En cours', account.running ? 'Oui' : 'Non'])
  if (account.webhookUrl) fields.push(['Webhook', account.webhookUrl])
  if (account.lastConnectedAt) fields.push(['Dernière connexion', new Date(account.lastConnectedAt).toLocaleString('fr-FR')])
  if (account.lastError) fields.push(['Erreur', account.lastError])
  if (account.reconnectAttempts) fields.push(['Tentatives de reconnexion', account.reconnectAttempts])

  return (
    <div className="mb-3 last:mb-0">
      <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
        {fields.map(([label, value]) => (
          <div key={label as string} className="contents">
            <span className="text-dark-text-secondary font-medium">{label as string}</span>
            <span className={`text-dark-text truncate ${label === 'Erreur' ? 'text-accent-red' : ''}`}>
              {String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface ChannelConfigModalProps {
  channelType: string
  channelLabel: string
  configData: Record<string, unknown>
  loading: boolean
  saving: boolean
  onConfigChange: (data: Record<string, unknown>) => void
  onSave: (dataOverride?: Record<string, unknown>) => void
  onClose: () => void
}

// Fields that store arrays (comma-separated in UI → array in JSON)
const ARRAY_FIELDS = new Set([
  'allowFrom', 'groupAllowFrom', 'channels', 'relays',
  'autoJoinAllowlist', 'allowedUserIds',
])

function ChannelConfigModal({
  channelType,
  channelLabel,
  configData,
  loading,
  saving,
  onConfigChange,
  onSave,
  onClose,
}: ChannelConfigModalProps) {
  const knownFields = CHANNEL_CONFIG_FIELDS[channelType]

  const updateField = (key: string, value: unknown) => {
    onConfigChange({ ...configData, [key]: value })
  }

  // For channels without predefined fields, allow raw JSON editing
  const [rawMode, setRawMode] = useState(!knownFields)
  const [rawJson, setRawJson] = useState(JSON.stringify(configData, null, 2))

  useEffect(() => {
    if (!knownFields) {
      setRawJson(JSON.stringify(configData, null, 2))
    }
  }, [configData, knownFields])

  const handleRawSave = () => {
    try {
      const parsed = JSON.parse(rawJson)
      onConfigChange(parsed)
      onSave(parsed)
    } catch {
      alert('Format JSON invalide')
    }
  }

  const getDisplayValue = (field: ChannelField): string => {
    const val = configData[field.key]
    if (val === undefined || val === null) return ''
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
  }

  const handleTextChange = (field: ChannelField, raw: string) => {
    if (ARRAY_FIELDS.has(field.key)) {
      if (raw === '') {
        updateField(field.key, [])
      } else {
        updateField(field.key, raw.split(',').map((s) => s.trim()).filter(Boolean))
      }
    } else if (field.type === 'number') {
      const num = parseInt(raw, 10)
      updateField(field.key, isNaN(num) ? undefined : num)
    } else {
      updateField(field.key, raw)
    }
  }

  const renderField = (field: ChannelField) => {
    switch (field.type) {
      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={configData[field.key] !== false && configData[field.key] !== undefined}
              onChange={(e) => updateField(field.key, e.target.checked)}
              className="rounded border-dark-border"
            />
            <span className="text-sm text-dark-text">
              {configData[field.key] !== false && configData[field.key] !== undefined ? 'Activé' : 'Désactivé'}
            </span>
          </label>
        )

      case 'select':
        return (
          <select
            value={(configData[field.key] as string) || ''}
            onChange={(e) => updateField(field.key, e.target.value || undefined)}
            className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue"
          >
            <option value="">(Non défini)</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )

      case 'textarea':
        return (
          <textarea
            value={getDisplayValue(field)}
            onChange={(e) => handleTextChange(field, e.target.value)}
            rows={4}
            placeholder={field.hint}
            className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text font-mono outline-none focus:border-accent-blue placeholder:text-dark-text-secondary resize-none"
          />
        )

      default:
        return (
          <input
            type={field.type === 'password' ? 'password' : 'text'}
            value={getDisplayValue(field)}
            onChange={(e) => handleTextChange(field, e.target.value)}
            placeholder={field.hint}
            className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
          />
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-xl bg-dark-card border border-dark-border max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{CHANNEL_ICONS[channelType] || '💬'}</span>
            <h3 className="text-base font-semibold text-dark-text">
              Configurer {channelLabel}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-accent-blue" />
            </div>
          ) : rawMode ? (
            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                Configuration JSON
              </label>
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                rows={16}
                className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text font-mono outline-none focus:border-accent-blue placeholder:text-dark-text-secondary resize-none"
                placeholder="{}"
              />
              {knownFields && (
                <button
                  onClick={() => setRawMode(false)}
                  className="mt-2 text-xs text-accent-blue hover:underline"
                >
                  Passer en mode formulaire
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {knownFields?.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                    {field.label}
                    {field.required && <span className="text-accent-red ml-0.5">*</span>}
                  </label>
                  {renderField(field)}
                  {field.hint && field.type !== 'boolean' && field.type !== 'select' && (
                    <p className="mt-0.5 text-[11px] text-dark-text-secondary">{field.hint}</p>
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  setRawJson(JSON.stringify(configData, null, 2))
                  setRawMode(true)
                }}
                className="text-xs text-accent-blue hover:underline"
              >
                Passer en mode JSON (avancé)
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-dark-border shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-dark-border px-4 py-1.5 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={rawMode ? handleRawSave : () => onSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent-blue px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
