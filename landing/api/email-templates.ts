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
<head><meta charset="utf-8"><title>Welcome to Muninn</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Muninn</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Memory-as-a-Service for AI Agents</p>
  </div>
  <div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <p>Hi there,</p>
    <p>Your account is ready! Here's your API key:</p>
    <div style="background: #1f2937; color: #10b981; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 20px 0;">${apiKey}</div>
    <p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px;"><strong>⚠️ Save this key securely</strong> — it won't be shown again.</p>
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
    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or visit <a href="https://www.muninn.au/docs" style="color: #667eea;">muninn.au/docs</a></p>
    <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">— The Muninn Team<br><a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a></p>
  </div>
</body>
</html>`,
    text: `Welcome to Muninn!\n\nYour account is ready. Here's your API key:\n\n${apiKey}\n\n⚠️ Save this key securely — it won't be shown again.\n\nQUICK START\n===========\n\n1. Test your key:\ncurl -X POST https://www.muninn.au/api/memories \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"content": "Hello, Muninn!"}'\n\n2. View docs: muninn.au/docs\n3. Manage keys: muninn.au/dashboard\n\nYOUR ACCOUNT\n============\nEmail: ${email}\nOrganization: ${organizationName}\nPlan: Pro ($10/month)\nAPI Calls: 50,000/month\n\nQuestions? Reply to this email.\n\n— The Muninn Team\nmuninn.au`
  };
}