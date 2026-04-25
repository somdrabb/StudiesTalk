'use strict';

// Onboarding security boundary:
// This middleware intentionally enforces school-admin onboarding on the server side
// while preserving the SQLite-default runtime and the staged repository/adapter migration.
// The allowlist below is explicit by design. New setup-safe routes must be added here
// deliberately rather than inferred from broad role or path heuristics.

const SCHOOL_ADMIN_ONBOARDING_ENFORCED_ROLES = new Set(['school_admin']);
const DEFAULT_GATE_CACHE_TTL_MS = 3000;

const ONBOARDING_ROUTE_ALLOWLIST = [
  { methods: null, pattern: /^\/api\/auth\//, reason: 'auth bootstrap/session lifecycle' },
  { methods: ['GET'], pattern: /^\/api\/workspaces$/, reason: 'workspace bootstrap selector' },
  { methods: ['GET'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding$/, reason: 'canonical onboarding read' },
  { methods: ['PATCH'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding$/, reason: 'canonical onboarding visibility updates' },
  { methods: ['PATCH'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding\/steps\/[^/]+$/, reason: 'canonical onboarding step writes' },
  { methods: ['POST'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding\/activate$/, reason: 'canonical onboarding activation' },
  { methods: ['GET'], pattern: /^\/api\/onboarding\/[^/]+$/, reason: 'legacy onboarding read' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/start$/, reason: 'legacy onboarding start' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/(?:defer|resume|auto-open-seen)$/, reason: 'legacy onboarding visibility updates' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/steps\/[^/]+$/, reason: 'legacy onboarding step save' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/steps\/[^/]+\/complete$/, reason: 'legacy onboarding step complete' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/steps\/[^/]+\/skip$/, reason: 'legacy onboarding step skip' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/complete$/, reason: 'legacy onboarding activation' },
  { methods: ['GET'], pattern: /^\/api\/onboarding\/[^/]+\/activation$/, reason: 'legacy onboarding activation metrics' },
  { methods: ['GET', 'PATCH', 'POST'], pattern: /^\/api\/workspaces\/[^/]+\/profile(?:\/registration)?$/, reason: 'school profile setup' },
  { methods: ['GET', 'PATCH'], pattern: /^\/api\/workspaces\/[^/]+\/billing-profile$/, reason: 'billing contact setup' },
  { methods: ['POST'], pattern: /^\/api\/workspaces\/[^/]+\/logo$/, reason: 'workspace branding setup' },
  { methods: ['GET', 'POST'], pattern: /^\/api\/workspaces\/[^/]+\/email-settings$/, reason: 'communication setup' },
  { methods: ['POST'], pattern: /^\/api\/workspaces\/[^/]+\/email-settings\/test$/, reason: 'communication verification' },
  { methods: ['GET'], pattern: /^\/api\/workspaces\/[^/]+\/email-templates$/, reason: 'communication template list' },
  { methods: ['GET', 'PUT'], pattern: /^\/api\/workspaces\/[^/]+\/email-templates\/[^/]+$/, reason: 'communication template edit' },
  { methods: ['POST'], pattern: /^\/api\/workspaces\/[^/]+\/email-templates\/[^/]+\/(?:reset|test)$/, reason: 'communication template actions' },
  { methods: ['GET', 'POST'], pattern: /^\/api\/users$/, reason: 'staff/student creation and directory' },
  { methods: ['POST'], pattern: /^\/api\/workspaces\/[^/]+\/students\/import$/, reason: 'student onboarding import flow' },
  { methods: ['GET'], pattern: /^\/api\/user-class-memberships$/, reason: 'class assignment support data' },
  { methods: ['GET', 'POST'], pattern: /^\/api\/channels$/, reason: 'academic structure list/create' },
  { methods: ['PATCH', 'DELETE'], pattern: /^\/api\/channels\/[^/]+$/, reason: 'academic structure maintenance' },
  { methods: ['GET', 'POST', 'DELETE'], pattern: /^\/api\/channels\/[^/]+\/members$/, reason: 'class membership setup' },
  { methods: ['POST'], pattern: /^\/api\/channels\/[^/]+\/members\/[^/]+$/, reason: 'class membership add shortcut' },
  { methods: ['GET', 'POST'], pattern: /^\/api\/channels\/[^/]+\/announcements$/, reason: 'announcement setup' },
  { methods: ['DELETE'], pattern: /^\/api\/channels\/[^/]+\/announcements\/[^/]+$/, reason: 'announcement cleanup' },
  { methods: ['GET', 'POST'], pattern: /^\/api\/live-sessions$/, reason: 'live class setup' },
  { methods: ['PATCH', 'DELETE'], pattern: /^\/api\/live-sessions\/[^/]+$/, reason: 'live class maintenance' },
  { methods: ['POST'], pattern: /^\/api\/live-sessions\/[^/]+\/join$/, reason: 'live class verification' },
  { methods: ['GET', 'POST'], pattern: /^\/api\/live-sessions\/[^/]+\/attendance$/, reason: 'live class attendance setup' },
  { methods: ['GET'], pattern: /^\/api\/homework\/channels\/[^/]+\/board$/, reason: 'homework board setup' },
  { methods: ['POST'], pattern: /^\/api\/homework\/channels\/[^/]+\/items$/, reason: 'homework creation' },
  { methods: ['PATCH', 'DELETE'], pattern: /^\/api\/homework\/items\/[^/]+$/, reason: 'homework maintenance' },
  { methods: ['POST'], pattern: /^\/api\/homework\/items\/[^/]+\/submissions$/, reason: 'homework submission verification' },
  { methods: ['POST'], pattern: /^\/api\/homework\/submissions\/[^/]+\/(?:review|comments)$/, reason: 'homework review flow' },
  { methods: ['GET', 'POST', 'DELETE'], pattern: /^\/api\/admin\/ai-budget(?:\/reset)?$/, reason: 'AI budget onboarding step' },
  { methods: ['GET'], pattern: /^\/api\/ai\/health$/, reason: 'system health check' }
];

function normalizeRoleName(role) {
  return String(role || 'member').trim().toLowerCase();
}

function buildOnboardingGateResponse(onboarding) {
  const progress = onboarding?.progress || {};
  const requiredRemaining = Math.max(
    Number(progress.requiredTotal || 0) - Number(progress.requiredCompleted || 0),
    0
  );
  return {
    status: onboarding?.status || 'not_started',
    currentStep: onboarding?.currentStep || 'welcome',
    activationReady: !!onboarding?.activationReady,
    visibility: onboarding?.visibility || null,
    progress: {
      completed: Number(progress.completed || 0),
      total: Number(progress.total || 0),
      requiredCompleted: Number(progress.requiredCompleted || 0),
      requiredTotal: Number(progress.requiredTotal || 0),
      requiredRemaining
    },
    completedAt: onboarding?.completedAt || null
  };
}

function createOnboardingGuard({
  onboardingRepository,
  attachAccessTokenIfPresent,
  logger = console,
  cacheTtlMs = DEFAULT_GATE_CACHE_TTL_MS
} = {}) {
  if (!onboardingRepository) throw new Error('onboardingRepository is required');
  if (typeof attachAccessTokenIfPresent !== 'function') {
    throw new Error('attachAccessTokenIfPresent is required');
  }

  const onboardingGateCache = new Map();

  function getRequestPathname(req) {
    return String(`${req.baseUrl || ''}${req.path || ''}`).trim();
  }

  function isAllowedRequest(req) {
    const method = String(req.method || '').toUpperCase();
    const pathname = getRequestPathname(req);
    return ONBOARDING_ROUTE_ALLOWLIST.some((entry) => {
      if (entry.methods && !entry.methods.includes(method)) return false;
      return entry.pattern.test(pathname);
    });
  }

  function invalidateWorkspace(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) return;
    onboardingGateCache.delete(normalizedWorkspaceId);
  }

  function shouldEnforceForUser(user) {
    if (!user) return false;
    if (user.superAdmin) return false;
    const role = normalizeRoleName(user.role || user.userRole);
    return SCHOOL_ADMIN_ONBOARDING_ENFORCED_ROLES.has(role);
  }

  async function getGateState(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim();
    if (!normalizedWorkspaceId) return null;
    const now = Date.now();
    const cached = onboardingGateCache.get(normalizedWorkspaceId);
    if (cached && now - cached.at < cacheTtlMs) {
      return cached.value;
    }
    await onboardingRepository.ensureWorkspaceOnboarding({
      workspaceId: normalizedWorkspaceId,
      now: new Date().toISOString()
    });
    const onboarding = await onboardingRepository.getWorkspaceOnboarding(normalizedWorkspaceId);
    const value = {
      workspaceId: normalizedWorkspaceId,
      required: !!onboarding?.visibility?.shouldEnforce,
      onboarding
    };
    onboardingGateCache.set(normalizedWorkspaceId, { at: now, value });
    return value;
  }

  async function middleware(req, res, next) {
    try {
      if (isAllowedRequest(req)) return next();

      const user = await attachAccessTokenIfPresent(req);
      if (!shouldEnforceForUser(user)) return next();

      const workspaceId = String(user?.workspaceId || user?.workspace_id || '').trim();
      if (!workspaceId) return next();

      const gate = await getGateState(workspaceId);
      if (!gate?.required) return next();

      return res.status(403).json({
        error: 'Onboarding required before full workspace access.',
        code: 'onboarding_required',
        onboarding: buildOnboardingGateResponse(gate.onboarding)
      });
    } catch (err) {
      logger.error('[Onboarding] Server-side gate failed', err);
      return res.status(500).json({ error: 'Onboarding gate failed' });
    }
  }

  return {
    middleware,
    invalidateWorkspace,
    buildOnboardingGateResponse,
    isAllowedRequest,
    shouldEnforceForUser,
    getGateState,
    allowlist: ONBOARDING_ROUTE_ALLOWLIST.slice()
  };
}

module.exports = {
  ONBOARDING_ROUTE_ALLOWLIST,
  SCHOOL_ADMIN_ONBOARDING_ENFORCED_ROLES,
  createOnboardingGuard
};
