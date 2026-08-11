import { normalizeUrl, getDisplayDomain } from './urlNormalize.js';

(() => {
    const steps = {
        landing: document.getElementById('step-landing'),
        crawling: document.getElementById('step-crawling'),
        complete: document.getElementById('step-complete')
    };

    const urlForm = document.getElementById('urlForm');
    const urlInput = document.getElementById('urlInput');
    const urlHint = document.getElementById('urlHint');
    const urlError = document.getElementById('urlError');
    const startBtn = document.getElementById('startBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    const siteDomain = document.getElementById('siteDomain');
    const siteDescription = document.getElementById('siteDescription');
    const siteFavicon = document.getElementById('siteFavicon');
    const completeFavicon = document.getElementById('completeFavicon');
    const progressBar = document.getElementById('progressBar');
    const progressCount = document.getElementById('progressCount');
    const currentUrlEl = document.getElementById('currentUrl');
    const pagesHeadline = document.getElementById('pagesHeadline');

    let eventSource = null;
    let abortController = null;
    let selectedFormat = 'xml';
    let crawlUrl = '';
    let sitemapContent = null;
    let sitemapContentType = 'application/xml';

    function showStep(name) {
        Object.entries(steps).forEach(([key, el]) => {
            el.classList.toggle('hidden', key !== name);
        });
    }

    function cleanup() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    }

    function clearValidation() {
        urlInput.classList.remove('input-invalid');
        urlError.classList.add('hidden');
        urlError.textContent = '';
    }

    function showError(message) {
        urlInput.classList.add('input-invalid');
        urlError.textContent = message;
        urlError.classList.remove('hidden');
        urlHint.classList.add('hidden');
    }

    function updateHint() {
        const raw = urlInput.value.trim();
        clearValidation();

        if (!raw) {
            urlHint.classList.add('hidden');
            return;
        }

        const normalized = normalizeUrl(raw);
        if (normalized) {
            urlHint.innerHTML = `Will crawl <strong>${normalized}</strong>`;
            urlHint.classList.remove('hidden');
        } else {
            urlHint.classList.add('hidden');
        }
    }

    function parseInput() {
        const raw = urlInput.value.trim();
        if (!raw) {
            showError('Enter a website address to crawl.');
            urlInput.focus();
            return null;
        }

        const normalized = normalizeUrl(raw);
        if (!normalized) {
            showError('That doesn\u2019t look like a valid website. Try example.com or https://example.com');
            urlInput.focus();
            return null;
        }

        clearValidation();
        return normalized;
    }

    function setSiteInfo(url) {
        const domain = getDisplayDomain(url);
        const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

        siteDomain.textContent = domain;
        siteFavicon.src = favicon;
        siteFavicon.alt = domain;
        completeFavicon.src = favicon;
        completeFavicon.alt = domain;
    }

    function updateProgress(data) {
        const processed = data.processed || 0;
        const total = Math.max(data.total || 1, processed);
        const pct = Math.min(100, Math.round((processed / total) * 100));

        progressBar.style.width = `${pct}%`;
        progressCount.textContent = `${processed} of ${total}`;

        if (data.currentUrl) {
            currentUrlEl.textContent = data.currentUrl;
            currentUrlEl.href = data.currentUrl;
        }
    }

    urlInput.addEventListener('input', updateHint);
    urlInput.addEventListener('blur', updateHint);

    document.querySelectorAll('.format-card:not(.disabled)').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedFormat = card.dataset.format;
        });
    });

    urlForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        crawlUrl = parseInput();
        if (!crawlUrl) return;

        cleanup();
        setSiteInfo(crawlUrl);
        siteDescription.textContent = 'Crawling website pages\u2026';
        progressBar.style.width = '0%';
        progressCount.textContent = '0 of 0';
        currentUrlEl.textContent = crawlUrl;
        currentUrlEl.href = crawlUrl;

        showStep('crawling');
        startBtn.disabled = true;

        eventSource = new EventSource('/api/sitemap/progress');
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'progress') {
                    updateProgress(data);
                } else if (data.type === 'complete') {
                    pagesHeadline.textContent = `${data.urlCount} page${data.urlCount !== 1 ? 's' : ''} discovered`;
                    eventSource.close();
                    eventSource = null;
                }
            } catch {
                // ignore parse errors
            }
        };

        abortController = new AbortController();

        try {
            const params = new URLSearchParams({
                url: crawlUrl,
                format: 'xml',
                nocache: 'true'
            });

            const response = await fetch(`/api/sitemap?${params}`, {
                signal: abortController.signal
            });

            if (!response.ok) {
                const contentType = response.headers.get('Content-Type') || '';
                const body = await response.text().catch(() => '');

                if (contentType.includes('application/json') && body) {
                    try {
                        const err = JSON.parse(body);
                        throw new Error(err.details || err.error || 'Crawl failed');
                    } catch (e) {
                        if (e instanceof SyntaxError) {
                            throw new Error('Crawl failed');
                        }
                        throw e;
                    }
                }

                throw new Error('Crawl failed');
            }

            sitemapContent = await response.text();
            sitemapContentType = response.headers.get('Content-Type') || 'application/xml';

            const resultRes = await fetch('/api/sitemap/result');
            if (resultRes.ok) {
                const result = await resultRes.json();
                pagesHeadline.textContent = `${result.urlCount} page${result.urlCount !== 1 ? 's' : ''} discovered`;

                const rootMeta = result.metadata[crawlUrl] || Object.values(result.metadata)[0];
                if (rootMeta?.title) {
                    siteDescription.textContent = rootMeta.title;
                }
            }

            showStep('complete');
        } catch (error) {
            if (error.name !== 'AbortError') {
                alert(error.message || 'An error occurred during crawling');
                showStep('landing');
            }
        } finally {
            cleanup();
            startBtn.disabled = false;
        }
    });

    async function cancelCrawl() {
        cleanup();
        try {
            await fetch('/api/sitemap/cancel', { method: 'POST' });
        } catch {
            // ignore
        }
        showStep('landing');
        startBtn.disabled = false;
    }

    cancelBtn.addEventListener('click', cancelCrawl);
    stopBtn.addEventListener('click', cancelCrawl);
    resetBtn.addEventListener('click', () => {
        sitemapContent = null;
        urlInput.value = '';
        clearValidation();
        urlHint.classList.add('hidden');
        showStep('landing');
    });

    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Generating\u2026';

        try {
            let content = sitemapContent;
            let mime = sitemapContentType;
            const ext = selectedFormat;

            if (selectedFormat !== 'xml' || !content) {
                const response = await fetch(`/api/sitemap/format?format=${selectedFormat}`);
                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.details || err.error || 'Generation failed');
                }
                content = await response.text();
                mime = response.headers.get('Content-Type') || 'text/plain';
            }

            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sitemap.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert(error.message || 'Failed to generate sitemap');
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download Sitemap \u2192';
        }
    });
})();
