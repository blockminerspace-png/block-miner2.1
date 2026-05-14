import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { deriveDefaultNetworkCidr, getClientIp, isIpInCidr, normalizeIp } from "#server/utils/clientIp.js";

const oldEnv = { ...process.env };

afterEach(() => {
  for (const key of ["TRUST_PROXY", "TRUSTED_PROXY_CIDRS", "IP_HEADER_PRIORITY"]) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
});

function req(headers, remoteAddress) {
  return { headers, socket: { remoteAddress } };
}

describe("secure client IP capture", () => {
  it("normalizes IPv4, IPv6, mapped IPv4, and IPv4 with port", () => {
    assert.equal(normalizeIp("1.2.3.4:1234"), "1.2.3.4");
    assert.equal(normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
    assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1");
  });

  it("rejects invalid IP values", () => {
    assert.equal(normalizeIp("not-an-ip"), null);
    assert.equal(normalizeIp("999.1.1.1"), null);
  });

  it("ignores spoofed x-forwarded-for when trust proxy is disabled", () => {
    process.env.TRUST_PROXY = "false";
    assert.equal(getClientIp(req({ "x-forwarded-for": "198.51.100.2" }, "203.0.113.7")), "203.0.113.7");
  });

  it("uses configured proxy headers only from trusted proxy CIDRs", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUSTED_PROXY_CIDRS = "10.0.0.0/8";
    process.env.IP_HEADER_PRIORITY = "x-forwarded-for";
    assert.equal(getClientIp(req({ "x-forwarded-for": "198.51.100.2, 10.0.0.5" }, "10.0.0.5")), "198.51.100.2");
    assert.equal(getClientIp(req({ "x-forwarded-for": "198.51.100.2" }, "203.0.113.7")), "203.0.113.7");
  });

  it("checks IPv4 and IPv6 CIDRs", () => {
    assert.equal(isIpInCidr("10.2.3.4", "10.0.0.0/8"), true);
    assert.equal(isIpInCidr("11.2.3.4", "10.0.0.0/8"), false);
    assert.equal(isIpInCidr("2001:db8::5", "2001:db8::/32"), true);
  });

  it("derives IPv6 /64 network keys without treating IPv4 as a shared subnet", () => {
    assert.equal(deriveDefaultNetworkCidr("2001:db8:abcd:0012::beef"), "2001:db8:abcd:12::/64");
    assert.equal(deriveDefaultNetworkCidr("203.0.113.7"), null);
  });
});
