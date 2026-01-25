import { db } from '@/local-db/database';
import { WhatsAppConversation, WhatsAppMessage } from '@/local-db/models';
import { v4 as uuidv4 } from 'uuid';

/**
 * WhatsApp Integration Service (Local-Only Storage)
 */
export const whatsappService = {
    /**
     * Send a text message via WhatsApp
     */
    async sendMessage(conversationId: string, text: string): Promise<WhatsAppMessage> {
        // Enforce online check (should also be checked in UI)
        if (!navigator.onLine) {
            throw new Error('Offline: WhatsApp is unavailable.');
        }

        // 1. Mock API implementation (SIMULATED)
        // In a real implementation, this would be an API call to a WhatsApp provider
        const isSuccess = true;

        // 2. Create message object
        const message: WhatsAppMessage = {
            id: uuidv4(),
            conversation_id: conversationId,
            direction: 'out',
            body: text,
            timestamp: Date.now(),
            status: isSuccess ? 'sent' : 'failed'
        };

        // 3. Save to local Dexie (MANDATORY)
        await db.whatsapp_messages.add(message);

        return message;
    },

    /**
     * Receive a message (triggered by simulated webhook or polling)
     */
    async receiveMessage(customerPhone: string, text: string): Promise<WhatsAppMessage> {
        // 1. Resolve conversation by phone
        let conversation = await db.whatsapp_conversations.where('customer_phone').equals(customerPhone).first();

        // 2. Create conversation if it doesn't exist
        if (!conversation) {
            conversation = {
                id: uuidv4(),
                customer_phone: customerPhone,
                created_at: Date.now()
            };
            await db.whatsapp_conversations.add(conversation);
        }

        // 3. Create and save message
        const message: WhatsAppMessage = {
            id: uuidv4(),
            conversation_id: conversation.id,
            direction: 'in',
            body: text,
            timestamp: Date.now(),
            status: 'received'
        };

        await db.whatsapp_messages.add(message);

        return message;
    },

    /**
     * Get all conversations
     */
    async getConversations(): Promise<WhatsAppConversation[]> {
        return await db.whatsapp_conversations.orderBy('created_at').reverse().toArray();
    },

    /**
     * Get messages for a conversation
     */
    async getMessages(conversationId: string): Promise<WhatsAppMessage[]> {
        return await db.whatsapp_messages
            .where('conversation_id')
            .equals(conversationId)
            // Sorting by timestamp
            .toArray()
            .then(msgs => msgs.sort((a, b) => a.timestamp - b.timestamp));
    },

    /**
     * Create a new conversation manually
     */
    async createConversation(customerPhone: string): Promise<WhatsAppConversation> {
        const existing = await db.whatsapp_conversations.where('customer_phone').equals(customerPhone).first();
        if (existing) return existing;

        const conversation: WhatsAppConversation = {
            id: uuidv4(),
            customer_phone: customerPhone,
            created_at: Date.now()
        };
        await db.whatsapp_conversations.add(conversation);
        return conversation;
    }
};
