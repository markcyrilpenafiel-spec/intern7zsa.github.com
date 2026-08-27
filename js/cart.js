/**
 * Shared cart helpers – all products priced at ₱1.00 for PayMongo testing
 */
(function () {
  const CART_KEY = 'coffeeBlendCart';
  const UNIT_PRICE = 1; // PHP

  function getCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  }

  function updateCartCount() {
    const count = getCart().reduce((s, i) => s + (i.quantity || 0), 0);
    document.querySelectorAll('#cart-count, [data-cart-count]').forEach((el) => {
      el.textContent = String(count);
    });
  }

  function addToCart(item) {
    const cart = getCart();
    const price = typeof item.price === 'number' ? item.price : UNIT_PRICE;
    const existing = cart.find((c) => c.id === item.id || c.name === item.name);
    if (existing) {
      existing.quantity += item.quantity || 1;
      existing.price = price;
    } else {
      cart.push({
        id: item.id || item.name,
        name: item.name,
        price: price,
        quantity: item.quantity || 1,
        image: item.image || ''
      });
    }
    saveCart(cart);
    return cart;
  }

  function setQuantity(idOrName, qty) {
    let cart = getCart();
    cart = cart
      .map((c) => {
        if (c.id === idOrName || c.name === idOrName) {
          return { ...c, quantity: Math.max(0, qty) };
        }
        return c;
      })
      .filter((c) => c.quantity > 0);
    saveCart(cart);
    return cart;
  }

  function removeItem(idOrName) {
    const cart = getCart().filter((c) => c.id !== idOrName && c.name !== idOrName);
    saveCart(cart);
    return cart;
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateCartCount();
  }

  function getTotal() {
    return getCart().reduce((s, i) => s + i.price * i.quantity, 0);
  }

  function getQuantity() {
    return getCart().reduce((s, i) => s + i.quantity, 0);
  }

  window.CoffeeCart = {
    CART_KEY,
    UNIT_PRICE,
    getCart,
    saveCart,
    updateCartCount,
    addToCart,
    setQuantity,
    removeItem,
    clearCart,
    getTotal,
    getQuantity
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateCartCount);
  } else {
    updateCartCount();
  }
})();
