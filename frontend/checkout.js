import { auth } from './firebase.js';
import { api } from './api.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const params = new URLSearchParams(location.search);
const productId = params.get('id');
const box = document.querySelector('#checkout-product');
const form = document.querySelector('#checkout-form');
const message = document.querySelector('[data-checkout-message]');
const button = form.querySelector('button[type="submit"]');
let product;
let currentUser = null;
const say = (text, error = false) => { message.textContent = text; message.hidden = false; message.classList.toggle('error-message', error); };

try {
  if (!productId) throw new Error('Choose a product from the shop first.');
  product = await api(`/api/products/${encodeURIComponent(productId)}`);
  box.innerHTML = `<div class="order-line"><span>${product.name} · Digital coupon</span><span>₹${Number(product.price).toLocaleString('en-IN')}</span></div><div class="order-line"><span>Payment method</span><span>Cashfree secure checkout</span></div><div class="order-line order-total"><span>Total</span><span>₹${Number(product.price).toLocaleString('en-IN')} INR</span></div>`;
  button.disabled = !currentUser;
} catch (error) {
  say(error.message, true); button.disabled = true;
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    document.querySelector('#checkout-email').value = user.email || '';
    document.querySelector('#checkout-name').value = user.displayName || '';
    button.disabled = !product;
    document.querySelector('[data-login-callout]').hidden = true;
  } else {
    button.disabled = true;
    document.querySelector('[data-login-callout]').hidden = false;
    const next = `${location.pathname.split('/').pop()}${location.search}`;
    document.querySelector('#checkout-login').href = `login.html?next=${encodeURIComponent(next)}`;
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!product) return;
  const user = auth.currentUser;
  if (!user) {
    const next = `${location.pathname.split('/').pop()}${location.search}`;
    location.assign(`login.html?next=${encodeURIComponent(next)}`); return;
  }
  button.disabled = true; say('Creating your secure payment session…');
  try {
    const token = await user.getIdToken();
    const order = await api('/api/orders/create', { token, method: 'POST', body: JSON.stringify({ productId, customerName: document.querySelector('#checkout-name').value, customerPhone: document.querySelector('#checkout-phone').value }) });
    const cashfree = Cashfree({ mode: order.cashfreeMode });
    await cashfree.checkout({ paymentSessionId: order.paymentSessionId, redirectTarget: '_self' });
  } catch (error) { say(error.message, true); button.disabled = false; }
});
