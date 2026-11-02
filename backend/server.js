import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';
import { Cashfree } from 'cashfree-pg';
import { products } from './data/products.js';

const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'FRONTEND_URL'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
const frontendUrl = new URL(process.env.FRONTEND_URL);
if (process.env.CASHFREE_ENV === 'production') {
  if (!process.env.API_PUBLIC_URL || new URL(process.env.API_PUBLIC_URL).protocol !== 'https:' || frontendUrl.protocol !== 'https:') {
    throw new Error('Production payments require HTTPS FRONTEND_URL and API_PUBLIC_URL values.');
  }
}
const projectId = process.env.FIREBASE_PROJECT_ID;
admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});
const db = admin.firestore();
const cashfree = new Cashfree(
  process.env.CASHFREE_ENV === 'production' ? Cashfree.PRODUCTION : Cashfree.SANDBOX,
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY,
  undefined, undefined, undefined, false
);
cashfree.XApiVersion = process.env.CASHFREE_API_VERSION || '2026-01-01';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin === frontendUrl.origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));

// Cashfree signature verification requires the exact raw bytes/string.
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  try {
    const signature = req.get('x-webhook-signature');
    const timestamp = req.get('x-webhook-timestamp');
    if (!signature || !timestamp || !raw) return res.status(400).send('Invalid webhook');
    const event = cashfree.PGVerifyWebhookSignature(signature, raw, timestamp);
    await handleVerifiedWebhook(event.object, event.type);
    return res.sendStatus(200);
  } catch (error) {
    console.error('Cashfree webhook rejected/failed:', error.message);
    return res.status(400).send('Webhook verification or processing failed');
  }
});
app.use(express.json({ limit: '32kb' }));

const authRequired = async (req, res, next) => {
  const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!match) return res.status(401).json({ error: 'Sign in to continue.' });
  try { req.user = await admin.auth().verifyIdToken(match[1], true); next(); }
  catch { return res.status(401).json({ error: 'Your session expired. Please sign in again.' }); }
};
const activeProducts = products.filter(p => p.active);
const productById = id => activeProducts.find(p => p.id === id);
const publicProduct = ({ id, name, description, price, image, category }) => ({ id, name, description, price, image, category, currency: 'INR' });
const cleanName = value => String(value || 'REDShop customer').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 100) || 'REDShop customer';
const validPhone = value => /^\d{10}$/.test(String(value || '').replace(/\D/g, ''));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/products', (_req, res) => res.json(activeProducts.map(publicProduct)));
app.get('/api/products/:id', (req, res) => {
  const product = productById(req.params.id);
  return product ? res.json(publicProduct(product)) : res.status(404).json({ error: 'Product not found.' });
});
app.get('/api/users/me', authRequired, async (req, res, next) => {
  try {
    const record = await admin.auth().getUser(req.user.uid);
    await db.collection('users').doc(record.uid).set({ uid: record.uid, name: record.displayName || '', email: record.email || '', updatedAt: admin.firestore.FieldValue.serverTimestamp(), accountStatus: 'active' }, { merge: true });
    res.json({ uid: record.uid, name: record.displayName || '', email: record.email || '', createdAt: record.metadata.creationTime || null });
  } catch (e) { next(e); }
});

const createOrderLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
app.post('/api/orders/create', authRequired, createOrderLimiter, async (req, res, next) => {
  let orderRef;
  try {
    const { productId, customerPhone } = req.body || {};
    const product = productById(productId);
    if (!product) return res.status(400).json({ error: 'Choose an available product.' });
    if (!validPhone(customerPhone)) return res.status(400).json({ error: 'Enter a valid 10-digit phone number.' });
    const user = await admin.auth().getUser(req.user.uid);
    if (!user.email) return res.status(400).json({ error: 'Your account needs an email address before checkout.' });
    const orderId = `rs_${crypto.randomUUID().replaceAll('-', '')}`;
    orderRef = db.collection('orders').doc(orderId);
    await orderRef.create({ orderId, userId: user.uid, productId: product.id, productName: product.name, amount: product.price, currency: 'INR', cashfreeOrderId: orderId, paymentStatus: 'pending', fulfillmentStatus: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    const orderRequest = {
      order_id: orderId,
      order_amount: product.price,
      order_currency: 'INR',
      customer_details: { customer_id: user.uid, customer_name: cleanName(req.body.customerName || user.displayName), customer_email: user.email, customer_phone: String(customerPhone).replace(/\D/g, '') },
      order_meta: {
        return_url: `${frontendUrl.origin}/success.html?order_id={order_id}`,
        notify_url: `${(process.env.API_PUBLIC_URL || '').replace(/\/$/, '')}/api/payments/webhook`
      },
      order_note: `REDShop ${product.name}`
    };
    if (!process.env.API_PUBLIC_URL) delete orderRequest.order_meta.notify_url;
    const cashfreeResponse = await cashfree.PGCreateOrder(orderRequest, undefined, orderId);
    const data = cashfreeResponse.data;
    await orderRef.update({ cashfreeCfOrderId: String(data.cf_order_id || ''), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.status(201).json({ orderId, paymentSessionId: data.payment_session_id, cashfreeMode: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox' });
  } catch (e) {
    if (orderRef) await orderRef.update({ paymentStatus: 'creation_failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
    next(e);
  }
});

async function authoritativePayment(orderId, paymentId = null) {
  const orderResponse = await cashfree.PGFetchOrder(orderId);
  const cfOrder = orderResponse.data;
  if (cfOrder.order_status !== 'PAID') return { paid: false, cfOrder };
  const paymentResponse = paymentId
    ? await cashfree.PGOrderFetchPayment(orderId, String(paymentId))
    : await cashfree.PGOrderFetchPayments(orderId);
  const payments = Array.isArray(paymentResponse.data) ? paymentResponse.data : [paymentResponse.data];
  const success = payments.find(p => p.payment_status === 'SUCCESS' && p.order_id === orderId);
  if (!success) return { paid: false, cfOrder };
  return { paid: true, cfOrder, payment: success };
}

async function fulfillPaidOrder(orderId, eventKey, payment) {
  const orderRef = db.collection('orders').doc(orderId);
  const eventRef = db.collection('payment_events').doc(eventKey);
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(crypto.randomInt(10_000_000, 100_000_000));
    const codeRef = db.collection('codes').doc(code);
    const result = await db.runTransaction(async tx => {
      const [eventSnap, orderSnap] = await Promise.all([tx.get(eventRef), tx.get(orderRef)]);
      if (eventSnap.exists) return { duplicate: true };
      if (!orderSnap.exists) {
        tx.create(eventRef, { orderId, eventType: 'PAYMENT_SUCCESS', verificationStatus: 'verified_order_not_found', receivedAt: admin.firestore.FieldValue.serverTimestamp(), processedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { missingOrder: true };
      }
      const order = orderSnap.data();
      if (Number(order.amount) !== Number(payment.payment_amount) || order.currency !== payment.payment_currency || payment.order_id !== order.cashfreeOrderId) {
        tx.update(orderRef, { paymentStatus: 'verification_mismatch', fulfillmentStatus: 'manual_review', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.create(eventRef, { orderId, eventType: 'PAYMENT_SUCCESS', verificationStatus: 'amount_or_order_mismatch', receivedAt: admin.firestore.FieldValue.serverTimestamp(), processedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { mismatch: true };
      }
      if (order.fulfillmentStatus === 'fulfilled') {
        tx.create(eventRef, { orderId, eventType: 'PAYMENT_SUCCESS', verificationStatus: 'already_fulfilled', receivedAt: admin.firestore.FieldValue.serverTimestamp(), processedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { alreadyFulfilled: true };
      }
      const codeSnap = await tx.get(codeRef);
      if (codeSnap.exists) return { codeCollision: true };
      tx.create(codeRef, {
        code,
        uid: order.userId,
        orderId,
        productId: order.productId,
        productName: order.productName,
        amount: order.amount,
        currency: order.currency,
        paymentId: String(payment.cf_payment_id),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      tx.update(orderRef, { paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', cashfreePaymentId: String(payment.cf_payment_id), codeId: code, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.create(eventRef, { orderId, eventType: 'PAYMENT_SUCCESS', verificationStatus: 'verified_code_created', codeId: code, receivedAt: admin.firestore.FieldValue.serverTimestamp(), processedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { fulfilled: true, code };
    });
    if (!result.codeCollision) return result;
  }
  throw new Error('Could not allocate a unique 8-digit code after repeated collisions');
}

async function handleVerifiedWebhook(payload, eventType) {
  const orderId = payload?.data?.order?.order_id || payload?.data?.order_id;
  const paymentId = payload?.data?.payment?.cf_payment_id || payload?.data?.cf_payment_id;
  if (typeof orderId !== 'string' || !/^rs_[a-f0-9]{32}$/.test(orderId)) throw new Error('Webhook order id is invalid');
  const eventHash = crypto.createHash('sha256').update(`${eventType}:${paymentId || orderId}`).digest('hex');
  if (!String(eventType).includes('SUCCESS')) {
    const orderRef = db.collection('orders').doc(orderId);
    const status = String(eventType).includes('FAILED') ? 'failed' : 'pending';
    await db.runTransaction(async tx => {
      const eventRef = db.collection('payment_events').doc(eventHash);
      const event = await tx.get(eventRef); if (event.exists) return;
      const order = await tx.get(orderRef);
      if (order.exists && order.data().paymentStatus !== 'paid') tx.update(orderRef, { paymentStatus: status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.create(eventRef, { orderId, eventType, verificationStatus: 'signature_verified', receivedAt: admin.firestore.FieldValue.serverTimestamp(), processedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    return;
  }
  const verified = await authoritativePayment(orderId, paymentId);
  if (!verified.paid || Number(verified.cfOrder.order_amount) !== Number(verified.payment.payment_amount) || verified.cfOrder.order_currency !== verified.payment.payment_currency) {
    throw new Error('Cashfree authoritative payment status or amount did not match');
  }
  const local = await db.collection('orders').doc(orderId).get();
  if (local.exists && (Number(local.data().amount) !== Number(verified.cfOrder.order_amount) || local.data().currency !== verified.cfOrder.order_currency)) {
    await db.collection('orders').doc(orderId).update({ paymentStatus: 'verification_mismatch', fulfillmentStatus: 'manual_review', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('payment_events').doc(eventHash).set({ orderId, eventType, verificationStatus: 'verified_cashfree_but_local_order_mismatch', receivedAt: admin.firestore.FieldValue.serverTimestamp(), processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.error(`Payment mismatch for order ${orderId}; manual resolution required.`);
    return;
  }
  const result = await fulfillPaidOrder(orderId, eventHash, verified.payment);
  if (result.mismatch) console.error(`Payment mismatch for order ${orderId}; manual resolution required.`);
}

app.get('/api/payments/status/:orderId', authRequired, async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    if (!/^rs_[a-f0-9]{32}$/.test(orderId)) return res.status(400).json({ error: 'Invalid order ID.' });
    const ref = db.collection('orders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Order not found.' });
    const order = snap.data();
    if (order.userId !== req.user.uid) return res.status(403).json({ error: 'You cannot view this order.' });
    if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'verification_mismatch') {
      const verified = await authoritativePayment(order.cashfreeOrderId);
      if (verified.paid && Number(verified.cfOrder.order_amount) === Number(order.amount) && verified.cfOrder.order_currency === order.currency) {
        await fulfillPaidOrder(orderId, `status_${orderId}_${verified.payment.cf_payment_id}`, verified.payment);
      } else if (verified.cfOrder.order_status === 'PAID') {
        await ref.update({ paymentStatus: 'verification_mismatch', fulfillmentStatus: 'manual_review', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    const current = (await ref.get()).data();
    res.json({ orderId, productName: current.productName, amount: current.amount, currency: current.currency, paymentStatus: current.paymentStatus, fulfillmentStatus: current.fulfillmentStatus });
  } catch (e) { next(e); }
});
app.get('/api/orders/my-orders', authRequired, async (req, res, next) => {
  try {
    const snapshot = await db.collection('orders').where('userId', '==', req.user.uid).orderBy('createdAt', 'desc').limit(50).get();
    res.json(snapshot.docs.map(doc => { const o = doc.data(); return { orderId: o.orderId, productName: o.productName, amount: o.amount, currency: o.currency, paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus, createdAt: o.createdAt?.toDate?.().toISOString() || null }; }));
  } catch (e) { next(e); }
});
app.get('/api/coupons/my-coupons', authRequired, async (req, res, next) => {
  try {
    const snapshot = await db.collection('codes').where('uid', '==', req.user.uid).orderBy('createdAt', 'desc').limit(100).get();
    res.json(snapshot.docs.map(doc => { const c = doc.data(); return { purchaseId: c.code, orderId: c.orderId, productName: c.productName, couponCode: c.code, amount: c.amount, purchasedAt: c.createdAt?.toDate?.().toISOString() || null }; }));
  } catch (e) { next(e); }
});

app.use((error, _req, res, _next) => {
  console.error('API error:', error?.response?.data || error.message || error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'We could not complete that request. Please try again.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '127.0.0.1', () => console.log(`REDShop API listening on 127.0.0.1:${port}`));
