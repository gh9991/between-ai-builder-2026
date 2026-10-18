import {createApp} from './server.mjs';
import {fileURLToPath} from 'node:url';
const app = await createApp(fileURLToPath(new URL('../dist-cloud/', import.meta.url)));
const port = Number(process.env.PORT || 8080);
app.listen(port, '127.0.0.1', () => console.log(`Between: http://127.0.0.1:${port}`));
process.on('SIGTERM', () => app.close(() => process.exit(0)));
