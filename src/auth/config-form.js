/**
 * Returns HTML for the SearchUnify MCP connection form.
 *
 * Security:
 * - Form submits via POST (secrets never in URL / logs / history)
 * - Session ID bound to form via hidden field
 * - Client secret input masked
 * - All assets inline — no external dependencies
 */
function getInstanceFormHTML({ formAction, sessionId }) {
  // Official SearchUnify favicon (32 × 32, webp, fetched from searchunify.com)
  const faviconB64 = 'UklGRjoEAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSIgCAAANkGXb2to295NkyxBmjrvCzMwM8+lg+twBMDNzQ+U2zGRmC74H/v9ngIiYuX2gkREREZGZmVn7yMzMzJmZmZlZdGYm7czu6FLiAAAAAAAAAAAAAP7/HgCHmJlJO7M7ulTkHwAAAAAAAAAAAADXoZ+fnqef3D0AAAAAAAAAAAAA///rWMzMOv8AAAAAAAAAAAAA///r2MzMOv8AAAAAAAAAAAAA///rWMzMOv8AAAAAAAAAAAAA///r2MzMOv8AAAAAAAAAAAAAf/+qjMzM+v8AAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAB//6qMzMz6/wAAAAAAAAAAAAD//6qMzMz6/wAAAAAAAAAAAACHmJlJO7M7ulTkHwAAAFZQOCB4AAAAMAIAnQEqIAAgAD5tMJZIpCSiIagIACADBLQAy0gAAP7qbQAA/trif/v4kHhAAAA=';

  // Official SearchUnify SVG logo (from searchunify.com/wp-content/themes/seoinux-child/assets/img/su-logo.svg)
  // White text + #FF7300 icon — designed for dark backgrounds
  const logoSvg = `<svg width="160" height="36" viewBox="0 0 227 51" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SearchUnify">
<g clip-path="url(#clip0)">
<path d="M103.242 22.6831C102.189 24.0043 100.817 25.0366 99.2552 25.6835C97.6934 26.3303 95.9928 26.5705 94.3127 26.3816C92.6326 26.1926 91.028 25.5807 89.6493 24.6031C88.2705 23.6255 87.1628 22.3142 86.4298 20.7922C85.6969 19.2702 85.3627 17.5872 85.4586 15.9009C85.5545 14.2146 86.0773 12.5803 86.9781 11.1509C87.8789 9.72164 89.1282 8.54418 90.6089 7.72886C92.0896 6.91354 93.7532 6.48706 95.4439 6.4894C100.945 6.4894 103.784 9.41036 105.03 13.5943L105.123 13.8831H111.693L111.6 13.3782C110.884 9.6521 108.909 6.28454 106.006 3.83858C103.069 1.38698 99.3624 0.0462387 95.5353 0.0514065C91.2154 0.148785 87.0907 1.86769 83.9822 4.86594C82.4547 6.37581 81.2421 8.17341 80.4149 10.1547C79.5876 12.1359 79.162 14.2614 79.1628 16.4081C79.0952 20.4017 80.554 24.2708 83.2419 27.2276L72.6641 32.926C72.5245 33.0014 72.4038 33.1073 72.311 33.2358C72.2181 33.3643 72.1554 33.5121 72.1276 33.6681C72.0998 33.8242 72.1077 33.9844 72.1505 34.137C72.1933 34.2896 72.2701 34.4306 72.3751 34.5495L76.8701 39.6891C76.9755 39.8099 77.1072 39.905 77.255 39.9672C77.4028 40.0294 77.563 40.0571 77.7231 40.0481C77.8833 40.0391 78.0393 39.9937 78.1792 39.9154C78.3192 39.837 78.4394 39.7277 78.5306 39.5959L85.7155 29.4974C87.6783 30.9667 89.9467 31.9762 92.3529 32.4512C94.7591 32.9263 97.2415 32.8546 99.6162 32.2416C101.991 31.6286 104.197 30.4899 106.072 28.9098C107.946 27.3298 109.441 25.3488 110.446 23.1135L110.699 22.536H103.388L103.262 22.6803L103.242 22.6831Z" fill="#FF7300"/>
<path d="M101.542 15.7943H89.8292C89.5386 15.7926 89.2588 15.877 89.0403 16.0554C88.8218 16.2337 88.6793 16.4936 88.643 16.7798C88.6413 16.8707 88.657 16.9612 88.6903 17.0458C88.7237 17.1303 88.7741 17.2071 88.8384 17.2714C88.9028 17.3357 88.9797 17.3861 89.0643 17.4194C89.149 17.4528 89.2396 17.4684 89.3306 17.4653H101.042C101.221 17.4565 101.39 17.3815 101.517 17.2548C101.644 17.1281 101.719 16.9588 101.728 16.7798C101.731 16.6889 101.715 16.5984 101.682 16.5138C101.649 16.4292 101.598 16.3524 101.534 16.2881C101.47 16.2238 101.393 16.1734 101.308 16.1401C101.223 16.1067 101.133 16.0912 101.042 16.0943L101.542 15.7943Z" fill="white"/>
<path d="M99.6676 19.3831H89.6847C89.3941 19.3816 89.1143 19.4661 88.896 19.6444C88.6775 19.8228 88.535 20.0827 88.4987 20.3689C88.497 20.4597 88.5126 20.5503 88.546 20.6348C88.5793 20.7194 88.6298 20.796 88.694 20.8603C88.7583 20.9246 88.8351 20.975 88.9198 21.0083C89.0045 21.0417 89.0951 21.0573 89.186 21.0542H99.1689C99.4595 21.0557 99.7393 20.9712 99.9576 20.7928C100.176 20.6144 100.318 20.3545 100.355 20.0683C100.358 19.9774 100.341 19.8869 100.308 19.8024C100.275 19.7178 100.224 19.641 100.16 19.5767C100.095 19.5124 100.019 19.462 99.9339 19.4286C99.8492 19.3953 99.7586 19.3797 99.6676 19.3831Z" fill="white"/>
<path d="M89.7574 13.5041H95.3712C95.5362 13.4863 95.6908 13.4151 95.8114 13.3012C95.932 13.1873 96.0119 13.0371 96.0388 12.8735V12.8372C96.0431 12.6573 95.9736 12.4836 95.8467 12.3572C95.7197 12.2308 95.5465 12.1626 95.3712 12.1517H89.7574C89.5821 12.1626 89.4089 12.2308 89.2819 12.3572C89.155 12.4836 89.0855 12.6573 89.0898 12.8372C89.0867 12.928 89.1024 13.0186 89.1357 13.1032C89.1691 13.1878 89.2195 13.2646 89.2839 13.3289C89.3482 13.3932 89.4251 13.4435 89.5097 13.4769C89.5944 13.5102 89.6851 13.5258 89.7574 13.5041Z" fill="white"/>
<path d="M75.5155 9.91605C74.6557 9.89836 73.798 10.0076 72.9701 10.2402C72.1767 10.4911 71.4319 10.8754 70.7678 11.3765C70.1482 11.8247 69.5899 12.352 69.1073 12.945V10.2225H65.0449L65.099 29.1034H69.1614L69.1427 21.421C69.113 20.3392 69.2656 19.2602 69.594 18.229C69.9058 17.3952 70.3577 16.6207 70.9301 15.9386C71.4672 15.3398 72.134 14.8712 72.8797 14.5685C73.6532 14.2536 74.4816 14.0953 75.3169 14.1028H76.2372V9.90112H75.5295L75.5155 9.91605Z" fill="white"/>
<path d="M17.4065 17.4178C15.5653 16.1324 13.465 15.2646 11.2528 14.875C10.0967 14.6226 9.05058 14.3338 8.09303 14.0274C7.4567 13.8423 6.86215 13.5361 6.34202 13.1258C6.01916 12.889 5.76419 12.5717 5.60265 12.2055L5.56629 12.1124C5.40325 11.7248 5.32902 11.3057 5.34904 10.8857V10.814C5.34385 10.3924 5.43753 9.97542 5.62258 9.59647C5.80764 9.21751 6.07894 8.8871 6.41475 8.63167C7.33987 7.947 8.47912 7.61441 9.62772 7.69371C10.739 7.6587 11.8466 7.83639 12.891 8.21718C14.0183 8.68624 15.0707 9.31795 16.0145 10.0921L16.5916 10.543L18.9748 7.35096L18.4517 6.91876C17.2644 5.95457 15.9374 5.17602 14.5162 4.60976C12.9714 4.05515 11.3368 3.79237 9.69578 3.83481C8.57856 3.8507 7.47053 4.03923 6.41102 4.39367C5.41571 4.69844 4.48959 5.19455 3.68475 5.85414C2.901 6.50062 2.29277 7.29301 1.86195 8.1827C1.44052 9.08033 1.21791 10.0582 1.20929 11.0496C1.18752 12.0177 1.35933 12.9803 1.71464 13.8812C2.07291 14.7531 2.65895 15.5128 3.41156 16.0812C4.22516 16.7163 5.13264 17.2213 6.10147 17.578C7.25746 18.0005 8.43893 18.3499 9.6389 18.624C10.6587 18.8516 11.6652 19.1346 12.6542 19.4716C13.259 19.6598 13.8313 19.9397 14.3511 20.3015C14.6597 20.5229 14.9128 20.8127 15.0905 21.1481L15.1269 21.2413C15.2849 21.6048 15.3589 21.9993 15.3432 22.3953V22.468C15.3488 22.9206 15.2431 23.3677 15.0356 23.7701C14.828 24.1725 14.5248 24.5179 14.1525 24.776C13.1621 25.469 11.9656 25.8059 10.7587 25.7317C9.33819 25.7824 7.977 25.5365 6.71497 25.0108C5.3732 24.4127 4.17252 23.6088 3.12253 22.63L2.58082 22.1643L0 25.1933L0.486703 25.6441C1.84796 26.9382 3.44851 27.955 5.19893 28.6377C6.92741 29.3206 8.77334 29.6577 10.6319 29.6297C11.8702 29.6208 13.0502 29.4879 14.2066 29.2329C15.2869 28.9374 16.2441 28.4409 17.0765 27.7724C17.885 27.1341 18.5289 26.3117 18.9543 25.374C19.3686 24.3984 19.5832 23.3498 19.5855 22.2901V22.2183C19.6123 21.3052 19.4298 20.3981 19.0522 19.5661C18.6746 18.7342 18.1117 17.9993 17.4065 17.4178Z" fill="white"/>
<path d="M40.7651 19.7436C40.7812 18.4492 40.5924 17.1603 40.2056 15.9248C39.8422 14.7595 39.2466 13.6798 38.4546 12.7505C37.6812 11.8502 36.7286 11.1206 35.6575 10.6082C34.4919 10.0531 33.2114 9.78117 31.9205 9.81464C30.6273 9.82877 29.3865 10.0988 28.2377 10.6082C27.1328 11.1587 26.1676 11.8912 25.3501 12.7728C24.5466 13.7282 23.9136 14.7985 23.4546 15.9462C22.9869 17.1723 22.7541 18.4754 22.7683 19.7874C22.7521 21.1561 22.997 22.5154 23.49 23.7925C23.9989 24.9579 24.7017 25.9893 25.5664 26.8765C26.4167 27.7642 27.4434 28.4644 28.5807 28.9321C29.7305 29.4086 30.9649 29.6478 32.2096 29.6353C33.8072 29.6915 35.3587 29.3569 36.7586 28.662C37.9841 27.9698 39.0566 27.0933 39.9716 26.0652L40.4229 25.5418L37.7871 23.1619L37.3209 23.6277C36.6764 24.2902 35.9483 24.866 35.1549 25.3406C34.2676 25.7514 33.2983 25.9549 32.3205 25.9357C31.6502 25.9589 31.0003 25.8548 30.3886 25.6293C29.725 25.4229 29.1654 25.0913 28.6917 24.6559C28.1772 24.2031 27.7598 23.6508 27.4647 23.0325C27.2017 22.4986 27.0248 21.9264 26.9407 21.3373L40.8406 21.301V19.7175L40.7651 19.7436ZM36.6309 18.1602L26.9015 18.1956C27.0131 17.7411 27.1577 17.2953 27.3342 16.8618C27.6265 16.2683 27.9969 15.7163 28.4353 15.2206C28.8792 14.76 29.4058 14.3869 29.9877 14.1206C30.5678 13.8656 31.1954 13.7364 31.8292 13.7415C32.5113 13.7168 33.1902 13.8464 33.8151 14.1206C34.3734 14.357 34.8682 14.7214 35.2594 15.1843C35.6795 15.6724 36.0151 16.227 36.2523 16.8255C36.4421 17.2622 36.5696 17.7234 36.6309 18.1956V18.1602Z" fill="white"/>
<path d="M131.873 14.3514C131.559 13.4381 131.054 12.6021 130.392 11.899C129.732 11.1927 128.925 10.639 128.028 10.2765C127.023 9.88445 125.967 9.6944 124.905 9.7176C123.421 9.68637 121.999 10.095 120.789 10.8893C120.37 11.1787 119.977 11.5047 119.616 11.8636V2.90051H115.536L115.608 28.9589H119.67L119.633 18.2653C119.597 17.6133 119.702 16.9611 119.94 16.3531C120.16 15.7853 120.478 15.2605 120.879 14.8023C121.318 14.4243 121.804 14.1032 122.323 13.8466C122.897 13.6386 123.501 13.5289 124.111 13.5225C124.674 13.474 125.242 13.5508 125.772 13.7472C126.303 13.9437 126.783 14.255 127.179 14.6588C127.956 15.6057 128.336 16.8009 128.263 18.0119L128.298 28.9944H132.36L132.324 17.4167C132.333 16.369 132.168 15.327 131.836 14.3328L131.873 14.3514Z" fill="white"/>
<path d="M154.314 3.82077L154.35 18.2467C154.35 20.7541 153.827 22.4669 152.672 23.621C152.051 24.2258 151.313 24.6964 150.502 25.0036C149.691 25.3108 148.826 25.4479 147.96 25.4065C147.041 25.4687 146.155 25.3398 145.326 25.0286C144.497 24.7174 143.746 24.2312 143.122 23.6033C141.883 22.0602 141.259 20.1137 141.371 18.1386L141.335 3.85616H137.273L137.31 18.3007C137.32 19.8785 137.588 21.444 138.103 22.9355C138.549 24.241 139.282 25.4303 140.248 26.4162C141.182 27.3841 142.332 28.1181 143.604 28.5585C144.962 29.0293 146.391 29.2612 147.828 29.244C149.302 29.2399 150.731 29.0272 152.107 28.6125C153.407 28.1311 154.538 27.394 155.482 26.4488C156.443 25.4171 157.163 24.2011 157.612 22.8777C158.17 21.3419 158.427 19.7135 158.37 18.0809L158.334 3.7984H154.273L154.314 3.82077Z" fill="white"/>
<path d="M179.186 14.153C178.873 13.2395 178.368 12.4034 177.705 11.7006C177.044 10.9943 176.237 10.4406 175.341 10.078C174.328 9.66879 173.257 9.47821 172.182 9.51918C170.734 9.48806 169.311 9.89665 168.102 10.6909C167.682 10.9803 167.29 11.3063 166.929 11.6652V9.98861H162.867L162.921 28.8695H166.983L166.946 18.1758C166.91 17.5241 167.015 16.8722 167.253 16.2645C167.474 15.6972 167.792 15.1725 168.192 14.7137C168.631 14.3354 169.116 14.014 169.636 13.7571C170.209 13.5491 170.814 13.4395 171.424 13.433C172 13.3844 172.562 13.4612 173.087 13.6578C173.612 13.8544 174.086 14.1659 174.474 14.5694C175.251 15.5163 175.631 16.7114 175.558 17.9225L175.593 28.8322H179.655L179.619 17.2556C179.627 16.2078 179.463 15.1659 179.132 14.1716L179.186 14.153Z" fill="white"/>
<path d="M188.943 3.10781L184.521 3.12323L184.536 7.39751L188.958 7.38209L188.943 3.10781Z" fill="white"/>
<path d="M188.804 9.77997L184.743 9.79413L184.809 28.6749L188.87 28.6607L188.804 9.77997Z" fill="white"/>
<path d="M204.621 9.93382H199.043V9.26692C199.043 6.59746 200.198 6.21932 201.336 6.21932C201.706 6.2293 202.074 6.27135 202.437 6.34505C202.865 6.40365 203.27 6.49429 203.667 6.6161L204.605 6.92252V3.22571L204.207 3.02733C203.728 2.80322 203.217 2.65698 202.691 2.59419C202.141 2.52239 201.585 2.4984 201.031 2.52248C200.257 2.47975 199.482 2.59343 198.753 2.8567C198.024 3.11996 197.356 3.52742 196.789 4.05469C196.178 4.7241 195.709 5.51037 195.411 6.36594C195.113 7.2215 194.992 8.12856 195.055 9.03221V9.86117H192.636V13.5403H195.073L195.108 28.7225H199.171L199.134 13.5207H204.635V9.89565L204.621 9.93382Z" fill="white"/>
<path d="M222.619 9.80716L217.455 23.2737L211.535 9.83883H206.407L215.415 27.9262C215.123 28.6802 214.681 29.3674 214.116 29.9464C213.882 30.1667 213.649 30.3087 213.394 30.3988C213.139 30.4889 212.868 30.5252 212.599 30.5053C212.174 30.5036 211.751 30.4612 211.335 30.3786C210.788 30.1803 210.499 30.0597 210.216 29.924L209.549 29.6074L208.123 32.9605L208.719 33.2492C209.328 33.5545 209.97 33.7904 210.632 33.9525C211.33 34.1182 212.046 34.1967 212.763 34.1862C214.175 34.2167 215.521 33.7709 216.607 32.9242C217.859 31.8181 218.794 30.3991 219.315 28.8129L227.005 9.7699H222.673L222.619 9.80716Z" fill="white"/>
</g>
<defs><clipPath id="clip0"><rect width="227" height="51" fill="white"/></clipPath></defs>
</svg>`;

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
    html, body {
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f2f5;
      color: #1a1a2e;
    }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: 16px;
      overflow-y: auto;
    }
    /* ── Card ── */
    .card {
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
      width: 100%;
      max-width: 440px;
      overflow: hidden;
    }
    /* ── Header (dark band with official logo) ── */
    .card-header {
      background: #1a1a2e;
      padding: 20px 28px;
      text-align: center;
    }
    .card-header svg { display: block; margin: 0 auto; }
    .card-header p {
      color: rgba(255,255,255,0.72);
      font-size: 13px;
      margin-top: 8px;
      line-height: 1.4;
    }
    /* ── Body ── */
    .card-body { padding: 20px 28px 24px; }
    /* ── Error banner ── */
    .error-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 9px 12px;
      border-radius: 7px;
      font-size: 13px;
      margin-bottom: 14px;
      display: none;
      line-height: 1.4;
    }
    .error-banner.visible { display: block; }
    /* ── Form groups ── */
    .form-group { margin-bottom: 13px; }
    label {
      display: block;
      font-weight: 600;
      font-size: 12px;
      color: #444;
      margin-bottom: 4px;
      letter-spacing: 0.1px;
      text-transform: uppercase;
    }
    label .req { color: #FF7300; margin-left: 1px; }
    input[type="url"],
    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 9px 11px;
      border: 1.5px solid #e0e0e0;
      border-radius: 7px;
      font-size: 14px;
      color: #1a1a2e;
      background: #fff;
      transition: border-color 0.15s, box-shadow 0.15s;
      outline: none;
    }
    input:focus {
      border-color: #FF7300;
      box-shadow: 0 0 0 3px rgba(255,115,0,0.12);
    }
    input.err {
      border-color: #dc2626;
      background: #fff8f8;
    }
    input.err:focus {
      border-color: #dc2626;
      box-shadow: 0 0 0 3px rgba(220,38,38,0.10);
    }
    input.ok { border-color: #16a34a; }
    .help { font-size: 11px; color: #999; margin-top: 3px; }
    .ferr { font-size: 12px; color: #dc2626; margin-top: 3px; display: none; }
    .ferr.on { display: block; }
    /* ── Button ── */
    .btn {
      width: 100%;
      padding: 11px;
      background: #FF7300;
      color: #fff;
      border: none;
      border-radius: 7px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s;
    }
    .btn:hover:not(:disabled) { background: #e56500; }
    .btn:disabled { background: #ffba80; cursor: not-allowed; }
    .spin {
      width: 15px; height: 15px;
      border: 2px solid rgba(255,255,255,0.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none; flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    /* ── Footer ── */
    .card-footer {
      border-top: 1px solid #f0f0f0;
      padding: 12px 28px;
      text-align: center;
      font-size: 11px;
      color: #999;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .card-footer svg { color: #16a34a; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Official SearchUnify logo on dark background -->
    <div class="card-header">
      ${logoSvg}
      <p>Enter your instance details to connect Claude securely.</p>
    </div>

    <div class="card-body">
      <div class="error-banner" id="banner" role="alert"></div>

      <form id="f" method="POST" action="${escapeHtml(formAction)}" autocomplete="off" novalidate>
        <input type="hidden" name="session" value="${escapeHtml(sessionId)}">

        <div class="form-group">
          <label for="instance">Instance URL<span class="req">*</span></label>
          <input type="url" id="instance" name="instance" placeholder="https://acme.searchunify.com" required autocomplete="off" spellcheck="false">
          <div class="ferr" id="e-instance"></div>
          <div class="help">Your SearchUnify platform URL</div>
        </div>

        <div class="form-group">
          <label for="uid">Search Client UID<span class="req">*</span></label>
          <input type="text" id="uid" name="uid" placeholder="e.g. abc123def456" required autocomplete="off" spellcheck="false">
          <div class="ferr" id="e-uid"></div>
          <div class="help">Found in Admin → Search Clients</div>
        </div>

        <div class="form-group">
          <label for="su_client_id">OAuth Client ID<span class="req">*</span></label>
          <input type="text" id="su_client_id" name="su_client_id" placeholder="Enter OAuth Client ID" required autocomplete="off" spellcheck="false">
          <div class="ferr" id="e-cid"></div>
          <div class="help">Found in Admin → OAuth Clients</div>
        </div>

        <div class="form-group">
          <label for="su_client_secret">OAuth Client Secret<span class="req">*</span></label>
          <input type="password" id="su_client_secret" name="su_client_secret" placeholder="Enter OAuth Client Secret" required autocomplete="new-password">
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
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a4 4 0 0 1 4 4v1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1V5a4 4 0 0 1 4-4zm0 1.5A2.5 2.5 0 0 0 5.5 5v1h5V5A2.5 2.5 0 0 0 8 2.5z"/>
      </svg>
      No passwords stored here &nbsp;·&nbsp; Powered by <strong>&nbsp;SearchUnify</strong>
    </div>
  </div>

  <script>
  (function () {
    var form   = document.getElementById('f');
    var banner = document.getElementById('banner');
    var btn    = document.getElementById('btn');
    var spin   = document.getElementById('spin');
    var btntxt = document.getElementById('btntxt');

    var fields = [
      {
        id: 'instance', errId: 'e-instance',
        validate: function (v) {
          if (!v) return 'Instance URL is required.';
          try {
            var u = new URL(v);
            if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1')
              return 'Instance URL must use HTTPS.';
          } catch (e) { return 'Enter a valid URL, e.g. https://acme.searchunify.com'; }
          return '';
        }
      },
      {
        id: 'uid', errId: 'e-uid',
        validate: function (v) {
          if (!v) return 'Search Client UID is required.';
          if (v.length > 200) return 'UID is too long.';
          if (!/^[a-zA-Z0-9\-_]+$/.test(v)) return 'UID may only contain letters, numbers, hyphens and underscores.';
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
      inp.classList.add('err');
      inp.classList.remove('ok');
      el.textContent = msg;
      el.classList.add('on');
    }
    function clrErr(f) {
      var inp = document.getElementById(f.id);
      var el  = document.getElementById(f.errId);
      inp.classList.remove('err');
      el.textContent = '';
      el.classList.remove('on');
    }
    function setOk(f) {
      var inp = document.getElementById(f.id);
      inp.classList.remove('err');
      inp.classList.add('ok');
      document.getElementById(f.errId).classList.remove('on');
    }

    /* Blur + input listeners for real-time per-field feedback */
    fields.forEach(function (f) {
      var inp = document.getElementById(f.id);
      inp.addEventListener('blur', function () {
        var v = inp.value.trim();
        var msg = f.validate(v);
        if (msg) setErr(f, msg);
        else if (v) setOk(f);
      });
      inp.addEventListener('input', function () {
        clrErr(f);
        inp.classList.remove('ok');
        banner.textContent = '';
        banner.classList.remove('visible');
      });
    });

    /* Submit */
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      banner.textContent = '';
      banner.classList.remove('visible');

      /* Normalise instance URL */
      var instInp = document.getElementById('instance');
      instInp.value = instInp.value.trim().replace(/\\/+$/, '');

      var firstErr = null;
      fields.forEach(function (f) {
        var inp = document.getElementById(f.id);
        var v = inp.value.trim();
        var msg = f.validate(v);
        if (msg) {
          setErr(f, msg);
          if (!firstErr) firstErr = { f: f, inp: inp, msg: msg };
        } else {
          setOk(f);
        }
      });

      if (firstErr) {
        banner.textContent = firstErr.msg;
        banner.classList.add('visible');
        /* Scroll banner into view so user sees it without scrolling */
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        firstErr.inp.focus();
        return;
      }

      btn.disabled = true;
      spin.style.display = 'block';
      btntxt.textContent = 'Redirecting\u2026';
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
