import { isSidebarPathVisible } from "../services/sidebarNavService.js";

/**
 * Blocks the request when the path is hidden in the public sidebar config.
 * @param {string} requiredPath — e.g. "/checkin"
 */
export function requireVisibleSidebarPath(requiredPath) {
  return async (_req, res, next) => {
    try {
      const allowed = await isSidebarPathVisible(requiredPath);
      if (!allowed) {
        return res.status(403).json({
          ok: false,
          code: "feature_disabled",
          message: "This feature is not available."
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
