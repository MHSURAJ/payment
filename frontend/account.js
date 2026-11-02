import { auth } from './firebase.js';
import { api } from './api.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const root = document.querySelector('[data-account-root]');
const page = document.body.dataset.accountPage;
onAuthStateChanged(auth, async user => {
  if (!root) return;
  if (!user) {
    root.innerHTML = '<div class="notice">Sign in with Google or email to securely view your private account information.</div><a class="button" href="login.html">Log in <span>↗</span></a>';
    return;
  }
  root.innerHTML = '<div class="notice">Loading your account…</div>';
  try {
    const token = await user.getIdToken();
    if (page === 'profile') {
      const [profile, orders] = await Promise.all([api('/api/users/me', { token }), api('/api/orders/my-orders', { token })]);
      const rows = orders.length ? orders.map(o => `<div class="order-line"><span>${escapeHtml(o.productName)}<small style="display:block;color:#89877f;margin-top:4px">${escapeHtml(o.orderId)} · ${o.paymentStatus}</small></span><strong>₹${Number(o.amount).toLocaleString('en-IN')}</strong></div>`).join('') : '<p class="form-help">No orders yet. Your purchases will appear here.</p>';
      root.innerHTML = `<div class="profile-head"><div><h1>${escapeHtml(profile.name || 'Your REDShop account')}</h1><p class="form-help">${escapeHtml(profile.email || '')}</p></div><button class="small-button" data-logout>Log out</button></div><div class="data-row"><span>Account ID</span><span>${escapeHtml(profile.uid)}</span></div><h2 style="font:700 17px var(--display);margin:24px 0 10px">Order history</h2>${rows}`;
    } else {
      const coupons = await api('/api/coupons/my-coupons', { token });
      if (!coupons.length) root.innerHTML = '<div class="notice">No coupons to show yet. Once a payment is verified and your coupon is assigned, it will appear here.</div><a class="button" href="shop.html">Find a good deal <span>↗</span></a>';
      else {
        root.replaceChildren();
        coupons.forEach(item => {
          const article = document.createElement('article'); article.className = 'coupon-item';
          const info = document.createElement('div');
          const title = document.createElement('h3'); title.textContent = item.productName;
          const sub = document.createElement('p'); sub.textContent = `Order ${item.orderId} · ${item.purchasedAt ? new Date(item.purchasedAt).toLocaleDateString() : 'Recently purchased'}`;
          const code = document.createElement('div'); code.className = 'coupon-code'; code.textContent = item.couponCode;
          info.append(title, sub, code);
          const copy = document.createElement('button'); copy.className = 'small-button'; copy.type = 'button'; copy.textContent = 'Copy code';
          copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(item.couponCode); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy code'; }, 1500); } catch { copy.textContent = 'Copy unavailable'; } });
          article.append(info, copy); root.append(article);
        });
      }
    }
    root.querySelector('[data-logout]')?.addEventListener('click', async () => { await signOut(auth); location.assign('index.html'); });
  } catch (error) {
    root.innerHTML = `<div class="notice">${escapeHtml(error.message)}</div><button class="small-button" data-logout>Log out</button>`;
    root.querySelector('[data-logout]')?.addEventListener('click', async () => { await signOut(auth); location.assign('index.html'); });
  }
});
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
