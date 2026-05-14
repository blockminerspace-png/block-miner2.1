import type { HelmetOptions } from "helmet";

export function getHelmetContentSecurityPolicyOptions(): Exclude<
  HelmetOptions["contentSecurityPolicy"],
  boolean | undefined
>;
