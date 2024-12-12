import path from 'path';

// Controller to serve the HTML form
export const renderSitemapForm = (req, res) => {
    const filePath = path.join(path.resolve(), 'views', 'sitemapForm.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error serving the sitemap form:', err.message);
            res.status(500).send('An error occurred while loading the page.');
        }
    });
};
