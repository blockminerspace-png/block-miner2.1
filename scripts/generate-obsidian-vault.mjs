import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const VAULT_DIR = path.join(ROOT, "obsidian-vault");
const FILES_DIR = path.join(VAULT_DIR, "20 - Arquivos");
const INDEX_DIR = path.join(VAULT_DIR, "30 - Índices");

const EXCLUDED_PREFIXES = [
  ".git/",
  "obsidian-vault/",
  "node_modules/",
  "client/node_modules/",
  "contracts/node_modules/",
  ".opencode/node_modules/",
  "client/dist/",
  "coverage/",
  "client/coverage/",
  "contracts/artifacts/",
  "contracts/cache/",
];

const TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md", ".txt", ".py",
  ".sh", ".ps1", ".yaml", ".yml", ".sql", ".html", ".css", ".scss", ".env",
  ".toml", ".conf", ".service", ".timer", ".gitignore", ".dockerignore",
  ".gitattributes", ".mdc"
]);

const LANGUAGE_HINTS = {
  ".js": "JavaScript",
  ".jsx": "React JSX",
  ".mjs": "ESM JavaScript",
  ".cjs": "CommonJS JavaScript",
  ".ts": "TypeScript",
  ".tsx": "React TSX",
  ".json": "JSON",
  ".md": "Markdown",
  ".txt": "Texto",
  ".py": "Python",
  ".sh": "Shell",
  ".ps1": "PowerShell",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".sql": "SQL",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".env": "Environment file",
  ".toml": "TOML",
  ".conf": "Config",
  ".service": "Systemd service",
  ".timer": "Systemd timer",
  ".mdc": "Cursor rule",
};

function escapeWikiTarget(target) {
  return target.replace(/\|/g, "\\|");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function shouldExclude(relPath) {
  return EXCLUDED_PREFIXES.some((prefix) => relPath === prefix.slice(0, -1) || relPath.startsWith(prefix));
}

function isTextFile(relPath) {
  const ext = path.extname(relPath);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const base = path.basename(relPath);
  return [".env", ".gitignore", ".dockerignore", ".gitattributes"].includes(base);
}

function detectDomain(relPath) {
  const top = relPath.split("/")[0];
  if (top === "client") return "frontend";
  if (top === "server") return "backend";
  if (["docker", "nginx", "k8s", "config"].includes(top)) return "infra";
  if (top === "tests") return "tests";
  if (top === "scripts") return "automation";
  if (top === "contracts") return "blockchain";
  if (["backups", "logs", "data", "vendor-notebooklm"].includes(top)) return "local";
  return "workspace";
}

function detectPurpose(relPath) {
  const normalized = relPath.toLowerCase();
  if (normalized.includes("/routes/")) return "Define endpoints e entrada HTTP.";
  if (normalized.includes("/controllers/")) return "Orquestra request/response e chama serviços.";
  if (normalized.includes("/services/")) return "Implementa regra de negócio e integrações.";
  if (normalized.includes("/models/")) return "Camada de acesso e modelagem de dados.";
  if (normalized.includes("/middleware/")) return "Intercepta fluxo HTTP/socket para validação, segurança ou auditoria.";
  if (normalized.includes("/pages/")) return "Página/tela de navegação do frontend.";
  if (normalized.includes("/components/")) return "Componente reutilizável de UI.";
  if (normalized.includes("/hooks/")) return "Hook React para estado, efeitos ou integrações.";
  if (normalized.includes("/utils/")) return "Função utilitária compartilhada.";
  if (normalized.includes("/prisma/migrations/")) return "Migração de banco de dados Prisma.";
  if (normalized.endsWith("package.json")) return "Manifesto de pacote e scripts.";
  if (normalized.endsWith(".test.js") || normalized.endsWith(".test.jsx") || normalized.endsWith(".test.mjs")) return "Arquivo de teste automatizado.";
  if (normalized.includes("docker-compose") || normalized.endsWith("dockerfile")) return "Configuração de container e deploy.";
  if (normalized.endsWith(".md")) return "Documento descritivo ou operacional.";
  if (normalized.endsWith(".json")) return "Configuração ou estrutura de dados.";
  return "Arquivo do projeto.";
}

function detectWhy(relPath) {
  const domain = detectDomain(relPath);
  if (domain === "frontend") return "Existe para entregar a interface e a experiência do usuário.";
  if (domain === "backend") return "Existe para sustentar API, regras de negócio, persistência e automações.";
  if (domain === "infra") return "Existe para provisionar, publicar ou operar o sistema.";
  if (domain === "tests") return "Existe para prevenir regressão e validar comportamento.";
  if (domain === "automation") return "Existe para reduzir trabalho manual em manutenção, migração ou deploy.";
  if (domain === "blockchain") return "Existe para integrar a lógica on-chain e os contratos do projeto.";
  if (domain === "local") return "Existe como artefato local, dado operacional ou dependência vendorizada.";
  return "Existe para compor o workspace e apoiar o funcionamento do projeto.";
}

function isRelativeSpec(spec) {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/");
}

function tryResolveRelative(relPath, spec, knownFiles) {
  const absBase = path.resolve(ROOT, path.dirname(relPath));
  const attemptBase = spec.startsWith("/")
    ? path.resolve(ROOT, `.${spec}`)
    : path.resolve(absBase, spec);

  const candidates = [
    attemptBase,
    `${attemptBase}.js`,
    `${attemptBase}.jsx`,
    `${attemptBase}.mjs`,
    `${attemptBase}.cjs`,
    `${attemptBase}.ts`,
    `${attemptBase}.tsx`,
    `${attemptBase}.json`,
    `${attemptBase}.md`,
    path.join(attemptBase, "index.js"),
    path.join(attemptBase, "index.jsx"),
    path.join(attemptBase, "index.mjs"),
    path.join(attemptBase, "index.ts"),
    path.join(attemptBase, "index.tsx"),
  ];

  for (const candidate of candidates) {
    const relCandidate = toPosix(path.relative(ROOT, candidate));
    if (knownFiles.has(relCandidate)) return relCandidate;
  }
  return null;
}

function extractSpecs(content) {
  const specs = new Set();
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /from\s+['"]([^'"]+)['"]/g,
    /href:\s*['"]([^'"]+)['"]/g,
    /src:\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content))) {
      specs.add(match[1]);
    }
  }
  return [...specs];
}

function describeConnections(relPath, refs) {
  if (refs.length === 0) return "Sem dependências locais detectadas automaticamente.";
  if (relPath === "server/server.js") return "Ponto de montagem do backend; importa rotas, middlewares, engine e serviços-base.";
  if (relPath === "client/src/app/App.tsx") return "Ponto central do roteamento do frontend; conecta páginas, layout e guardas.";
  return "Conecta-se diretamente aos arquivos listados em dependências locais detectadas.";
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = toPosix(path.relative(ROOT, abs));
    if (shouldExclude(rel)) continue;
    if (entry.isDirectory()) {
      await walk(abs, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

function sortPaths(paths) {
  return paths.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function sanitizeSegment(segment) {
  return segment.replace(/[\\:*?"<>|]/g, "_");
}

function notePathForFile(relPath) {
  const parts = relPath.split("/").map(sanitizeSegment);
  return path.join(FILES_DIR, ...parts) + ".md";
}

function wikiForFile(relPath) {
  return `[[20 - Arquivos/${escapeWikiTarget(relPath)}|${relPath}]]`;
}

async function main() {
  const files = sortPaths(await walk(ROOT));
  const knownFiles = new Set(files);
  const graph = new Map();
  const backlinks = new Map();
  const metadata = new Map();

  for (const relPath of files) {
    const absPath = path.join(ROOT, relPath);
    const stat = await fs.stat(absPath);
    let refs = [];
    let textPreview = null;

    if (isTextFile(relPath)) {
      try {
        const content = await fs.readFile(absPath, "utf8");
        textPreview = content.slice(0, 5000);
        refs = extractSpecs(content)
          .filter(isRelativeSpec)
          .map((spec) => tryResolveRelative(relPath, spec, knownFiles))
          .filter(Boolean);
      } catch {
        textPreview = null;
      }
    }

    refs = [...new Set(refs)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    graph.set(relPath, refs);
    for (const ref of refs) {
      if (!backlinks.has(ref)) backlinks.set(ref, []);
      backlinks.get(ref).push(relPath);
    }
    metadata.set(relPath, {
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      ext: path.extname(relPath),
      language: LANGUAGE_HINTS[path.extname(relPath)] || "Arquivo",
      domain: detectDomain(relPath),
      purpose: detectPurpose(relPath),
      why: detectWhy(relPath),
      preview: textPreview,
    });
  }

  await ensureDir(FILES_DIR);
  await ensureDir(INDEX_DIR);
  await ensureDir(path.join(VAULT_DIR, ".obsidian"));
  await fs.writeFile(
    path.join(VAULT_DIR, "20 - Arquivos.md"),
    [
      "# 20 - Arquivos",
      "",
      "Coleção completa de notas por arquivo geradas automaticamente.",
      "",
      "- Cada nota espelha um caminho real do projeto.",
      "- As ligações são baseadas em dependências locais estáticas detectáveis.",
      "- Para navegar por área, comece em [[01 - Mapa Detalhado]] ou em [[30 - Índices]].",
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(VAULT_DIR, "30 - Índices.md"),
    [
      "# 30 - Índices",
      "",
      "Pasta de índices por área do workspace.",
      "",
      "- Use estes índices para entrar em grupos grandes sem depender só do grafo global.",
    ].join("\n") + "\n",
    "utf8",
  );

  const byTopLevel = new Map();
  for (const relPath of files) {
    const top = relPath.split("/")[0];
    if (!byTopLevel.has(top)) byTopLevel.set(top, []);
    byTopLevel.get(top).push(relPath);
  }

  const trackedLikeCount = files.length;

  const topIndexLines = [
    "# 01 - Mapa Detalhado",
    "",
    "Vault gerado automaticamente a partir do filesystem do projeto.",
    "",
    `- Arquivos documentados individualmente: \`${trackedLikeCount}\``,
    `- Diretórios excluídos por serem dependências/cache/artefatos: \`${EXCLUDED_PREFIXES.join("`, `")}\``,
    "",
    "## Índices por área",
    "",
  ];

  for (const [top, topFiles] of [...byTopLevel.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))) {
    const noteName = `30 - Índice - ${top}.md`;
    topIndexLines.push(`- [[30 - Índices/${noteName.replace(/\.md$/, "")}|${top}]]: ${topFiles.length} arquivos`);
  }

  await fs.writeFile(
    path.join(VAULT_DIR, "01 - Mapa Detalhado.md"),
    `${topIndexLines.join("\n")}\n`,
    "utf8",
  );

  for (const [top, topFiles] of [...byTopLevel.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))) {
    const lines = [
      `# Índice ${top}`,
      "",
      `Total de arquivos nesta área: \`${topFiles.length}\``,
      "",
      "## Arquivos",
      "",
    ];
    for (const relPath of topFiles) {
      const info = metadata.get(relPath);
      lines.push(`- ${wikiForFile(relPath)} | ${info.domain} | ${info.language} | ${info.purpose}`);
    }
    await fs.writeFile(path.join(INDEX_DIR, `30 - Índice - ${sanitizeSegment(top)}.md`), `${lines.join("\n")}\n`, "utf8");
  }

  for (const relPath of files) {
    const info = metadata.get(relPath);
    const refs = graph.get(relPath) || [];
    const inbound = (backlinks.get(relPath) || []).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const notePath = notePathForFile(relPath);
    await ensureDir(path.dirname(notePath));

    const lines = [
      "---",
      `source_path: ${JSON.stringify(relPath)}`,
      `domain: ${info.domain}`,
      `language: ${JSON.stringify(info.language)}`,
      `extension: ${JSON.stringify(info.ext || "(sem extensão)")}`,
      `size_bytes: ${info.size}`,
      `modified_at: ${JSON.stringify(info.mtime)}`,
      `outbound_local_refs: ${refs.length}`,
      `inbound_local_refs: ${inbound.length}`,
      "---",
      "",
      `# ${relPath}`,
      "",
      "## O que é",
      "",
      `${info.purpose}`,
      "",
      "## Por que existe",
      "",
      `${info.why}`,
      "",
      "## O que conecta com quem",
      "",
      `${describeConnections(relPath, refs)}`,
      "",
      "## Dependências locais detectadas",
      "",
    ];

    if (refs.length === 0) {
      lines.push("- Nenhuma dependência local detectada.");
    } else {
      for (const ref of refs) {
        lines.push(`- Usa ${wikiForFile(ref)}`);
      }
    }

    lines.push("", "## Referenciado por", "");

    if (inbound.length === 0) {
      lines.push("- Nenhum backlink local detectado.");
    } else {
      for (const ref of inbound) {
        lines.push(`- É usado por ${wikiForFile(ref)}`);
      }
    }

    lines.push("", "## Classificação", "", `- Domínio: \`${info.domain}\``, `- Linguagem/tipo: \`${info.language}\``, `- Tamanho: \`${info.size} bytes\``);

    if (info.preview && isTextFile(relPath)) {
      lines.push("", "## Observação técnica", "", "Análise automática baseada em caminho, extensão e referências locais estáticas.");
    }

    lines.push("", "## Navegação", "", `- Voltar ao [[01 - Mapa Detalhado]]`, `- Ver índice da área em [[30 - Índices/30 - Índice - ${sanitizeSegment(relPath.split("/")[0])}|${relPath.split("/")[0]}]]`);

    await fs.writeFile(notePath, `${lines.join("\n")}\n`, "utf8");
  }

  const homeLines = [
    "# BlockMiner 2.1 Vault",
    "",
    "Este vault foi expandido para documentar arquivos individualmente e suas conexões locais detectáveis.",
    "",
    `- Arquivos com nota própria: \`${trackedLikeCount}\``,
    "- Dependências de terceiros e artefatos pesados foram excluídos da expansão nota-a-nota para preservar desempenho do Obsidian.",
    "",
    "## Entradas principais",
    "",
    "- [[01 - Mapa Detalhado]]",
    "- [[10 - Árvore Raiz]]",
    "- [[11 - Frontend Client]]",
    "- [[12 - Backend Server]]",
    "- [[13 - Infra, Deploy e Operação]]",
    "- [[14 - Testes e Qualidade]]",
    "- [[15 - Áreas Locais, Geradas e Sensíveis]]",
    "",
    "## Pasta de notas geradas",
    "",
    "- [[20 - Arquivos]]",
    "- [[30 - Índices]]",
  ];

  await fs.writeFile(path.join(VAULT_DIR, "00 - Início.md"), `${homeLines.join("\n")}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
