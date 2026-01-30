import CryptoJS from 'crypto-js';

const KEY = 'iraqcore-supabase-key';

/**
 * Encrypts a string using AES
 */
export const encrypt = (text: string): string => {
    if (!text) return '';
    try {
        // If it starts with this prefix, it's likely already encrypted.
        // Returning as-is to prevent double-encryption.
        if (text.startsWith('U2FsdGVkX1')) {
            return text;
        }
        return CryptoJS.AES.encrypt(text, KEY).toString();
    } catch (error) {
        console.error('Encryption failed:', error);
        return text;
    }
};

/**
 * Decrypts a string using AES. 
 * If decryption fails or the input is not encrypted, returns the original input.
 */
export const decrypt = (ciphertext: string): string => {
    if (!ciphertext) return '';
    try {
        console.log('[Encryption] Attempting to decrypt:', ciphertext.substring(0, 10) + '...');
        // Simple check to see if it looks like an AES encrypted string (starts with U2FsdGVkX1)
        if (!ciphertext.startsWith('U2FsdGVkX1')) {
            console.log('[Encryption] Not an encrypted string, returning as-is.');
            return ciphertext;
        }

        const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);

        if (!originalText) {
            console.warn('[Encryption] Decryption resulted in empty string, may be wrong key or corrupted data.');
            return ciphertext;
        }

        console.log('[Encryption] Decryption successful.');
        return originalText;
    } catch (error) {
        console.error('[Encryption] Decryption error:', error);
        return ciphertext;
    }
};
