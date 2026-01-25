const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Helper to send data back to Tauri
function send(data) {
    process.stdout.write(JSON.stringify(data) + '\n');
}

// Helper to clean phone numbers (mirroring Baileys fix)
async function getCleanNumber(jid) {
    if (!jid) return '';
    try {
        const contact = await client.getContactById(jid);
        if (contact && contact.number) {
            return contact.number;
        }
    } catch (e) {
        // Fallback to extraction
    }
    // Fallback: Strip everything except digits from prefix
    return jid.split('@')[0].replace(/\D/g, '');
}

// Global Error Catching for easy debugging
process.on('uncaughtException', (err) => {
    send({ type: 'error', data: `Uncaught Exception: ${err.message}`, stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
    send({ type: 'error', data: `Unhandled Rejection: ${reason}` });
});

const mediaDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'IraqCore', 'whatsapp-media')
    : path.join(__dirname, 'whatsapp-media');

if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

// Proactive Lock Clearing for Puppeteer
const sessionPath = path.join(mediaDir, '..', 'wwebjs-auth', 'session-experimental-web');

console.log(`[Bridge Version Check] V2.4 (CimInstance + Simple Filter) - TZ: ${new Date().toISOString()}`);

// Surgical Zombie Killer: Find and kill chrome processes using THIS specific session directory
if (process.platform === 'win32') {
    try {
        const { execSync } = require('child_process');
        // Simple and robust: find any chrome with our unique session string and kill it
        const psCmd = "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { try { (Get-WmiObject Win32_Process -Filter \\\"ProcessId=$($_.Id)\\\").CommandLine -like '*session-experimental-web*' } catch { $false } } | Stop-Process -Force";
        execSync(`powershell -Command "${psCmd}"`);
        console.log('[Bridge Log] Cleaned up zombie Chromium processes (V2.4)');
    } catch (err) {
        // Ignore errors if no processes found
    }
}

const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

if (fs.existsSync(sessionPath)) {
    // Wait a brief moment for OS to release files after process kill
    const startWait = new Date(new Date().getTime() + 1000);
    while (startWait > new Date()) { }

    lockFiles.forEach(file => {
        const filePath = path.join(sessionPath, file);
        if (fs.existsSync(filePath)) {
            // Retry loop for stubborn locks
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`[Bridge Log] Removed stale lock: ${file} (Attempt ${attempt})`);
                    break;
                } catch (err) {
                    if (attempt === 3) {
                        console.error(`[Bridge Warning] Could not remove lock ${file} after 3 attempts.`);
                    } else {
                        const waitTill = new Date(new Date().getTime() + 300);
                        while (waitTill > new Date()) { }
                    }
                }
            }
        }
    });
}

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'experimental-web',
        dataPath: path.join(mediaDir, '..', 'wwebjs-auth')
    }),
    puppeteer: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

console.log(`[Bridge Log] Session data path: ${path.join(mediaDir, '..', 'wwebjs-auth', 'session-experimental-web')}`);

client.on('qr', async (qr) => {
    try {
        const url = await qrcode.toDataURL(qr);
        send({ type: 'qr', data: url });
    } catch (err) {
        send({ type: 'error', data: 'Failed to generate QR code' });
    }
});

client.on('ready', () => {
    send({ type: 'status', data: 'connected' });
});

client.on('authenticated', () => {
    send({ type: 'status', data: 'authenticated' });
});

client.on('auth_failure', (msg) => {
    send({ type: 'status', data: 'error', message: msg });
});

client.on('disconnected', (reason) => {
    send({ type: 'status', data: 'disconnected', reason });
});

client.on('message', async (msg) => {
    // Incoming Message
    let mediaData = null;
    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            const fileName = `${msg.id.id}.${media.mimetype.split('/')[1].split(';')[0] || 'bin'}`;
            const filePath = path.join(mediaDir, fileName);
            fs.writeFileSync(filePath, media.data, 'base64');
            mediaData = {
                url: filePath.replace(/\\/g, '/'),
                type: media.mimetype.includes('image') ? 'image' :
                    media.mimetype.includes('video') ? 'video' :
                        media.mimetype.includes('audio') ? 'audio' : 'document'
            };
        } catch (err) {
            console.error('Media download error:', err);
        }
    }

    send({
        type: 'incoming_message',
        data: {
            id: msg.id.id,
            from: await getCleanNumber(msg.from),
            body: msg.body || (mediaData ? `[${mediaData.type}]` : ''),
            timestamp: msg.timestamp * 1000,
            media_url: mediaData?.url,
            media_type: mediaData?.type
        }
    });
});

client.on('message_create', async (msg) => {
    // Sent Message (Sync from phone or ERP)
    if (msg.fromMe) {
        let mediaData = null;
        if (msg.hasMedia) {
            try {
                // To avoid redownloading what we just sent from ERP, 
                // we'd check if the file exists, but for sync from phone it's needed.
                const media = await msg.downloadMedia();
                if (media) {
                    const fileName = `${msg.id.id}.${media.mimetype.split('/')[1].split(';')[0] || 'bin'}`;
                    const filePath = path.join(mediaDir, fileName);
                    if (!fs.existsSync(filePath)) {
                        fs.writeFileSync(filePath, media.data, 'base64');
                    }
                    mediaData = {
                        url: filePath.replace(/\\/g, '/'),
                        type: media.mimetype.includes('image') ? 'image' :
                            media.mimetype.includes('video') ? 'video' :
                                media.mimetype.includes('audio') ? 'audio' : 'document'
                    };
                }
            } catch (err) {
                // Just log it
            }
        }

        send({
            type: 'outgoing_message_sync',
            data: {
                id: msg.id.id,
                to: await getCleanNumber(msg.to),
                body: msg.body || (mediaData ? `[${mediaData.type}]` : ''),
                timestamp: msg.timestamp * 1000,
                media_url: mediaData?.url,
                media_type: mediaData?.type
            }
        });
    }
});

// Implementation of command listener
process.stdin.on('data', async (data) => {
    try {
        const command = JSON.parse(data.toString().trim());

        if (command.type === 'stop') {
            send({ type: 'status', data: 'stopping' });
            if (client) {
                try {
                    await client.destroy();
                    send({ type: 'status', data: 'disconnected' });
                } catch (e) {
                    console.error('Error destroying client:', e);
                }
            }
            process.exit(0);
        }

        if (command.type === 'send_message') {
            const { to, text } = command.data;
            const chat = await client.getChatById(`${to}@c.us`);

            // Anti-Ban: Simulating typing
            await chat.sendStateTyping();

            // Random delay based on text length
            const delay = Math.min(Math.max(text.length * 50, 1500), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));

            await chat.clearState();
            const result = await client.sendMessage(`${to}@c.us`, text);

            send({
                type: 'message_sent',
                id: command.id,
                data: { id: result.id.id }
            });
        }
    } catch (err) {
        // Error handling
    }
});

process.stdin.on('close', async () => {
    if (client) await client.destroy().catch(() => { });
    process.exit(0);
});

process.on('SIGINT', async () => {
    if (client) await client.destroy().catch(() => { });
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (client) await client.destroy().catch(() => { });
    process.exit(0);
});

// Final startup with safety delay
setTimeout(() => {
    client.initialize().catch(err => {
        send({ type: 'error', data: `Initialization Error: ${err.message}` });
    });
}, 2000);
