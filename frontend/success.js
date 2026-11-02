import { auth } from './firebase.js';
import { api } from './api.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const output = document.querySelector('#payment-result');
const orderId = new URLSearchParams(location.search).get('order_id');
function view(title, text, paid = false) {
  output.innerHTML = `<div class="${paid ? 'success-mark' : 'status-mark'}">${paid ? '✓' : '…'}</div><div class="eyebrow" style="justify-content:center"><span class="eyebrow-line"></span> PAYMENT STATUS <span class="eyebrow-line"></span></div><h1>${title}</h1><p>${text}</p>`;
}
if (!orderId) view('No order to check.', 'Return to the shop to choose a product.');
else onAuthStateChanged(auth, async user => {
  if (!user) {
    view('Sign in to check your order.', 'This page only shows order details to the customer who placed it.');
    const next = `${location.pathname.split('/').pop()}${location.search}`;
    output.insertAdjacentHTML('beforeend', `<a class="button" href="login.html?next=${encodeURIComponent(next)}">Sign in with Google or email <span>↗</span></a>`);
    return;
  }
  view('Checking your payment…', 'We are asking REDShop’s server to verify the order with Cashfree.');
  try {
    const token = await user.getIdToken();
    let status;
    for (let attempt = 0; attempt < 8; attempt++) {
      status = await api(`/api/payments/status/${encodeURIComponent(orderId)}`, { token });
      if (status.paymentStatus === 'paid' || ['failed', 'verification_mismatch'].includes(status.paymentStatus)) break;
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    if (status.paymentStatus === 'paid' && status.fulfillmentStatus === 'fulfilled') {
      view('Payment confirmed. Good choice.', `${status.productName} · ₹${Number(status.amount).toLocaleString('en-IN')} ${status.currency}. Your coupon is ready in My Coupons.`, true);
      output.insertAdjacentHTML('beforeend', '<a class="button" href="my-coupons.html">View My Coupons <span>↗</span></a>');
    } else if (status.fulfillmentStatus === 'inventory_unavailable') {
      view('Payment received. We’re resolving delivery.', 'Your payment is verified, but coupon inventory needs attention. Contact support with order ID ' + orderId + '.');
    } else if (status.paymentStatus === 'failed') view('Payment not completed.', 'No coupon has been delivered. You can return to the shop and try again.');
    else if (status.paymentStatus === 'verification_mismatch') view('We’re checking this order.', 'Payment details need a manual review. Please contact support with order ID ' + orderId + '.');
    else view('Your payment is still processing.', 'Please check My Coupons in a few moments. Order ID: ' + orderId);
  } catch (error) { view('We couldn’t load this order yet.', error.message); }
});
