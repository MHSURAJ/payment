# REDShop

REDShop is a responsive coupon storefront using Firebase Authentication, a Node/Express API, Firestore, and Cashfree PG hosted checkout.

## Coupon catalogue and image

The shop displays three separate coupon cards: 100 Coins, 150 Coins, and 200 Coins. Their initial checkout prices are ₹100, ₹150, and ₹200 INR, respectively; update the trusted prices in `backend/data/products.js` if your intended prices differ. The same `assets/coins.png` file is used for the coupon image on each card and product page. Add your image at that path; until then, the built-in coin illustration is shown.

Each card has a **Buy now** button. Customers sign in, enter their 10-digit mobile number, and continue to Cashfree hosted checkout. On a successful payment, the backend verifies the payment with Cashfree and atomically creates a unique eight-digit numeric code document in Firestore's `codes` collection. The authenticated customer can then see and copy their own codes on My Coupons.

## Firebase setup

The supplied Firebase web configuration is in `frontend/firebase-config.js`. Firebase browser API keys are public identifiers; restrict this key in Google Cloud Console to the Firebase Authentication APIs and your site domains.

In Firebase Console for project `redline-esports`:

1. Enable **Google** and **Email/Password** in Authentication sign-in providers.
2. Add `localhost` and `redshop.hindcraft.online` to Authentication's authorized domains.
3. Enable Firestore if it is not already enabled. This project uses the same Firebase database as your existing app.
4. Create a Firebase Admin service account and place its project ID, client email, and private key in `backend/.env`. Keep the service account key private.

The project's `backend/firestore.rules` contains the existing rules supplied for the other Firebase app, preserved as provided, plus a `/codes/{codeId}` rule that allows a signed-in user to read only code documents whose `uid` is their own. Client writes to `codes` are denied; the backend uses Firebase Admin after verified payment. The rules and indexes are **not deployed automatically**. Review and deploy the merged rules only when you're ready to update the shared Firebase project's Firestore rules.

## Cashfree and local development

Cashfree App ID and Secret Key belong only in the backend environment file. Do not paste the secret into frontend code or commit it.

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env: add Firebase Admin values and Cashfree sandbox credentials
npm install
npm run dev
```

For local preview, run a second terminal from the project root:

```powershell
npx serve@14 -l 5500 .
```

Open `http://localhost:5500`. Keep `CASHFREE_ENV=sandbox` and `FRONTEND_URL=http://localhost:5500`. Cashfree webhooks need a publicly reachable callback; use a secure HTTPS tunnel for local testing and set `API_PUBLIC_URL` to that tunnel's base URL. Register `/api/payments/webhook` with Cashfree. The backend listens on `127.0.0.1:3000`.

For production, serve the frontend behind HTTPS at `https://redshop.hindcraft.online`, proxy `/api/` to the backend, and set both `FRONTEND_URL` and `API_PUBLIC_URL` to that HTTPS origin. The backend refuses production Cashfree mode without HTTPS URLs. Use live credentials only after merchant approval and sandbox verification.

## Firestore deployment

`firebase.json` points to the merged rules and indexes. From the project root, deploy when you intentionally want to update the shared database's rules/indexes:

```sh
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project redline-esports
```

The Admin SDK bypasses client security rules. The backend stores each generated code document with `code`, `uid`, `orderId`, `productId`, `productName`, `amount`, `currency`, `paymentId`, and `createdAt`. It chooses an unused 8-digit code as the Firestore document ID and creates it in the same transaction that marks the order fulfilled. Webhook repeats cannot create a second code for the same successful payment.

## Security and launch notes

- All Cashfree orders are created on the server from `backend/data/products.js`; prices sent by a browser are ignored.
- Private APIs verify Firebase ID tokens and enforce order/code ownership.
- Cashfree webhooks use the SDK verifier and exact raw request body. The return page asks the backend to fetch authoritative Cashfree order/payment status; a redirect alone never marks a purchase paid.
- The Firebase project is shared with another app. The supplied match, wallet, registration, squad, user, and admin rules remain in `backend/firestore.rules`; only a `/codes` match was added.
- Replace the sample product text and draft policies with your final coupon terms and business information before launch. No production credentials or live charge have been configured in this workspace.
