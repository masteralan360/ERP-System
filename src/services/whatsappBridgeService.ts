import { Command } from '@tauri-apps/plugin-shell';
import { db } from '@/local-db/database';
import { v4 as uuidv4 } from 'uuid';

export interface BridgeEvent {
    type: 'qr' | 'status' | 'incoming_message' | 'message_sent' | 'error' | 'initializing';
    data?: any;
    id?: string;
}

class WhatsAppBridgeService {
    private child: any = null;
    private status: string = 'idle';
    private currentListener: ((event: BridgeEvent) => void) | null = null;
    private isStarting: boolean = false;

    async start(onEvent: (event: BridgeEvent) => void) {
        this.currentListener = onEvent;

        // If already connected and handle is valid, just report status
        if (this.child) {
            onEvent({ type: 'status', data: this.status });
            return;
        }

        // Prevent multiple simultaneous spawn attempts
        if (this.isStarting) return;
        this.isStarting = true;

        try {
            console.log('[WhatsAppBridgeService] Spawning WhatsApp engine...');
            onEvent({ type: 'status', data: 'initializing' });

            const command = Command.create('node', ['../whatsapp-bridge/index.js']);

            command.stdout.on('data', (line) => {
                try {
                    const event: BridgeEvent = JSON.parse(line);
                    this.handleInternalEvent(event);
                } catch (e) {
                    console.log('[Bridge Output]:', line);
                }
            });

            command.stderr.on('data', (line) => {
                console.error('[Bridge Error]:', line);
            });

            const newChild = await command.spawn();

            command.on('close', data => {
                console.log(`[WhatsAppBridgeService] Engine process closed (Code: ${data.code})`);

                // Only reset state if the process that died is the one we currently think is active
                if (this.child === newChild) {
                    this.status = 'disconnected';
                    this.child = null;
                    if (this.currentListener) {
                        this.currentListener({ type: 'status', data: 'disconnected' });
                    }
                }
            });

            this.child = newChild;
            this.status = 'running';
            onEvent({ type: 'status', data: 'running' });

        } catch (error) {
            console.error('[WhatsAppBridgeService] Critical Spawn Error:', error);
            this.status = 'error';
            onEvent({ type: 'error', data: error });
        } finally {
            this.isStarting = false;
        }
    }

    private async handleInternalEvent(event: BridgeEvent) {
        if (event.type === 'status') {
            this.status = event.data;
        }

        if (event.type === 'incoming_message') {
            await this.saveIncomingMessage(event.data);
        }

        // Handle messages sent from phone (sync to UI)
        if ((event as any).type === 'outgoing_message_sync') {
            await this.saveOutgoingMessage((event as any).data);
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

            // Check if message already exists to avoid duplicates
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
            console.error('[WhatsAppBridgeService] Message Persistence Error:', err);
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

            // Check if message already exists to avoid duplicates
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
            console.error('[WhatsAppBridgeService] Outgoing Message Sync Error:', err);
        }
    }

    async sendMessage(to: string, text: string) {
        if (!this.child) {
            console.error('[WhatsAppBridgeService] Cannot send: Child handle is null. Service may have been nulled by a close event.');
            throw new Error('Bridge not started');
        }

        const messageId = uuidv4();
        try {
            await this.child.write(JSON.stringify({
                type: 'send_message',
                id: messageId,
                data: { to, text }
            }) + '\n');
            return messageId;
        } catch (err) {
            console.error('[WhatsAppBridgeService] Write Error (Stdin):', err);
            throw err;
        }
    }

    async stop() {
        if (this.child) {
            try {
                await this.child.kill();
                console.log('[WhatsAppBridgeService] Engine killed cleanly');
            } catch (e) {
                // Ignore
            }
            this.child = null;
            this.status = 'idle';
        }
    }

    getStatus() {
        return this.status;
    }
}

export const whatsappBridgeService = new WhatsAppBridgeService();
