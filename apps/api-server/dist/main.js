"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const ws_1 = require("ws");
global.WebSocket = ws_1.default;
const fs = require("fs");
const path = require("path");
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
        if (match) {
            const key = match[1].trim();
            let val = match[2].trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1);
            }
            else if (val.startsWith("'") && val.endsWith("'")) {
                val = val.substring(1, val.length - 1);
            }
            process.env[key] = val;
        }
    });
}
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:jamilnawaz036@db.czxoschackeetzspupxh.supabase.co:5432/postgres';
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
    }));
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`[JAMSH BACKEND] API server listening at: http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map