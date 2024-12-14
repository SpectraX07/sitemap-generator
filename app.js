// app.js
import express from 'express';
import dotenv from 'dotenv/config';
import manageRoutes from './routes/manageRoutes.js';
import webRoutes from './routes/webRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import bodyParser from 'body-parser';
import path from 'path';

const app = express();
const __dirname = path.resolve(); // If using ES modules

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/public', express.static(path.join(__dirname, 'public')));


// Use the sitemap routes
// app.use('/', manageRoutes);
app.use('/web', webRoutes);
app.use('/api', apiRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Server running on http://localhost:${process.env.PORT}`);
});
