/**
 * CricSynthesis: API access requests (Google Apps Script web app bound to the sign-ups sheet)
 *
 * 1. Saves each request to the sheet.
 * 2. Sends a confirmation email through Resend from hello@cricsynthesis.in.
 *
 * Called by the site's "Build with CricSynthesis" form, by API plan upgrade requests from the account page, and when
 * someone creates an account (type "welcome": logged on a "Signups" tab, and each address is welcomed only once).
 * The Resend key lives in Script properties (Project Settings > Script properties > RESEND_API_KEY), not in code.
 * After editing: Deploy > Manage deployments > pencil > Version: New version > Deploy (keeps the same URL).
 */

const FROM = 'CricSynthesis <hello@cricsynthesis.in>';
const REPLY_TO = 'hello@cricsynthesis.in';
const SITE = 'https://cricsynthesis.in';
const LOGO = SITE + '/email-logo.png';

// Values sent by the form's "What are you building?" field
const INTERESTS = {
  analytics: 'Analytics (ratings, projections and matchups)',
  simulation: 'Simulation (match forecasts and what-ifs)',
  graphics: 'Graphics (share-ready cards)',
  all: 'The full catalog'
};
const PLANS = { 'api-pro': 'Pro', 'api-business': 'Business' };
const VOLUMES = {
  '<1k': 'under 1,000 requests a day', '1k-10k': '1,000 to 10,000 requests a day',
  '10k-50k': '10,000 to 50,000 requests a day', '>50k': 'more than 50,000 requests a day'
};

function doPost(e) {
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);

    if (data.type === 'welcome') return json(welcomeSignup(book, data));

    var sheet = book.getSheets()[0];

    // Columns: A Timestamp, B Full Name, C Work Email, D Organization, E Interested Product, F Source,
    //          G Plan request, H Volume, I Message (G to I are filled for upgrade requests only)
    sheet.appendRow([
      new Date().toISOString(),
      data.name || '',
      data.email || '',
      data.organization || '',
      data.segment || '',
      data.source || '',
      data.interest || '',
      data.volume || '',
      data.message || ''
    ]);

    if (data.email) {
      var mail = /^Upgrade:/.test(data.interest || '') ? upgradeEmail(data) : accessEmail(data);
      sendViaResend(data.email, mail.subject, mail.html, mail.text);
    }
    return json({ success: true });
  } catch (error) {
    return json({ success: false, error: error.message });
  }
}

// New account: log it on the "Signups" tab and send the welcome email, once per address.
function welcomeSignup(book, data) {
  var email = String(data.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'bad email' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tab = book.getSheetByName('Signups') || book.insertSheet('Signups');
    if (tab.getLastRow() === 0) tab.appendRow(['Timestamp', 'Name', 'Email', 'Welcome sent']);
    var seen = tab.getLastRow() > 1 ? tab.getRange(2, 3, tab.getLastRow() - 1, 1).getValues() : [];
    if (seen.some(function (r) { return String(r[0]).toLowerCase() === email; })) return { success: true, duplicate: true };
    var mail = welcomeEmail(data);
    var res = sendViaResend(email, mail.subject, mail.html, mail.text);
    tab.appendRow([new Date().toISOString(), data.name || '', email, /"id"/.test(res) ? 'yes' : 'failed']);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sendViaResend(to, subject, html, text) {
  var key = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  var res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: subject, html: html, text: text }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) console.error('Resend error', res.getResponseCode(), res.getContentText());
  return res.getContentText();
}

// ── the two emails ────────────────────────────────────────────────────────────────────────────────────────────────

function accessEmail(d) {
  var first = firstName(d.name);
  var org = d.organization ? ' for ' + esc(d.organization) : '';
  var interest = INTERESTS[d.segment];
  var body =
    p('We&rsquo;ve received your request for API access' + org + '. We read every request ourselves and usually reply within ' +
      'two working days with your key and anything you need to get started.') +
    (interest ? p('You told us you&rsquo;re most interested in <strong style="color:#1d1f20">' + interest + '</strong>, so we&rsquo;ll ' +
      'start there.') : '') +
    links('While you wait', [
      ['API reference', SITE + '/docs/', 'Every endpoint, with sample responses'],
      ['Playground', SITE + '/playground/', 'Try live calls in your browser'],
      ['MCP server', SITE + '/mcp/', 'Use our analytics inside Claude and other AI assistants'],
      ['Match centre', SITE + '/match/', 'See the forecasts the API is built on']
    ]);
  return {
    subject: 'Your CricSynthesis API access request',
    html: layout('API access request', 'Thanks, ' + first + '. We&rsquo;ve got your request.', body,
                 'Read the docs', SITE + '/docs/'),
    text: 'Thanks, ' + plain(first) + '.\n\nWe\'ve received your request for API access' + (d.organization ? ' for ' + d.organization : '') +
      '. We usually reply within two working days with your key.\n\nWhile you wait:\nAPI reference: ' + SITE + '/docs/\n' +
      'Playground: ' + SITE + '/playground/\nMCP server: ' + SITE + '/mcp/\n\nQuestions? Just reply to this email.\n\nCricSynthesis\n' + SITE
  };
}

function welcomeEmail(d) {
  var first = firstName(d.name);
  var body =
    p('Your CricSynthesis account is ready. While we&rsquo;re in beta, every account includes Pro at no cost, so ' +
      'MatchSynth Lab is open to you as well.') +
    links('Where to start', [
      ['Match centre', SITE + '/match/', 'Win chances, likely scores and players to watch for upcoming matches'],
      ['MatchSynth Lab', SITE + '/lab/', 'Change the XI, toss or conditions and replay the match yourself'],
      ['Results', SITE + '/results/', 'How our past forecasts compared with what happened'],
      ['Your account', SITE + '/account/', 'Profile, email preferences and API keys']
    ]);
  return {
    subject: 'Welcome to CricSynthesis',
    html: layout('Welcome', 'Welcome to CricSynthesis, ' + first + '.', body, 'Open the match centre', SITE + '/match/',
                 'you created an account on cricsynthesis.in'),
    text: 'Welcome to CricSynthesis, ' + plain(first) + '.\n\nYour account is ready. While we\'re in beta, every account includes ' +
      'Pro at no cost, so MatchSynth Lab is open to you as well.\n\nMatch centre: ' + SITE + '/match/\nMatchSynth Lab: ' + SITE +
      '/lab/\nResults: ' + SITE + '/results/\nYour account: ' + SITE + '/account/\n\nQuestions? Just reply to this email.\n\nCricSynthesis\n' + SITE
  };
}

function upgradeEmail(d) {
  var first = firstName(d.name);
  var plan = PLANS[(d.interest || '').replace(/^Upgrade:\s*/, '')] || 'a higher';
  var vol = VOLUMES[d.volume];
  var body =
    p('We&rsquo;ve received your request to move to the <strong style="color:#1d1f20">' + plan + '</strong> API plan' +
      (vol ? ', at ' + vol : '') + '. We&rsquo;ll review it and reply within two working days.') +
    p('Your current keys keep working in the meantime. You can follow the request, or cancel it, from your account page.');
  return {
    subject: 'Your CricSynthesis ' + plan + ' plan request',
    html: layout('Plan upgrade request', 'Thanks, ' + first + '. Your request is in.', body,
                 'Open your account', SITE + '/account/'),
    text: 'Thanks, ' + plain(first) + '.\n\nWe\'ve received your request to move to the ' + plan + ' API plan' + (vol ? ', at ' + vol : '') +
      '. We\'ll reply within two working days. Your current keys keep working in the meantime.\n\nYour account: ' + SITE +
      '/account/\n\nQuestions? Just reply to this email.\n\nCricSynthesis\n' + SITE
  };
}

// ── layout (light theme, site colours: ink #1d1f20, steel #5980a6 / #416180, rust #b5653a) ───────────────────────────

function layout(eyebrow, heading, body, cta, ctaUrl, why) {
  var font = "'Barlow', 'Segoe UI', Arial, sans-serif";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<meta name="color-scheme" content="light"><title>CricSynthesis</title></head>' +
    '<body style="margin:0;padding:0;background:#f2f2f3;font-family:' + font + ';">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f2f3;"><tr><td align="center" style="padding:40px 16px;">' +
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dcdde0;border-radius:12px;overflow:hidden;">' +
    // brand bar
    '<tr><td style="padding:0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td width="54%" style="height:6px;background:#5980a6;font-size:0;line-height:0;">&nbsp;</td>' +
    '<td style="height:6px;background:#b5653a;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>' +
    // logo
    '<tr><td style="padding:32px 40px 8px 40px;"><a href="' + SITE + '" style="text-decoration:none;">' +
    '<img src="' + LOGO + '" alt="CricSynthesis" width="175" height="34" style="display:block;border:0;outline:none;width:175px;height:auto;"></a></td></tr>' +
    // heading
    '<tr><td style="padding:24px 40px 0 40px;">' +
    '<p style="margin:0 0 10px 0;color:#416180;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">' + eyebrow + '</p>' +
    '<h1 style="margin:0 0 18px 0;color:#1d1f20;font-size:24px;line-height:1.3;font-weight:700;">' + heading + '</h1>' +
    body + '</td></tr>' +
    // button
    '<tr><td style="padding:8px 40px 36px 40px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td style="background:#5980a6;border-radius:6px;"><a href="' + ctaUrl + '" style="display:inline-block;padding:12px 22px;color:#ffffff;' +
    'font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;">' + cta + '</a></td></tr></table></td></tr>' +
    // footer
    '<tr><td style="padding:0 40px;"><div style="height:1px;background:#e4e5e7;font-size:0;line-height:0;">&nbsp;</div></td></tr>' +
    '<tr><td style="padding:22px 40px 30px 40px;color:#6b7075;font-size:13px;line-height:1.6;">' +
    'Questions? Just reply to this email.<br>' +
    '<a href="https://in.linkedin.com/company/cricsynthesis" style="color:#416180;text-decoration:none;">LinkedIn</a> &nbsp;·&nbsp; ' +
    '<a href="https://x.com/cricsynthesis" style="color:#416180;text-decoration:none;">X</a> &nbsp;·&nbsp; ' +
    '<a href="https://instagram.com/cricsynthesis" style="color:#416180;text-decoration:none;">Instagram</a> &nbsp;·&nbsp; ' +
    '<a href="' + SITE + '" style="color:#416180;text-decoration:none;">cricsynthesis.in</a></td></tr>' +
    '</table>' +
    '<p style="margin:18px 0 0 0;color:#8a8e93;font-size:11px;font-family:' + font + ';">© ' + new Date().getFullYear() +
    ' CricSynthesis. You&rsquo;re receiving this because ' + (why || 'you asked for API access on cricsynthesis.in') + '.</p>' +
    '</td></tr></table></body></html>';
}

function p(html) {
  return '<p style="margin:0 0 16px 0;color:#3d4146;font-size:16px;line-height:1.65;">' + html + '</p>';
}

function links(title, rows) {
  var items = rows.map(function (r) {
    return '<tr><td style="padding:10px 0;border-top:1px solid #e4e5e7;">' +
      '<a href="' + r[1] + '" style="color:#416180;font-size:15px;font-weight:700;text-decoration:none;">' + r[0] + ' &rarr;</a>' +
      '<div style="color:#6b7075;font-size:14px;line-height:1.5;margin-top:2px;">' + r[2] + '</div></td></tr>';
  }).join('');
  return '<p style="margin:8px 0 6px 0;color:#1d1f20;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">' + title + '</p>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;">' + items + '</table>';
}

function firstName(name) {
  var n = String(name || '').trim().split(/\s+/)[0];
  return n ? esc(n) : 'there';
}

function plain(s) { return String(s).replace(/&[a-z]+;|&#\d+;/g, ''); }

// Names and organisations come from a public form: never put them into the HTML unescaped.
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ── manual tests: Run > testAccessEmail / testUpgradeEmail ────────────────────────────────────────────────────────

function testAccessEmail() {
  var m = accessEmail({ name: 'Saurav Kumar', organization: 'Test Org', segment: 'simulation' });
  console.log(sendViaResend('ibeingsaurav@gmail.com', m.subject, m.html, m.text));
}

function testWelcomeEmail() {
  var m = welcomeEmail({ name: 'Saurav Kumar' });
  console.log(sendViaResend('ibeingsaurav@gmail.com', m.subject, m.html, m.text));
}

function testUpgradeEmail() {
  var m = upgradeEmail({ name: 'Saurav Kumar', interest: 'Upgrade: api-pro', volume: '1k-10k' });
  console.log(sendViaResend('ibeingsaurav@gmail.com', m.subject, m.html, m.text));
}
