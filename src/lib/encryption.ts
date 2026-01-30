import CryptoJS from 'crypto-js';

const KEY = 'iraqcore-supabase-key';

/**
 * Encrypts a string using AES
 */
export const encrypt = (text: string): string => {
    if (!text) return '';
    try {
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
        // Simple check to see if it looks like an AES encrypted string (starts with U2FsdGVkX1)
        // This helps avoid trying to decrypt already plain text if the user hasn't encrypted it yet.
        if (!ciphertext.startsWith('U2FsdGVkX1')) {
            return ciphertext;
        }

        const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);

        // If decryption result is empty, it might have failed or input was invalid
        return originalText || ciphertext;
    } catch (error) {
        // Fallback to original string if decryption fails
        return ciphertext;
    }
};
