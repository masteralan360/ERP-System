import { db } from './database'

export async function getAppSetting(key: string): Promise<string | undefined> {
    const setting = await db.app_settings.get(key)
    return setting?.value
}

export async function setAppSetting(key: string, value: string): Promise<void> {
    await db.app_settings.put({ key, value })
    // Mirror to localStorage for synchronous access on startup
    localStorage.setItem(`app_setting_${key}`, value)
}

export function getAppSettingSync(key: string): string | null {
    return localStorage.getItem(`app_setting_${key}`)
}
