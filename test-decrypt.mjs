
import CryptoJS from 'crypto-js';
const KEY = 'iraqcore-supabase-key';
const encryptedKey = "U2FsdGVkX18aKLikN08Bu/WKXfl/SWOnjCthf9GP0FwnB0WLmrsGu5mV8ufreHtcC1NVjMWZTkbK9+ltQOFf9BNse7xxW7ISIxGGoZ7gqU+++PK8EJaGtD5hzHjHn0nTDa9nuiqtOWUkRM06ebHzygOsp5jCpaOHhimeWTFBIIyb2vCyYh5OkEkdXfjiLRfZiaAKc6DZncE7+Z17+4oBYSMLBWG7+mU3khCE+P9hsKdpd8c4EI/xkSdK0AEqhs7CrDM8CLTPw7sG414o9nSRKf5UuL4M7J0m79TO++H9hgQ=";
const plainKeyExpected = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVib2lzcGFuZ2NheXh4aGVvdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MDM0MjMsImV4cCI6MjA4MzI3OTQyM30.lu57_UFDEtj36FjhQ4WZkbC3kcheWf9sdXqf6o58ORQ";

try {
    const keyBytes = CryptoJS.AES.decrypt(encryptedKey, KEY);
    const decodedKey = keyBytes.toString(CryptoJS.enc.Utf8);

    console.log("Decoded Key:", decodedKey);
    console.log("Expected Key:", plainKeyExpected);
    console.log("Match?", decodedKey === plainKeyExpected);
    console.log("Decoded Length:", decodedKey.length);
    console.log("Expected Length:", plainKeyExpected.length);

    if (decodedKey !== plainKeyExpected) {
        for (let i = 0; i < Math.max(decodedKey.length, plainKeyExpected.length); i++) {
            if (decodedKey[i] !== plainKeyExpected[i]) {
                console.log(`Mismatch at index ${i}: Decoded='${decodedKey[i]}' (${decodedKey.charCodeAt(i)}), Expected='${plainKeyExpected[i]}' (${plainKeyExpected.charCodeAt(i)})`);
                break;
            }
        }
    }
} catch (e) {
    console.error("Error:", e.message);
}
