(function() {
    const site = window.location.hostname;
    const page = window.location.pathname;
    const referrer = document.referrer;
    const userAgent = navigator.userAgent;

    fetch('https://stat.pixelserver.fr/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site, page, referrer, userAgent })
    }).catch(() => {});
})();