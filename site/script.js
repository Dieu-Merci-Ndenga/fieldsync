(() => {
  // Interactive demo: toggle the phone between offline and online.
  const banner = document.getElementById('banner');
  const bannerText = document.getElementById('banner-text');
  const state = document.getElementById('state');
  const btn = document.getElementById('toggle');
  const caption = document.getElementById('caption');
  let offline = false;

  const render = () => {
    banner.className = 's-banner ' + (offline ? 'offline' : 'online');
    bannerText.textContent = offline ? 'Offline · 2 changes saved on this device' : 'All changes synced';
    state.className = 'tag ' + (offline ? 'warn' : 'ok');
    state.textContent = offline ? 'Pending · 2' : 'Synced';
    btn.textContent = offline ? 'Reconnect' : 'Go offline';
    btn.setAttribute('aria-pressed', String(offline));
    caption.textContent = offline
      ? 'Edits keep working. They wait in a durable queue on the device.'
      : 'Back online: the queue drains in order, nothing is lost.';
  };
  btn.addEventListener('click', () => {
    offline = !offline;
    render();
  });
  render();

  // Subtle reveal on scroll.
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) return items.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
    { threshold: 0.12 },
  );
  items.forEach((e) => io.observe(e));
})();
