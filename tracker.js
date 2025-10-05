(function() {
    const site = window.location.hostname;
    const page = window.location.pathname;
    const referrer = document.referrer;
    const userAgent = navigator.userAgent;

    fetch('https://stat.pixelxserver.fr/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site, page, referrer, userAgent })
    }).catch(() => {});
})();
