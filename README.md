# RedShop

Static e-commerce site (HTML, CSS, JS). Pages: `index.html` (shop), `user.html` (user dashboard), `admin.html` (admin dashboard).

## Go live on GitHub Pages
1. Create a repo (e.g. `redshop`) and upload the contents of this folder to the repo root.
2. Repo **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`.
3. Your site appears at `https://<username>.github.io/redshop/`.

## Admin
Open `admin.html`. Default password: `admin123` (change `ADMIN_PASS` in `js/admin.js`).

## Important
Data is stored in each browser's localStorage, so products added by the admin are only visible in that browser.
To share products with all visitors, swap `js/store.js` for a backend such as Firebase or Supabase.
