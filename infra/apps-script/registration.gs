/**
 * CricSynthesis: API access requests (Google Apps Script web app bound to the sign-ups sheet)
 *
 * 1. Saves each request to the sheet.
 * 2. Sends a confirmation email through Resend from hello@cricsynthesis.in.
 *
 * Called by the site's "Build with CricSynthesis" form, by API plan upgrade requests from the account page, when
 * someone creates an account (type "welcome": recorded in Firestore signups/{email}, each address welcomed only once),
 * and by job applications from the careers page (type "application": a row in the Applications tab, the resume saved
 * to Drive under "CricSynthesis applications/<job>", a confirmation to the applicant and a notice to hello@).
 * Firestore is written with this script's own Google sign-in (the project owner), so no security-rule change is needed;
 * the manifest (appsscript.json) must list the datastore scope, see infra/apps-script/appsscript.json.
 * The Resend key lives in Script properties (Project Settings > Script properties > RESEND_API_KEY), not in code.
 * After editing: Deploy > Manage deployments > pencil > Version: New version > Deploy (keeps the same URL).
 */

const FROM = 'CricSynthesis <hello@cricsynthesis.in>';
const REPLY_TO = 'hello@cricsynthesis.in';
const CAREERS_FROM = 'CricSynthesis Careers <no-reply@cricsynthesis.in>';   // job emails: automated, replies not monitored
const SITE = 'https://cricsynthesis.in';
const LOGO = SITE + '/email-logo.png';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/cricsynthesis/databases/(default)/documents';

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
    if (data.type === 'application') return json(jobApplication(book, data));

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

// New account: record it in Firestore (signups/{email}) and send the welcome email, once per address.
function welcomeSignup(book, data) {
  var email = String(data.email || '').trim().toLowerCase();
  if (!/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(email)) return { success: false, error: 'bad email' };
  var doc = { fields: {
    email: { stringValue: email },
    name: { stringValue: String(data.name || '').slice(0, 120) },
    uid: { stringValue: String(data.uid || '').slice(0, 128) },
    created: { timestampValue: new Date().toISOString() },
    welcome: { stringValue: 'pending' }
  } };
  // createDocument fails with 409 if the address is already there: that is the "only once" check
  var made = firestore('post', '/signups?documentId=' + encodeURIComponent(email), doc);
  if (made.getResponseCode() === 409) return { success: true, duplicate: true };
  if (made.getResponseCode() >= 300) {
    console.error('Firestore error', made.getResponseCode(), made.getContentText());
    return { success: false, error: 'store' };
  }
  var mail = welcomeEmail(data);
  var sent = /"id"/.test(sendViaResend(email, mail.subject, mail.html, mail.text));
  firestore('patch', '/signups/' + encodeURIComponent(email) + '?updateMask.fieldPaths=welcome&updateMask.fieldPaths=welcomedAt',
            { fields: { welcome: { stringValue: sent ? 'sent' : 'failed' }, welcomedAt: { timestampValue: new Date().toISOString() } } });
  return { success: true };
}

// ── job applications ──────────────────────────────────────────────────────────────────────────────────────────────

var APPLY_FIELDS = ['name', 'email', 'phone', 'city', 'portfolio', 'status', 'experience', 'notice', 'reels', 'graphic', 'cricket'];
var RESUME_TYPES = { 'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
var RESUME_MAX = 5 * 1024 * 1024;

function jobApplication(book, data) {
  if (data.website) return { success: true };                       // honeypot field filled: a bot
  for (var i = 0; i < APPLY_FIELDS.length; i++) if (!String(data[APPLY_FIELDS[i]] || '').trim()) return { success: false, error: 'missing' };
  var email = String(data.email).trim().toLowerCase();
  if (!/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(email)) return { success: false, error: 'email' };
  var job = String(data.job || 'general').replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'general';
  var r = data.resume || {}, ext = RESUME_TYPES[r.type];
  if (!ext || !r.data) return { success: false, error: 'resume' };
  var bytes;
  try { bytes = Utilities.base64Decode(r.data); } catch (e) { return { success: false, error: 'resume' }; }
  if (!bytes.length || bytes.length > RESUME_MAX) return { success: false, error: 'resume' };

  var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HHmm');
  var safe = String(data.name).replace(/[^\w .-]/g, '').trim().slice(0, 60) || 'applicant';
  var file = applicationsFolder(job).createFile(Utilities.newBlob(bytes, r.type, stamp + ' ' + safe + '.' + ext));

  var sheet = book.getSheetByName('Applications') || book.insertSheet('Applications');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Received (IST)', 'Role', 'Name', 'Email', 'Phone', 'City', 'Portfolio', 'LinkedIn', 'Status', 'Experience',
      'Notice period', 'Tools', 'Short-form videos', 'Data graphic', 'Follows cricket', 'Notes', 'Resume', 'Review status']);
    sheet.setFrozenRows(1);
  }
  var cell = function (v, n) { return String(v || '').slice(0, n || 2000).replace(/^[=+\-@]/, "'$&"); };  // no formula injection
  sheet.appendRow([Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm'), cell(data.jobTitle || job, 120),
    cell(data.name, 120), email, cell(data.phone, 30), cell(data.city, 80), cell(data.portfolio, 300), cell(data.linkedin, 300),
    cell(data.status, 60), cell(data.experience, 40), cell(data.notice, 40), cell(data.tools, 300), cell(data.reels), cell(data.graphic),
    cell(data.cricket), cell(data.notes), file.getUrl(), 'New']);

  var mail = applicationEmail(data);
  sendViaResend(email, mail.subject, mail.html, mail.text, CAREERS_FROM);
  sendViaResend(REPLY_TO, ('New application: ' + (data.jobTitle || job) + ' from ' + data.name).replace(/[\r\n]+/g, ' ').slice(0, 200),
    p(esc(data.name) + ' (' + esc(email) + ', ' + esc(data.city) + ') applied for ' + esc(data.jobTitle || job) + '.') +
    p('<a href="' + book.getUrl() + '#gid=' + sheet.getSheetId() + '">Open the Applications sheet</a> · <a href="' + file.getUrl() + '">Resume</a>'),
    data.name + ' applied for ' + (data.jobTitle || job) + '. Applications sheet: ' + book.getUrl());
  return { success: true };
}

function applicationsFolder(job) {
  var root = folderIn(DriveApp.getRootFolder(), 'CricSynthesis applications');
  return folderIn(root, job);
}

function folderIn(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function applicationEmail(d) {
  var first = firstName(d.name), title = String(d.jobTitle || 'the role').slice(0, 120), role = esc(title);
  var body =
    p('Thank you for applying for the <strong style="color:#1d1f20">' + role + '</strong> position at CricSynthesis. ' +
      'We have received your application and resume.') +
    p('Our team reviews every application. If your profile matches what we are looking for, we will contact you about ' +
      'the next step, a short assignment based on a real forecast. If you are not shortlisted, we will let you know by email.') +
    p('If you need to update your application, write to <a href="mailto:hello@cricsynthesis.in" style="color:#416180;">' +
      'hello@cricsynthesis.in</a> with the role in the subject line.');
  return {
    subject: 'Application received: ' + title + ' at CricSynthesis',
    html: careersLayout('Application received', 'Thank you, ' + first + '.', body, 'View open roles', SITE + '/careers/'),
    text: 'Thank you, ' + plain(first) + '.\n\nThank you for applying for the ' + title + ' position at CricSynthesis. ' +
      'We have received your application and resume.\n\nOur team reviews every application. If your profile matches what we ' +
      'are looking for, we will contact you about the next step, a short assignment based on a real forecast. If you are not ' +
      'shortlisted, we will let you know by email.\n\nTo update your application, write to hello@cricsynthesis.in with the role ' +
      'in the subject line.\n\nOpen roles: ' + SITE + '/careers/\n\n--\n' + CAREERS_NOTICE_TEXT + '\n\n© ' + new Date().getFullYear() +
      ' CricSynthesis · ' + ADDRESS + ' · ' + SITE
  };
}

var ADDRESS = '13, BTM Stage 1, Bengaluru, 560068';

var CAREERS_NOTICE_TEXT =
  'This is an automated message sent from a no-reply address; replies to it are not monitored. For questions, write to ' +
  'hello@cricsynthesis.in.\n' +
  'CricSynthesis never asks candidates for payment, bank details or fees at any stage of hiring. If anyone does so in our name, ' +
  'do not respond and report it to hello@cricsynthesis.in.\n' +
  'We process your application data only to assess your application, as described in our privacy policy (' + SITE + '/privacy/). ' +
  'To have it deleted, write to privacy@cricsynthesis.in.\n' +
  'This email and any attachments are confidential and intended only for the addressee. If you received it in error, ' +
  'please delete it.';

// Job emails: centred logo, no-reply notice, links and disclaimers. Light theme, site colours.
function careersLayout(eyebrow, heading, body, cta, ctaUrl) {
  var font = "'Barlow', 'Segoe UI', Arial, sans-serif";
  var small = 'margin:0 0 10px 0;color:#b6babe;font-size:12px;line-height:1.6;';
  var flink = 'color:#94bce3;text-decoration:none;';
  var social = function (url, icon, name) {
    return '<td style="padding:0 5px;"><a href="' + url + '" style="text-decoration:none;"><img src="' + SITE + '/email/' + icon +
      '.png" alt="' + name + '" width="32" height="32" style="display:block;border:0;outline:none;width:32px;height:32px;"></a></td>';
  };
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<meta name="color-scheme" content="light"><title>CricSynthesis Careers</title></head>' +
    '<body style="margin:0;padding:0;background:#f2f2f3;font-family:' + font + ';">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f2f3;"><tr><td align="center" style="padding:40px 16px;">' +
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dcdde0;border-radius:12px;overflow:hidden;">' +
    '<tr><td style="padding:0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td width="54%" style="height:6px;background:#5980a6;font-size:0;line-height:0;">&nbsp;</td>' +
    '<td style="height:6px;background:#b5653a;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>' +
    // centred logo
    '<tr><td align="center" style="padding:34px 40px 10px 40px;"><a href="' + SITE + '" style="text-decoration:none;">' +
    '<img src="' + LOGO + '" alt="CricSynthesis" width="175" height="34" style="display:block;margin:0 auto;border:0;outline:none;width:175px;height:auto;"></a></td></tr>' +
    '<tr><td style="padding:0 40px;"><div style="height:1px;background:#e4e5e7;font-size:0;line-height:0;">&nbsp;</div></td></tr>' +
    // heading and body
    '<tr><td style="padding:28px 40px 0 40px;">' +
    '<p style="margin:0 0 10px 0;color:#416180;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">' + eyebrow + '</p>' +
    '<h1 style="margin:0 0 18px 0;color:#1d1f20;font-size:24px;line-height:1.3;font-weight:700;">' + heading + '</h1>' +
    body + '</td></tr>' +
    '<tr><td style="padding:8px 40px 30px 40px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td style="background:#5980a6;border-radius:6px;"><a href="' + ctaUrl + '" style="display:inline-block;padding:12px 22px;color:#ffffff;' +
    'font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;">' + cta + '</a></td></tr></table></td></tr>' +
    '<tr><td style="padding:0 40px 28px 40px;color:#3d4146;font-size:15px;line-height:1.6;">Regards,<br><strong style="color:#1d1f20;">' +
    'Hiring team, CricSynthesis</strong></td></tr>' +
    // footer: site steel, logo, links, social icons, address and disclaimers
    '<tr><td style="background:#1d2d3d;padding:32px 40px 28px 40px;" align="center">' +
    '<a href="' + SITE + '" style="text-decoration:none;"><img src="' + SITE + '/email/logo-light.png" alt="CricSynthesis" width="150" ' +
    'style="display:block;margin:0 auto;border:0;outline:none;width:150px;height:auto;"></a>' +
    '<p style="margin:10px 0 18px 0;color:#94bce3;font-size:13px;">Cricket simulation and analytics</p>' +
    '<p style="margin:0 0 20px 0;color:#5d7a96;font-size:13px;">' +
    '<a href="' + SITE + '/careers/" style="' + flink + '">Careers</a> &nbsp;·&nbsp; ' +
    '<a href="' + SITE + '/privacy/" style="' + flink + '">Privacy policy</a> &nbsp;·&nbsp; ' +
    '<a href="' + SITE + '/terms/" style="' + flink + '">Terms</a> &nbsp;·&nbsp; ' +
    '<a href="' + SITE + '" style="' + flink + '">cricsynthesis.in</a></p>' +
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 20px auto;"><tr>' +
    social('https://in.linkedin.com/company/cricsynthesis', 'linkedin', 'LinkedIn') +
    social('https://x.com/cricsynthesis', 'x', 'X') +
    social('https://instagram.com/cricsynthesis', 'instagram', 'Instagram') + '</tr></table>' +
    '<p style="margin:0;color:#b6babe;font-size:12px;line-height:1.6;">' + ADDRESS + '</p>' +
    '<div style="height:1px;background:#33475b;margin:24px 0 20px 0;font-size:0;line-height:0;">&nbsp;</div>' +
    '<div style="text-align:left;">' +
    '<p style="' + small + '"><strong style="color:#e6e7e8;">This is an automated message sent from a no-reply address.</strong> Replies to this ' +
    'email are not monitored. For questions, write to <a href="mailto:hello@cricsynthesis.in" style="' + flink + '">hello@cricsynthesis.in</a>.</p>' +
    '<p style="' + small + '"><strong style="color:#e6e7e8;">Recruitment fraud.</strong> CricSynthesis never asks candidates for payment, ' +
    'bank details or fees at any stage of hiring. If anyone does so in our name, do not respond and report it to ' +
    '<a href="mailto:hello@cricsynthesis.in" style="' + flink + '">hello@cricsynthesis.in</a>.</p>' +
    '<p style="' + small + '"><strong style="color:#e6e7e8;">Your data.</strong> We process your application only to assess it, as described ' +
    'in our <a href="' + SITE + '/privacy/" style="' + flink + '">privacy policy</a>. To have it deleted, write to ' +
    '<a href="mailto:privacy@cricsynthesis.in" style="' + flink + '">privacy@cricsynthesis.in</a>.</p>' +
    '<p style="' + small + '"><strong style="color:#e6e7e8;">Confidentiality.</strong> This email and any attachments are confidential and ' +
    'intended only for the addressee. If you received it in error, please delete it.</p></div>' +
    '<p style="margin:16px 0 0 0;color:#8f9499;font-size:11px;line-height:1.6;">© ' + new Date().getFullYear() +
    ' CricSynthesis. You are receiving this because you applied for a role on cricsynthesis.in.</p>' +
    '</td></tr></table>' +
    '</td></tr></table></body></html>';
}

function firestore(method, path, body) {
  return UrlFetchApp.fetch(FIRESTORE + path, {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sendViaResend(to, subject, html, text, from) {
  var key = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  var mail = { from: from || FROM, to: [to], subject: subject, html: html, text: text };
  if (!from) mail.reply_to = REPLY_TO;
  var res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(mail),
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

// Writes a test record to Firestore (signups/<your email>) and sends the welcome email. Delete the record to re-run.
function testWelcomeSignup() {
  console.log(JSON.stringify(welcomeSignup(null, { name: 'Saurav Kumar', email: 'ibeingsaurav@gmail.com', uid: 'test' })));
}

function testWelcomeEmail() {
  var m = welcomeEmail({ name: 'Saurav Kumar' });
  console.log(sendViaResend('ibeingsaurav@gmail.com', m.subject, m.html, m.text));
}

function testApplicationEmail() {
  var m = applicationEmail({ name: 'Saurav Kumar', jobTitle: 'Graphics Designer & Video Editor' });
  console.log(sendViaResend('ibeingsaurav@gmail.com', m.subject, m.html, m.text, CAREERS_FROM));
}

function testUpgradeEmail() {
  var m = upgradeEmail({ name: 'Saurav Kumar', interest: 'Upgrade: api-pro', volume: '1k-10k' });
  console.log(sendViaResend('ibeingsaurav@gmail.com', m.subject, m.html, m.text));
}
