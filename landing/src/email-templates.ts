/**
 * Muninn Email Templates
 * 
 * HTML email templates for transactional emails.
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Welcome email after signup
export function welcomeEmail(params: {
  email: string;
  apiKey: string;
  organizationName: string;
}): EmailTemplate {
  const { email, apiKey, organizationName } = params;
  
  return {
    subject: 'Welcome to Muninn — Your API Key Inside',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Muninn</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Muninn</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Memory-as-a-Service for AI Agents</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <p>Hi there,</p>
    <p>Your account is ready! Here's your API key:</p>
    
    <div style="background: #1f2937; color: #10b981; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 20px 0;">
      ${apiKey}
    </div>
    
    <p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px;">
      <strong>⚠️ Save this key securely</strong> — it won't be shown again.
    </p>
    
    <h2 style="margin-top: 30px;">Quick Start</h2>
    
    <p><strong>1. Test your key:</strong></p>
    <pre style="background: #1f2937; color: #e5e7eb; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 13px;">curl -X POST https://www.muninn.au/api/memories \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello, Muninn!"}'</pre>
    
    <p><strong>2. View docs:</strong> <a href="https://www.muninn.au/docs" style="color: #667eea;">muninn.au/docs</a></p>
    <p><strong>3. Manage keys:</strong> <a href="https://www.muninn.au/dashboard" style="color: #667eea;">muninn.au/dashboard</a></p>
    
    <h2 style="margin-top: 30px;">Your Account</h2>
    <ul style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
      <li><strong>Email:</strong> ${email}</li>
      <li><strong>Organization:</strong> ${organizationName}</li>
      <li><strong>Plan:</strong> Pro ($10/month)</li>
      <li><strong>API Calls:</strong> 50,000/month</li>
    </ul>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        Questions? Reply to this email or visit <a href="https://www.muninn.au/docs" style="color: #667eea;">muninn.au/docs</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
        — The Muninn Team<br>
        <a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
Welcome to Muninn!

Your account is ready. Here's your API key:

${apiKey}

⚠️ Save this key securely — it won't be shown again.

QUICK START
===========

1. Test your key:

curl -X POST https://www.muninn.au/api/memories \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello, Muninn!"}'

2. View docs: muninn.au/docs
3. Manage keys: muninn.au/dashboard

YOUR ACCOUNT
============

Email: ${email}
Organization: ${organizationName}
Plan: Pro ($10/month)
API Calls: 50,000/month

Questions? Reply to this email.

— The Muninn Team
muninn.au
    `
  };
}

// Password reset email
export function passwordResetEmail(params: {
  email: string;
  resetUrl: string;
}): EmailTemplate {
  const { email, resetUrl } = params;
  
  return {
    subject: 'Reset Your Muninn Password',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Reset Your Password</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <p>Hi there,</p>
    <p>You requested a password reset for your Muninn account.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset Password</a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">Or copy this link:</p>
    <pre style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 13px; word-break: break-all; overflow-x: auto;">${resetUrl}</pre>
    
    <p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px; margin-top: 20px;">
      This link expires in 24 hours. If you didn't request this, you can safely ignore this email.
    </p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px;">
        — The Muninn Team<br>
        <a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
Reset Your Password

You requested a password reset for your Muninn account.

Reset link: ${resetUrl}

This link expires in 24 hours. If you didn't request this, you can safely ignore this email.

— The Muninn Team
muninn.au
    `
  };
}

// Payment confirmation email
export function paymentConfirmationEmail(params: {
  email: string;
  plan: string;
  amount: string;
  nextBillingDate: string;
}): EmailTemplate {
  const { email, plan, amount, nextBillingDate } = params;
  
  return {
    subject: 'Payment Confirmed — Your Muninn Account is Active',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">✓ Payment Confirmed</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Your Muninn account is now active</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <h2>Account Details</h2>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Email</strong></td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${email}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Plan</strong></td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${plan}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Amount</strong></td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${amount}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0;"><strong>Next billing</strong></td>
        <td style="padding: 12px 0; text-align: right;">${nextBillingDate}</td>
      </tr>
    </table>
    
    <h2>What's Next?</h2>
    <ol style="background: white; padding: 20px 20px 20px 40px; border-radius: 8px; border: 1px solid #e5e7eb;">
      <li style="margin-bottom: 10px;"><strong>Get your API key:</strong> <a href="https://www.muninn.au/dashboard" style="color: #667eea;">muninn.au/dashboard</a></li>
      <li style="margin-bottom: 10px;"><strong>Configure BYOK:</strong> Use your own OpenAI or Gemini key</li>
      <li style="margin-bottom: 10px;"><strong>Integrate:</strong> <a href="https://www.muninn.au/docs" style="color: #667eea;">View integration guides</a></li>
    </ol>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        Questions? Reply to this email or visit <a href="https://www.muninn.au/docs" style="color: #667eea;">muninn.au/docs</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
        — The Muninn Team<br>
        <a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
PAYMENT CONFIRMED

Your Muninn account is now active.

ACCOUNT DETAILS
===============
Email: ${email}
Plan: ${plan}
Amount: ${amount}
Next billing: ${nextBillingDate}

WHAT'S NEXT?
============
1. Get your API key: muninn.au/dashboard
2. Configure BYOK: Use your own OpenAI or Gemini key
3. Integrate: muninn.au/docs

Questions? Reply to this email.

— The Muninn Team
muninn.au
    `
  };
}

// Usage warning email (80% threshold)
export function usageWarningEmail(params: {
  email: string;
  usageCount: number;
  usageLimit: number;
  percentageUsed: number;
  resetDate: string;
}): EmailTemplate {
  const { email, usageCount, usageLimit, percentageUsed, resetDate } = params;
  
  return {
    subject: `You've Used ${percentageUsed}% of Your Muninn API Calls`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Usage Warning</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ Usage Warning</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">You've used ${percentageUsed}% of your monthly API calls</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <h2>Current Usage</h2>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
        <span>Calls this month</span>
        <span><strong>${usageCount.toLocaleString()}</strong></span>
      </div>
      <div style="background: #f3f4f6; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: linear-gradient(90deg, #f59e0b, #d97706); height: 100%; width: ${percentageUsed}%;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 14px; color: #6b7280;">
        <span>Remaining: ${(usageLimit - usageCount).toLocaleString()}</span>
        <span>Limit: ${usageLimit.toLocaleString()}</span>
      </div>
    </div>
    
    <p><strong>Resets:</strong> ${resetDate}</p>
    
    <h2 style="margin-top: 30px;">Avoid Interruption</h2>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
      <h3 style="margin-top: 0;">Upgrade to Enterprise</h3>
      <ul style="margin-bottom: 0;">
        <li>Unlimited API calls</li>
        <li>Dedicated infrastructure</li>
        <li>Team management</li>
        <li>Priority support</li>
      </ul>
      <div style="text-align: center; margin-top: 20px;">
        <a href="https://www.muninn.au/dashboard/billing" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Upgrade Now</a>
      </div>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px;">
        — The Muninn Team<br>
        <a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
USAGE WARNING

You've used ${percentageUsed}% of your monthly API calls.

CURRENT USAGE
=============
Calls this month: ${usageCount.toLocaleString()}
Remaining: ${(usageLimit - usageCount).toLocaleString()}
Limit: ${usageLimit.toLocaleString()}
Resets: ${resetDate}

AVOID INTERRUPTION
==================
Upgrade to Enterprise for unlimited calls:
muninn.au/dashboard/billing

— The Muninn Team
muninn.au
    `
  };
}

// New API key created notification
export function apiKeyCreatedEmail(params: {
  email: string;
  keyName: string;
  keyPrefix: string;
  createdAt: string;
}): EmailTemplate {
  const { email, keyName, keyPrefix, createdAt } = params;
  
  return {
    subject: 'New API Key Created — Muninn',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New API Key Created</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔐 New API Key Created</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <p>A new API key was created for your Muninn account.</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Name</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${keyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Prefix</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace;">${keyPrefix}...</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Created</strong></td>
          <td style="padding: 8px 0; text-align: right;">${createdAt}</td>
        </tr>
      </table>
    </div>
    
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px; margin: 20px 0;">
      <strong>Security Notice:</strong> If you didn't create this key, revoke it immediately at <a href="https://www.muninn.au/dashboard?tab=keys" style="color: #667eea;">muninn.au/dashboard</a>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://www.muninn.au/dashboard?tab=keys" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Manage API Keys</a>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px;">
        — The Muninn Team<br>
        <a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
NEW API KEY CREATED

A new API key was created for your account.

Key Details
===========
Name: ${keyName}
Prefix: ${keyPrefix}...
Created: ${createdAt}

SECURITY NOTICE
===============
If you didn't create this key, revoke it immediately at:
muninn.au/dashboard?tab=keys

— The Muninn Team
muninn.au
    `
  };
}

// BYOK provider configured
export function byokConfiguredEmail(params: {
  email: string;
  provider: string;
  model: string;
}): EmailTemplate {
  const { email, provider, model } = params;
  
  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    gemini: 'Google Gemini',
    anthropic: 'Anthropic',
    ollama: 'Ollama (Local)',
    openrouter: 'OpenRouter'
  };
  
  return {
    subject: `BYOK Provider Configured — ${providerNames[provider] || provider}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BYOK Provider Configured</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">✓ Provider Configured</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Your BYOK settings are active</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <h2>Configuration</h2>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Provider</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${providerNames[provider] || provider}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Model</strong></td>
          <td style="padding: 8px 0; text-align: right;">${model}</td>
        </tr>
      </table>
    </div>
    
    <h2>How It Works</h2>
    <ol style="background: white; padding: 20px 20px 20px 40px; border-radius: 8px; border: 1px solid #e5e7eb;">
      <li style="margin-bottom: 10px;">Your agent calls Muninn API</li>
      <li style="margin-bottom: 10px;">We use <strong>your</strong> ${providerNames[provider] || provider} key for embeddings</li>
      <li style="margin-bottom: 10px;">You pay your provider directly</li>
    </ol>
    
    <p style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; border-radius: 4px; margin: 20px 0;">
      <strong>Benefit:</strong> Your Muninn usage doesn't count toward our embedding quota — you only pay for what you use.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://www.muninn.au/dashboard?tab=provider" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Manage Providers</a>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px;">
        — The Muninn Team<br>
        <a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
BYOK PROVIDER CONFIGURED

Your custom embedding provider is now active.

CONFIGURATION
=============
Provider: ${providerNames[provider] || provider}
Model: ${model}

HOW IT WORKS
============
1. Your agent calls Muninn API
2. We use YOUR ${providerNames[provider] || provider} key for embeddings
3. You pay your provider directly

BENEFIT
=======
Your Muninn usage doesn't count toward our embedding quota.

Manage providers: muninn.au/dashboard?tab=provider

— The Muninn Team
muninn.au
    `
  };
}