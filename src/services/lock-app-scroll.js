const locks = new WeakMap();

export function lockAppScroll(target = document) {
  const elements = [target.body, target.querySelector('.page-content')].filter(Boolean);
  for (const element of elements) {
    const previous = locks.get(element) || { count: 0, overflow: element.style.overflow };
    previous.count++;
    locks.set(element, previous);
    element.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const element of elements) {
      const previous = locks.get(element);
      if (--previous.count === 0) { element.style.overflow = previous.overflow; locks.delete(element); }
    }
  };
}
