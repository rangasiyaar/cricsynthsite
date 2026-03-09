/**
 * CricSynthesis Registration Handler with Resend Email
 * 
 * This Google Apps Script:
 * 1. Saves registration data to Google Sheets
 * 2. Sends confirmation email via Resend API from hello@cricsynthesis.in
 */

// Resend API Configuration
const RESEND_API_KEY = 're_Tf7fSXBq_MssJ9ijSt3eUWP3R61ChDnCb';
const FROM_EMAIL = 'hello@cricsynthesis.in';
const FROM_NAME = 'CricSynthesis';

// Map HTML form values to display names
const PRODUCT_MAP = {
    'cricveda': 'CricVeda — Fantasy Analytics API',
    'matchsynth': 'MatchSynth — Match Simulation Engine',
    'graphsynth': 'GraphSynth — Broadcast Visualizations',
    'multiple': 'Multiple Products'
};

function doPost(e) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        var data = JSON.parse(e.postData.contents);

        // Save to sheet
        // Make sure your Google Sheet columns exactly match this order:
        // A: Timestamp
        // B: Full Name
        // C: Work Email
        // D: Organization
        // E: Interested Product
        // F: Referrer/Source (Optional)
        sheet.appendRow([
            new Date().toISOString(),
            data.name || '',
            data.email || '',
            data.organization || '',
            data.segment || '',
            data.source || ''
        ]);

        // Send confirmation email via Resend
        if (data.email) {
            var displayProduct = PRODUCT_MAP[data.segment] || 'CricSynthesis Products';
            sendEmailViaResend(data.name || 'there', data.email, displayProduct);
        }

        return ContentService
            .createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: error.message }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function sendEmailViaResend(name, toEmail, product) {
    var htmlBody = getEmailTemplate(name, product);

    var payload = {
        from: FROM_NAME + ' <' + FROM_EMAIL + '>',
        to: [toEmail],
        subject: 'CricSynthesis Private Beta - Invite Request Received',
        html: htmlBody
    };

    var options = {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + RESEND_API_KEY,
            'Content-Type': 'application/json'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch('https://api.resend.com/emails', options);
    var result = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200) {
        console.error('Resend API Error:', result);
    }

    return result;
}

function getEmailTemplate(name, product) {
    // Dynamic text based on product selection
    let productInterestText = "";
    if (product !== 'Multiple Products' && product !== 'CricSynthesis Products') {
        productInterestText = `<p style="color: #a1a1aa; font-size: 16px; line-height: 1.7; margin: 0 0 25px 0;">We noticed your particular interest in <strong>${product}</strong>. We're incredibly excited to show you the capabilities we've developed in that area.</p>`;
    } else {
        productInterestText = `<p style="color: #a1a1aa; font-size: 16px; line-height: 1.7; margin: 0 0 25px 0;">We noticed your interest across our platform. Whether it's fantasy analytics, simulations, or broadcasting, we're building the infrastructure you want.</p>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CricSynthesis Private Beta Registration</title>
</head>
<body style="margin: 0; padding: 0; background-color: #06080d; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #06080d;">
        <tr>
            <td align="center" style="padding: 60px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b0e16; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06);">
                    
                    <!-- Header with Logo -->
                    <tr>
                        <td align="center" style="padding: 40px 40px 30px 40px;">
                            <img src="https://i.postimg.cc/mgXK06V9/logo.png" alt="CricSynthesis" style="height: 50px; width: auto; display: block;" />
                        </td>
                    </tr>

                    <!-- Status Badge -->
                    <tr>
                        <td align="center" style="padding: 0 40px 10px 40px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 50px; padding: 6px 16px;">
                                        <span style="color: #10b981; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">✓ Request Received</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px 40px;">
                            <h1 style="color: #f0f0f5; font-size: 24px; font-weight: 700; margin: 0 0 20px 0; line-height: 1.3; text-align: center;">
                                Thank You for Your Interest, ${name}.
                            </h1>
                            <p style="color: #a1a1aa; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
                                We've successfully received your request for an invite to the CricSynthesis Private Beta. Our APIs process data from over 15,000 matches to deliver unparalleled cricket intelligence, and we're thrilled to have you join our early waitlist.
                            </p>
                            
                            <!-- Dynamic Product Interest Text -->
                            ${productInterestText}
                        </td>
                    </tr>

                    <!-- Next Steps -->
                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px;">
                                <tr>
                                    <td style="padding: 24px;">
                                        <h2 style="color: #f0f0f5; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">What to Expect Next:</h2>
                                        <ol style="color: #a1a1aa; font-size: 15px; line-height: 1.7; margin: 0; padding-left: 20px;">
                                            <li style="margin-bottom: 8px;">Our team is reviewing your organization's request.</li>
                                            <li style="margin-bottom: 8px;">We are currently prioritizing integrations based on use-cases.</li>
                                            <li>You will receive another email containing your API keys and documentation access once approved.</li>
                                        </ol>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Divider -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="height: 1px; background: rgba(255,255,255,0.06);"></div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px 40px 40px; text-align: center;">
                            <p style="color: #6b7280; font-size: 13px; margin: 0 0 15px 0; line-height: 1.6;">
                                CricSynthesis — Cricket Intelligence Delivered as APIs
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                                <tr>
                                    <td style="padding: 0 8px;">
                                        <a href="https://linkedin.com/company/cricsynthesis" style="color: #6366f1; font-size: 13px; text-decoration: none; font-weight: 500;">LinkedIn</a>
                                    </td>
                                    <td style="color: #4b5263;">•</td>
                                    <td style="padding: 0 8px;">
                                        <a href="https://twitter.com/cricsynthesis" style="color: #6366f1; font-size: 13px; text-decoration: none; font-weight: 500;">X (Twitter)</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
                
                <!-- Extra Space at Bottom -->
                <p style="color: #4b5263; font-size: 11px; margin: 20px 0 0 0; text-align: center;">
                    © 2026 CricSynthesis. All rights reserved.<br>
                    <a href="mailto:hello@cricsynthesis.in" style="color: #6b7280; text-decoration: underline;">hello@cricsynthesis.in</a>
                </p>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

// Test function - run this manually to test email sending
function testEmail() {
    var result = sendEmailViaResend('Saurav', 'ibeingsaurav@gmail.com', 'CricVeda — Fantasy Analytics API');
    console.log(result);
}
