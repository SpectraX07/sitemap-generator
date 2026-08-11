import SitemapGenerator from '../utils/sitemapGenerator.js';

export const generateSitemap = async (req, res) => {
    console.log('Received request:', req.body);
    
    try {
        const { url } = req.body;
        
        if (!url) {
            console.log('No URL provided');
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        console.log(`Processing sitemap generation request for: ${url}`);

        let parsedUrl;
        try {
            // Validate URL format
            parsedUrl = new URL(url);
            if (!parsedUrl.protocol.startsWith('http')) {
                throw new Error('URL must use HTTP or HTTPS protocol');
            }
        } catch (error) {
            console.log('Invalid URL format:', error.message);
            return res.status(400).json({
                success: false,
                message: `Invalid URL format: ${error.message}`
            });
        }

        // Create sitemap generator instance
        console.log('Creating sitemap generator instance');
        const generator = new SitemapGenerator(url);
        
        // Generate sitemap
        console.log('Starting sitemap generation');
        let sitemap;
        try {
            sitemap = await generator.generateSitemap();
        } catch (error) {
            console.error('Error during sitemap generation:', error);
            if (error.code === 'ECONNREFUSED') {
                return res.status(400).json({
                    success: false,
                    message: 'Could not connect to the website'
                });
            } else if (error.code === 'ENOTFOUND') {
                return res.status(400).json({
                    success: false,
                    message: 'Website not found'
                });
            } else if (error.message === 'No valid URLs found to include in sitemap') {
                return res.status(404).json({
                    success: false,
                    message: 'No valid URLs found to include in sitemap'
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Error generating sitemap',
                    error: error.message
                });
            }
        }
        
        if (!sitemap) {
            console.log('No sitemap generated');
            return res.status(500).json({
                success: false,
                message: 'Failed to generate sitemap'
            });
        }
        
        console.log('Sitemap generated successfully, sending response');
        
        // Set XML content type and send response
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', 'attachment; filename=sitemap.xml');
        return res.send(sitemap);
        
    } catch (error) {
        console.error('Unexpected error in generateSitemap controller:', error);
        return res.status(500).json({
            success: false,
            message: 'Unexpected error occurred',
            error: error.message
        });
    }
}; 