/**
 * Returns HTML for the SearchUnify MCP connection form.
 *
 * Security:
 * - Form submits via fetch/JSON (page never navigates away on error —
 *   keeps the OAuth callback server alive for a retry)
 * - Session ID bound to form via hidden field
 * - Client secret input masked
 * - All assets inline — no external dependencies
 */
function getInstanceFormHTML({ formAction, sessionId }) {

  // Official SearchUnify favicon (32×32 webp, from searchunify.com)
  const faviconB64 = 'UklGRjoEAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSIgCAAANkGXb2to295NkyxBmjrvCzMwM8+lg+twBMDNzQ+U2zGRmC74H/3E7hIiYAKRK9vLm/s6qfM3za+nLylGc8Y9yYU+77EsYrGTX1BYllr64jdSsDVOZcQYAIjmtpLXh9NmfRCpq15iHkSLZXCNZj79qFyl1kxEGYMSCYdjT7QqknD7Xy5+6iCqmPABM3+/V/SisRe0tWRKlDxc+PBSlj1oY0Daf/8mxKgjuu2vGKxTKGky8E0g1dTpgbNwjGQDM6MYrZbFSopLenwK1NQqw+5GqWGSwwTCO31gmMslS7xBkVMcBbemkYC6DEF3bNcGnL6taZcppSqLsQhPwfXFWVakMbf+cAWPjV6kKW7cgy2TwybnsfhoAnLkOCaz5H7xLQCoQpCcYHDIos9FJULLshOiX9cNtDaAkSCYAk0jNt0Kse0LMuJBjFgXkpNDp03MW6BYVqbJXziDKz9wr7rUj2dx7HkvN7XMpyG39cyyRgAyDiQCwAP7tqjSoPfar14ICOCVnZToBsT1B9GueS6KSyb3nfhZQ1vBYJqB/uykwfh93ZZDSPLX/7kRjyGrJUH6cmd2v7AK4nxb12GBrnlbX98NKpqvSowMIfwhLIt7bbswlWEoHmtIVU3MnGEBs+ZcVyZKzqiUYNkyZJGt2ro0ZADi0tuwAALK7Bqo9uvb9rC5HAQjJrJ++XXcCILW8qyWgw9y9t57XV5WtSgCb8bP1Zc0CAJU9rVqCAf8LQ176o1ZW59oRON7ZNTIIyZcdcQYQX96WEdr8uX4cJQlpOVaCuIAZgLH5wQHA1EKeUNQkQopXGnrs4PNnWRAzGKm/Xe5uVyPvvdIF/x5Z+j586c+qFf8/8v6o/m8m/j9WUDggjAEAANALAJ0BKiAAIAA+RRyKQ6KhoRv6rAAoBES2AE6ZQjq7wD8AOY73O7X7QiXTpK/TbR7/cPsd7gHmA/gH+c9cDpAP2S6wD0APK89g79q/3M9nomUzDG0OAF692vxPsDFaX+sL3lNRdQAA/EyxUOex3/h+/xoR3nHIa6A7ASyfKUttNOFwT/pcz06iON7pgxqHAxVv/+BCfubdf3te6DGDpnK/9Vn6utHe3b4DxmDuv+lHwjT9jaye4R2nmwMw2Hh/jn2yhxHG/9WrIso7t4GezXdzpdZHwgfjfXrjEzJo2RubrzEVA7pmH6uYuHWPYs6dCxY5ILWxmeKgYvXrQA2X+RnLE/E6pfIPJm0HkADgy1X//9YKyUY0Y+C4hrNF1Mhpze+G7vvud+P/9zCx4CAiCE/pXVhqzcH62dQcK9AfFrO92+t76rryJU35FY/H/Sqp0jMwXREzVjW4yRklWABqd+e2xkei6212YfKZA7zu8Cqxsie98EephgNmNXalH0nXw1+3zzT1PMlkzk+gAA==';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-Frame-Options" content="DENY">
  <meta name="robots" content="noindex,nofollow">
  <title>Connect to SearchUnify</title>
  <link rel="icon" type="image/webp" href="data:image/webp;base64,${faviconB64}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a2e; }
    body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100%; padding: 16px; overflow-y: auto; }

    /* ── Card ── */
    .card { background: #fff; border-radius: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); width: 100%; max-width: 420px; overflow: hidden; }

    /* ── Header ── */
    .card-header { background: #1a1a2e; padding: 22px 28px 18px; text-align: center; }
    .brand { display: inline-flex; align-items: center; gap: 10px; }
    /* S-mark icon: just the orange swoosh + white bars (official mark) */
    .brand-icon { flex-shrink: 0; }
    .brand-name { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; line-height: 1; }
    .card-header p { color: rgba(255,255,255,0.65); font-size: 13px; margin-top: 10px; line-height: 1.4; }

    /* ── Body ── */
    .card-body { padding: 18px 24px 22px; }

    /* ── Error banner ── */
    .banner { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 9px 12px; border-radius: 7px; font-size: 13px; margin-bottom: 14px; display: none; line-height: 1.4; }
    .banner.on { display: block; }

    /* ── Form ── */
    .fg { margin-bottom: 12px; }
    label { display: block; font-weight: 600; font-size: 11px; color: #555; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
    label .req { color: #FF7300; margin-left: 1px; }
    input[type="url"], input[type="text"], input[type="password"] {
      width: 100%; padding: 9px 11px; border: 1.5px solid #e0e0e0; border-radius: 7px;
      font-size: 14px; color: #1a1a2e; background: #fff; outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    input:focus { border-color: #FF7300; box-shadow: 0 0 0 3px rgba(255,115,0,0.12); }
    input.err { border-color: #dc2626; background: #fff8f8; }
    input.err:focus { border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.10); }
    input.ok { border-color: #16a34a; }
    .help { font-size: 11px; color: #aaa; margin-top: 3px; }
    .ferr { font-size: 12px; color: #dc2626; margin-top: 3px; display: none; }
    .ferr.on { display: block; }

    /* ── Button ── */
    .btn {
      width: 100%; padding: 11px; background: #FF7300; color: #fff; border: none;
      border-radius: 7px; font-size: 15px; font-weight: 600; cursor: pointer;
      margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: background 0.2s;
    }
    .btn:hover:not(:disabled) { background: #e56500; }
    .btn:disabled { background: #ffba80; cursor: not-allowed; }
    .spin { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: none; flex-shrink: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Footer ── */
    .card-footer { border-top: 1px solid #f0f0f0; padding: 10px 24px; text-align: center; font-size: 11px; color: #bbb; display: flex; align-items: center; justify-content: center; gap: 5px; }
    .card-footer svg { color: #16a34a; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="brand">
        <!-- Official SearchUnify S-mark (orange swoosh + white bars), isolated viewBox -->
        <svg class="brand-icon" width="38" height="38" viewBox="69 0 48 51" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M103.242 22.6831C102.189 24.0043 100.817 25.0366 99.2552 25.6835C97.6934 26.3303 95.9928 26.5705 94.3127 26.3816C92.6326 26.1926 91.028 25.5807 89.6493 24.6031C88.2705 23.6255 87.1628 22.3142 86.4298 20.7922C85.6969 19.2702 85.3627 17.5872 85.4586 15.9009C85.5545 14.2146 86.0773 12.5803 86.9781 11.1509C87.8789 9.72164 89.1282 8.54418 90.6089 7.72886C92.0896 6.91354 93.7532 6.48706 95.4439 6.4894C100.945 6.4894 103.784 9.41036 105.03 13.5943L105.123 13.8831H111.693L111.6 13.3782C110.884 9.6521 108.909 6.28454 106.006 3.83858C103.069 1.38698 99.3624 0.0462387 95.5353 0.0514065C91.2154 0.148785 87.0907 1.86769 83.9822 4.86594C82.4547 6.37581 81.2421 8.17341 80.4149 10.1547C79.5876 12.1359 79.162 14.2614 79.1628 16.4081C79.0952 20.4017 80.554 24.2708 83.2419 27.2276L72.6641 32.926C72.5245 33.0014 72.4038 33.1073 72.311 33.2358C72.2181 33.3643 72.1554 33.5121 72.1276 33.6681C72.0998 33.8242 72.1077 33.9844 72.1505 34.137C72.1933 34.2896 72.2701 34.4306 72.3751 34.5495L76.8701 39.6891C76.9755 39.8099 77.1072 39.905 77.255 39.9672C77.4028 40.0294 77.563 40.0571 77.7231 40.0481C77.8833 40.0391 78.0393 39.9937 78.1792 39.9154C78.3192 39.837 78.4394 39.7277 78.5306 39.5959L85.7155 29.4974C87.6783 30.9667 89.9467 31.9762 92.3529 32.4512C94.7591 32.9263 97.2415 32.8546 99.6162 32.2416C101.991 31.6286 104.197 30.4899 106.072 28.9098C107.946 27.3298 109.441 25.3488 110.446 23.1135L110.699 22.536H103.388L103.262 22.6803L103.242 22.6831Z" fill="#FF7300"/>
          <path d="M101.542 15.7943H89.8292C89.5386 15.7926 89.2588 15.877 89.0403 16.0554C88.8218 16.2337 88.6793 16.4936 88.643 16.7798C88.6413 16.8707 88.657 16.9612 88.6903 17.0458C88.7237 17.1303 88.7741 17.2071 88.8384 17.2714C88.9028 17.3357 88.9797 17.3861 89.0643 17.4194C89.149 17.4528 89.2396 17.4684 89.3306 17.4653H101.042C101.221 17.4565 101.39 17.3815 101.517 17.2548C101.644 17.1281 101.719 16.9588 101.728 16.7798C101.731 16.6889 101.715 16.5984 101.682 16.5138C101.649 16.4292 101.598 16.3524 101.534 16.2881C101.47 16.2238 101.393 16.1734 101.308 16.1401C101.223 16.1067 101.133 16.0912 101.042 16.0943L101.542 15.7943Z" fill="white"/>
          <path d="M99.6676 19.3831H89.6847C89.3941 19.3816 89.1143 19.4661 88.896 19.6444C88.6775 19.8228 88.535 20.0827 88.4987 20.3689C88.497 20.4597 88.5126 20.5503 88.546 20.6348C88.5793 20.7194 88.6298 20.796 88.694 20.8603C88.7583 20.9246 88.8351 20.975 88.9198 21.0083C89.0045 21.0417 89.0951 21.0573 89.186 21.0542H99.1689C99.4595 21.0557 99.7393 20.9712 99.9576 20.7928C100.176 20.6144 100.318 20.3545 100.355 20.0683C100.358 19.9774 100.341 19.8869 100.308 19.8024C100.275 19.7178 100.224 19.641 100.16 19.5767C100.095 19.5124 100.019 19.462 99.9339 19.4286C99.8492 19.3953 99.7586 19.3797 99.6676 19.3831Z" fill="white"/>
          <path d="M89.7574 13.5041H95.3712C95.5362 13.4863 95.6908 13.4151 95.8114 13.3012C95.932 13.1873 96.0119 13.0371 96.0388 12.8735V12.8372C96.0431 12.6573 95.9736 12.4836 95.8467 12.3572C95.7197 12.2308 95.5465 12.1626 95.3712 12.1517H89.7574C89.5821 12.1626 89.4089 12.2308 89.2819 12.3572C89.155 12.4836 89.0855 12.6573 89.0898 12.8372C89.0867 12.928 89.1024 13.0186 89.1357 13.1032C89.1691 13.1878 89.2195 13.2646 89.2839 13.3289C89.3482 13.3932 89.4251 13.4435 89.5097 13.4769C89.5944 13.5102 89.6851 13.5258 89.7574 13.5041Z" fill="white"/>
        </svg>
        <span class="brand-name">SearchUnify</span>
      </div>
      <p>Enter your instance details to connect securely.</p>
    </div>

    <div class="card-body">
      <div class="banner" id="banner" role="alert"></div>

      <form id="f" autocomplete="off" novalidate>
        <input type="hidden" name="session" value="${escapeHtml(sessionId)}">

        <div class="fg">
          <label for="instance">Instance URL<span class="req">*</span></label>
          <input type="url" id="instance" name="instance" placeholder="https://acme.searchunify.com" autocomplete="off" spellcheck="false">
          <div class="ferr" id="e-instance"></div>
          <div class="help">Your SearchUnify platform URL</div>
        </div>

        <div class="fg">
          <label for="uid">Search Client UID<span class="req">*</span></label>
          <input type="text" id="uid" name="uid" placeholder="e.g. abc123def456" autocomplete="off" spellcheck="false">
          <div class="ferr" id="e-uid"></div>
          <div class="help">Found in Admin → Search Clients</div>
        </div>

        <div class="fg">
          <label for="su_client_id">OAuth Client ID<span class="req">*</span></label>
          <input type="text" id="su_client_id" name="su_client_id" placeholder="Enter OAuth Client ID" autocomplete="off" spellcheck="false">
          <div class="ferr" id="e-cid"></div>
          <div class="help">Found in Admin → OAuth Clients</div>
        </div>

        <div class="fg">
          <label for="su_client_secret">OAuth Client Secret<span class="req">*</span></label>
          <input type="password" id="su_client_secret" name="su_client_secret" placeholder="Enter OAuth Client Secret" autocomplete="new-password">
          <div class="ferr" id="e-csec"></div>
          <div class="help">Secret associated with your OAuth Client</div>
        </div>

        <button type="submit" class="btn" id="btn">
          <div class="spin" id="spin"></div>
          <span id="btntxt">Continue to Login</span>
        </button>
      </form>
    </div>

    <div class="card-footer">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a4 4 0 0 1 4 4v1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1V5a4 4 0 0 1 4-4zm0 1.5A2.5 2.5 0 0 0 5.5 5v1h5V5A2.5 2.5 0 0 0 8 2.5z"/>
      </svg>
      No passwords stored &nbsp;·&nbsp; Powered by <strong>&nbsp;SearchUnify</strong>
    </div>
  </div>

  <script>
  (function () {
    var form    = document.getElementById('f');
    var banner  = document.getElementById('banner');
    var btn     = document.getElementById('btn');
    var spin    = document.getElementById('spin');
    var btntxt  = document.getElementById('btntxt');
    var action  = '${escapeHtml(formAction)}';

    var fields = [
      {
        id: 'instance', errId: 'e-instance',
        validate: function (v) {
          if (!v) return 'Instance URL is required.';
          try {
            var u = new URL(v);
            if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1')
              return 'Instance URL must use HTTPS.';
          } catch (ex) { return 'Enter a valid URL, e.g. https://acme.searchunify.com'; }
          return '';
        }
      },
      {
        id: 'uid', errId: 'e-uid',
        validate: function (v) {
          if (!v) return 'Search Client UID is required.';
          if (v.length > 200) return 'UID is too long.';
          if (!/^[a-zA-Z0-9\\-_]+$/.test(v)) return 'UID may only contain letters, numbers, hyphens and underscores.';
          return '';
        }
      },
      {
        id: 'su_client_id', errId: 'e-cid',
        validate: function (v) {
          if (!v) return 'OAuth Client ID is required.';
          if (v.length < 4) return 'Client ID is too short.';
          if (v.length > 200) return 'Client ID is too long.';
          return '';
        }
      },
      {
        id: 'su_client_secret', errId: 'e-csec',
        validate: function (v) {
          if (!v) return 'OAuth Client Secret is required.';
          if (v.length < 4) return 'Client Secret is too short.';
          if (v.length > 200) return 'Client Secret is too long.';
          return '';
        }
      }
    ];

    function setErr(f, msg) {
      var inp = document.getElementById(f.id);
      var el  = document.getElementById(f.errId);
      inp.classList.add('err'); inp.classList.remove('ok');
      el.textContent = msg; el.classList.add('on');
    }
    function clrErr(f) {
      var inp = document.getElementById(f.id);
      var el  = document.getElementById(f.errId);
      inp.classList.remove('err');
      el.textContent = ''; el.classList.remove('on');
    }
    function setOk(f) {
      var inp = document.getElementById(f.id);
      inp.classList.remove('err'); inp.classList.add('ok');
      document.getElementById(f.errId).classList.remove('on');
    }
    function showBanner(msg) {
      banner.textContent = msg; banner.classList.add('on');
      banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function resetBtn() {
      btn.disabled = false; spin.style.display = 'none';
      btntxt.textContent = 'Continue to Login';
    }

    /* Blur / input listeners — real-time per-field feedback */
    fields.forEach(function (f) {
      var inp = document.getElementById(f.id);
      inp.addEventListener('blur', function () {
        var v = inp.value.trim();
        var msg = f.validate(v);
        if (msg) setErr(f, msg); else if (v) setOk(f);
      });
      inp.addEventListener('input', function () {
        clrErr(f); inp.classList.remove('ok');
        banner.textContent = ''; banner.classList.remove('on');
      });
    });

    /* Submit — fetch keeps the page alive so mcp-remote's callback
     * server stays open for a corrected retry */
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      banner.textContent = ''; banner.classList.remove('on');

      /* Normalise instance URL */
      var instInp = document.getElementById('instance');
      instInp.value = instInp.value.trim().replace(/\\/+$/, '');

      /* Client-side validation */
      var firstErr = null;
      fields.forEach(function (f) {
        var inp = document.getElementById(f.id);
        var v = inp.value.trim();
        var msg = f.validate(v);
        if (msg) { setErr(f, msg); if (!firstErr) firstErr = { f: f, inp: inp, msg: msg }; }
        else { setOk(f); }
      });
      if (firstErr) { showBanner(firstErr.msg); firstErr.inp.focus(); return; }

      /* POST via fetch — server returns { redirectUrl } or { error } */
      btn.disabled = true; spin.style.display = 'block';
      btntxt.textContent = 'Connecting\u2026';

      var params = new URLSearchParams();
      params.append('session', document.querySelector('[name="session"]').value);
      params.append('instance', document.getElementById('instance').value.trim());
      params.append('uid', document.getElementById('uid').value.trim());
      params.append('su_client_id', document.getElementById('su_client_id').value.trim());
      params.append('su_client_secret', document.getElementById('su_client_secret').value);

      fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.redirectUrl) {
            btntxt.textContent = 'Redirecting\u2026';
            window.location.href = data.redirectUrl;
          } else {
            showBanner(data.error || 'An unexpected error occurred. Please try again.');
            resetBtn();
          }
        })
        .catch(function () {
          showBanner('Network error. Please check your connection and try again.');
          resetBtn();
        });
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
