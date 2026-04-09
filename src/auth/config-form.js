/**
 * Returns HTML for the SearchUnify connection form.
 * Users enter their SU instance URL and the OAuth client credentials
 * registered for MCP on their instance. Authentication is then handled
 * by SU's own login page via OAuth redirect.
 *
 * Security:
 * - Form submits via POST (secrets never in URL/logs/history)
 * - Session ID bound to form via hidden field
 * - Client secret input masked
 */
function getInstanceFormHTML({ formAction, sessionId }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-Frame-Options" content="DENY">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; form-action 'self' https:;">
  <title>Connect SearchUnify</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      padding: 40px;
      max-width: 480px;
      width: 100%;
    }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo h1 { font-size: 22px; color: #1a1a2e; }
    .logo p { color: #666; font-size: 14px; margin-top: 6px; }
    .form-group { margin-bottom: 18px; }
    label { display: block; font-weight: 500; color: #333; margin-bottom: 6px; font-size: 14px; }
    input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    input:focus { outline: none; border-color: #4a6cf7; }
    .help-text { font-size: 12px; color: #888; margin-top: 4px; }
    .btn {
      width: 100%;
      padding: 12px;
      background: #4a6cf7;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    .btn:hover { background: #3a5ce5; }
    .btn:disabled { background: #a0b0e0; cursor: not-allowed; }
    .error {
      background: #fef2f2;
      color: #dc2626;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
      display: none;
    }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>Connect SearchUnify</h1>
      <p>Enter your SearchUnify instance details. You will be redirected to log in on your SearchUnify instance.</p>
    </div>

    <div class="error" id="error"></div>

    <form id="instanceForm" method="POST" action="${escapeHtml(formAction)}" autocomplete="off">
      <input type="hidden" name="session" value="${escapeHtml(sessionId)}">

      <div class="form-group">
        <label for="instance">SearchUnify Instance URL</label>
        <input type="url" id="instance" name="instance" placeholder="https://your-instance.searchunify.com" required autocomplete="off">
        <div class="help-text">e.g., https://acme.searchunify.com</div>
      </div>

      <div class="form-group">
        <label for="su_client_id">OAuth Client ID</label>
        <input type="text" id="su_client_id" name="su_client_id" placeholder="Enter OAuth Client ID" required autocomplete="off">
        <div class="help-text">Found in SearchUnify Admin &gt; OAuth Clients</div>
      </div>

      <div class="form-group">
        <label for="su_client_secret">OAuth Client Secret</label>
        <input type="password" id="su_client_secret" name="su_client_secret" placeholder="Enter OAuth Client Secret" required autocomplete="new-password">
        <div class="help-text">The secret associated with your OAuth Client</div>
      </div>

      <button type="submit" class="btn" id="submitBtn">Continue to Login</button>
    </form>

    <div class="footer">
      You will be redirected to your SearchUnify instance to log in securely.
      <br>No passwords are stored on this server.
    </div>
  </div>

  <script>
    const form = document.getElementById('instanceForm');
    const errorDiv = document.getElementById('error');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', (e) => {
      const instance = document.getElementById('instance').value.trim();
      const clientId = document.getElementById('su_client_id').value.trim();
      const clientSecret = document.getElementById('su_client_secret').value.trim();
      if (!instance || !clientId || !clientSecret) {
        e.preventDefault();
        errorDiv.textContent = 'All fields are required.';
        errorDiv.style.display = 'block';
        return;
      }
      try {
        const url = new URL(instance);
        if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
          e.preventDefault();
          errorDiv.textContent = 'Instance URL must use HTTPS.';
          errorDiv.style.display = 'block';
          return;
        }
      } catch {
        e.preventDefault();
        errorDiv.textContent = 'Please enter a valid URL (e.g., https://acme.searchunify.com).';
        errorDiv.style.display = 'block';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Redirecting...';
    });
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
