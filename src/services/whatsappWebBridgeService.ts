import { Command } from '@tauri-apps/plugin-shell';
import { db } from '@/local-db/database';
import { v4 as uuidv4 } from 'uuid';

export type BridgeStatus = 'initializing' | 'running' | 'connected' | 'disconnected' | 'authenticated' | 'error' | 'qr';

export interface BridgeEvent {
    type: BridgeStatus | 'status' | 'incoming_message' | 'outgoing_message_sync' | 'message_sent';
    data: any;
    message?: string;
}

class WhatsAppWebBridgeService {
    private child: any = null;
    public status: BridgeStatus = 'disconnected';
    private currentListener: ((event: BridgeEvent) => void) | null = null;
    private isStarting = false;
    private isStopping = false;
    private stopPromise: Promise<void> | null = null;

    async stop() {
        if (this.child && !this.isStopping) {
            this.isStopping = true;
            this.stopPromise = (async () => {
                try {
                    console.log('[WhatsAppWebBridge] Initiating graceful shutdown...');

                    const closePromise = new Promise<void>((resolve) => {
                        const timeout = setTimeout(() => {
                            console.log('[WhatsAppWebBridge] Shutdown timeout, forcing kill');
                            resolve();
                        }, 4000);

                        if (this.child) {
                            this.child.on('close', () => {
                                clearTimeout(timeout);
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    });

                    // Try clean command first
                    await this.child.write(JSON.stringify({ type: 'stop' }) + '\n').catch(() => { });

                    // Then kill just in case
                    await this.child.kill().catch(() => { });

                    await closePromise;
                    console.log('[WhatsAppWebBridge] Engine stopped and released');
                } catch (e) {
                    console.error('[WhatsAppWebBridge] Error during stop:', e);
                } finally {
                    this.child = null;
                    this.status = 'disconnected';
                    this.isStopping = false;
                    this.stopPromise = null;
                }
            })();
            return this.stopPromise;
        } else if (this.isStopping) {
            return this.stopPromise;
        }
    }

    async start(onEvent: (event: BridgeEvent) => void) {
        // If stopping, wait for it to finish first
        if (this.isStopping && this.stopPromise) {
            console.log('[WhatsAppWebBridge] Start requested while stopping, awaiting cleanup...');
            await this.stopPromise;
        }

        // If already starting or running, don't overlap
        if (this.isStarting) return;
        if (this.child) {
            onEvent({ type: 'status', data: this.status });
            return;
        }

        this.isStarting = true;
        this.currentListener = onEvent;

        try {
            // Extra safety: wait a moment for any ghost processes to fully release files
            await new Promise(resolve => setTimeout(resolve, 1000));

            console.log('[WhatsAppWebBridge] Spawning experimental engine...');
            onEvent({ type: 'status', data: 'initializing' });

            // Using the same pathing pattern as the stable bridge
            const command = Command.create('node', [
                '../whatsapp-web-bridge/index.js'
            ]);

            command.on('close', (data: any) => {
                console.log(`[WhatsAppWebBridge] Engine process closed with code ${data.code}`);
                this.status = 'disconnected';
                this.child = null;
                if (this.currentListener) {
                    this.currentListener({ type: 'status', data: 'disconnected' });
                    this.currentListener({ type: 'disconnected', data: data.code });
                }
            });

            command.on('error', (error: any) => {
                console.error('[WhatsAppWebBridge] Engine process error:', error);
                this.status = 'error';
                if (this.currentListener) {
                    this.currentListener({ type: 'error', data: error });
                }
            });

            command.stdout.on('data', (line: string) => {
                // Robust parsing: process output line by line and only attempt JSON parse on likely objects
                const lines = line.split('\n');
                for (const rawLine of lines) {
                    const trimmed = rawLine.trim();
                    if (!trimmed) continue;

                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        try {
                            const event = JSON.parse(trimmed);
                            this.handleInternalEvent(event);
                        } catch (err) {
                            // Non-JSON object logs
                        }
                    } else {
                        console.log('[WhatsAppWebBridge Output]:', trimmed);
                    }
                }
            });

            command.stderr.on('data', (line: string) => {
                const message = line.trim();
                console.error('[WhatsAppWebBridge Error Logs]:', message);
                // Propagate stderr as error if it contains crash-related keywords or if we haven't connected yet
                if (this.status !== 'connected' && this.currentListener) {
                    this.currentListener({ type: 'error', data: message });
                }
            });

            const handle = await command.spawn();
            this.child = handle;
            this.status = 'running';
            console.log('[WhatsAppWebBridge] Engine spawned successfully');

        } catch (error) {
            console.error('[WhatsAppWebBridge] Failed to start engine:', error);
            this.status = 'error';
            onEvent({ type: 'error', data: error });
        } finally {
            this.isStarting = false;
        }
    }

    private async handleInternalEvent(event: BridgeEvent) {
        if (event.type === 'status' || (event.type as string) === 'status') {
            this.status = (event as any).data;
        }

        if (event.type === 'incoming_message') {
            await this.saveIncomingMessage(event.data);
        }

        if (event.type === 'outgoing_message_sync') {
            await this.saveOutgoingMessage(event.data);
        }

        if (this.currentListener) {
            this.currentListener(event);
        }
    }

    private async saveIncomingMessage(data: any) {
        try {
            let conv = await db.whatsapp_conversations.where('customer_phone').equals(data.from).first();
            if (!conv) {
                conv = {
                    id: uuidv4(),
                    customer_phone: data.from,
                    created_at: Date.now()
                };
                await db.whatsapp_conversations.add(conv);
            }

            const existing = await db.whatsapp_messages.get(data.id);
            if (existing) return;

            await db.whatsapp_messages.add({
                id: data.id || uuidv4(),
                conversation_id: conv.id,
                direction: 'in',
                body: data.body,
                timestamp: data.timestamp || Date.now(),
                status: 'received',
                media_url: data.media_url,
                media_type: data.media_type
            });
        } catch (err) {
            console.error('[WhatsAppWebBridgeService] Persistence Error:', err);
        }
    }

    private async saveOutgoingMessage(data: any) {
        try {
            let conv = await db.whatsapp_conversations.where('customer_phone').equals(data.to).first();
            if (!conv) {
                conv = {
                    id: uuidv4(),
                    customer_phone: data.to,
                    created_at: Date.now()
                };
                await db.whatsapp_conversations.add(conv);
            }

            const existing = await db.whatsapp_messages.get(data.id);
            if (existing) return;

            await db.whatsapp_messages.add({
                id: data.id || uuidv4(),
                conversation_id: conv.id,
                direction: 'out',
                body: data.body,
                timestamp: data.timestamp || Date.now(),
                status: 'sent',
                media_url: data.media_url,
                media_type: data.media_type
            });
        } catch (err) {
            console.error('[WhatsAppWebBridgeService] Persistence Error:', err);
        }
    }

    async sendMessage(to: string, text: string) {
        if (!this.child) throw new Error('Bridge not started');

        const messageId = uuidv4();
        await this.child.write(JSON.stringify({
            type: 'send_message',
            id: messageId,
            data: { to, text }
        }) + '\n');
        return messageId;
    }
}

export const whatsappWebBridgeService = new WhatsAppWebBridgeService();
