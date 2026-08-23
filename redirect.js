const target = new URL('./dist/index.html', window.location.href);
target.search = window.location.search;
target.hash = window.location.hash;
window.location.replace(target.href);
