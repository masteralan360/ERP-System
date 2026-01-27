import { isDesktop, isMobile, isTauri, PlatformAPI } from '../lib/platform';

/**
 * Service to handle platform-specific operations
 */
class PlatformService implements PlatformAPI {
    private appDataPath: string = '';

    async initialize() {
        if (isTauri()) {
            try {
                const { appDataDir } = await import('@tauri-apps/api/path');
                this.appDataPath = await appDataDir();
                console.log('[PlatformService] Initialized AppData path:', this.appDataPath);
            } catch (e) {
                console.error('[PlatformService] Failed to get AppData path:', e);
            }
        }
    }

    convertFileSrc(path: string): string {
        if (isTauri()) {
            try {
                let finalPath = path;

                // 1. Resolve relative paths if we have the cached AppData path
                // This handles "product-images/..." -> "C:/Users/.../AppData/.../product-images/..."
                if (this.appDataPath && !path.startsWith('http') && !path.includes(':') && !path.startsWith('/') && !path.startsWith('\\')) {
                    // Normalize everything to forward slashes
                    const cleanAppData = this.appDataPath.replace(/\\/g, '/');
                    const cleanPath = path.replace(/\\/g, '/');

                    const relPath = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
                    const base = cleanAppData.endsWith('/') ? cleanAppData.slice(0, -1) : cleanAppData;

                    finalPath = `${base}/${relPath}`;
                }

                // 2. Use Tauri v2 native converter if available
                const tauri = (window as any).__TAURI__;
                if (tauri?.core?.convertFileSrc) {
                    return tauri.core.convertFileSrc(finalPath);
                }

                // 3. Fallback for older patterns / direct construction
                if ((window as any).__TAURI_INTERNALS__) {
                    const normalizedPath = finalPath.replace(/\\/g, '/');
                    // In v2 on Windows, the protocol is typically https://asset.localhost/
                    const assetUrl = `https://asset.localhost/${normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath}`;
                    return assetUrl;
                }
            } catch (error) {
                console.error('Error converting file src:', error);
            }
        }
        return path;
    }

    async getAppDataDir(): Promise<string> {
        if (isTauri()) {
            const { appDataDir } = await import('@tauri-apps/api/path');
            return appDataDir();
        }
        return '';
    }

    async joinPath(...parts: string[]): Promise<string> {
        if (isTauri()) {
            const { join } = await import('@tauri-apps/api/path');
            return join(...parts);
        }
        return parts.join('/');
    }

    async message(message: string, options?: { title?: string; type?: 'info' | 'warning' | 'error' }): Promise<void> {
        if (isTauri()) {
            const { message: tauriMessage } = await import('@tauri-apps/plugin-dialog');
            await tauriMessage(message, {
                title: options?.title || 'ERP System',
                kind: options?.type as any || 'info'
            });
            return;
        }
        alert(message);
    }

    async confirm(message: string, options?: { title?: string; type?: 'info' | 'warning' | 'error' }): Promise<boolean> {
        if (isTauri()) {
            const { ask } = await import('@tauri-apps/plugin-dialog');
            return ask(message, {
                title: options?.title || 'ERP System',
                kind: options?.type as any || 'info'
            });
        }
        return window.confirm(message);
    }

    async getVersion(): Promise<string> {
        try {
            if (isTauri()) {
                const { getVersion } = await import('@tauri-apps/api/app');
                return await getVersion();
            }
        } catch (e) {
            console.error("Failed to get version:", e);
        }
        return '1.1.10'; // Default fallback
    }

    async relaunch(): Promise<void> {
        if (isDesktop()) {
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
        } else if (isMobile()) {
            // Mobile usually doesn't "relaunch" in the same way, but we can exit or reset
        } else {
            window.location.reload();
        }
    }
    async pickAndSaveImage(workspaceId: string, subDir: string = 'product-images'): Promise<string | null> {
        if (isTauri()) {
            try {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const { mkdir, copyFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');

                const selected = await open({
                    multiple: false,
                    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
                });

                if (selected && typeof selected === 'string') {
                    const ext = selected.split('.').pop();
                    const fileName = `${Date.now()}.${ext}`;
                    const relativeDir = `${subDir}/${workspaceId}`;

                    await mkdir(relativeDir, { baseDir: BaseDirectory.AppData, recursive: true });

                    const relativeDest = `${relativeDir}/${fileName}`;
                    await copyFile(selected, relativeDest, { toPathBaseDir: BaseDirectory.AppData });

                    // Return relative path (e.g. product-images/uuid/123.jpg)
                    return relativeDest;
                }
            } catch (error) {
                console.error('Error picking/saving image in Tauri:', error);
            }
        }

        return null;
    }

    /**
     * Save a downloaded file to AppData using BaseDirectory for mobile compatibility
     */
    async saveDownloadedFile(workspaceId: string, fileName: string, content: ArrayBuffer, subDir: string = 'product-images'): Promise<string | null> {
        if (isTauri()) {
            try {
                const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');

                const relativeDir = `${subDir}/${workspaceId}`;

                // Ensure directory exists in AppData
                await mkdir(relativeDir, { baseDir: BaseDirectory.AppData, recursive: true });

                const relativeDest = `${relativeDir}/${fileName}`;

                // Write file to AppData
                await writeFile(relativeDest, new Uint8Array(content), { baseDir: BaseDirectory.AppData });

                console.log('[PlatformService] Saved file:', relativeDest);
                return relativeDest;
            } catch (error) {
                console.error('[PlatformService] Error saving downloaded file:', error);
                throw error;
            }
        }
        return null;
    }
}

export const platformService = new PlatformService();
