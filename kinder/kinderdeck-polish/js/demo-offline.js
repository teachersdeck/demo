/* Public demo build only (tools/build_demo.py): KinderDeck's school backend is not connected here.
   Calls to it are answered in the browser with "not connected", so nothing about the demo school leaves the page. */
(() => {
  const BASE = 'https://backend.demo.invalid', real = window.fetch.bind(window);
  window.fetch = (url, opts) => String(url).startsWith(BASE)
    ? Promise.resolve(new Response(JSON.stringify({error: 'This is the demo: it is not connected to a school, so nothing was sent. / Đây là bản dùng thử: chưa kết nối với trường nên không gửi gì.'}),
        {status: 503, headers: {'Content-Type': 'application/json'}}))
    : real(url, opts);
})();
