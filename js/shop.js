nav('shop');
const grid = document.getElementById('grid'), q = document.getElementById('q');
function draw() {
  const t = q.value.toLowerCase(), ps = RS.products().filter(p => p.name.toLowerCase().includes(t));
  grid.innerHTML = ps.length ? ps.map(p => `<div class="card"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"><div class="body"><h3>${esc(p.name)}</h3><div class="price">${money(p.amount)}</div><button class="btn" onclick="addCart('${p.id}')">Add to cart</button></div></div>`).join('')
    : '<p class="muted">No products match your search.</p>';
}
function addCart(id) {
  const c = RS.cart(), i = c.find(x => x.id === id);
  i ? i.qty++ : c.push({ id, qty: 1 });
  RS.set('cart', c); nav('shop'); toast('Added to cart');
}
q.oninput = draw; draw();
