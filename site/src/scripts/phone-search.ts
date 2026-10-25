// Find a phone by name on the mobile price page. The page carries the whole list (name, link, lowest
// price as text), so typing filters it in the browser with no request.
const root = document.querySelector<HTMLElement>('[data-phone-search]');
if (root) {
  const input = root.querySelector('input')!;
  const results = root.querySelector<HTMLUListElement>('[data-results]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const data = JSON.parse(root.querySelector('script[type="application/json"]')!.textContent ?? '[]') as Array<[string, string, string]>;
  // "Galaxy A57", "galaxya57" and "a57" all find "Samsung Galaxy A57 5G": each typed word must match the
  // name from the start of one of its words (so "a5" finds the A5x phones, not "Ultra 5G").
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '');
  const phones = data.map(([name, href, price]) => {
    const words = name.split(/\s+/).map(norm);
    return { name, href, price, starts: words.map((_, i) => words.slice(i).join('')) };
  });

  const show = () => {
    const typed = input.value.trim().split(/\s+/).map(norm).filter(Boolean);
    const hits = typed.length === 0 ? [] : phones.filter((p) => typed.every((t) => p.starts.some((s) => s.startsWith(t)))).slice(0, 12);
    results.replaceChildren(
      ...hits.map((p) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = p.href;
        a.className = 'flex justify-between gap-4 px-4 py-2 text-ink no-underline hover:bg-page';
        const name = document.createElement('span');
        name.textContent = p.name;
        const price = document.createElement('span');
        price.className = 'whitespace-nowrap text-ink-2';
        price.textContent = p.price;
        a.append(name, price);
        li.append(a);
        return li;
      }),
    );
    results.hidden = hits.length === 0;
    empty.hidden = typed.length === 0 || hits.length > 0;
  };
  input.addEventListener('input', show);
  show();
}
