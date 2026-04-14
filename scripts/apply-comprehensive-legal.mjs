/**
 * Applies expanded Privacy Policy and Terms of Use to all i18n locale files.
 * Run from repo root: node scripts/apply-comprehensive-legal.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "client", "src", "i18n", "locales");

function load(locale) {
  return JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8"));
}

function save(locale, data) {
  fs.writeFileSync(path.join(localesDir, `${locale}.json`), JSON.stringify(data, null, 2) + "\n", "utf8");
}

const common = {
  en: {
    skipToContent: "Skip to legal content",
    backToHome: "Home",
    scrollToTop: "Back to top",
  },
  "pt-BR": {
    skipToContent: "Ir para o conteúdo legal",
    backToHome: "Início",
    scrollToTop: "Voltar ao topo",
  },
  es: {
    skipToContent: "Ir al contenido legal",
    backToHome: "Inicio",
    scrollToTop: "Volver arriba",
  },
};

const privacy = {
  en: {
    meta: {
      title: "Privacy Policy | BlockMiner",
      description:
        "How BlockMiner collects, uses, stores, shares, and protects personal data across blockminer.space and related services (GDPR, LGPD, and U.S. state privacy practices).",
    },
    eyebrow: "Legal",
    title: "Privacy Policy",
    intro:
      "This Privacy Policy describes how BlockMiner (“we”, “us”, “our”) processes personal data when you visit blockminer.space, use our web application, create an account, link a wallet, participate in gameplay, rewards, or referrals, or contact support. It is intended to meet transparency expectations under the EU General Data Protection Regulation (GDPR), the Brazilian Lei Geral de Proteção de Dados (LGPD), and common disclosure practices for U.S. state consumer privacy laws (including California) where applicable. If you do not agree, please discontinue use of the Services.",
    sections: {
      controllerContact: {
        title: "1. Data controller, representative contacts, and scope",
        paragraphs: [
          "The data controller responsible for personal data processed through BlockMiner is the operating entity identified on the platform’s legal or transparency pages, doing business as BlockMiner. Contact for privacy matters is primarily through the official support channels published on blockminer.space (for example Discord, Telegram, or a published support email).",
          "If we appoint a Data Protection Officer (DPO) or an EU/UK representative where required by law, we will publish their contact details in this section or on a linked compliance page. Until such appointment is published, privacy requests should be submitted through the same official support channels.",
          "This policy applies to processing related to our website, authenticated application, APIs, customer support, security operations, fraud prevention, marketing communications (where used), and integrations with third-party wallet, payment, analytics, or infrastructure providers that we configure.",
        ],
        bullets: [
          "Controller identity: published on the platform (trade name BlockMiner).",
          "Primary contact: official support channel listed on blockminer.space.",
          "Supervisory authorities: see Section 15.",
        ],
      },
      scopeDefinitions: {
        title: "2. Definitions and roles",
        paragraphs: [
          "“Personal data” means information relating to an identified or identifiable individual. “Processing” includes collection, storage, use, disclosure, restriction, erasure, and similar operations. “You” means visitors and registered users.",
          "Where we process personal data on behalf of another party as a processor, contractual terms govern that relationship; this policy describes our practices as controller for the BlockMiner product unless we state otherwise.",
        ],
      },
      categoriesCollected: {
        title: "3. Categories of personal data we process",
        paragraphs: [
          "We may process the following categories, depending on how you use the Services:",
        ],
        bullets: [
          "Account and profile: username, email address, password hash, referral or invitation codes, language preferences, and profile settings.",
          "Security and session: authentication tokens, session identifiers, device/browser metadata, IP address, approximate location derived from IP, timestamps, anti-abuse signals, and audit logs.",
          "Gameplay and economy: in-platform balances, mining or hashrate metrics, reward history, shop or inventory events, task completion records, and similar operational logs tied to your account.",
          "Wallet and on-chain context: wallet addresses you connect or provide, chain identifiers, transaction references relevant to deposits/withdrawals, and risk-screening outcomes (we do not store private keys or seed phrases).",
          "Support and communications: messages you send us, dispute details, and attachments you choose to provide.",
          "Marketing (optional): email or in-product identifiers used for newsletters or promotions when you opt in.",
        ],
      },
      purposesLegalBases: {
        title: "4. Purposes of processing and legal bases (GDPR / UK GDPR)",
        paragraphs: [
          "Where GDPR or UK GDPR applies, we rely on one or more of the following legal bases: performance of a contract (Art. 6(1)(b)), legitimate interests (Art. 6(1)(f)), consent (Art. 6(1)(a)), and legal obligation (Art. 6(1)(c)). Where LGPD applies, we rely on compatible bases such as performance of services, compliance with legal obligations, legitimate interest, consent where required, and protection of credit or fraud prevention where applicable.",
          "We process account and security data to create and maintain accounts, authenticate users, prevent fraud and abuse, enforce policies, and secure the platform—typically contract necessity and legitimate interests in security and integrity.",
          "We process gameplay and economy data to operate features, calculate rewards, provide leaderboards or statistics where offered, and improve balancing—typically contract necessity and legitimate interests in product operation.",
          "We process wallet-related data to facilitate optional deposits/withdrawals, reconcile transactions, and meet compliance obligations—typically contract necessity, legal obligation, and legitimate interests in fraud prevention.",
          "We may send service messages (for example security alerts or policy updates) without marketing consent where permitted. Marketing messages require consent or another valid basis under local law.",
        ],
      },
      cookiesIdentifiers: {
        title: "5. Cookies, local storage, and similar technologies",
        paragraphs: [
          "We use cookies and similar technologies to maintain sessions, protect against CSRF and replay attacks, remember preferences, and measure basic product performance. Strictly necessary cookies may be placed without consent where required to deliver the service safely.",
          "If we deploy non-essential analytics or advertising technologies, we will provide a consent mechanism where required by law (for example the ePrivacy Directive / national implementations) and describe choices in-product or via browser settings.",
          "You can control cookies through your browser; disabling strictly necessary cookies may break sign-in or security features.",
        ],
      },
      walletsBlockchain: {
        title: "6. Wallet data, blockchain transparency, and third-party networks",
        paragraphs: [
          "Public blockchains are not controlled by BlockMiner. Wallet addresses and transaction details you broadcast may be visible on-chain indefinitely and processed by miners, indexers, and analytics providers independent of us.",
          "We do not ask for seed phrases or private keys. Never share them with anyone claiming to represent support.",
          "To reduce risk, use official in-app flows only, verify network and token details, and understand that mistaken transfers may be irreversible.",
        ],
      },
      minors: {
        title: "7. Children and minors",
        paragraphs: [
          "BlockMiner is not directed to children under the age required to enter a binding contract in their jurisdiction. We do not knowingly collect personal data from children below that age. If you believe a minor has provided data, contact us and we will take appropriate steps to delete or restrict processing, subject to law.",
        ],
      },
      sources: {
        title: "8. Sources of personal data",
        paragraphs: [
          "We collect data directly from you (forms, gameplay, wallet connections), automatically from your device and our servers (logs, telemetry needed for security), and occasionally from third parties such as fraud vendors, identity verification providers (if used), or advertising/attribution partners (if you consent).",
        ],
      },
      recipients: {
        title: "9. Recipients, processors, and onward transfers",
        paragraphs: [
          "We may disclose personal data to hosting and cloud providers, email and messaging services, database and monitoring tools, payment or wallet infrastructure partners, customer support platforms, analytics vendors (where permitted), professional advisers, and authorities when required by law.",
          "We use contractual safeguards with processors (including data processing agreements) requiring confidentiality, security measures, and assistance with data subject requests where applicable.",
        ],
      },
      internationalTransfers: {
        title: "10. International transfers",
        paragraphs: [
          "We may process or store data in countries outside your own, including outside the European Economic Area (EEA), the UK, or Brazil. Where required, we implement appropriate safeguards such as Standard Contractual Clauses (SCCs), UK Addendum, or other mechanisms recognized under applicable law.",
          "You may request further information about safeguards by contacting us; copies may be redacted for confidentiality where permitted.",
        ],
      },
      retentionSecurity: {
        title: "11. Retention and security",
        paragraphs: [
          "We retain personal data only as long as necessary for the purposes described, including security, dispute resolution, and legal compliance. Criteria include account status, ongoing investigations, statutory limitation periods, and technical backup cycles. Aggregated or de-identified data may be retained longer.",
          "We implement administrative, technical, and organizational measures designed to protect personal data, including access controls, encryption in transit where appropriate, logging, vulnerability management, and staff training. No method of transmission or storage is 100% secure.",
        ],
      },
      breachesAutomation: {
        title: "12. Personal data breaches and automated decision-making",
        paragraphs: [
          "We maintain internal procedures to detect, assess, and (where required) notify supervisory authorities and affected individuals about personal data breaches without undue delay.",
          "We may use automated systems to score risk, detect cheating, or prioritize support. Where a decision produces legal or similarly significant effects solely by automated means, we will provide information required by law, including meaningful logic, significance, and your rights to human review where applicable.",
        ],
      },
      rights: {
        title: "13. Your privacy rights",
        paragraphs: [
          "Depending on your jurisdiction, you may have rights to access, rectify, erase, restrict processing, object to certain processing, withdraw consent, data portability, and information about automated decisions. LGPD grants rights such as confirmation of processing, access, correction, anonymization/blocking, deletion, portability, information about sharing, and revocation of consent.",
        ],
        bullets: [
          "Access: request a copy or summary of personal data we hold about you.",
          "Correction: request correction of inaccurate or incomplete data.",
          "Deletion: request deletion subject to legal exceptions (for example retention for fraud prevention).",
          "Restriction / objection: request restriction or object to processing based on legitimate interests or direct marketing.",
          "Portability: receive structured data you provided where technically feasible.",
          "Complaints: lodge a complaint with a supervisory authority (see Section 15).",
        ],
      },
      marketingOptOut: {
        title: "14. Marketing preferences and Do Not Track",
        paragraphs: [
          "You can opt out of marketing emails using unsubscribe links or by contacting support. Some jurisdictions grant rights to limit “sale” or “sharing” of personal information for cross-context behavioral advertising; where applicable, we will provide a clear mechanism or honor legally recognized global privacy control signals as required.",
          "Unless required by law, we do not respond to “Do Not Track” browser signals as a uniform standard does not exist.",
        ],
      },
      updatesComplaints: {
        title: "15. Changes, complaints, and contact",
        paragraphs: [
          "We may update this Privacy Policy by posting a revised version and updating the “Last updated” date. Where changes are material and consent is required, we will seek consent or provide notice as required by law.",
          "EU/EEA users may contact their local supervisory authority (for example a national DPA). UK users may contact the ICO. Brazilian users may contact the Autoridade Nacional de Proteção de Dados (ANPD). California residents may contact the California Privacy Protection Agency or pursue other rights under applicable law.",
          "For privacy requests, contact official BlockMiner support with sufficient detail to verify your identity. We may request additional information to prevent fraudulent requests. We will respond within timelines required by applicable law (often within 30 days for GDPR/LGPD, subject to extensions where permitted).",
        ],
      },
    },
  },
  "pt-BR": {
    meta: {
      title: "Política de Privacidade | BlockMiner",
      description:
        "Como o BlockMiner coleta, usa, armazena, partilha e protege dados pessoais em blockminer.space (GDPR, LGPD e práticas de privacidade nos EUA).",
    },
    eyebrow: "Legal",
    title: "Política de Privacidade",
    intro:
      "Esta Política de Privacidade descreve como o BlockMiner (“nós”, “nos”, “nosso”) trata dados pessoais quando visita blockminer.space, utiliza a aplicação web, cria conta, associa carteira, participa em jogo, recompensas ou indicações, ou contacta o suporte. Visa transparência conforme o RGPD (UE/Reino Unido), a LGPD (Brasil) e práticas comuns de leis estaduais dos EUA (incluindo Califórnia), quando aplicável. Se não concordar, deixe de usar os Serviços.",
    sections: {
      controllerContact: {
        title: "1. Responsável pelo tratamento, contactos e âmbito",
        paragraphs: [
          "O responsável pelo tratamento dos dados pessoais processados através do BlockMiner é a entidade operacional identificada nas páginas legais ou de transparência da plataforma, comercialmente como BlockMiner. O contacto para questões de privacidade é principalmente pelos canais oficiais de suporte publicados em blockminer.space (por exemplo Discord, Telegram ou e-mail de suporte publicado).",
          "Se nomearmos um Encarregado de Proteção de Dados (DPO) ou um representante na UE/Reino Unido quando a lei exigir, publicaremos os contactos nesta secção ou numa página de conformidade ligada. Até essa publicação, os pedidos de privacidade devem ser enviados pelos mesmos canais oficiais de suporte.",
          "Esta política aplica-se ao tratamento relacionado com o nosso site, aplicação autenticada, APIs, suporte ao cliente, operações de segurança, prevenção a fraude, comunicações de marketing (quando utilizadas) e integrações com fornecedores de carteira, pagamento, analytics ou infraestrutura que configuramos.",
        ],
        bullets: [
          "Identidade do responsável: publicada na plataforma (nome comercial BlockMiner).",
          "Contacto principal: canal oficial de suporte listado em blockminer.space.",
          "Autoridades de supervisão: ver Secção 15.",
        ],
      },
      scopeDefinitions: {
        title: "2. Definições e papéis",
        paragraphs: [
          "“Dados pessoais” significa informação relativa a uma pessoa singular identificada ou identificável. “Tratamento” inclui recolha, armazenamento, uso, divulgação, limitação, eliminação e operações semelhantes. “Você” significa visitantes e utilizadores registados.",
          "Quando tratamos dados pessoais em nome de outra entidade como subcontratante, aplicam-se termos contratuais; esta política descreve as nossas práticas como responsável pelo produto BlockMiner salvo indicação em contrário.",
        ],
      },
      categoriesCollected: {
        title: "3. Categorias de dados pessoais que tratamos",
        paragraphs: ["Podemos tratar as seguintes categorias, consoante a utilização dos Serviços:"],
        bullets: [
          "Conta e perfil: nome de utilizador, e-mail, hash da palavra-passe, códigos de indicação, preferências de idioma e definições de perfil.",
          "Segurança e sessão: tokens de autenticação, identificadores de sessão, metadados de dispositivo/navegador, endereço IP, localização aproximada derivada do IP, carimbos de data/hora, sinais antifraude e registos de auditoria.",
          "Jogo e economia: saldos internos, métricas de mineração ou hashrate, histórico de recompensas, eventos de loja ou inventário, registos de tarefas e registos operacionais associados à conta.",
          "Carteira e contexto on-chain: endereços de carteira que associa, identificadores de rede, referências de transação relevantes para depósitos/saques e resultados de triagem de risco (não armazenamos chaves privadas nem frases-semente).",
          "Suporte e comunicações: mensagens que nos envia, detalhes de litígios e anexos que opte por fornecer.",
          "Marketing (opcional): e-mail ou identificadores in-app para newsletters ou promoções quando der consentimento.",
        ],
      },
      purposesLegalBases: {
        title: "4. Finalidades e bases legais (RGPD / UK GDPR e LGPD)",
        paragraphs: [
          "Quando o RGPD ou UK GDPR se aplica, podemos fundamentar o tratamento na execução de contrato (art. 6(1)(b)), interesses legítimos (art. 6(1)(f)), consentimento (art. 6(1)(a)) e obrigação legal (art. 6(1)(c)). Sob a LGPD, podemos fundamentar em bases compatíveis como execução de serviços, cumprimento de obrigações legais, interesse legítimo, consentimento quando necessário e prevenção a fraude.",
          "Tratamos dados de conta e segurança para criar e manter contas, autenticar utilizadores, prevenir fraude e abuso, aplicar políticas e proteger a plataforma — tipicamente necessidade contratual e interesses legítimos em segurança.",
          "Tratamos dados de jogo e economia para operar funcionalidades, calcular recompensas, fornecer rankings ou estatísticas quando oferecidos e melhorar o equilíbrio — tipicamente necessidade contratual e interesses legítimos.",
          "Tratamos dados relacionados com carteiras para facilitar depósitos/saques opcionais, reconciliar transações e cumprir obrigações de conformidade — tipicamente contrato, obrigação legal e interesse legítimo na prevenção a fraude.",
          "Podemos enviar mensagens de serviço (alertas de segurança ou atualizações de políticas) sem consentimento de marketing quando permitido. Mensagens de marketing exigem consentimento ou outra base válida.",
        ],
      },
      cookiesIdentifiers: {
        title: "5. Cookies, armazenamento local e tecnologias semelhantes",
        paragraphs: [
          "Utilizamos cookies e tecnologias semelhantes para manter sessões, proteger contra CSRF e ataques de repetição, memorizar preferências e medir desempenho básico. Cookies estritamente necessários podem ser colocados sem consentimento quando indispensáveis à prestação segura do serviço.",
          "Se implementarmos analytics ou publicidade não essenciais, forneceremos mecanismo de consentimento quando a lei exigir e descreveremos as opções no produto ou nas definições do navegador.",
          "Pode controlar cookies no navegador; desativar cookies necessários pode impedir o início de sessão ou funcionalidades de segurança.",
        ],
      },
      walletsBlockchain: {
        title: "6. Dados de carteira, transparência blockchain e redes de terceiros",
        paragraphs: [
          "Blockchains públicas não são controladas pelo BlockMiner. Endereços e transações que difunda podem ficar visíveis on-chain indefinidamente e ser tratados por mineradores, indexadores e fornecedores de analytics independentes de nós.",
          "Não pedimos frases-semente nem chaves privadas. Nunca as partilhe com quem alegue ser suporte.",
          "Para reduzir risco, use apenas fluxos oficiais na aplicação, verifique rede e token, e tenha em conta que transferências erradas podem ser irreversíveis.",
        ],
      },
      minors: {
        title: "7. Crianças e menores",
        paragraphs: [
          "O BlockMiner não se dirige a crianças abaixo da idade necessária para celebrar contrato na sua jurisdição. Não recolhemos conscientemente dados de menores abaixo dessa idade. Se acreditar que um menor forneceu dados, contacte-nos e adotaremos medidas para eliminar ou restringir o tratamento, conforme a lei.",
        ],
      },
      sources: {
        title: "8. Origens dos dados pessoais",
        paragraphs: [
          "Recolhemos dados diretamente de si (formulários, jogo, ligações de carteira), automaticamente do dispositivo e dos nossos servidores (registos, telemetria necessária à segurança) e ocasionalmente de terceiros como fornecedores antifraude, verificação de identidade (se usada) ou parceiros de publicidade/atribuição (se consentir).",
        ],
      },
      recipients: {
        title: "9. Destinatários, subcontratantes e transferências subsequentes",
        paragraphs: [
          "Podemos divulgar dados pessoais a fornecedores de alojamento e cloud, serviços de e-mail e mensagens, bases de dados e monitorização, parceiros de pagamento ou infraestrutura de carteiras, plataformas de suporte, fornecedores de analytics (quando permitido), consultores e autoridades quando a lei o exigir.",
          "Utilizamos salvaguardas contratuais com subcontratantes (incluindo acordos de tratamento de dados) exigindo confidencialidade, medidas de segurança e assistência em pedidos dos titulares quando aplicável.",
        ],
      },
      internationalTransfers: {
        title: "10. Transferências internacionais",
        paragraphs: [
          "Podemos tratar ou armazenar dados fora do seu país, incluindo fora do EEE, Reino Unido ou Brasil. Quando exigido, implementamos garantias adequadas como Cláusulas Contratuais-Tipo (SCC), Addendum do Reino Unido ou outros mecanismos reconhecidos.",
          "Pode solicitar mais informação sobre garantias contactando-nos; cópias podem ser redigidas por confidencialidade quando permitido.",
        ],
      },
      retentionSecurity: {
        title: "11. Conservação e segurança",
        paragraphs: [
          "Conservamos dados pessoais apenas pelo tempo necessário às finalidades descritas, incluindo segurança, resolução de litígios e cumprimento legal. Critérios incluem estado da conta, investigações em curso, prazos legais e ciclos de cópia de segurança. Dados agregados ou pseudonimizados podem ser conservados por mais tempo.",
          "Aplicamos medidas administrativas, técnicas e organizacionais para proteger dados pessoais, incluindo controlos de acesso, encriptação em trânsito quando apropriado, registos, gestão de vulnerabilidades e formação. Nenhum método é 100% seguro.",
        ],
      },
      breachesAutomation: {
        title: "12. Violações de dados e decisões automatizadas",
        paragraphs: [
          "Mantemos procedimentos internos para detetar, avaliar e (quando exigido) notificar autoridades de supervisão e titulares sobre violações de dados pessoais sem demora indevida.",
          "Podemos usar sistemas automatizados para pontuar risco, detetar batotas ou priorizar suporte. Quando uma decisão produz efeitos jurídicos ou significativos apenas por meios automatizados, forneceremos informação exigida pela lei, incluindo lógica, importância e direitos de revisão humana quando aplicável.",
        ],
      },
      rights: {
        title: "13. Os seus direitos de privacidade",
        paragraphs: [
          "Consoante a jurisdição, pode ter direitos de acesso, retificação, apagamento, limitação do tratamento, oposição a certos tratamentos, retirada do consentimento, portabilidade e informação sobre decisões automatizadas. A LGPD prevê confirmação de tratamento, acesso, correção, anonimização/bloqueio, eliminação, portabilidade, informação sobre partilhas e revogação do consentimento.",
        ],
        bullets: [
          "Acesso: pedir cópia ou resumo dos dados que conservamos sobre si.",
          "Retificação: corrigir dados inexatos ou incompletos.",
          "Eliminação: pedir apagamento sujeito a exceções legais (ex.: retenção antifraude).",
          "Limitação / oposição: limitar ou opor-se a tratamentos baseados em interesses legítimos ou marketing direto.",
          "Portabilidade: receber dados estruturados que forneceu quando tecnicamente viável.",
          "Reclamações: apresentar reclamação a uma autoridade de supervisão (ver Secção 15).",
        ],
      },
      marketingOptOut: {
        title: "14. Preferências de marketing e Do Not Track",
        paragraphs: [
          "Pode cancelar marketing por e-mail através de links de cancelamento de subscrição ou contactando o suporte. Algumas jurisdições concedem direitos para limitar a “venda” ou “partilha” para publicidade entre contextos; quando aplicável, forneceremos mecanismo claro ou honraremos sinais legais reconhecidos.",
          "Salvo obrigação legal, não respondemos de forma uniforme a sinais “Do Not Track” por ausência de padrão único.",
        ],
      },
      updatesComplaints: {
        title: "15. Alterações, reclamações e contacto",
        paragraphs: [
          "Podemos atualizar esta Política publicando uma versão revista e atualizando a data de “Última atualização”. Quando as alterações forem materiais e o consentimento for exigido, solicitaremos consentimento ou daremos aviso conforme a lei.",
          "Utilizadores da UE/EEE podem contactar a autoridade de proteção de dados local. No Reino Unido, a ICO. No Brasil, a ANPD. Residentes na Califórnia podem contactar a CPPA ou exercer outros direitos aplicáveis.",
          "Para pedidos de privacidade, contacte o suporte oficial do BlockMiner com detalhes suficientes para verificar a identidade. Podemos solicitar informação adicional para prevenir pedidos fraudulentos. Responderemos nos prazos legais (frequentemente até 30 dias no RGPD/LGPD, com extensões quando permitido).",
        ],
      },
    },
  },
  es: {
    meta: {
      title: "Política de Privacidad | BlockMiner",
      description:
        "Cómo BlockMiner recopila, usa, almacena, comparte y protege datos personales en blockminer.space (RGPD, LGPD y leyes estatales de EE. UU.).",
    },
    eyebrow: "Legal",
    title: "Política de Privacidad",
    intro:
      "Esta Política de Privacidad describe cómo BlockMiner (“nosotros”, “nos”) trata datos personales cuando visita blockminer.space, usa la aplicación web, crea una cuenta, vincula una cartera, participa en el juego, recompensas o referidos, o contacta al soporte. Está pensada para la transparencia bajo el RGPD (UE/Reino Unido), la LGPD (Brasil) y prácticas habituales de leyes estatales de privacidad de EE. UU. (incluida California), cuando corresponda. Si no está de acuerdo, deje de usar los Servicios.",
    sections: {
      controllerContact: {
        title: "1. Responsable del tratamiento, contactos y alcance",
        paragraphs: [
          "El responsable del tratamiento de los datos personales procesados a través de BlockMiner es la entidad operativa identificada en las páginas legales o de transparencia de la plataforma, comercialmente como BlockMiner. El contacto para asuntos de privacidad es principalmente a través de los canales oficiales de soporte publicados en blockminer.space (por ejemplo Discord, Telegram o correo de soporte publicado).",
          "Si designamos un Delegado de Protección de Datos (DPO) o un representante en la UE/Reino Unido cuando la ley lo exija, publicaremos los datos de contacto en esta sección o en una página de cumplimiento vinculada. Hasta entonces, las solicitudes de privacidad deben enviarse por los mismos canales oficiales de soporte.",
          "Esta política se aplica al tratamiento relacionado con nuestro sitio web, aplicación autenticada, APIs, atención al cliente, operaciones de seguridad, prevención del fraude, comunicaciones de marketing (cuando se utilicen) e integraciones con proveedores de cartera, pago, analítica o infraestructura que configuremos.",
        ],
        bullets: [
          "Identidad del responsable: publicada en la plataforma (nombre comercial BlockMiner).",
          "Contacto principal: canal oficial de soporte listado en blockminer.space.",
          "Autoridades de supervisión: ver Sección 15.",
        ],
      },
      scopeDefinitions: {
        title: "2. Definiciones y roles",
        paragraphs: [
          "“Datos personales” significa información relativa a una persona física identificada o identificable. “Tratamiento” incluye recopilación, almacenamiento, uso, divulgación, limitación, borrado y operaciones similares. “Usted” significa visitantes y usuarios registrados.",
          "Cuando tratamos datos personales en nombre de otro como encargado, rigen términos contractuales; esta política describe nuestras prácticas como responsables del producto BlockMiner salvo que indiquemos lo contrario.",
        ],
      },
      categoriesCollected: {
        title: "3. Categorías de datos personales que tratamos",
        paragraphs: ["Podemos tratar las siguientes categorías, según cómo use los Servicios:"],
        bullets: [
          "Cuenta y perfil: nombre de usuario, correo electrónico, hash de contraseña, códigos de referido, preferencias de idioma y ajustes de perfil.",
          "Seguridad y sesión: tokens de autenticación, identificadores de sesión, metadatos de dispositivo/navegador, dirección IP, ubicación aproximada derivada de la IP, marcas de tiempo, señales antifraude y registros de auditoría.",
          "Juego y economía: saldos internos, métricas de minería o hashrate, historial de recompensas, eventos de tienda o inventario, registros de tareas y registros operativos vinculados a la cuenta.",
          "Cartera y contexto on-chain: direcciones de cartera que conecta, identificadores de red, referencias de transacción relevantes para depósitos/retiros y resultados de evaluación de riesgos (no almacenamos claves privadas ni frases semilla).",
          "Soporte y comunicaciones: mensajes que nos envía, detalles de disputas y archivos adjuntos que elija proporcionar.",
          "Marketing (opcional): correo o identificadores in-app para boletines o promociones cuando dé su consentimiento.",
        ],
      },
      purposesLegalBases: {
        title: "4. Finalidades y bases legales (RGPD / UK GDPR y LGPD)",
        paragraphs: [
          "Cuando se aplica el RGPD o UK GDPR, podemos basarnos en la ejecución del contrato (art. 6(1)(b)), intereses legítimos (art. 6(1)(f)), consentimiento (art. 6(1)(a)) y obligación legal (art. 6(1)(c)). Bajo la LGPD, podemos basarnos en bases compatibles como prestación de servicios, cumplimiento legal, interés legítimo, consentimiento cuando sea necesario y prevención del fraude.",
          "Tratamos datos de cuenta y seguridad para crear y mantener cuentas, autenticar usuarios, prevenir fraude y abuso, hacer cumplir políticas y proteger la plataforma —típicamente necesidad contractual e intereses legítimos de seguridad.",
          "Tratamos datos de juego y economía para operar funciones, calcular recompensas, ofrecer clasificaciones o estadísticas cuando existan y mejorar el equilibrio —típicamente contrato e intereses legítimos.",
          "Tratamos datos de cartera para facilitar depósitos/retiros opcionales, conciliar transacciones y cumplir obligaciones de cumplimiento —típicamente contrato, obligación legal e interés legítimo antifraude.",
          "Podemos enviar mensajes de servicio (alertas de seguridad o actualizaciones de políticas) sin consentimiento de marketing cuando lo permita la ley. El marketing requiere consentimiento u otra base válida.",
        ],
      },
      cookiesIdentifiers: {
        title: "5. Cookies, almacenamiento local y tecnologías similares",
        paragraphs: [
          "Usamos cookies y tecnologías similares para mantener sesiones, proteger contra CSRF y ataques de repetición, recordar preferencias y medir el rendimiento básico. Las cookies estrictamente necesarias pueden colocarse sin consentimiento cuando sean indispensables para prestar el servicio de forma segura.",
          "Si implementamos analítica o publicidad no esenciales, proporcionaremos un mecanismo de consentimiento cuando la ley lo exija y describiremos las opciones en el producto o en la configuración del navegador.",
          "Puede controlar las cookies en el navegador; desactivar las necesarias puede impedir el inicio de sesión o funciones de seguridad.",
        ],
      },
      walletsBlockchain: {
        title: "6. Datos de cartera, transparencia blockchain y redes de terceros",
        paragraphs: [
          "Las blockchains públicas no están controladas por BlockMiner. Las direcciones y transacciones que difunda pueden ser visibles on-chain indefinidamente y tratadas por mineros, indexadores y proveedores de analítica independientes de nosotros.",
          "No solicitamos frases semilla ni claves privadas. Nunca las comparta con quien afirme ser soporte.",
          "Para reducir riesgos, use solo flujos oficiales en la app, verifique red y token, y tenga en cuenta que los envíos erróneos pueden ser irreversibles.",
        ],
      },
      minors: {
        title: "7. Menores",
        paragraphs: [
          "BlockMiner no está dirigido a menores por debajo de la edad necesaria para celebrar un contrato en su jurisdicción. No recopilamos conscientemente datos de menores por debajo de esa edad. Si cree que un menor proporcionó datos, contáctenos y tomaremos medidas para borrar o restringir el tratamiento, según la ley.",
        ],
      },
      sources: {
        title: "8. Origen de los datos personales",
        paragraphs: [
          "Recopilamos datos directamente de usted (formularios, juego, conexión de cartera), automáticamente desde su dispositivo y nuestros servidores (registros, telemetría necesaria para la seguridad) y ocasionalmente de terceros como proveedores antifraude, verificación de identidad (si se usa) o socios de publicidad/atribución (si consiente).",
        ],
      },
      recipients: {
        title: "9. Destinatarios, encargados y transferencias ulteriores",
        paragraphs: [
          "Podemos divulgar datos personales a proveedores de alojamiento y nube, correo y mensajería, bases de datos y monitorización, socios de pago o infraestructura de cartera, plataformas de soporte, proveedores de analítica (cuando esté permitido), asesores y autoridades cuando la ley lo exija.",
          "Utilizamos salvaguardas contractuales con encargados (incluidos acuerdos de tratamiento) que exigen confidencialidad, medidas de seguridad y asistencia en solicitudes de los interesados cuando corresponda.",
        ],
      },
      internationalTransfers: {
        title: "10. Transferencias internacionales",
        paragraphs: [
          "Podemos tratar o almacenar datos fuera de su país, incluso fuera del EEE, Reino Unido o Brasil. Cuando sea necesario, implementamos garantías adecuadas como Cláusulas Contractuales Tipo (SCC), el Addendum del Reino Unido u otros mecanismos reconocidos.",
          "Puede solicitar más información sobre las garantías contactándonos; las copias pueden redactarse por confidencialidad cuando esté permitido.",
        ],
      },
      retentionSecurity: {
        title: "11. Conservación y seguridad",
        paragraphs: [
          "Conservamos datos personales solo el tiempo necesario para las finalidades descritas, incluida la seguridad, resolución de disputas y cumplimiento legal. Los criterios incluyen el estado de la cuenta, investigaciones en curso, plazos legales y ciclos de copia de seguridad. Los datos agregados o pseudonimizados pueden conservarse más tiempo.",
          "Aplicamos medidas administrativas, técnicas y organizativas para proteger los datos personales, incluidos controles de acceso, cifrado en tránsito cuando procede, registros, gestión de vulnerabilidades y formación. Ningún método es 100% seguro.",
        ],
      },
      breachesAutomation: {
        title: "12. Violaciones de datos y decisiones automatizadas",
        paragraphs: [
          "Mantenemos procedimientos internos para detectar, evaluar y (cuando sea obligatorio) notificar a las autoridades de supervisión y a los interesados sobre violaciones de datos personales sin demora indebida.",
          "Podemos usar sistemas automatizados para puntuar riesgo, detectar trampas o priorizar el soporte. Cuando una decisión produzca efectos jurídicos o similares únicamente por medios automatizados, proporcionaremos la información exigida por la ley, incluida la lógica, la importancia y sus derechos de revisión humana cuando corresponda.",
        ],
      },
      rights: {
        title: "13. Sus derechos de privacidad",
        paragraphs: [
          "Según su jurisdicción, puede tener derechos de acceso, rectificación, supresión, limitación del tratamiento, oposición a ciertos tratamientos, retirada del consentimiento, portabilidad e información sobre decisiones automatizadas. La LGPD prevé confirmación del tratamiento, acceso, corrección, anonimización/bloqueo, eliminación, portabilidad, información sobre compartición y revocación del consentimiento.",
        ],
        bullets: [
          "Acceso: solicitar copia o resumen de los datos que conservamos sobre usted.",
          "Rectificación: corregir datos inexactos o incompletos.",
          "Supresión: solicitar borrado sujeto a excepciones legales (p. ej., retención antifraude).",
          "Limitación / oposición: limitar u oponerse al tratamiento basado en intereses legítimos o marketing directo.",
          "Portabilidad: recibir datos estructurados que proporcionó cuando sea técnicamente factible.",
          "Reclamaciones: presentar reclamación ante una autoridad de supervisión (ver Sección 15).",
        ],
      },
      marketingOptOut: {
        title: "14. Preferencias de marketing y Do Not Track",
        paragraphs: [
          "Puede darse de baja del marketing por correo mediante enlaces de cancelación de suscripción o contactando al soporte. Algunas jurisdicciones otorgan derechos para limitar la “venta” o “compartición” para publicidad entre contextos; cuando corresponda, ofreceremos un mecanismo claro u honraremos señales legales reconocidas.",
          "Salvo obligación legal, no respondemos de forma uniforme a las señales “Do Not Track” por la falta de un estándar único.",
        ],
      },
      updatesComplaints: {
        title: "15. Cambios, reclamaciones y contacto",
        paragraphs: [
          "Podemos actualizar esta Política publicando una versión revisada y actualizando la fecha de “Última actualización”. Cuando los cambios sean materiales y se requiera consentimiento, lo solicitaremos o notificaremos según la ley.",
          "Los usuarios de la UE/EEE pueden contactar a su autoridad local de protección de datos. En el Reino Unido, la ICO. En Brasil, la ANPD. Los residentes de California pueden contactar a la CPPA u ejercer otros derechos aplicables.",
          "Para solicitudes de privacidad, contacte al soporte oficial de BlockMiner con detalles suficientes para verificar su identidad. Podemos solicitar información adicional para prevenir solicitudes fraudulentas. Responderemos en los plazos legales (a menudo dentro de 30 días para RGPD/LGPD, con prórrogas cuando esté permitido).",
        ],
      },
    },
  },
};

const termsExtra = {
  en: {
    electronicCommunications: {
      title: "16. Electronic communications, records, and signatures",
      paragraphs: [
        "You agree that we may send you notices, receipts, agreements, and policy updates electronically through the email associated with your account, in-product messages, or posted notices on blockminer.space.",
        "You are responsible for keeping your email address accurate. Electronic records maintained by our systems may be used as evidence of transactions, consents, and account activity, subject to applicable law and authentication requirements.",
      ],
    },
    governingLawDisputes: {
      title: "17. Governing law, venue, informal dispute resolution, and class actions",
      paragraphs: [
        "Unless mandatory consumer law in your country requires otherwise, these Terms and the Privacy Policy are governed by the laws designated in our published corporate disclosures or, if none are published, by the laws of the jurisdiction where the operating entity is established, without regard to conflict-of-law rules that would require another jurisdiction’s laws.",
        "You agree to first contact support and attempt to resolve disputes informally in good faith for at least thirty (30) days before initiating formal proceedings, where such a requirement is enforceable under applicable law.",
        "To the fullest extent permitted by law, disputes must be brought on an individual basis and not as a plaintiff or class member in any purported class, collective, or representative proceeding. If you are a consumer in a jurisdiction that prohibits such waivers, this subsection applies only to the extent permitted.",
      ],
    },
    regulatoryCompliancePrograms: {
      title: "18. Sanctions, export controls, and compliance programs",
      paragraphs: [
        "You represent that you are not identified on any government restricted-party list and that you will not use the Services to violate trade sanctions, export controls, or anti-boycott rules applicable to you or to BlockMiner.",
        "We may screen activity, block access, freeze features, or terminate accounts where required by law or where we reasonably believe a transaction or user presents sanctions, fraud, or illicit finance risk.",
        "Nothing in these Terms obliges us to process a withdrawal, payment, or transfer that we reasonably believe would violate applicable law.",
      ],
    },
    finalProvisions: {
      title: "19. Final provisions",
      paragraphs: [
        "These Terms remain in effect while you use the Services. We may deny access, including blocking IP addresses, or terminate accounts without notice where permitted by law, including for breach of these Terms or applicable law.",
        "If your account is terminated, you must not create a new account to evade enforcement, including using false or third-party identities.",
        "We are not responsible for losses from unauthorized access to your account caused by your failure to secure credentials or devices, except where mandatory law states otherwise.",
        "For technical issues, contact support through official channels. We will use commercially reasonable efforts to respond within a reasonable time; specific SLAs may be published separately.",
        "If any provision of these Terms is held invalid, the remaining provisions remain enforceable to the maximum extent. Our failure to enforce a provision is not a waiver.",
        "These Terms, together with the Privacy Policy and any feature-specific rules we publish, constitute the entire agreement regarding the subject matter and supersede prior oral or written understandings on the same topic, except where mandatory law requires otherwise.",
      ],
    },
    contact: {
      title: "20. Contact",
      paragraphs: [
        "For questions about these Terms of Use, contact BlockMiner through the official support channel published on blockminer.space (for example Discord, Telegram, or email if listed there).",
      ],
    },
  },
  "pt-BR": {
    electronicCommunications: {
      title: "16. Comunicações eletrónicas, registos e assinaturas",
      paragraphs: [
        "Concorda que podemos enviar avisos, recibos, acordos e atualizações de políticas eletronicamente para o e-mail associado à conta, mensagens na aplicação ou avisos publicados em blockminer.space.",
        "É responsável por manter o e-mail correto. Registos eletrónicos mantidos pelos nossos sistemas podem ser usados como evidência de transações, consentimentos e atividade da conta, conforme a lei e requisitos de autenticação.",
      ],
    },
    governingLawDisputes: {
      title: "17. Lei aplicável, foro, resolução informal e ações coletivas",
      paragraphs: [
        "Salvo lei consumerista imperativa no seu país, estes Termos e a Política de Privacidade regem-se pelas leis indicadas nas divulgações corporativas publicadas ou, se não houver, pelas leis da jurisdição onde a entidade operadora está estabelecida, sem conflito de leis que imponha outra ordem jurídica.",
        "Concorda em contactar primeiro o suporte e tentar resolver litígios de boa-fé por pelo menos trinta (30) dias antes de iniciar processos formais, quando tal requisito seja exigível.",
        "Na máxima extensão permitida pela lei, os litígios devem ser intentados individualmente e não como autor ou membro de classe em qualquer processo coletivo ou representativo. Se for consumidor numa jurisdição que proíba tal renúncia, esta subsecção aplica-se apenas na medida permitida.",
      ],
    },
    regulatoryCompliancePrograms: {
      title: "18. Sanções, controlos de exportação e programas de conformidade",
      paragraphs: [
        "Declara que não está identificado em listas restritivas governamentais e que não usará os Serviços para violar sanções comerciais, controlos de exportação ou regras antiboicote aplicáveis a si ou ao BlockMiner.",
        "Podemos filtrar atividade, bloquear acesso, congelar funcionalidades ou encerrar contas quando a lei o exija ou quando razoavelmente acreditarmos que uma transação ou utilizador apresenta risco de sanções, fraude ou financiamento ilícito.",
        "Nada nestes Termos nos obriga a processar um saque, pagamento ou transferência que razoavelmente acreditemos violar a lei aplicável.",
      ],
    },
    finalProvisions: {
      title: "19. Disposições finais",
      paragraphs: [
        "Estes Termos permanecem em vigor enquanto usar os Serviços. Podemos negar acesso, incluindo bloqueio de IP, ou encerrar contas sem aviso quando permitido por lei, incluindo por violação destes Termos.",
        "Se a conta for encerrada, não deve criar nova conta para contornar a aplicação, incluindo identidades falsas ou de terceiros.",
        "Não somos responsáveis por perdas por acesso não autorizado causado pela falha em proteger credenciais ou dispositivos, salvo lei imperativa.",
        "Para questões técnicas, contacte o suporte pelos canais oficiais. Envidaremos esforços comercialmente razoáveis para responder em tempo razoável; SLAs podem ser publicados separadamente.",
        "Se alguma disposição for inválida, as restantes permanecem exequíveis na máxima medida. A falha em fazer cumprir não constitui renúncia.",
        "Estes Termos, juntamente com a Política de Privacidade e regras específicas publicadas, constituem o acordo integral sobre a matéria e substituem entendimentos orais ou escritos prévios, salvo lei imperativa.",
      ],
    },
    contact: {
      title: "20. Contato",
      paragraphs: [
        "Para questões sobre estes Termos de Uso, contacte o BlockMiner pelo canal oficial de suporte publicado em blockminer.space (por exemplo Discord, Telegram ou e-mail se listado).",
      ],
    },
  },
  es: {
    electronicCommunications: {
      title: "16. Comunicaciones electrónicas, registros y firmas",
      paragraphs: [
        "Usted acepta que podamos enviar avisos, recibos, acuerdos y actualizaciones de políticas electrónicamente al correo asociado a su cuenta, mensajes en la aplicación o avisos publicados en blockminer.space.",
        "Es responsable de mantener su correo electrónico actualizado. Los registros electrónicos mantenidos por nuestros sistemas pueden usarse como evidencia de transacciones, consentimientos y actividad de la cuenta, según la ley y requisitos de autenticación.",
      ],
    },
    governingLawDisputes: {
      title: "17. Ley aplicable, foro, resolución informal y acciones colectivas",
      paragraphs: [
        "Salvo ley consumerista imperativa en su país, estos Términos y la Política de Privacidad se rigen por las leyes designadas en nuestras divulgaciones corporativas publicadas o, si no existen, por las leyes de la jurisdicción donde la entidad operadora está establecida, sin reglas de conflicto que impongan otra ley.",
        "Usted acepta contactar primero al soporte e intentar resolver disputas de buena fe durante al menos treinta (30) días antes de iniciar procedimientos formales, cuando tal requisito sea exigible.",
        "En la máxima medida permitida por la ley, las disputas deben plantearse de forma individual y no como demandante o miembro de clase en ningún procedimiento colectivo o representativo. Si es consumidor en una jurisdicción que prohíba tales renuncias, este apartado aplica solo en la medida permitida.",
      ],
    },
    regulatoryCompliancePrograms: {
      title: "18. Sanciones, controles de exportación y programas de cumplimiento",
      paragraphs: [
        "Usted declara que no está identificado en listas restringidas gubernamentales y que no usará los Servicios para violar sanciones comerciales, controles de exportación o reglas antiboicot aplicables a usted o a BlockMiner.",
        "Podemos examinar actividad, bloquear acceso, congelar funciones o terminar cuentas cuando la ley lo exija o cuando razonablemente creamos que una transacción o usuario presenta riesgo de sanciones, fraude o financiamiento ilícito.",
        "Nada en estos Términos nos obliga a procesar un retiro, pago o transferencia que razonablemente creamos que violaría la ley aplicable.",
      ],
    },
    finalProvisions: {
      title: "19. Disposiciones finales",
      paragraphs: [
        "Estos Términos permanecen en vigor mientras use los Servicios. Podemos denegar el acceso, incluido el bloqueo de IP, o terminar cuentas sin aviso cuando lo permita la ley, incluso por incumplimiento de estos Términos.",
        "Si se termina su cuenta, no debe crear una nueva para eludir la aplicación, incluido el uso de identidades falsas o de terceros.",
        "No somos responsables de pérdidas por acceso no autorizado causado por su falta de protección de credenciales o dispositivos, salvo ley imperativa.",
        "Para problemas técnicos, contacte al soporte por canales oficiales. Haremos esfuerzos comercialmente razonables para responder en un plazo razonable; los SLA pueden publicarse por separado.",
        "Si alguna disposición es inválida, las restantes permanecen exigibles en la máxima medida. La falta de hacer cumplir no constituye renuncia.",
        "Estos Términos, junto con la Política de Privacidad y las reglas específicas publicadas, constituyen el acuerdo completo sobre el tema y sustituyen entendimientos previos, salvo ley imperativa.",
      ],
    },
    contact: {
      title: "20. Contacto",
      paragraphs: [
        "Para preguntas sobre estos Términos de Uso, contacte a BlockMiner a través del canal oficial de soporte publicado en blockminer.space (por ejemplo Discord, Telegram o correo si figura).",
      ],
    },
  },
};

for (const locale of ["en", "pt-BR", "es"]) {
  const j = load(locale);
  j.legal.common = { ...j.legal.common, ...common[locale] };
  j.legal.privacyPolicy = privacy[locale];
  const ts = { ...j.legal.termsOfUse.sections };
  const extra = termsExtra[locale];
  ts.electronicCommunications = extra.electronicCommunications;
  ts.governingLawDisputes = extra.governingLawDisputes;
  ts.regulatoryCompliancePrograms = extra.regulatoryCompliancePrograms;
  ts.finalProvisions = extra.finalProvisions;
  ts.contact = extra.contact;
  j.legal.termsOfUse.sections = ts;
  save(locale, j);
}

console.log("Applied comprehensive legal content to en, pt-BR, es.");
