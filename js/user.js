const app = document.getElementById('app');
function render() {
  nav('user');
  const u = RS.user();
  if (!u) {
    app.innerHTML = `<form class="panel narrow" id="lf"><h2>Sign in to your dashboard</h2><input id="un" placeholder="Your name" required><input id="ue" type="email" placeholder="Email" required><button class="btn">Continue</button></form>`;
    document.getElementById('lf').onsubmit = ev => {
      ev.preventDefault();
      RS.set('user', { name: un.value.trim(), email: ue.value.trim().toLowerCase() }); render();
    };
    return;
  }
  const prods = RS.products();
  const cart = RS.cart().map(c => ({ ...c, p: prods.find(p => p.id === c.id) })).filter(c => c.p);
  const total = cart.reduce((s, c) => s + c.p.amount * c.qty, 0);
  const orders = RS.orders().filter(o => o.email === u.email).reverse();
  app.innerHTML = `
    <div class="bar"><div><h1>Hi, ${esc(u.name)}</h1><p class="muted" style="margin:0">${esc(u.email)}</p></div>
    <button class="btn ghost" onclick="logout()">Sign out</button></div>
    <div class="two">
      <section class="panel"><h2>Your cart</h2>
        ${cart.length ? cart.map(c => `<div class="row"><img src="${esc(c.p.image)}" alt=""><div class="grow"><b>${esc(c.p.name)}</b><span class="muted">${money(c.p.amount)}</span></div>
          <div class="qty"><button onclick="qty('${c.id}',-1)" aria-label="Decrease">−</button>${c.qty}<button onclick="qty('${c.id}',1)" aria-label="Increase">+</button></div></div>`).join('')
          + `<div class="total"><span>Total</span><span>${money(total)}</span></div><button class="btn" onclick="checkout()">Place order</button>`
          : '<p class="muted">Your cart is empty. <a href="index.html">Browse the shop</a>.</p>'}
      </section>
      <section class="panel"><h2>Your orders</h2>
        ${orders.length ? orders.map(o => `<div class="row"><div class="grow"><b>Order ${o.id.slice(-5)}</b><span class="muted">${new Date(o.date).toLocaleDateString()} · ${o.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ')}</span></div><div style="text-align:right"><b>${money(o.total)}</b><br><span class="tag ${o.status}">${o.status}</span></div></div>`).join('')
          : '<p class="muted">No orders yet.</p>'}
      </section>
    </div>`;
}
function qty(id, d) {
  let c = RS.cart(); const i = c.find(x => x.id === id);
  if (i) i.qty += d; c = c.filter(x => x.qty > 0); RS.set('cart', c); render();
}
function checkout() {
  const u = RS.user(), prods = RS.products();
  const items = RS.cart().map(c => { const p = prods.find(p => p.id === c.id); return p && { name: p.name, amount: p.amount, qty: c.qty }; }).filter(Boolean);
  if (!items.length) return;
  const orders = RS.orders();
  orders.push({ id: uid(), email: u.email, name: u.name, items, total: items.reduce((s, i) => s + i.amount * i.qty, 0), date: Date.now(), status: 'Placed' });
  RS.set('orders', orders); RS.set('cart', []); render(); toast('Order placed');
}
function logout() { localStorage.removeItem('rs_user'); render(); }
render();
