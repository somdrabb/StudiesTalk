'use strict';

const DEFAULT_GATE_CACHE_TTL_MS = 3000;

const POLICY_ROUTE_ALLOWLIST = [
  { methods: null, pattern: /^\/api\/auth\//, reason: 'auth/session lifecycle' },
  { methods: null, pattern: /^\/api\/register\//, reason: 'registration flow' },
  { methods: ['GET'], pattern: /^\/api\/workspaces$/, reason: 'workspace bootstrap selector' },
  { methods: ['GET'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding$/, reason: 'onboarding read' },
  { methods: ['PATCH'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding$/, reason: 'onboarding visibility' },
  { methods: ['PATCH'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding\/steps\/[^/]+$/, reason: 'onboarding step save' },
  { methods: ['POST'], pattern: /^\/api\/workspaces\/[^/]+\/onboarding\/activate$/, reason: 'onboarding activation' },
  { methods: ['GET'], pattern: /^\/api\/onboarding\/[^/]+$/, reason: 'legacy onboarding read' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/(?:start|defer|resume|auto-open-seen|complete)$/, reason: 'legacy onboarding lifecycle' },
  { methods: ['POST'], pattern: /^\/api\/onboarding\/[^/]+\/steps\/[^/]+(?:\/(?:complete|skip))?$/, reason: 'legacy onboarding step save' },
  { methods: ['GET'], pattern: /^\/api\/onboarding\/[^/]+\/activation$/, reason: 'legacy onboarding activation metrics' },
  { methods: ['GET'], pattern: /^\/api\/workspaces\/[^/]+\/policy$/, reason: 'policy checkpoint read' },
  { methods: ['POST'], pattern: /^\/api\/workspaces\/[^/]+\/policy\/accept$/, reason: 'policy checkpoint accept' },
  { methods: ['GET'], pattern: /^\/api\/policy\/acceptance$/, reason: 'legacy policy acceptance read' },
  { methods: ['POST'], pattern: /^\/api\/policy\/accept$/, reason: 'legacy policy acceptance write' },
  { methods: ['GET'], pattern: /^\/api\/legal\/required-acceptance$/, reason: 'legal acceptance read' },
  { methods: ['POST'], pattern: /^\/api\/legal\/[^/]+\/accept$/, reason: 'legal acceptance write' }
];

function buildPolicyGateResponse(gate = {}) {
  return {
    required: !!gate.required,
    exempt: !!gate.exempt,
    reason: gate.reason || null,
    version: gate.version || null,
    accepted: !!gate.accepted,
    acceptedAt: gate.acceptedAt || null,
    workspaceId: gate.workspaceId || null
  };
}

function createPolicyGuard({
  policyRepository,
  attachAccessTokenIfPresent,
  logger = console,
  onBlocked = null,
  cacheTtlMs = DEFAULT_GATE_CACHE_TTL_MS
} = {}) {
  if (!policyRepository) throw new Error('policyRepository is required');
  if (typeof attachAccessTokenIfPresent !== 'function') {
    throw new Error('attachAccessTokenIfPresent is required');
  }

  const cache = new Map();

  function getRequestPathname(req) {
    return String(`${req.baseUrl || ''}${req.path || ''}`).trim();
  }

  function isAllowedRequest(req) {
    const pathname = getRequestPathname(req);
    const method = String(req.method || '').toUpperCase();
    return POLICY_ROUTE_ALLOWLIST.some((entry) => {
      if (entry.methods && !entry.methods.includes(method)) return false;
      return entry.pattern.test(pathname);
    });
  }

  function cacheKey(workspaceId, userId) {
    return `${String(workspaceId || '').trim()}::${String(userId || '').trim()}`;
  }

  function invalidate(workspaceId, userId = '*') {
    const ws = String(workspaceId || '').trim();
    if (!ws) return;
    if (userId === '*') {
      for (const key of cache.keys()) {
        if (key.startsWith(`${ws}::`)) cache.delete(key);
      }
      return;
    }
    cache.delete(cacheKey(ws, userId));
  }

  async function getGateState({ workspaceId, userId, user }) {
    const ws = String(workspaceId || '').trim();
    const uid = String(userId || '').trim();
    if (!ws || !uid) {
      return {
        workspaceId: ws || null,
        required: false,
        accepted: true,
        exempt: true,
        reason: 'missing_context',
        version: null,
        acceptedAt: null
      };
    }
    const role = String(user?.role || user?.userRole || '').trim().toLowerCase();
    if (user?.superAdmin || role === 'super_admin') {
      return {
        workspaceId: ws,
        required: false,
        accepted: true,
        exempt: true,
        reason: 'super_admin_exempt',
        version: await policyRepository.getWorkspacePolicyVersion(ws),
        acceptedAt: null
      };
    }

    const key = cacheKey(ws, uid);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.at < cacheTtlMs) {
      return cached.value;
    }

    const version = await policyRepository.getWorkspacePolicyVersion(ws);
    const acceptance = await policyRepository.getAcceptanceByVersion(ws, uid, version);
    const value = {
      workspaceId: ws,
      required: !acceptance,
      accepted: !!acceptance,
      exempt: false,
      reason: acceptance ? 'already_accepted' : 'policy_acceptance_required',
      version,
      acceptedAt: acceptance?.acceptedAt || null
    };
    cache.set(key, { at: now, value });
    return value;
  }

  async function middleware(req, res, next) {
    try {
      if (isAllowedRequest(req)) return next();
      const user = await attachAccessTokenIfPresent(req);
      if (!user) return next();
      const workspaceId = String(user?.workspaceId || user?.workspace_id || '').trim();
      const userId = String(user?.sub || user?.id || '').trim();
      const gate = await getGateState({ workspaceId, userId, user });
      if (!gate.required) return next();
      if (typeof onBlocked === 'function') {
        await onBlocked(req, {
          workspaceId,
          userId,
          user,
          gate
        });
      }
      return res.status(403).json({
        error: 'Policy acceptance required before workspace access.',
        code: 'policy_acceptance_required',
        policyGate: buildPolicyGateResponse(gate)
      });
    } catch (err) {
      logger.error('[Policy] Server-side gate failed', err);
      return res.status(500).json({ error: 'Policy gate failed' });
    }
  }

  return {
    middleware,
    invalidate,
    getGateState,
    isAllowedRequest,
    allowlist: POLICY_ROUTE_ALLOWLIST.slice()
  };
}

module.exports = {
  POLICY_ROUTE_ALLOWLIST,
  buildPolicyGateResponse,
  createPolicyGuard
};
