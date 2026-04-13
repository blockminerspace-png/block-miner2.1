# BlockMiner Security Analysis Report

**Date:** April 11, 2026  
**Project:** BlockMiner 2.1 Web3 Mining Game  
**Analyst:** Automated Security Analysis

---

## Executive Summary

This report provides a comprehensive security analysis of the BlockMiner project. The application has several strong security measures implemented, but also contains critical vulnerabilities that should be addressed immediately.

### Security Score: 7.2/10

| Category                       | Score  |
| ------------------------------ | ------ |
| Authentication & Authorization | 7.5/10 |
| Data Protection                | 6.0/10 |
| API Security                   | 8.0/10 |
| Infrastructure Security        | 7.0/10 |
| Content Security               | 7.5/10 |
| Crypto/Financial               | 7.5/10 |

---

## 1. Authentication & Authorization

### 1.1 JWT Implementation

**Status:** Good

The project uses JWT for authentication with proper validation:

```javascript
// server/utils/authTokens.js
jwt.sign(payload, requireJwtSecret(), {
  expiresIn: ACCESS_TOKEN_TTL,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE
});
```

- ✅ Uses HS256 algorithm
- ✅ Implements issuer and audience validation
- ✅ Has access token (12h) and refresh token (30 days) separation
- ⚠️ JWT_SECRET is stored in environment variables (see vulnerabilities)

### 1.2 Admin Authentication

**Status:** Good with concerns

```javascript
// server/middleware/adminAuth.js
payload = jwt.verify(token, jwtSecret, {
  issuer: "blockminer-admin",
  algorithms: ["HS256"]
});

if (payload.role !== "admin" || payload.type !== "admin_session") {
  return res.status(403).json({ ok: false, message: "Forbidden" });
}
```

- ✅ Separate admin JWT validation
- ✅ Requires `role: "admin"` and `type: "admin_session"`
- ⚠️ Development flag `ALLOW_OPEN_ADMIN_USER_ROUTES` can bypass admin checks

### 1.3 Two-Factor Authentication

**Status:** Implemented

```javascript
// server/routes/auth.js
if (user.isTwoFactorEnabled) {
  const isValid = authenticator.check(twoFactorToken, user.twoFactorSecret);
}
```

- ✅ TOTP-based 2FA implemented
- ✅ 2FA tokens validated on login

### 1.4 Password Security

**Status:** Good

```javascript
const passwordHash = await bcrypt.hash(password, 10);
```

- ✅ Uses bcrypt with cost factor 10
- ✅ Minimum password length enforced (8 characters)
- ✅ Password reset tokens expire

---

## 2. Critical Vulnerabilities

### 2.1 Credentials Exposed in Environment File

**Severity:** CRITICAL

The `.env` file contains hardcoded secrets:

```env
# Example shape only — real values were redacted; never commit production .env
JWT_SECRET=<REDACTED>
ADMIN_SECURITY_CODE=<REDACTED>
WITHDRAWAL_PRIVATE_KEY=<REDACTED>
WITHDRAWAL_MNEMONIC=<REDACTED>
SMTP_PASS=<REDACTED>
SMTP_USER=<REDACTED>
POLYGONSCAN_API_KEY=<REDACTED>
```

**Impact:** If the `.env` file is exposed or committed to version control, attackers have full access to:

- JWT signing (impersonate any user)
- Admin privileges
- Withdrawal of funds from the hot wallet
- Email account for password resets

**Recommendation:**

1. Use a secrets manager (AWS Secrets Manager, HashiCorp Vault)
2. Rotate all exposed secrets immediately
3. Add `.env` to `.gitignore` (already done)
4. Implement secret rotation policy
5. Use different secrets for each environment

### 2.2 Hardcoded Admin Security Code

**Severity:** HIGH

```javascript
// server/routes/auth.js - Lines 538-545
if (adminKey !== process.env.ADMIN_SECURITY_CODE) {
  return res.status(403).json({ ok: false, message: "Unauthorized manual reset." });
}
```

The `ADMIN_SECURITY_CODE` is used as a manual password reset mechanism. This is a fundamental flaw as it provides a backdoor.

**Recommendation:** Remove this feature entirely and rely only on JWT-based admin authentication.

### 2.3 Missing Database Prepared Statements

**Status:** MEDIUM

While Prisma uses parameterized queries, some raw SQL or string interpolation could be vulnerable. The project should be audited for SQL injection.

---

## 3. API Security

### 3.1 Rate Limiting

**Status:** Good

```javascript
// server/middleware/rateLimit.js
const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5000
});

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });
```

- ✅ Global rate limiting (5000 requests/15min)
- ✅ Per-endpoint rate limiting
- ⚠️ In-memory rate limiting (doesn't scale horizontally)

**Recommendation:** Use Redis-based rate limiting for production deployments.

### 3.2 CSRF Protection

**Status:** Implemented

```javascript
// server/middleware/csrf.js
if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
  const headerToken = req.headers["x-csrf-token"];
  if (!headerToken || headerToken !== csrfToken) {
    return res.status(403).json({ message: "CSRF blocked" });
  }
}
```

- ✅ Token-based CSRF validation
- ✅ Validates state-changing methods only

### 3.3 Input Validation

**Status:** Good

```javascript
// server/routes/auth.js
const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email(),
  password: z.string().min(8),
  acceptTerms: z.boolean().refine((value) => value === true)
});
```

- ✅ Uses Zod for schema validation
- ✅ Email validation
- ✅ Username format restrictions

---

## 4. Content Security

### 4.1 Helmet.js

**Status:** Good

```javascript
// server/server.js
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  })
);
```

- ✅ Security headers enabled
- ⚠️ CSP disabled in favor of custom middleware

### 4.2 CSP Configuration

**Status:** Needs Improvement

```javascript
// server/middleware/csp.js
scriptSrc: [
  "'self'",
  "'unsafe-inline'",     // ⚠️ Security risk
  "'unsafe-eval'",       // ⚠️ Security risk
  "https://cdn.jsdelivr.net",
  "https://www.googletagmanager.com",
  "https://www.youtube.com",
  "https://s.ytimg.com"
],
```

**Problems:**

- `unsafe-inline` allows inline script execution
- `unsafe-eval` allows `eval()` usage
- Allows external scripts from CDNs

**Recommendation:** Remove `'unsafe-inline'` and `'unsafe-eval'` after code audit.

### 4.3 CORS Configuration

**Status:** Good

```javascript
// server/utils/corsConfig.js
export function buildExpressCorsOptions() {
  const origins = parseCorsOriginsList(); // Whitelist only
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      } // ⚠️ Allows null origin
      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    }
  };
}
```

- ✅ Whitelist-based origins
- ⚠️ Allows null origin (not recommended for production)

---

## 5. Financial Security

### 5.1 Withdrawal Protection

**Status:** Good

- ✅ Requires authentication
- ✅ Requires 2FA for withdrawals (should be verified)
- ✅ Rate limiting on withdrawal endpoints
- ✅ Minimum withdrawal amount: 0.5 POL
- ✅ Maximum withdrawal amount: 100 POL
- ⚠️ Hot wallet private key in environment variable

### 5.2 Deposit Verification

**Status:** Good

```javascript
// server/cron/depositsCron.js
const DEPOSIT_MIN_CONFIRMATIONS = 50;
```

- ✅ Requires 50 block confirmations
- ✅ Transaction monitoring via Cron jobs

### 5.3 Anti-Fraud Measures

**Status:** Good

```javascript
// server/routes/auth.js - Anti-abuse
const accountsWithSameIp = await prisma.user.count({
  where: { ip: clientIp }
});

if (accountsWithSameIp >= 2) {
  return res.status(403).json({ message: "Registration limit reached" });
}

// Prevent self-referral
if (referrer.ip === clientIp) {
  logger.warn(`Self-referral blocked`);
}
```

- ✅ IP-based registration limiting (max 2 accounts)
- ✅ Anti self-referral protection
- ✅ Audit logging for suspicious activities

---

## 6. Infrastructure Security

### 6.1 Data Exposure

**Severity:** HIGH

The following files contain or could contain sensitive information:

| File                                 | Risk                                    |
| ------------------------------------ | --------------------------------------- |
| `.env`                               | Secrets exposure                        |
| `.env.production`                    | Production secrets                      |
| `deploy.secrets.local`               | Deployment credentials                  |
| `deploy-credentials.local.md`        | Deployment credentials (documentation!) |
| `admin-export-db-20260305-194835.db` | Exported database (!!)                  |

**Critical Issue:** Found database exports in project directory!

**Recommendation:**

1. Remove all exported databases from the project root
2. Add `*.db` to `.gitignore`
3. Implement secure backup procedures

### 6.2 Docker Security

**Status:** Adequate

```dockerfile
# Dockerfile
FROM node:18-slim
# Non-root user recommended
```

- ✅ Uses Node.js base image
- ⚠️ Should run as non-root in production

### 6.3 Path Traversal Protection

**Status:** Partial

```javascript
// server/routes/admin.js - Download protection
if (file.includes("..") || file.includes("/")) {
  return res.status(400).send("Invalid file name");
}
```

- ✅ Basic path traversal protection for backups
- ⚠️ Could be more robust

---

## 7. Session Security

### 7.1 Cookie Configuration

**Status:** Good

```javascript
// server/utils/token.js
function buildCookie(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Max-Age=" + maxAgeSeconds,
    "Path=/",
    "HttpOnly", // ✅ Prevents XSS access
    "SameSite=Lax"
  ]; // ⚠️ Should be Strict
  if (process.env.NODE_ENV === "production") parts.push("Secure"); // ✅ HTTPS only in production
  return parts.join("; ");
}
```

- ✅ HttpOnly cookies (prevents XSS)
- ✅ Secure flag in production
- ⚠️ SameSite=Lax instead of Strict

**Recommendation:** Use `SameSite=Strict` if possible.

### 7.2 Token Expiration

**Status:** Good

| Token Type     | Expiration              |
| -------------- | ----------------------- |
| Access Token   | 12 hours                |
| Refresh Token  | 30 days                 |
| Password Reset | 24 hours (configurable) |
| Admin Session  | 24 hours                |

---

## 8. Logging & Monitoring

### 8.1 Audit Logging

**Status:** Good

```javascript
// Implementation found in server/src/audit/
await enqueueAuditEvent({
  event: buildAuditEventFromHttpRequest({
    req,
    event: {
      userId: user.id,
      eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      status: AuditEventStatus.SUCCESS
    }
  })
});
```

- ✅ Audit events for authentication
- ✅ IP tracking
- ✅ User agent tracking

### 8.2 Security Logging

**Status:** Good

```javascript
// server/middleware/auth.js
logger.warn(`Iron Dome: Bot flag direct rejection for IP: ${req.ip}`);
logger.warn(`Iron Dome: Action REJECTED from ${req.ip}`);
```

- ✅ Logs blocked bot attempts
- ✅ Logs authentication failures

---

## 9. Recommendations

### Priority 1 (Critical - Fix Now)

1. **Rotate all secrets immediately**
   - JWT_SECRET
   - ADMIN_SECURITY_CODE
   - WITHDRAWAL_PRIVATE_KEY
   - WITHDRAWAL_MNEMONIC
   - SMTP credentials
   - PolygonScan API key

2. **Remove hardcoded admin security code** from auth.js routes

3. **Remove exported database file** from project root

4. **Move secrets to a secrets manager**

### Priority 2 (High - Fix Within 1 Week)

5. **Upgrade SameSite cookie attribute** to Strict

6. **Remove 'unsafe-inline' and 'unsafe-eval'** from CSP after code refactoring

7. **Add additional 2FA requirement** for withdrawals

8. **Implement Redis-based rate limiting** for horizontal scaling

9. **Block null origins** in CORS for production

### Priority 3 (Medium - Fix Within 1 Month)

10. **Implement secret rotation policy**

11. **Add Web Application Firewall (WAF)**

12. **Implement API request signing** for critical endpoints

13. **Add IP-based anomaly detection**

14. **Regular security audits** and penetration testing

---

## 10. Test Coverage

The project has security-related tests in `/tests/`:

- ✅ `authTokens.test.js` - Authentication tokens
- ✅ `walletValidation.test.js` - Wallet operations
- ✅ `verify_security_fix.mjs` - Security fixes verification

**Recommendation:** Add more security-focused tests:

- CSRF bypass attempts
- Rate limiting bypass
- SQL injection attempts
- XSS payload testing

---

## 11. Conclusion

The BlockMiner project has a solid security foundation with proper:

- JWT authentication
- 2FA support
- Rate limiting
- CSRF protection
- Audit logging

However, **critical vulnerabilities** exist that must be addressed immediately:

1. Exposed secrets in environment files
2. Hardcoded admin credentials
3. Exported database in project directory

The financial aspect of the application (cryptocurrency handling) requires the highest level of security attention. Immediate action is recommended for the Priority 1 items.

---

_Report generated by automated security analysis_
