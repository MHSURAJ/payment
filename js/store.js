/* Shared data layer. Uses localStorage (static hosting, no backend). */
const RS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('rs_' + k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rs_' + k, JSON.stringify(v)); return true; } catch (e) { alert('Storage is full. Use a smaller image or an image URL.'); return false; } },
  products() { return this.get('products', []); },
  cart() { return this.get('cart', []); },
  orders() { return this.get('orders', []); },
  user() { return this.get('user', null); }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function placeholder(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${color}"/><text x="200" y="215" font-size="46" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
if (RS.get('products', null) === null) {
  RS.set('products', [
    { id: uid(), name: 'Red Hoodie', amount: 1499, image: placeholder('Hoodie', '#d90429') },
    { id: uid(), name: 'Canvas Sneakers', amount: 2299, image: placeholder('Sneakers', '#8d0801') },
    { id: uid(), name: 'Travel Backpack', amount: 1899, image: placeholder('Backpack', '#ef233c') }
  ]);
}

/* Resize uploaded images so they fit in localStorage */
function readImage(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const i = new Image();
      i.onload = () => {
        const s = Math.min(1, 600 / Math.max(i.width, i.height)), c = document.createElement('canvas');
        c.width = i.width * s; c.height = i.height * s;
        c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', .8));
      };
      i.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function nav(active) {
  const n = RS.cart().reduce((s, x) => s + x.qty, 0), on = k => active === k ? 'on' : '';
  document.getElementById('nav').innerHTML =
    `<a class="logo" href="index.html">Red<b>Shop</b></a><nav><a href="index.html" class="${on('shop')}">Shop</a><a href="user.html" class="${on('user')}">My dashboard${n ? ' (' + n + ')' : ''}</a><a href="admin.html" class="${on('admin')}">Admin</a></nav>`;
}
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800);
}
