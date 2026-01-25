const baileys = require('@whiskeysockets/baileys')
const makeWASocket = baileys.default || baileys.makeWASocket || baileys
const { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = baileys
const pino = require('pino')
const QRCode = require('qrcode')
const fs = require('fs')
const path = require('path')

const mediaDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'IraqCore', 'whatsapp-media')
    : path.join(__dirname, 'whatsapp-media');

if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

const logger = pino({ level: 'silent' })

// Helper to send data to Tauri
function send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n')
}

// --- SINGLE INSTANCE LOCK & ZOMBIE KILLER ---
const LOCK_FILE = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'IraqCore', 'whatsapp-bridge.pid')
    : path.join(__dirname, 'whatsapp-bridge.pid');

function ensureSingleInstance() {
    try {
        // Create directory if missing
        const dir = path.dirname(LOCK_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        if (fs.existsSync(LOCK_FILE)) {
            const oldPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'));
            if (oldPid && oldPid !== process.pid) {
                try {
                    // Aggressively kill the old process
                    process.kill(oldPid, 'SIGKILL');
                    // Wait a bit for the system to release the sockets
                    const start = Date.now();
                    while (Date.now() - start < 1500) { /* sync sleep */ }
                    console.log(`[Bridge Killer] Terminated zombie process: ${oldPid}`);
                } catch (e) {
                    // Process likely already dead
                }
            }
        }
        // Write our PID
        fs.writeFileSync(LOCK_FILE, process.pid.toString());
    } catch (e) {
        // Ignore errors, don't crash loop
    }
}

// Run killer immediately
ensureSingleInstance();

async function connectToWhatsApp() {
    // 1. Setup Auth State in a local folder
    // Use AppData to avoid triggering Tauri watcher rebuilds
    const authDir = process.env.APPDATA
        ? path.join(process.env.APPDATA, 'IraqCore', 'whatsapp-auth')
        : path.join(__dirname, 'auth_info_baileys');

    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    // 2. Initialize Socket
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['IraqCore ERP', 'Desktop', '1.0.0']
    })

    // 3. Listen for Credential Updates
    sock.ev.on('creds.update', saveCreds)

    // 4. Handle Connection State
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            try {
                // Generate QR as DataURL for the React UI to display
                const dataUrl = await QRCode.toDataURL(qr)
                send({ type: 'qr', data: dataUrl })
            } catch (err) {
                send({ type: 'error', data: 'Failed to generate QR' })
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            // Detailed logging for debugging
            process.stderr.write(JSON.stringify({
                type: 'debug',
                message: `Connection closed. Status: ${statusCode}, Reconnecting: ${shouldReconnect}`,
                error: lastDisconnect?.error?.message,
                stack: lastDisconnect?.error?.stack
            }) + '\n')

            // Handle 401 Unauthorized / Session Invalidated / 440 Conflict
            if (statusCode === 401 || statusCode === 403 || statusCode === 440 || statusCode === DisconnectReason.loggedOut) {
                const isConflict = statusCode === 440;
                logger.info(isConflict ? 'Session conflict. Exiting...' : 'Session invalid or logged out. Clearing auth data...')

                if (!isConflict) {
                    fs.rmSync(authDir, { recursive: true, force: true })
                }

                // Exit. If it was a conflict, the "other" process wins. 
                // If it was unauthorized, we've cleared data for a fresh start.
                process.exit(0)
            }

            send({
                type: 'status',
                data: 'disconnected',
                reason: statusCode,
                reconnecting: shouldReconnect
            })

            if (shouldReconnect) {
                // Add a 3s delay to prevent rapid thrashing loops
                setTimeout(() => {
                    connectToWhatsApp()
                }, 3000)
            }
        } else if (connection === 'open') {
            send({ type: 'status', data: 'connected' })
        }
    })

    // 5. Handle Incoming AND Outgoing Messages (Sync from Phone)
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
            for (const msg of m.messages) {
                if (msg.message) {
                    // Resolve the actual number (Handling LIDs)
                    let remoteJid = msg.key.remoteJid;
                    if (remoteJid.endsWith('@lid') && msg.key.remoteJidAlt) {
                        remoteJid = msg.key.remoteJidAlt;
                    }

                    const messageType = Object.keys(msg.message)[0];
                    let mediaData = null;

                    // Handle Media
                    if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(messageType)) {
                        try {
                            const buffer = await downloadMediaMessage(
                                msg,
                                'buffer',
                                {},
                                { logger, reuploadRequest: sock.updateMediaMessage }
                            );

                            const mimetype = msg.message[messageType].mimetype || '';
                            const extension = mimetype.split('/')[1]?.split(';')[0] || 'bin';
                            const fileName = `${msg.key.id}.${extension}`;
                            const filePath = path.join(mediaDir, fileName);

                            fs.writeFileSync(filePath, buffer);

                            mediaData = {
                                url: filePath.replace(/\\/g, '/'),
                                type: messageType === 'audioMessage' && msg.message[messageType].ptt ? 'voice' : messageType.replace('Message', ''),
                                caption: msg.message[messageType].caption || ''
                            };
                        } catch (err) {
                            console.error('[Media Sync Error]:', err);
                        }
                    }

                    const messageBody = msg.message.conversation ||
                        msg.message.extendedTextMessage?.text ||
                        msg.message[messageType]?.caption ||
                        (mediaData ? `[${mediaData.type}]` : 'Media Message');

                    if (msg.key.fromMe) {
                        // Outgoing message sent from the phone - sync to UI
                        send({
                            type: 'outgoing_message_sync',
                            data: {
                                id: msg.key.id,
                                to: remoteJid.split('@')[0],
                                body: messageBody,
                                timestamp: msg.messageTimestamp * 1000,
                                media_url: mediaData?.url,
                                media_type: mediaData?.type
                            }
                        })
                    } else {
                        // Incoming message
                        send({
                            type: 'incoming_message',
                            data: {
                                id: msg.key.id,
                                from: remoteJid.split('@')[0],
                                body: messageBody,
                                timestamp: msg.messageTimestamp * 1000,
                                pushName: msg.pushName,
                                media_url: mediaData?.url,
                                media_type: mediaData?.type
                            }
                        })
                    }
                }
            }
        }
    })

    // 6. Listen for Commands from React/Tauri via Stdin
    process.stdin.on('data', async (data) => {
        try {
            const raw = data.toString().trim()
            if (!raw) return

            const command = JSON.parse(raw)
            if (command.type === 'send_message') {
                const { to, text } = command.data
                const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`

                // Anti-Ban Safety Step 1: Simulate "Typing..." state
                await sock.presenceSubscribe(jid)

                // Anti-Ban Safety Step 2: Random human-like typing delay
                // Simulate typing in a loop so the indicator stays active
                const typingTime = Math.min(Math.max(text.length * 50, 1500), 5000);
                const startTime = Date.now();

                while (Date.now() - startTime < typingTime) {
                    await sock.sendPresenceUpdate('composing', jid);
                    // Typing indicators usually stay for 2-3 seconds, so we refresh it
                    await baileys.delay(1800);
                }

                // Stop typing and send
                await sock.sendPresenceUpdate('paused', jid)
                const result = await sock.sendMessage(jid, { text })

                send({
                    type: 'message_sent',
                    id: command.id,
                    data: result
                })
            }
        } catch (e) {
            // Silently ignore malformed JSON or other errors
        }
    })
    // 7. Auto-terminate if parent process closes stdin (Anti-Zombie)
    process.stdin.on('close', () => {
        process.exit(0)
    })

    process.stdin.on('end', () => {
        process.exit(0)
    })
}

// Start the engine
send({ type: 'status', data: 'initializing' })
connectToWhatsApp().catch(err => {
    process.stderr.write(JSON.stringify({ type: 'error', data: err.message }) + '\n')
})
