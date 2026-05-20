import { isInfrastructureIp, normalizeIp } from "../modules/ip-intelligence/ipAddress.js";

const LEVELS = [
  { min: 85, level: "critical" },
  { min: 65, level: "high" },
  { min: 35, level: "medium" },
  { min: 0, level: "low" },
];

const SAFE_ADMIN_ACTIONS = new Set([
  "ignore",
  "monitor",
  "review",
  "review_candidate",
  "needs_more_signals",
  "shared_ip_low_confidence",
  "infrastructure_ignored",
  "restrict",
  "manual_review",
  "high_confidence_cluster",
]);

const LOW_TRUST_IP_SIGNAL_TYPES = new Set(["registration_ip", "last_ip", "auth_ip_history", "ip_network"]);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** PTR/hostnames that usually mean "our reverse proxy / container", not an end-user ISP. */
const INFRA_REVERSE_DNS_MARKERS = [
  "nginx",
  "docker",
  "ingress",
  "traefik",
  "haproxy",
  "envoy",
  "caddy",
  "kube-proxy",
  "cloudflare",
  "akamai",
  "fastly",
  "loadbalancer",
  "load-balancer",
  "block-miner-nginx",
  "blockminer-nginx",
];

const MASS_SHARED_IP_MIN_USERS = 25;

function looksLikeInfrastructureReverseDns(value) {
  const t = String(value || "").toLowerCase();
  if (!t) return false;
  return INFRA_REVERSE_DNS_MARKERS.some((m) => t.includes(m));
}

function isInfrastructureMassSharedIp(group) {
  const st = group?.signalType;
  if (!LOW_TRUST_IP_SIGNAL_TYPES.has(st)) return false;
  const n = Number(group.userCount || group.users?.length || 0);
  if (n < MASS_SHARED_IP_MIN_USERS) return false;
  const key = String(group.key || "").trim();
  if (hasPrivateNetworkMarker(key)) return true;
  const ptr = String(group.ipIntelligence?.reverseDns || "").trim();
  if (ptr && looksLikeInfrastructureReverseDns(ptr)) return true;
  return false;
}

function buildInfrastructureIpDecision(group, reasonCode = "infrastructure_ip") {
  const n = Number(group.userCount || group.users?.length || 0);
  const key = String(group.key || "").trim();
  const warnings = [
    `Stored signal "${key}" is infrastructure/proxy (Docker bridge, loopback, or private LAN) — excluded from end-user fraud scoring.`,
    "Ensure TRUST_PROXY=1 and proxy headers (X-Real-IP / X-Forwarded-For / CF-Connecting-IP) are applied so new sessions store the visitor's public IP.",
  ];
  if (n >= MASS_SHARED_IP_MIN_USERS) {
    warnings.push(
      `${n} accounts share one stored IP — that usually means client-IP capture behind nginx/docker was wrong, not coordinated fraud.`,
    );
  }
  return {
    score: 0,
    level: "low",
    confidence: "low",
    reasons: [reasonCode === "mass_shared" ? "Mass shared stored IP on infrastructure hop." : "Infrastructure/proxy IP ignored."],
    falsePositiveWarnings: warnings,
    alerts: [],
    identityVectors: [],
    identityVectorCount: 0,
    correlation: {
      wallet: false,
      fingerprint: false,
      asnProvider: false,
      mandatorySatisfied: false,
      ptrAsn: {
        type: "infrastructure",
        confidence: "High",
        reason: "PTR/ASN not used for private or proxy-internal IPs.",
      },
      geolocationCoherent: false,
      suspiciousIp: false,
    },
    decision: {
      confidence: "Low",
      recommendedAction: "infrastructure_ignored",
      destructiveAllowed: false,
      reason: "Infrastructure/proxy IP — not valid multi-account evidence.",
      requiresManualReview: false,
    },
    recommendedAction: "infrastructure_ignored",
  };
}

function buildInfrastructureMisconfigurationDecision(group) {
  const n = Number(group.userCount || group.users?.length || 0);
  const warnings = [
    `${n} accounts share one stored IP — that is almost never real "multi-account" fraud; it usually means the app recorded the reverse-proxy/Docker hop (wrong client IP) instead of the visitor.`,
    "Fix production env: set TRUST_PROXY=1 and TRUSTED_PROXY_CIDRS to the proxy network (e.g. 172.16.0.0/12 for Docker bridge). Ensure nginx sends X-Real-IP / X-Forwarded-For (see repo nginx.conf). New sessions will store real IPs; treat this cluster as infrastructure noise, not ban evidence.",
  ];
  return buildInfrastructureIpDecision(group, "mass_shared");
}
const SHARED_NETWORK_PROVIDER_TYPES = new Set(["residential", "mobile", "corporate", "education", "public_wifi"]);
const SUSPICIOUS_PROVIDER_TYPES = new Set(["hosting", "vpn_proxy", "tor"]);
const SCRIPT_GARBAGE_TERMS = ["undefined", "null", "[object object]", "unknown"];
const PLATFORM_TERMS = ["blockminer", "blockminer.space", "test.blockminer.space", "www.blockminer.space"];
const PRIVATE_NETWORK_REGEXES = [
  /\b127\.0\.0\.1\b/i,
  /\blocalhost\b/i,
  /\b192\.168\.\d{1,3}\.\d{1,3}\b/i,
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/i,
  /\b172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b/i,
];

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function levelFor(score) {
  return LEVELS.find((x) => score >= x.min)?.level || "low";
}

function normalizeConfidenceLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  return "Low";
}

function pushUnique(target, value) {
  if (value && !target.includes(value)) target.push(value);
}

function parseHost(value) {
  try {
    const host = new URL(String(value || "").trim()).hostname;
    return host ? host.toLowerCase() : null;
  } catch {
    return null;
  }
}

function getPlatformIndicators() {
  const envHosts = [
    process.env.APP_URL,
    process.env.SUPPORT_ADMIN_PUBLIC_URL,
    process.env.VITE_PUBLIC_WALLET_APP_URL,
  ].map(parseHost).filter(Boolean);
  const envIps = [
    process.env.SERVER_IP,
    process.env.SERVER_PUBLIC_IP,
    process.env.HOST_IP,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return new Set([...PLATFORM_TERMS, ...envHosts, ...envIps].map((value) => String(value || "").toLowerCase()).filter(Boolean));
}

function hasPrivateNetworkMarker(value) {
  const text = String(value || "").toLowerCase();
  return PRIVATE_NETWORK_REGEXES.some((pattern) => pattern.test(text));
}

function hasScriptGarbage(value) {
  const text = String(value || "").trim().toLowerCase();
  return SCRIPT_GARBAGE_TERMS.includes(text);
}

function hasPlatformSelfReference(value, platformIndicators) {
  const text = String(value || "").toLowerCase();
  if (!text) return false;
  return [...platformIndicators].some((term) => term && text.includes(term));
}

function buildTechnicalAnomalyDecision(anomalies) {
  return {
    score: 40,
    level: "medium",
    confidence: "low",
    reasons: ["Technical data quality anomalies — review manually; never auto-ban."],
    falsePositiveWarnings: [
      "Anomalies may include proxy/internal IP metadata or script placeholders — confirm wallet and fingerprint before action.",
    ],
    alerts: [],
    identityVectors: ["technical_anomaly"],
    identityVectorCount: 1,
    correlation: {
      wallet: false,
      fingerprint: false,
      asnProvider: false,
      mandatorySatisfied: false,
      ptrAsn: {
        type: "unknown",
        confidence: "Low",
        reason: "Technical anomaly bucket — not sufficient for destructive action.",
      },
      geolocationCoherent: false,
      suspiciousIp: false,
    },
    decision: {
      confidence: "Low",
      recommendedAction: "needs_more_signals",
      destructiveAllowed: false,
      reason: "Technical anomalies require manual review with wallet/fingerprint evidence.",
      requiresManualReview: true,
      anomalies,
    },
    recommendedAction: "needs_more_signals",
  };
}

function detectTechnicalAnomalies(group) {
  const anomalies: string[] = [];
  const platformIndicators = getPlatformIndicators();
  const candidates = [
    { label: "group.key", value: group.key },
    { label: "group.signalType", value: group.signalType },
    { label: "ip.reverseDns", value: group.ipIntelligence?.reverseDns },
    { label: "ip.normalizedIp", value: group.ipIntelligence?.normalizedIp },
    { label: "ip.providerLabel", value: group.ipIntelligence?.providerLabel },
    { label: "ip.asnOrg", value: group.ipIntelligence?.asnOrg },
  ];

  for (const user of Array.isArray(group.users) ? group.users : []) {
    candidates.push(
      { label: `user.${user.id}.email`, value: user.email },
      { label: `user.${user.id}.username`, value: user.username },
      { label: `user.${user.id}.walletAddress`, value: user.walletAddress },
      { label: `user.${user.id}.userAgent`, value: user.userAgent },
    );
  }

  const storedIp = normalizeIp(group.key);
  if (storedIp && isInfrastructureIp(storedIp)) {
    return [];
  }

  for (const candidate of candidates) {
    const value = String(candidate.value || "").trim();
    if (!value) continue;
    if (candidate.label === "ip.reverseDns" && looksLikeInfrastructureReverseDns(value)) {
      continue;
    }
    if (hasPrivateNetworkMarker(value)) {
      continue;
    }
    const skipPlatformOnIpMeta =
      candidate.label === "ip.reverseDns" ||
      candidate.label === "ip.providerLabel" ||
      candidate.label === "ip.asnOrg" ||
      candidate.label === "ip.normalizedIp";
    if (!skipPlatformOnIpMeta && hasPlatformSelfReference(value, platformIndicators)) {
      anomalies.push(`${candidate.label}: platform_self_reference`);
    }
    if (hasScriptGarbage(value)) {
      anomalies.push(`${candidate.label}: script_garbage`);
    }
  }

  return anomalies;
}

function hasCoherentGeo(ipIntelligence: Record<string, unknown> = {}, geolocation: unknown) {
  if (!isPlainRecord(geolocation)) return false;
  const confidence = String(geolocation.confidence ?? "").toLowerCase();
  const country = String(geolocation.countryCode ?? geolocation.country ?? "").trim();
  if (!country) return false;
  if (["high", "medium"].includes(confidence)) return true;
  const pt = ipIntelligence.providerType;
  return pt === "residential" || pt === "mobile";
}

function classifyPtrAsnCorrelation(ipIntelligence: unknown) {
  const meta: Record<string, unknown> = isPlainRecord(ipIntelligence) ? ipIntelligence : {};
  const ptrText = String(meta.reverseDns ?? "").toLowerCase();
  const asnText = String(meta.asnOrg ?? "").toLowerCase();
  if (!ptrText && !asnText) {
    return {
      type: "unknown",
      confidence: "Low",
      reason: "PTR/ASN indisponiveis; rede permanece metadado de baixa confianca.",
    };
  }

  const carrierTerms = ["telecom", "fibra", "fiber", "broadband", "residential", "residencial", "mobile", "wireless", "telefonica", "telef", "claro", "vivo", "tim", "oi"];
  const datacenterTerms = ["hosting", "datacenter", "data center", "server", "servers", "cloud", "aws", "amazon", "google", "azure", "digitalocean", "hetzner", "ovh", "linode", "oracle", "vpn", "proxy", "tor"];
  const combined = `${ptrText} ${asnText}`;

  if (carrierTerms.some((term) => combined.includes(term))) {
    return {
      type: "residential_like",
      confidence: "Medium",
      reason: "PTR/ASN sugerem operadora residencial ou movel.",
    };
  }
  if (datacenterTerms.some((term) => combined.includes(term))) {
    return {
      type: "datacenter_like",
      confidence: "Medium",
      reason: "PTR/ASN sugerem datacenter, hosting ou VPN.",
    };
  }
  return {
    type: "unknown",
    confidence: "Low",
    reason: "PTR/ASN nao permitem classificar a rede com seguranca.",
  };
}

function buildIdentityVectors(group, ptrAsnCorrelation) {
  const vectors: string[] = [];
  if (group.signalType === "profile_wallet" || group.signalType === "onchain_wallet" || Number(group.sameWalletCount) > 0) {
    vectors.push("wallet");
  }
  if (group.signalType === "device_fingerprint" || Number(group.sameDeviceCount) > 0) {
    vectors.push("fingerprint");
  }
  if (group.signalType === "asn" || SUSPICIOUS_PROVIDER_TYPES.has(group.ipIntelligence?.providerType) || ptrAsnCorrelation.type === "datacenter_like") {
    vectors.push("asn_provider");
  }
  if (Boolean(group.shortCreationWindow) || Boolean(group.sessionTimingCorrelation)) {
    vectors.push("session_timing");
  }
  if (Number(group.similarIdentityCount) > 0) {
    vectors.push("profile_pattern");
  }
  return vectors;
}

function buildDecision({ score, identityVectors, mandatoryCorrelation, falsePositiveAlert, ipOnlySignal }) {
  const vectorCount = identityVectors.length;
  const destructiveAllowed = mandatoryCorrelation && vectorCount >= 3 && score >= 85 && !falsePositiveAlert;
  let action = "ignore";
  let reason = "Sinais insuficientes para acao.";
  let confidence = "Low";

  if (destructiveAllowed) {
    action = "high_confidence_cluster";
    confidence = "High";
    reason =
      "Wallet, fingerprint e ASN/provedor convergem — revisar manualmente; ban automatico nunca e aplicado.";
  } else if (mandatoryCorrelation && vectorCount >= 2 && score >= 65) {
    action = "review_candidate";
    confidence = "Medium";
    reason = "Correlacoes fortes presentes, mas abaixo do limiar para acao destrutiva.";
  } else if (mandatoryCorrelation && vectorCount >= 2) {
    action = "review_candidate";
    confidence = "Medium";
    reason = "Correlacao wallet + fingerprint + ASN/provedor presente.";
  } else if (score >= 45 || vectorCount >= 2) {
    action = "review_candidate";
    confidence = score >= 65 ? "Medium" : "Low";
    reason = "Ha correlacoes relevantes, mas sem prova suficiente para punicao automatica.";
  } else if (ipOnlySignal && score >= 8) {
    action = "shared_ip_low_confidence";
    confidence = "Low";
    reason = "Apenas IP/rede compartilhada — metadado fraco; exige outros sinais.";
  } else if (score >= 20 || vectorCount >= 1) {
    action = "monitor";
    confidence = "Low";
    reason = "Somente monitoramento; IP e rede continuam metadados de baixa confianca.";
  }

  if (falsePositiveAlert) {
    action = "needs_more_signals";
    confidence = "Low";
    reason = "Conflito entre IP suspeito e geolocalizacao coerente; revisar manualmente.";
  }

  if (!SAFE_ADMIN_ACTIONS.has(action)) {
    action = "review_candidate";
  }

  return {
    confidence,
    action,
    destructiveAllowed: false,
    reason,
  };
}

export function calculateMultiAccountRisk(group) {
  const storedIp = normalizeIp(group?.key);
  if (storedIp && isInfrastructureIp(storedIp)) {
    return isInfrastructureMassSharedIp(group)
      ? buildInfrastructureMisconfigurationDecision(group)
      : buildInfrastructureIpDecision(group);
  }
  if (isInfrastructureMassSharedIp(group)) {
    return buildInfrastructureMisconfigurationDecision(group);
  }
  const technicalAnomalies = detectTechnicalAnomalies(group || {});
  if (technicalAnomalies.length > 0) {
    return buildTechnicalAnomalyDecision(technicalAnomalies);
  }

  const reasons = [];
  const falsePositiveWarnings = [];
  const alerts = [];
  const providerType = group.ipIntelligence?.providerType || "unknown";
  const userCount = Number(group.userCount || group.users?.length || 0);
  const geolocation = group.geolocation || null;
  const ptrAsnCorrelation = classifyPtrAsnCorrelation(group.ipIntelligence);
  let score = 0;

  const fraudKind = String(group.fraudKind || "");
  const sharedLedgerWithdrawTo =
    group.signalType === "onchain_wallet" && fraudKind === "shared_ledger_to_address";
  const sharedLedgerFrom = group.signalType === "onchain_wallet" && fraudKind === "shared_ledger_from_address";
  const ledgerCounterpartyCluster = sharedLedgerWithdrawTo || sharedLedgerFrom;

  /** Same 0x in `transactions.address` is usually many withdrawals to one exchange/custodian — not "same profile wallet". */
  const walletCorrelation =
    group.signalType === "profile_wallet" ||
    (!ledgerCounterpartyCluster && group.signalType === "onchain_wallet") ||
    Number(group.sameWalletCount || 0) > 0;

  const rawDeviceCol = Number(group.sameDeviceCount || 0);
  const ignoreGenericUaOnly =
    ledgerCounterpartyCluster &&
    userCount >= 5 &&
    rawDeviceCol > 0 &&
    Number(group.sameWalletCount || 0) === 0;
  const effectiveDeviceCol = ignoreGenericUaOnly ? 0 : rawDeviceCol;

  const fingerprintCorrelation =
    group.signalType === "device_fingerprint" || effectiveDeviceCol > 0;
  const asnProviderCorrelation = group.signalType === "asn" || SUSPICIOUS_PROVIDER_TYPES.has(providerType) || ptrAsnCorrelation.type === "datacenter_like";
  const mandatoryCorrelation = walletCorrelation && fingerprintCorrelation && asnProviderCorrelation;

  if (sharedLedgerWithdrawTo && userCount >= 2) {
    pushUnique(
      falsePositiveWarnings,
      "Varias contas a levantar para o mesmo endereco 0x e comum (exchange, custodian, mesma carteira de destino). Nao equivale a wallet de perfil duplicada na tabela users."
    );
  }
  if (sharedLedgerFrom && userCount >= 2) {
    pushUnique(
      falsePositiveWarnings,
      "O mesmo endereco 'from' em depositos pode ser gateway custodial ou browser partilhado; confirme com wallet de perfil e fingerprint especifico antes de sancionar."
    );
  }

  if (walletCorrelation) {
    if (group.signalType === "profile_wallet") {
      score += 28;
      pushUnique(reasons, "Mesmo wallet ID aparece em multiplas contas.");
    } else if (!ledgerCounterpartyCluster && group.signalType === "onchain_wallet") {
      score += 32;
      pushUnique(reasons, "Mesma carteira on-chain aparece em multiplas contas.");
    } else if (Number(group.sameWalletCount || 0) > 0) {
      score += 26;
      pushUnique(reasons, "Carteira de perfil repetida entre contas neste agrupamento.");
    }
  }

  if (fingerprintCorrelation) {
    score += group.signalType === "device_fingerprint" ? 34 : 24;
    pushUnique(reasons, "Mesmo fingerprint/hardware do navegador aparece em multiplas contas.");
  }

  if (group.signalType === "asn") {
    score += userCount >= 10 ? 16 : userCount >= 4 ? 10 : 4;
    pushUnique(reasons, `${userCount} contas convergem no mesmo ASN/provedor.`);
    pushUnique(falsePositiveWarnings, "ASN isolado e apenas contexto; nao use como prova automatica.");
  }

  if (group.signalType === "ip_network") {
    score += userCount >= 10 ? 10 : userCount >= 4 ? 6 : 2;
    pushUnique(reasons, `${userCount} contas compartilham a mesma rede derivada.`);
    pushUnique(falsePositiveWarnings, "Sub-rede isolada e apenas contexto; revisar com wallet e fingerprint.");
  }

  const ipOnlySignal = LOW_TRUST_IP_SIGNAL_TYPES.has(group.signalType);
  if (ipOnlySignal) {
    const ipBump = userCount >= 10 ? 6 : userCount >= 4 ? 4 : 1;
    score += Math.min(25, ipBump);
    pushUnique(reasons, `${userCount} contas compartilham sinal de IP (metadado fraco).`);
    pushUnique(
      falsePositiveWarnings,
      "IP compartilhado sozinho nunca autoriza ban — exija wallet, fingerprint ou evidencia financeira.",
    );
  }

  if (Boolean(group.shortCreationWindow) || Boolean(group.sessionTimingCorrelation)) {
    score += 12;
    pushUnique(reasons, "Comportamento temporal/sessao converge entre as contas.");
  }

  if (Number(group.similarIdentityCount) > 0) {
    score += 8;
    pushUnique(reasons, "Padrao de identidade similar entre usuarios.");
  }

  if (SUSPICIOUS_PROVIDER_TYPES.has(providerType)) {
    score += providerType === "hosting" ? 16 : 22;
    pushUnique(reasons, providerType === "hosting"
      ? "PTR/ASN indicam datacenter ou hosting."
      : "PTR/ASN indicam VPN, proxy ou Tor.");
  }

  if (group.ipIntelligence?.proxyDetected === true) {
    score += 14;
    pushUnique(reasons, group.ipIntelligence?.proxyType
      ? `Proxycheck marcou a conexao como ${group.ipIntelligence.proxyType}.`
      : "Proxycheck marcou a conexao como proxy/VPN.");
  }

  if (SHARED_NETWORK_PROVIDER_TYPES.has(providerType)) {
    score -= providerType === "mobile" ? 18 : 12;
    pushUnique(falsePositiveWarnings, providerType === "mobile"
      ? "Rede movel/CGNAT pode concentrar muitos usuarios legitimos no mesmo IP."
      : "Rede residencial/organizacional compartilhada pode concentrar usuarios legitimos.");
  }

  if (ptrAsnCorrelation.type === "residential_like") {
    score -= 8;
    pushUnique(falsePositiveWarnings, "PTR/ASN sugerem operadora residencial; trate IP como apoio e nao como prova.");
  } else if (ptrAsnCorrelation.type === "datacenter_like") {
    score += 6;
    pushUnique(reasons, "Cruze PTR/ASN com outros vetores: a rede parece datacenter-like.");
  }

  const coherentGeo = hasCoherentGeo(group.ipIntelligence, geolocation);
  const suspiciousIp = SUSPICIOUS_PROVIDER_TYPES.has(providerType) || group.ipIntelligence?.proxyDetected === true || ptrAsnCorrelation.type === "datacenter_like";
  const falsePositiveAlert = coherentGeo && suspiciousIp;
  if (falsePositiveAlert) {
    const alert = "Alerta de Falso Positivo";
    pushUnique(alerts, alert);
    pushUnique(falsePositiveWarnings, `${alert}: geolocalizacao coerente conflita com IP suspeito.`);
    pushUnique(reasons, "Geolocalizacao coerente reduz confianca do sinal de rede suspeito.");
    score -= 14;
  }

  if (!mandatoryCorrelation) {
    pushUnique(falsePositiveWarnings, "Sem correlacao obrigatoria entre wallet, fingerprint e ASN/provedor, a acao deve permanecer conservadora.");
  }

  const identityVectors = buildIdentityVectors(
    { ...group, sameDeviceCount: effectiveDeviceCol },
    ptrAsnCorrelation
  );
  score = clampScore(score);
  const level = levelFor(score);
  const decision = buildDecision({
    score,
    identityVectors,
    mandatoryCorrelation,
    falsePositiveAlert,
    ipOnlySignal,
  });
  const legacyConfidence = normalizeConfidenceLevel(decision.confidence).toLowerCase();

  return {
    score,
    level,
    confidence: legacyConfidence,
    reasons: reasons.length ? reasons : ["Nenhum vetor forte de identidade coincidiu."],
    falsePositiveWarnings,
    alerts,
    identityVectors,
    identityVectorCount: identityVectors.length,
    correlation: {
      wallet: walletCorrelation,
      fingerprint: fingerprintCorrelation,
      asnProvider: asnProviderCorrelation,
      mandatorySatisfied: mandatoryCorrelation,
      ptrAsn: ptrAsnCorrelation,
      geolocationCoherent: coherentGeo,
      suspiciousIp,
    },
    decision: {
      confidence: decision.confidence,
      recommendedAction: decision.action,
      destructiveAllowed: decision.destructiveAllowed,
      reason: decision.reason,
      requiresManualReview: decision.action === "review" || decision.action === "manual_review",
    },
    recommendedAction: decision.action,
  };
}
