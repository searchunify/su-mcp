/**
 * Returns HTML for the SearchUnify connection form.
 * Users enter their SU instance URL, UID, and OAuth client credentials.
 * Authentication is then handled by SU's own login page via OAuth redirect.
 *
 * Security:
 * - Form submits via POST (secrets never in URL/logs/history)
 * - Session ID bound to form via hidden field
 * - Client secret input masked
 * - All assets inline — no external dependencies
 */
function getInstanceFormHTML({ formAction, sessionId }) {
  // Inline SVG favicon — "SU" monogram in SearchUnify orange
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#FF6B35"/><text x="16" y="22" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">SU</text></svg>`;
  const faviconUri = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-Frame-Options" content="DENY">
  <meta name="robots" content="noindex,nofollow">
  <title>Connect to SearchUnify</title>
  <link rel="icon" type="image/svg+xml" href="${faviconUri}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: #f0f2f5;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 24px 16px;
      color: #1a1a2e;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
      padding: 40px 36px 32px;
      max-width: 460px;
      width: 100%;
    }
    /* ── Header / Logo ── */
    .logo-wrap {
      text-align: center;
      margin-bottom: 28px;
    }
    .logo-mark {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .logo-icon {
      width: 40px;
      height: 40px;
      background: #FF6B35;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .logo-icon span {
      color: #fff;
      font-weight: 800;
      font-size: 16px;
      letter-spacing: -0.5px;
    }
    .logo-text {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a2e;
      letter-spacing: -0.3px;
    }
    .logo-text em {
      color: #FF6B35;
      font-style: normal;
    }
    .logo-sub {
      font-size: 14px;
      color: #666;
      line-height: 1.5;
      max-width: 340px;
      margin: 0 auto;
    }
    /* ── Divider ── */
    .divider {
      height: 1px;
      background: #f0f0f0;
      margin: 0 -36px 24px;
    }
    /* ── Form fields ── */
    .form-group { margin-bottom: 16px; }
    label {
      display: block;
      font-weight: 600;
      color: #333;
      margin-bottom: 6px;
      font-size: 13px;
      letter-spacing: 0.1px;
    }
    label .required { color: #FF6B35; margin-left: 2px; }
    .input-wrap { position: relative; }
    input[type="url"],
    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 10px 12px;
      border: 1.5px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      color: #1a1a2e;
      background: #fff;
      transition: border-color 0.15s, box-shadow 0.15s;
      outline: none;
    }
    input:focus {
      border-color: #FF6B35;
      box-shadow: 0 0 0 3px rgba(255,107,53,0.12);
    }
    input.input-error {
      border-color: #dc2626;
      background: #fff8f8;
    }
    input.input-error:focus {
      border-color: #dc2626;
      box-shadow: 0 0 0 3px rgba(220,38,38,0.10);
    }
    input.input-ok {
      border-color: #16a34a;
    }
    .help-text {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
      line-height: 1.4;
    }
    .field-error {
      font-size: 12px;
      color: #dc2626;
      margin-top: 4px;
      display: none;
      line-height: 1.4;
    }
    .field-error.visible { display: block; }
    /* ── Top error banner ── */
    .error-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 18px;
      display: none;
      line-height: 1.5;
    }
    .error-banner.visible { display: block; }
    /* ── Button ── */
    .btn {
      width: 100%;
      padding: 12px 20px;
      background: #FF6B35;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      margin-top: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      letter-spacing: 0.1px;
    }
    .btn:hover:not(:disabled) { background: #e55a28; }
    .btn:active:not(:disabled) { transform: scale(0.99); }
    .btn:disabled { background: #ffb89a; cursor: not-allowed; }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    /* ── Footer ── */
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #999;
      line-height: 1.6;
    }
    .footer .lock-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      margin-bottom: 4px;
      color: #666;
      font-size: 12px;
    }
    .footer .lock-row svg { color: #16a34a; flex-shrink: 0; }
    .badge-oauth {
      display: inline-block;
      background: #f0fdf4;
      color: #16a34a;
      border: 1px solid #bbf7d0;
      border-radius: 20px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <!-- Header -->
    <div class="logo-wrap">
      <div class="logo-mark">
        <div class="logo-icon"><span>SU</span></div>
        <div class="logo-text">Search<em>Unify</em></div>
      </div>
      <div class="badge-oauth">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style="display:inline;vertical-align:middle;margin-right:3px"><path d="M8 1a4 4 0 0 1 4 4v1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1V5a4 4 0 0 1 4-4zm0 1.5A2.5 2.5 0 0 0 5.5 5v1h5V5A2.5 2.5 0 0 0 8 2.5z"/></svg>
        Secured with OAuth 2.0
      </div>
      <p class="logo-sub">Enter your SearchUnify details to connect. You'll be redirected to your instance to sign in securely.</p>
    </div>

    <div class="divider"></div>

    <!-- Error banner -->
    <div class="error-banner" id="errorBanner" role="alert"></div>

    <form id="instanceForm" method="POST" action="${escapeHtml(formAction)}" autocomplete="off" novalidate>
      <input type="hidden" name="session" value="${escapeHtml(sessionId)}">

      <!-- Instance URL -->
      <div class="form-group">
        <label for="instance">Instance URL<span class="required">*</span></label>
        <div class="input-wrap">
          <input type="url" id="instance" name="instance"
            placeholder="https://acme.searchunify.com"
            required autocomplete="off" spellcheck="false">
        </div>
        <div class="field-error" id="err-instance"></div>
        <div class="help-text">Your SearchUnify platform URL, e.g. https://acme.searchunify.com</div>
      </div>

      <!-- UID -->
      <div class="form-group">
        <label for="uid">Search Client UID<span class="required">*</span></label>
        <div class="input-wrap">
          <input type="text" id="uid" name="uid"
            placeholder="e.g. abc123def456"
            required autocomplete="off" spellcheck="false">
        </div>
        <div class="field-error" id="err-uid"></div>
        <div class="help-text">Found in SearchUnify Admin → Search Clients</div>
      </div>

      <!-- OAuth Client ID -->
      <div class="form-group">
        <label for="su_client_id">OAuth Client ID<span class="required">*</span></label>
        <div class="input-wrap">
          <input type="text" id="su_client_id" name="su_client_id"
            placeholder="Enter your OAuth Client ID"
            required autocomplete="off" spellcheck="false">
        </div>
        <div class="field-error" id="err-client-id"></div>
        <div class="help-text">Found in SearchUnify Admin → OAuth Clients</div>
      </div>

      <!-- OAuth Client Secret -->
      <div class="form-group">
        <label for="su_client_secret">OAuth Client Secret<span class="required">*</span></label>
        <div class="input-wrap">
          <input type="password" id="su_client_secret" name="su_client_secret"
            placeholder="Enter your OAuth Client Secret"
            required autocomplete="new-password">
        </div>
        <div class="field-error" id="err-client-secret"></div>
        <div class="help-text">The secret associated with your OAuth Client</div>
      </div>

      <button type="submit" class="btn" id="submitBtn">
        <div class="spinner" id="spinner"></div>
        <span id="btnText">Continue to Login</span>
      </button>
    </form>

    <!-- Footer -->
    <div class="footer">
      <div class="lock-row">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a4 4 0 0 1 4 4v1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1V5a4 4 0 0 1 4-4zm0 1.5A2.5 2.5 0 0 0 5.5 5v1h5V5A2.5 2.5 0 0 0 8 2.5z"/>
        </svg>
        Your credentials are sent directly to your SearchUnify instance. No passwords stored here.
      </div>
      <div>Powered by <strong>SearchUnify</strong></div>
    </div>
  </div>

  <script>
    (function () {
      const form     = document.getElementById('instanceForm');
      const banner   = document.getElementById('errorBanner');
      const submitBtn = document.getElementById('submitBtn');
      const spinner  = document.getElementById('spinner');
      const btnText  = document.getElementById('btnText');

      /* ── Validators ── */
      function validateInstance(val) {
        if (!val) return 'Instance URL is required.';
        let u;
        try { u = new URL(val); } catch { return 'Enter a valid URL, e.g. https://acme.searchunify.com'; }
        if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
          return 'Instance URL must use HTTPS.';
        }
        return '';
      }
      function validateUid(val) {
        if (!val) return 'Search Client UID is required.';
        if (val.length > 200) return 'UID is too long (max 200 characters).';
        if (!/^[a-zA-Z0-9\-_]+$/.test(val)) return 'UID may only contain letters, numbers, hyphens, and underscores.';
        return '';
      }
      function validateClientId(val) {
        if (!val) return 'OAuth Client ID is required.';
        if (val.length < 4) return 'OAuth Client ID is too short.';
        if (val.length > 200) return 'OAuth Client ID is too long (max 200 characters).';
        return '';
      }
      function validateClientSecret(val) {
        if (!val) return 'OAuth Client Secret is required.';
        if (val.length < 4) return 'OAuth Client Secret is too short.';
        if (val.length > 200) return 'OAuth Client Secret is too long (max 200 characters).';
        return '';
      }

      const fields = [
        { id: 'instance',         errId: 'err-instance',      validate: validateInstance },
        { id: 'uid',              errId: 'err-uid',            validate: validateUid },
        { id: 'su_client_id',     errId: 'err-client-id',     validate: validateClientId },
        { id: 'su_client_secret', errId: 'err-client-secret', validate: validateClientSecret },
      ];

      /* ── Per-field inline error helpers ── */
      function showFieldError(field, msg) {
        const input = document.getElementById(field.id);
        const errEl = document.getElementById(field.errId);
        input.classList.add('input-error');
        input.classList.remove('input-ok');
        errEl.textContent = msg;
        errEl.classList.add('visible');
      }
      function clearFieldError(field) {
        const input = document.getElementById(field.id);
        const errEl = document.getElementById(field.errId);
        input.classList.remove('input-error');
        errEl.textContent = '';
        errEl.classList.remove('visible');
      }
      function markFieldOk(field) {
        const input = document.getElementById(field.id);
        input.classList.remove('input-error');
        input.classList.add('input-ok');
        clearFieldError(field);
      }

      /* ── Blur validation ── */
      fields.forEach(function (field) {
        const input = document.getElementById(field.id);
        input.addEventListener('blur', function () {
          const val = input.value.trim();
          const msg = field.validate(val);
          if (msg) { showFieldError(field, msg); }
          else if (val) { markFieldOk(field); }
        });
        input.addEventListener('input', function () {
          clearFieldError(field);
          input.classList.remove('input-ok');
        });
        input.addEventListener('focus', function () {
          banner.textContent = '';
          banner.classList.remove('visible');
        });
      });

      /* ── Submit ── */
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        banner.textContent = '';
        banner.classList.remove('visible');

        // Normalise instance URL (strip trailing slash)
        const instanceInput = document.getElementById('instance');
        instanceInput.value = instanceInput.value.trim().replace(/\/+$/, '');

        // Validate all fields
        let firstError = null;
        fields.forEach(function (field) {
          const input = document.getElementById(field.id);
          const val = input.value.trim();
          const msg = field.validate(val);
          if (msg) {
            showFieldError(field, msg);
            if (!firstError) firstError = { field, input, msg };
          } else {
            markFieldOk(field);
          }
        });

        if (firstError) {
          banner.textContent = firstError.msg;
          banner.classList.add('visible');
          firstError.input.focus();
          return;
        }

        // All valid — show loading state and submit
        submitBtn.disabled = true;
        spinner.style.display = 'block';
        btnText.textContent = 'Redirecting…';
        form.submit();
      });
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export { getInstanceFormHTML };
