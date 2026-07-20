require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const { getPool } = require('./db');
const registerSockets = require('./sockets');

// Routes
const authRoutes    = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes    = require('./routes/cart');
const collabRoutes  = require('./routes/collab');
const agentRoutes   = require('./routes/agent');
const wardrobeRoutes = require('./routes/wardrobe');
const missionRoutes = require('./routes/mission');
const partyRoutes = require('./routes/party');
const demoRoutes = require('./routes/demo');

const app    = express();
const server = http.createServer(app);

// Local hackathon dev tool only — reflect any origin so a phone on the same
// WiFi (hitting the LAN IP instead of localhost) isn't blocked by CORS.
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Serve local product images statically
// Legacy images (pre-catalog-swap, kept for any surviving old rows) at:
// data-pipeline/raw/Images/Images/{id}.jpg
const imagesPath = path.join(__dirname, '..', '..', 'data-pipeline', 'raw', 'Images', 'Images');
// maxAge: 0 forces the browser to revalidate (conditional GET via ETag) on
// every load instead of blindly trusting a stale cached copy for days —
// a 7-day cache meant a swapped/corrected image file on disk could still
// show the old wrong photo to anyone who'd loaded that URL before.
const staticOpts = { maxAge: 0, etag: true, lastModified: true };
app.use('/images', express.static(imagesPath, staticOpts));
console.log('📷 Legacy images served from:', imagesPath);

// New catalog image sources (data-pipeline/seed_hm_catalog.py,
// supplement_deepfashion.py, seed_ethnic_manual.py) — kept in their own
// mounts rather than copied into the folder above so re-seeding never has
// to move 100k+ files around.
//
// Mounted one level ABOVE the images_128_128/img_highres subfolder, not at
// it — the seed scripts' own IMG_BASE constants already bake that subfolder
// name into every stored URL (e.g. .../images/hm/images_128_128/010/...),
// so mounting static() AT that subfolder doubled it in the real file
// lookup and 404'd every image.
const hmImagesPath = path.join(__dirname, '..', '..', 'data-pipeline', 'raw', 'hm');
app.use('/images/hm', express.static(hmImagesPath, staticOpts));
console.log('📷 H&M images served from:', hmImagesPath);

const deepfashionImagesPath = path.join(__dirname, '..', '..', 'data-pipeline', 'raw', 'deepfashion');
app.use('/images/deepfashion', express.static(deepfashionImagesPath, staticOpts));
console.log('📷 DeepFashion images served from:', deepfashionImagesPath);

const ethnicImagesPath = path.join(__dirname, '..', '..', 'data-pipeline', 'raw', 'ethnic_manual_images');
app.use('/images/ethnic', express.static(ethnicImagesPath, staticOpts));
console.log('📷 Ethnic-supplement images served from:', ethnicImagesPath);

// Attach io to every request
app.use((req, _res, next) => { req.io = io; next(); });

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart',     cartRoutes);
app.use('/api/collab',   collabRoutes);
app.use('/api/agent',    agentRoutes);
app.use('/api/wardrobe', wardrobeRoutes);
app.use('/api/mission', missionRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/demo',    demoRoutes);

registerSockets(io);

const PORT = process.env.PORT || 5000;

getPool()
  .then(() => {
    server.listen(PORT, () => console.log(`🚀 StyleOS backend on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ Oracle connection failed:', err.message);
    console.error('   Make sure Oracle is running and .env credentials are correct');
    process.exit(1);
  });
