(function() {
    const site = window.location.hostname;
    const page = window.location.pathname;
    const referrer = document.referrer;
    const userAgent = navigator.userAgent;
    const language = navigator.language || navigator.userLanguage;
    const screenResolution = `${screen.width}x${screen.height}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    fetch('https://stat.pixelserver.fr/api/track', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '', // Le proxy ajoutera cette en-tête automatiquement
            'X-Real-IP': '' // Le proxy ajoutera cette en-tête automatiquement
        },
        body: JSON.stringify({
            site,
            page,
            referrer,
            userAgent,
            language,
            screenResolution,
            timezone
        })
    }).catch(() => {});
})();