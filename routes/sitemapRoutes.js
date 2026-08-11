import express from 'express';
import { generateSitemap } from '../controllers/sitemapController.js';

const router = express.Router();

router.post('/generate', generateSitemap);

export default router; 