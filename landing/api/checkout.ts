/**
 * Muninn v5.3 - Stripe Checkout
 * 
 * Creates Stripe checkout sessions for subscriptions.
 * Version: 2.1.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.muninn.au';

// Pricing configuration - Real Stripe Price IDs
const PRICES = {
  pro: {
    monthly: 'price_1TDbr8DV47UEfSf7Ftxadd3l', // $10/month Pro plan
    yearly: 'price_1TDbr8DV47UEfSf7Ftxadd3l' // Same for now (add yearly later)
  },
  enterprise: {
    monthly: 'price_1TDbr8DV47UEfSf7Ftxadd3l', // Placeholder
    yearly: 'price_1TDbr8DV47UEfSf7Ftxadd3l'   // Placeholder
  }
};

const TIERS = {
  free: { limit: 1000, price: 0 },
  pro: { limit: 50000, price: 10 }, // Updated to $10/mo
  enterprise: { limit: 1000000, price: 100 }
};

interface CheckoutRequest {
  tier: 'pro' | 'enterprise';
  email?: string;
  organization_name?: string;
  success_url?: string;
  cancel_url?: string;
}

async function createStripeCustomer(email: string, name?: string): Promise<string> {
  const response = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      email,
      name: name || email.split('@')[0],
      'metadata[source]': 'muninn'
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create customer: ${error.error?.message}`);
  }
  
  const customer = await response.json();
  return customer.id;
}

async function createCheckoutSession(
  customerId: string,
  tier: 'pro' | 'enterprise',
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const priceId = PRICES[tier].monthly;
  
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'subscription_data[trial_period_days]': '14', // 14-day free trial
      'metadata[tier]': tier
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create checkout session: ${error.error?.message}`);
  }
  
  const session = await response.json();
  return session.url;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { tier, email, organization_name, success_url, cancel_url }: CheckoutRequest = req.body;
    
    // Validate tier
    if (!tier || !['pro', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be "pro" or "enterprise"' });
    }
    
    // Require email for new customers
    if (!email) {
      return res.status(400).json({ error: 'Email required for checkout' });
    }
    
    // Create Stripe customer
    const customerId = await createStripeCustomer(email, organization_name);
    
    // Create checkout session
    const successUrl = success_url || `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = cancel_url || `${FRONTEND_URL}/pricing`;
    
    const checkoutUrl = await createCheckoutSession(customerId, tier, successUrl, cancelUrl);
    
    res.status(200).json({
      url: checkoutUrl,
      customer_id: customerId,
      tier
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      message: error.message 
    });
  }
}