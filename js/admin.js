/* Demo password. Client-side only, so it keeps casual visitors out but is NOT real security. */
const ADMIN_PASS = 'admin123';
const app = document.getElementById('app');
let editId = null, imgData = '';

function render() {
  nav('admin');
  if (sessionStorage.getItem('rs_admin') !== '1') {
    app.innerHTML = `<form class="panel narrow" id="af"><h2>Admin sign in</h2><input id="ap" type="password" placeholder="Admin password" required><button class="btn">Sign in</button></form>`;
    document.getElementById('af').onsubmit = e => {
      e.preventDefault();
      if (ap.value === ADMIN_PASS) { sessionStorage.setItem('rs_admin', '1'); render(); } else toast('Wrong password');
    };
    return;
  }
  const ps = RS.products(), orders = RS.orders().slice().reverse();
  app.innerHTML = `
    <div class="bar"><h1>Admin dashboard</h1><button class="btn ghost" onclick="logout()">Sign out</button></div>
    <div class="two">
      <section>
        <form class="panel" id="pf"><h2>${editId ? 'Edit product' : 'Add product'}</h2>
          <input id="pn" placeholder="Product name" required>
          <input id="pa" type="number" min="1" step="any" placeholder="Amount (₹)" required>
          <label class="muted">Image: upload a file<input id="pi" type="file" accept="image/*"></label>
          <input id="pu" type="url" placeholder="…or paste an image URL">
          <img id="pv" class="preview" alt="Image preview" hidden>
          <div style="display:flex;gap:10px"><button class="btn">${editId ? 'Save changes' : 'Add product'}</button>${editId ? '<button type="button" class="btn ghost" onclick="cancelEdit()">Cancel</button>' : ''}</div>
        </form>
      </section>
      <section class="panel"><h2>Products (${ps.length})</h2>
        ${ps.length ? ps.map(p => `<div class="row"><img src="${esc(p.image)}" alt=""><div class="grow"><b>${esc(p.name)}</b><span class="muted">${money(p.amount)}</span></div>
          <button class="btn ghost sm" onclick="edit('${p.id}')">Edit</button><button class="btn sm" onclick="del('${p.id}')">Delete</button></div>`).join('')
          : '<p class="muted">No products yet. Add your first one.</p>'}
      </section>
    </div>
    <section class="panel"><h2>Customer orders (${orders.length})</h2>
      ${orders.length ? orders.map(o => `<div class="row"><div class="grow"><b>${esc(o.name)} · ${esc(o.email)}</b><span class="muted">${o.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ')} · ${money(o.total)}</span></div>
        <select style="width:auto" onchange="status('${o.id}',this.value)">${['Placed', 'Shipped', 'Delivered'].map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>`).join('')
        : '<p class="muted">No orders yet.</p>'}
    </section>`;
  const f = document.getElementById('pf');
  if (editId) {
    const p = ps.find(x => x.id === editId);
    pn.value = p.name; pa.value = p.amount; imgData = p.image; preview(imgData);
  } else imgData = '';
  pi.onchange = async () => { if (pi.files[0]) { imgData = await readImage(pi.files[0]); pu.value = ''; preview(imgData); } };
  pu.oninput = () => { if (pu.value) { imgData = pu.value.trim(); preview(imgData); } };
  f.onsubmit = e => {
    e.preventDefault();
    if (!imgData) return toast('Add a product image');
    const item = { name: pn.value.trim(), amount: Number(pa.value), image: imgData };
    const list = RS.products();
    if (editId) { const i = list.findIndex(x => x.id === editId); list[i] = { ...list[i], ...item }; }
    else list.push({ id: uid(), ...item });
    if (!RS.set('products', list)) return;
    toast(editId ? 'Product updated' : 'Product added'); editId = null; render();
  };
}
function preview(src) { pv.src = src; pv.hidden = false; }
function edit(id) { editId = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function cancelEdit() { editId = null; render(); }
function del(id) {
  if (!confirm('Delete this product?')) return;
  RS.set('products', RS.products().filter(p => p.id !== id));
  RS.set('cart', RS.cart().filter(c => c.id !== id));
  if (editId === id) editId = null; toast('Product deleted'); render();
}
function status(id, s) { const o = RS.orders(); o.find(x => x.id === id).status = s; RS.set('orders', o); toast('Order ' + s.toLowerCase()); }
function logout() { sessionStorage.removeItem('rs_admin'); render(); }
render();
