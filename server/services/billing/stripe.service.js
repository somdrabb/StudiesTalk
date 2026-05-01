'use strict';

const STRIPE_API_VERSION = '2026-02-25.clover';

function cleanString(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function requireConfigured(value, message) {
  if (!cleanString(value)) {
    const error = new Error(message);
    error.statusCode = 503;
    throw error;
  }
  return cleanString(value);
}

function createStripeBillingService({
  env = process.env,
  billingRepository,
  audit = null,
  updateWorkspaceStatus = null,
  stripeClient: injectedStripeClient = null
} = {}) {
  if (!billingRepository) throw new Error('Stripe billing service requires billingRepository.');

  const secretKey = cleanString(env.STRIPE_SECRET_KEY);
  const webhookSecret = cleanString(env.STRIPE_WEBHOOK_SECRET);
  const defaultCurrency = cleanString(env.STRIPE_DEFAULT_CURRENCY, 'eur').toLowerCase();
  const successUrl = cleanString(env.STRIPE_CHECKOUT_SUCCESS_URL || env.APP_BASE_URL && `${env.APP_BASE_URL}/admin?tab=billing&stripe=success`);
  const cancelUrl = cleanString(env.STRIPE_CHECKOUT_CANCEL_URL || env.APP_BASE_URL && `${env.APP_BASE_URL}/admin?tab=billing&stripe=cancelled`);
  let stripeClient = null;

  function getStripe() {
    if (injectedStripeClient) return injectedStripeClient;
    if (!secretKey) return null;
    if (stripeClient) return stripeClient;
    const Stripe = require('stripe');
    stripeClient = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
    return stripeClient;
  }

  function getStatus() {
    return {
      provider: 'stripe',
      configured: Boolean(secretKey || injectedStripeClient),
      publicKeyConfigured: Boolean(cleanString(env.STRIPE_PUBLIC_KEY)),
      webhookConfigured: Boolean(webhookSecret),
      mode: secretKey.startsWith('sk_live_') ? 'live' : secretKey ? 'test' : 'disabled',
      apiVersion: STRIPE_API_VERSION,
      defaultCurrency,
      checkoutConfigured: Boolean(successUrl && cancelUrl)
    };
  }

  function resolvePriceId(planOrPriceId) {
    const key = cleanString(planOrPriceId || env.STRIPE_DEFAULT_PRICE_ID);
    if (key.startsWith('price_')) return key;
    const plan = key.toLowerCase();
    if (plan === 'starter') return cleanString(env.STRIPE_PRICE_STARTER || env.STRIPE_DEFAULT_PRICE_ID);
    if (plan === 'pro' || plan === 'professional') return cleanString(env.STRIPE_PRICE_PRO || env.STRIPE_DEFAULT_PRICE_ID);
    if (plan === 'enterprise') return cleanString(env.STRIPE_PRICE_ENTERPRISE || env.STRIPE_DEFAULT_PRICE_ID);
    return key;
  }

  function stripePeriodEndToIso(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n * 1000).toISOString();
  }

  async function ensureCustomer({ workspaceId, email = null, name = null, metadata = {} }) {
    const ws = requireConfigured(workspaceId, 'workspaceId is required.');
    const profile = await billingRepository.getWorkspaceBillingProfile(ws)
      || await billingRepository.ensureWorkspaceBilling({ workspaceId: ws, billingEmail: email });
    const current = await billingRepository.getWorkspaceBillingProfile(ws);
    if (current?.providerCustomerId || current?.stripeCustomerId) return current.providerCustomerId || current.stripeCustomerId;

    const stripe = getStripe();
    if (!stripe) {
      const error = new Error('Stripe is not configured.');
      error.statusCode = 503;
      throw error;
    }
    const customer = await stripe.customers.create({
      email: email || current?.billingEmail || undefined,
      name: name || current?.invoiceContactName || undefined,
      metadata: {
        workspaceId: ws,
        ...metadata
      }
    });
    await billingRepository.updateWorkspaceStripeState({
      workspaceId: ws,
      stripeCustomerId: customer.id
    });
    return customer.id;
  }

  async function setWorkspaceStatus(workspaceId, status) {
    if (!workspaceId || typeof updateWorkspaceStatus !== 'function') return;
    await updateWorkspaceStatus(workspaceId, status);
  }

  async function createCustomer(workspace) {
    const source = workspace || {};
    return ensureCustomer({
      workspaceId: source.id || source.workspaceId || source.workspace_id,
      email: source.billingEmail || source.billing_email || source.email || null,
      name: source.name || source.invoiceContactName || source.invoice_contact_name || null,
      metadata: source.metadata || {}
    });
  }

  async function createCheckoutSession(input, planArg = null) {
    const options = typeof input === 'string'
      ? { workspaceId: input, plan: planArg }
      : (input || {});
    const {
      workspaceId,
      priceId,
      plan,
      quantity = 1,
      email = null,
      trialDays = null,
      actorId = null
    } = options;
    const stripe = getStripe();
    if (!stripe) {
      const error = new Error('Stripe is not configured.');
      error.statusCode = 503;
      throw error;
    }
    const ws = requireConfigured(workspaceId, 'workspaceId is required.');
    const price = requireConfigured(priceId || resolvePriceId(plan), 'Stripe priceId is required.');
    const customerId = await ensureCustomer({ workspaceId: ws, email, metadata: { createdBy: actorId || '' } });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: Math.max(1, Math.floor(Number(quantity) || 1)) }],
      success_url: requireConfigured(successUrl, 'Stripe success URL is not configured.'),
      cancel_url: requireConfigured(cancelUrl, 'Stripe cancel URL is not configured.'),
      subscription_data: {
        metadata: { workspaceId: ws }
      },
      metadata: {
        workspaceId: ws,
        actorId: actorId || ''
      },
      ...(trialDays != null && Number(trialDays) > 0 ? { subscription_data: { trial_period_days: Math.floor(Number(trialDays)), metadata: { workspaceId: ws } } } : {})
    });
    await billingRepository.recordBillingProviderEvent({
      workspaceId: ws,
      provider: 'stripe',
      eventType: 'checkout_session_created',
      status: 'created',
      providerRef: session.id,
      metadata: { priceId: price, plan: plan || null, actorId }
    });
    return {
      id: session.id,
      url: session.url,
      customerId,
      provider: 'stripe'
    };
  }

  async function createPortalSession({ workspaceId, returnUrl = null }) {
    const stripe = getStripe();
    if (!stripe) {
      const error = new Error('Stripe is not configured.');
      error.statusCode = 503;
      throw error;
    }
    const ws = requireConfigured(workspaceId, 'workspaceId is required.');
    const profile = await billingRepository.getWorkspaceBillingProfile(ws);
    const customerId = profile?.providerCustomerId || profile?.stripeCustomerId;
    if (!customerId) {
      const error = new Error('Workspace does not have a Stripe customer yet.');
      error.statusCode = 400;
      throw error;
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || successUrl || undefined
    });
    return { id: session.id, url: session.url, provider: 'stripe' };
  }

  async function getCustomerPortalSession(customerId, returnUrl = null) {
    const stripe = getStripe();
    if (!stripe) {
      const error = new Error('Stripe is not configured.');
      error.statusCode = 503;
      throw error;
    }
    const customer = requireConfigured(customerId, 'customerId is required.');
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: returnUrl || successUrl || undefined
    });
    return { id: session.id, url: session.url, provider: 'stripe' };
  }

  function constructWebhookEvent(rawBody, signature) {
    const stripe = getStripe();
    if (!stripe) throw new Error('Stripe is not configured.');
    if (!webhookSecret) {
      const error = new Error('Stripe webhook secret is not configured.');
      error.statusCode = 503;
      throw error;
    }
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async function handleWebhookEvent(event) {
    const type = cleanString(event?.type);
    const object = event?.data?.object || {};
    const workspaceId = cleanString(object?.metadata?.workspaceId || object?.subscription_details?.metadata?.workspaceId);
    const status = cleanString(object?.status, 'received');
    const providerRef = cleanString(object?.id || event?.id);

    if (type === 'checkout.session.completed') {
      await billingRepository.updateWorkspaceStripeState({
        workspaceId,
        stripeCustomerId: object.customer || null,
        stripeSubscriptionId: object.subscription || null,
        stripeSubscriptionStatus: 'active'
      });
      await setWorkspaceStatus(workspaceId, 'active');
    } else if (type.startsWith('customer.subscription.')) {
      const customerWorkspaceId = workspaceId || await billingRepository.findWorkspaceByStripeCustomerId(object.customer);
      const subscriptionStatus = type === 'customer.subscription.deleted'
        ? 'canceled'
        : object.status || null;
      await billingRepository.updateWorkspaceStripeState({
        workspaceId: customerWorkspaceId,
        stripeCustomerId: object.customer || null,
        stripeSubscriptionId: object.id || null,
        stripePriceId: object.items?.data?.[0]?.price?.id || null,
        stripeSubscriptionStatus: subscriptionStatus,
        currentPeriodEnd: stripePeriodEndToIso(object.current_period_end)
      });
      if (type === 'customer.subscription.deleted') {
        await setWorkspaceStatus(customerWorkspaceId, 'suspended');
      } else if (['active', 'trialing'].includes(String(subscriptionStatus || ''))) {
        await setWorkspaceStatus(customerWorkspaceId, 'active');
      } else if (['past_due', 'unpaid'].includes(String(subscriptionStatus || ''))) {
        await setWorkspaceStatus(customerWorkspaceId, 'past_due');
      }
    } else if (type === 'invoice.payment_succeeded' || type === 'invoice.paid') {
      const customerWorkspaceId = workspaceId || await billingRepository.findWorkspaceByStripeCustomerId(object.customer);
      await billingRepository.recordStripePaymentFromInvoice({
        workspaceId: customerWorkspaceId,
        stripeInvoiceId: object.id,
        stripePaymentIntentId: object.payment_intent || object.charge || null,
        amountPaid: object.amount_paid,
        currency: object.currency || defaultCurrency
      });
      await billingRepository.updateWorkspaceStripeState({
        workspaceId: customerWorkspaceId,
        stripeCustomerId: object.customer || null,
        stripeSubscriptionId: object.subscription || null,
        stripeSubscriptionStatus: 'active'
      });
      await setWorkspaceStatus(customerWorkspaceId, 'active');
    } else if (type === 'invoice.payment_failed') {
      const customerWorkspaceId = workspaceId || await billingRepository.findWorkspaceByStripeCustomerId(object.customer);
      await billingRepository.updateWorkspaceStripeState({
        workspaceId: customerWorkspaceId,
        stripeCustomerId: object.customer || null,
        stripeSubscriptionId: object.subscription || null,
        stripeSubscriptionStatus: 'past_due'
      });
      if (typeof billingRepository.recordStripeInvoiceFailure === 'function') {
        await billingRepository.recordStripeInvoiceFailure({
          workspaceId: customerWorkspaceId,
          stripeInvoiceId: object.id,
          amountDue: object.amount_due || object.amount_remaining || 0,
          currency: object.currency || defaultCurrency
        });
      }
      await billingRepository.recordBillingProviderEvent({
        workspaceId: customerWorkspaceId || null,
        provider: 'stripe',
        eventType: 'invoice.failed',
        status: 'failed',
        providerRef,
        metadata: {
          stripeInvoiceId: object.id,
          paymentIntentId: object.payment_intent || object.charge || null
        }
      });
      await setWorkspaceStatus(customerWorkspaceId, 'past_due');
    }

    await billingRepository.recordBillingProviderEvent({
      workspaceId: workspaceId || null,
      provider: 'stripe',
      eventType: type,
      status,
      providerRef,
      metadata: { eventId: event.id, livemode: !!event.livemode }
    });
    if (typeof audit === 'function') audit('billing.stripe.webhook', { eventType: type, providerRef, workspaceId: workspaceId || null });
    return { ok: true, type };
  }

  async function handleWebhook(event) {
    return handleWebhookEvent(event);
  }

  return {
    getStatus,
    createCustomer,
    ensureCustomer,
    createCheckoutSession,
    createPortalSession,
    getCustomerPortalSession,
    constructWebhookEvent,
    handleWebhookEvent,
    handleWebhook
  };
}

module.exports = {
  STRIPE_API_VERSION,
  createStripeBillingService
};
