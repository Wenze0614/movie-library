// Puts the download for the visitor's computer first and highlights it.
// Without JavaScript, both buttons simply show (Mac highlighted).
(() => {
  const picker = document.querySelector('[data-os-picker]');
  if (!picker) return;
  const platform = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  const os = platform.includes('win') ? 'windows' : platform.includes('mac') ? 'mac' : null;
  if (!os) return;
  const mine = picker.querySelector(`[data-os="${os}"]`);
  if (!mine) return;
  for (const link of picker.querySelectorAll('.dl')) link.classList.toggle('dl-primary', link === mine);
  picker.prepend(mine);
})();
