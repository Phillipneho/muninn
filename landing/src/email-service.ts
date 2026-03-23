/**
 * Muninn Email Service
 * 
 * Sends transactional emails via Resend.
 */

import { Resend } from 'resend';
import {
  welcomeEmail,
  passwordResetEmail,
  paymentConfirmationEmail,
  usageWarningEmail,
  apiKeyCreatedEmail,
  byokConfiguredEmail,
  type EmailTemplate
} from './email-templates';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Muninn <hello@muninn.au>';

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email via Resend
 */
async function sendEmail(
  to: string,
  template: EmailTemplate
): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err: any) {
    console.error('Email send error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send welcome email after signup
 */
export async function sendWelcomeEmail(params: {
  email: string;
  apiKey: string;
  organizationName: string;
}): Promise<SendResult> {
  const template = welcomeEmail(params);
  return sendEmail(params.email, template);
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(params: {
  email: string;
  resetUrl: string;
}): Promise<SendResult> {
  const template = passwordResetEmail(params);
  return sendEmail(params.email, template);
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmationEmail(params: {
  email: string;
  plan: string;
  amount: string;
  nextBillingDate: string;
}): Promise<SendResult> {
  const template = paymentConfirmationEmail(params);
  return sendEmail(params.email, template);
}

/**
 * Send usage warning email (80% threshold)
 */
export async function sendUsageWarningEmail(params: {
  email: string;
  usageCount: number;
  usageLimit: number;
  percentageUsed: number;
  resetDate: string;
}): Promise<SendResult> {
  const template = usageWarningEmail(params);
  return sendEmail(params.email, template);
}

/**
 * Send API key created notification
 */
export async function sendApiKeyCreatedEmail(params: {
  email: string;
  keyName: string;
  keyPrefix: string;
  createdAt: string;
}): Promise<SendResult> {
  const template = apiKeyCreatedEmail(params);
  return sendEmail(params.email, template);
}

/**
 * Send BYOK provider configured email
 */
export async function sendByokConfiguredEmail(params: {
  email: string;
  provider: string;
  model: string;
}): Promise<SendResult> {
  const template = byokConfiguredEmail(params);
  return sendEmail(params.email, template);
}

/**
 * Queue email for later sending (for webhooks that can't wait)
 */
export async function queueEmail(
  type: 'welcome' | 'reset' | 'payment' | 'usage' | 'apikey' | 'byok',
  params: Record<string, any>
): Promise<void> {
  // For now, just log - can be replaced with a job queue
  console.log(`[EMAIL QUEUE] ${type}:`, JSON.stringify(params));
  
  // In production, push to a queue like:
  // - Vercel Queue (if available)
  // - Upstash Queue
  // - BullMQ (Redis)
  // - AWS SQS
}