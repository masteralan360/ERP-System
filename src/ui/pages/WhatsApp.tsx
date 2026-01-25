import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/auth'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useWorkspace } from '@/workspace'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/local-db/database'
import { whatsappBridgeService, BridgeEvent } from '@/services/whatsappBridgeService'
import { cn } from '@/lib/utils'
import {
    Search,
    Plus,
    MessageSquare,
    Send,
    Phone,
    User,
    WifiOff,
    Shield,
    MoreVertical,
    Check,
    CheckCheck,
    AlertCircle,
    Loader2,
    History as HistoryIcon,
    QrCode,
    RefreshCw,
    Link as LinkIcon,
    Trash2,
    FileText,
    Mic,
    Play
} from 'lucide-react'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'

export default function WhatsApp() {
    const { user } = useAuth()
    const { hasFeature } = useWorkspace()
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
    const [messageInput, setMessageInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [isLoading, setIsLoading] = useState(false)
    const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'initializing' | 'running' | 'connected' | 'disconnected' | 'error'>('idle')
    const [qrData, setQrData] = useState<string | null>(null)
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    // Data Queries
    const conversations = useLiveQuery(() =>
        db.whatsapp_conversations.orderBy('created_at').reverse().toArray()
    )

    const messages = useLiveQuery(async () => {
        if (!selectedConvId) return []
        const msgs = await db.whatsapp_messages
            .where('conversation_id')
            .equals(selectedConvId)
            .toArray();
        return msgs.sort((a, b) => a.timestamp - b.timestamp);
    }, [selectedConvId])

    const selectedConv = conversations?.find(c => c.id === selectedConvId)

    // Bridge Implementation
    useEffect(() => {
        const initBridge = async () => {
            try {
                await whatsappBridgeService.start((event: BridgeEvent) => {
                    console.log('[WhatsApp Bridge Event]:', event.type, event.data);

                    if (event.type === 'qr') {
                        setQrData(event.data);
                        setBridgeStatus('disconnected');
                    } else if (event.type === 'status') {
                        setBridgeStatus(event.data);
                        if (event.data === 'connected') {
                            setQrData(null);
                        }
                    }
                });
            } catch (err) {
                console.error('Bridge failed to start:', err);
            }
        };

        if (hasFeature('allow_whatsapp')) {
            initBridge();
        }

        return () => {
            // Stop the bridge when leaving the page or refreshing to prevent orphan processes
            whatsappBridgeService.stop();
        };
    }, [hasFeature]);

    // Online Status Tracking
    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    // Reset menu when switching conversations
    useEffect(() => {
        setActiveMenuId(null)
    }, [selectedConvId])

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Check if click is inside the header menu ref
            const isInsideHeaderMenu = menuRef.current?.contains(target);

            // Check if click is inside a sidebar menu item (using a data attribute or class)
            const isInsideSidebarMenu = target.closest('.sidebar-menu-container');

            if (!isInsideHeaderMenu && !isInsideSidebarMenu) {
                setActiveMenuId(null)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    // Permission check
    const isAllowed = user?.role === 'admin' || user?.role === 'staff'
    const isEnabled = hasFeature('allow_whatsapp')

    if (!isEnabled) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-in fade-in zoom-in duration-500">
                <div className="p-6 bg-amber-500/10 rounded-full mb-6 text-amber-500 shadow-xl shadow-amber-500/5">
                    <Shield className="w-16 h-16" />
                </div>
                <h2 className="text-3xl font-black mb-3">Feature Disabled</h2>
                <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
                    WhatsApp integration is currently disabled for this workspace. Please contact your administrator.
                </p>
            </div>
        )
    }

    if (!isAllowed) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-in fade-in zoom-in duration-500">
                <div className="p-6 bg-destructive/10 rounded-full mb-6 text-destructive shadow-xl shadow-destructive/5">
                    <Shield className="w-16 h-16" />
                </div>
                <h2 className="text-3xl font-black mb-3">Access Denied</h2>
                <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
                    You don't have permission to use the WhatsApp feature. Only Admins and Staff can access this page.
                </p>
            </div>
        )
    }

    const handleSendMessage = async () => {
        if (!selectedConvId || !messageInput.trim() || !selectedConv) return
        if (bridgeStatus !== 'connected') return

        setIsLoading(true)
        try {
            const tempId = await whatsappBridgeService.sendMessage(selectedConv.customer_phone, messageInput);

            // Optimistically save to Dexie as 'sending'
            await db.whatsapp_messages.add({
                id: tempId,
                conversation_id: selectedConvId,
                direction: 'out',
                body: messageInput,
                timestamp: Date.now(),
                status: 'sent' // Bridge currently returns success once sent to socket
            });

            setMessageInput('')
        } catch (error) {
            console.error('Failed to send message:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleNewChat = async () => {
        const phone = prompt('Enter customer phone number (international format, e.g., 9647701234567):')
        if (phone && phone.trim()) {
            const cleanPhone = phone.trim().replace('+', '');
            let conv = await db.whatsapp_conversations.where('customer_phone').equals(cleanPhone).first();
            if (!conv) {
                const id = crypto.randomUUID();
                await db.whatsapp_conversations.add({
                    id,
                    customer_phone: cleanPhone,
                    created_at: Date.now()
                });
                setSelectedConvId(id);
            } else {
                setSelectedConvId(conv.id);
            }
        }
    }

    const handleDeleteConversation = async (id: string) => {
        const convId = id || selectedConvId;
        if (!convId) return
        if (!confirm('Are you sure you want to delete this conversation? All messages will be lost.')) return

        try {
            await db.transaction('rw', db.whatsapp_conversations, db.whatsapp_messages, async () => {
                await db.whatsapp_messages.where('conversation_id').equals(convId).delete();
                await db.whatsapp_conversations.delete(convId);
            });
            if (selectedConvId === convId) setSelectedConvId(null);
            setActiveMenuId(null);
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    }

    const filteredConversations = conversations?.filter(c =>
        c.customer_phone.includes(searchQuery)
    )

    const [hasConnectedBefore, setHasConnectedBefore] = useState(false)

    // ... (inside useEffect or handler)
    useEffect(() => {
        if (bridgeStatus === 'connected') {
            setHasConnectedBefore(true)
        }
    }, [bridgeStatus])

    // Helper to safely get media URL for Tauri v2
    const getMediaUrl = (path?: string) => {
        if (!path) return '';

        // 1. Normalize slashes (Tauri protocol likes forward slashes)
        let normalized = path.replace(/\\/g, '/');

        // 2. Strip asset:// if it's there from old database entries
        if (normalized.startsWith('asset://')) {
            normalized = normalized.replace('asset://', '');
        }

        // 3. Fix Windows drive letter encoding (e.g. C/Users -> C:/Users)
        // Check for "C/" shape at the start
        if (/^[a-zA-Z]\//.test(normalized)) {
            normalized = normalized.charAt(0) + ':' + normalized.slice(1);
        }

        try {
            return convertFileSrc(normalized);
        } catch (e) {
            console.error('Failed to convert file src:', e);
            return '';
        }
    };

    // --- Pairing Screen UI (Only if never connected or explicitly disconnected with QR) ---
    // If we have connected before, we prefer to show the chat UI with a "Reconnecting" badge
    // rather than reverting to the full screen pairing view, UNLESS we really need to re-pair (new QR).
    const showPairingScreen = (!hasConnectedBefore && bridgeStatus !== 'connected') || (qrData && bridgeStatus === 'disconnected');

    if (showPairingScreen && qrData && qrData.startsWith('data:image')) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-12 bg-background rounded-[2.5rem] border border-border/50 shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-primary/5 p-8 rounded-[3.5rem] mb-10 border border-primary/10 relative">
                    <div className="absolute -top-4 -right-4 bg-emerald-500 text-white p-3 rounded-2xl shadow-lg animate-bounce">
                        <LinkIcon className="w-6 h-6" />
                    </div>
                    <img src={qrData} alt="WhatsApp QR Code" className="w-64 h-64 rounded-2xl shadow-2xl border-4 border-white dark:border-white/10" />
                </div>

                <h2 className="text-4xl font-black mb-4 tracking-tighter">Link WhatsApp Device</h2>
                <p className="text-muted-foreground max-w-lg text-lg leading-relaxed mb-10 font-medium">
                    Open WhatsApp on your phone, go to <span className="text-primary font-bold">Linked Devices</span> and scan this QR code to start using local chat.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
                    <div className="p-6 bg-muted/30 rounded-3xl border border-border/50 space-y-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary mx-auto">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-sm">End-to-End Private</h4>
                        <p className="text-[11px] text-muted-foreground">Encryption is maintained by WhatsApp. No data is stored on our servers.</p>
                    </div>
                    <div className="p-6 bg-muted/30 rounded-3xl border border-border/50 space-y-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary mx-auto">
                            <WifiOff className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-sm">Local Storage</h4>
                        <p className="text-[11px] text-muted-foreground">Your chat history stays only on this PC in a secure local database.</p>
                    </div>
                    <div className="p-6 bg-muted/30 rounded-3xl border border-border/50 space-y-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary mx-auto">
                            <QrCode className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-sm">Auto Reconnect</h4>
                        <p className="text-[11px] text-muted-foreground">Once linked, the app will automatically reconnect whenever you start it.</p>
                    </div>
                </div>

                <div className="mt-12 flex items-center gap-3 text-muted-foreground/40 text-[11px] font-black uppercase tracking-[0.3em]">
                    <RefreshCw className="w-4 h-4 animate-spin-slow" />
                    Waiting for scanner...
                </div>
            </div>
        )
    }

    // --- Pairing Screen UI ---
    if (bridgeStatus === 'disconnected' && qrData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-12 bg-background rounded-[2.5rem] border border-border/50 shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-primary/5 p-8 rounded-[3.5rem] mb-10 border border-primary/10 relative">
                    <div className="absolute -top-4 -right-4 bg-emerald-500 text-white p-3 rounded-2xl shadow-lg animate-bounce">
                        <LinkIcon className="w-6 h-6" />
                    </div>
                    <img src={qrData} alt="WhatsApp QR Code" className="w-64 h-64 rounded-2xl shadow-2xl border-4 border-white dark:border-white/10" />
                </div>

                <h2 className="text-4xl font-black mb-4 tracking-tighter">Link WhatsApp Device</h2>
                <p className="text-muted-foreground max-w-lg text-lg leading-relaxed mb-10 font-medium">
                    Open WhatsApp on your phone, go to <span className="text-primary font-bold">Linked Devices</span> and scan this QR code to start using local chat.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
                    <div className="p-6 bg-muted/30 rounded-3xl border border-border/50 space-y-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary mx-auto">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-sm">End-to-End Private</h4>
                        <p className="text-[11px] text-muted-foreground">Encryption is maintained by WhatsApp. No data is stored on our servers.</p>
                    </div>
                    <div className="p-6 bg-muted/30 rounded-3xl border border-border/50 space-y-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary mx-auto">
                            <WifiOff className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-sm">Local Storage</h4>
                        <p className="text-[11px] text-muted-foreground">Your chat history stays only on this PC in a secure local database.</p>
                    </div>
                    <div className="p-6 bg-muted/30 rounded-3xl border border-border/50 space-y-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary mx-auto">
                            <QrCode className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-sm">Auto Reconnect</h4>
                        <p className="text-[11px] text-muted-foreground">Once linked, the app will automatically reconnect whenever you start it.</p>
                    </div>
                </div>

                <div className="mt-12 flex items-center gap-3 text-muted-foreground/40 text-[11px] font-black uppercase tracking-[0.3em]">
                    <RefreshCw className="w-4 h-4 animate-spin-slow" />
                    Waiting for scanner...
                </div>
            </div>
        )
    }

    if (!hasConnectedBefore && bridgeStatus !== 'connected') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-700 text-center">
                <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
                <h2 className="text-2xl font-black uppercase tracking-widest opacity-50">
                    {bridgeStatus === 'idle' ? 'Starting Engine...' :
                        bridgeStatus === 'initializing' ? 'Initializing...' :
                            bridgeStatus === 'running' ? 'Waking up WhatsApp...' :
                                bridgeStatus === 'disconnected' ? 'Connecting...' : 'Loading...'}
                </h2>
                <p className="text-muted-foreground mt-2 font-medium">Connecting to local native socket</p>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-160px)] min-h-[500px] flex overflow-hidden rounded-[2.5rem] border border-border/50 bg-background shadow-2xl transition-all duration-500 page-enter dark:border-white/5">
            {/* Sidebar */}
            <div className="w-80 border-r border-border/50 flex flex-col bg-muted/5 backdrop-blur-3xl shrink-0 dark:bg-white/[0.02]">
                {/* Connection Status Banner */}
                {bridgeStatus !== 'connected' && hasConnectedBefore && (
                    <div className="px-4 py-1.5 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-widest text-center animate-pulse">
                        Reconnecting to WhatsApp...
                    </div>
                )}

                <div className="p-6 border-b border-border/50 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-black flex items-center gap-2 tracking-tighter">
                            <MessageSquare className="w-6 h-6 text-primary fill-primary/10" />
                            WhatsApp
                        </h2>
                        <Button variant="ghost" size="icon" className="rounded-2xl hover:bg-primary/10 transition-colors" onClick={handleNewChat}>
                            <Plus className="w-5 h-5" />
                        </Button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input
                            placeholder="Search chats..."
                            className="pl-11 h-12 rounded-2xl bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/40"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {!isOnline && (
                    <div className="bg-amber-500/10 px-6 py-2 border-b border-amber-500/20 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-[11px] font-black uppercase tracking-widest animate-pulse">
                        <WifiOff className="w-3.5 h-3.5" />
                        Working Offline
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredConversations?.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => setSelectedConvId(conv.id)}
                            className={cn(
                                "flex items-center gap-4 p-5 cursor-pointer transition-all hover:bg-primary/5 border-b border-border/10 group relative",
                                selectedConvId === conv.id && "bg-primary/10"
                            )}
                        >
                            {selectedConvId === conv.id && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-r-full shadow-[0_0_12px_rgba(var(--primary),0.5)]" />
                            )}
                            <div className="w-14 h-14 rounded-[1.25rem] bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                <User className="w-7 h-7 opacity-80" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="font-extrabold truncate text-[15px] tracking-tight">+{conv.customer_phone}</span>
                                    <span className="text-[10px] text-muted-foreground/50 font-bold">
                                        {new Date(conv.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="text-[11px] text-muted-foreground font-medium truncate opacity-60 flex items-center gap-1">
                                        <HistoryIcon className="w-3 h-3" />
                                        Device History
                                    </p>
                                    <div className="relative sidebar-menu-container" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setActiveMenuId(activeMenuId === conv.id ? null : conv.id);
                                            }}
                                        >
                                            <MoreVertical className="w-3 h-3" />
                                        </Button>

                                        {activeMenuId === conv.id && (
                                            <div className="absolute right-0 top-full mt-1 w-32 bg-background border border-border rounded-xl shadow-xl p-1 z-[100] animate-in fade-in zoom-in duration-150">
                                                <Button
                                                    variant="ghost"
                                                    className="w-full justify-start text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg gap-2 h-8 px-2 font-bold"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteConversation(conv.id);
                                                    }}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    Delete
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {(!filteredConversations || filteredConversations.length === 0) && (
                        <div className="p-10 text-center text-muted-foreground/40 space-y-3">
                            <MessageSquare className="w-12 h-12 mx-auto opacity-10" />
                            <p className="text-xs font-bold uppercase tracking-widest">No conversations</p>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-primary/[0.03] border-t border-border/50 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 leading-none mb-1">
                        <Shield className="w-3.5 h-3.5" />
                        Active Local Session
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground font-medium opacity-70">
                        Chat history is stored locally on this machine. Messages are not synced or shared.
                    </p>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-[#e4dcd4] dark:bg-[#0b141a]/98 relative transition-colors duration-500">
                {/* Authentic WhatsApp Wallpaper - Pattern Overlay */}
                <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none dark:opacity-[0.08] mix-blend-multiply dark:mix-blend-overlay"
                    style={{
                        backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                        backgroundSize: '400px',
                        backgroundRepeat: 'repeat'
                    }}
                />

                {selectedConv ? (
                    <>
                        {/* Chat Header */}
                        <div className="z-10 bg-background/80 backdrop-blur-2xl p-5 border-b border-border/30 flex justify-between items-center shadow-sm dark:bg-[#202c33]/90">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-[1.1rem] bg-primary/20 flex items-center justify-center text-primary shadow-inner border border-primary/10">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-[16px] leading-none mb-1.5 tracking-tight">+{selectedConv.customer_phone}</h3>
                                    <div className="flex items-center gap-1.5">
                                        <div className={cn("w-2 h-2 rounded-full", isOnline && bridgeStatus === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-muted-foreground/30")} />
                                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                                            {isOnline && bridgeStatus === 'connected' ? 'Active Session' : 'Offline Mode'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 opacity-60 hover:opacity-100"><Phone className="w-5 h-5" /></Button>
                                <div className="relative" ref={menuRef}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn("rounded-xl h-10 w-10 transition-all", activeMenuId === 'header' ? "bg-primary/10 opacity-100" : "opacity-60 hover:opacity-100")}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuId(activeMenuId === 'header' ? null : 'header');
                                        }}
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </Button>

                                    {activeMenuId === 'header' && (
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in duration-200">
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl gap-2 font-bold"
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteConversation(selectedConvId!);
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete Chat
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div
                            ref={scrollRef}
                            className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 custom-scrollbar z-10 scroll-smooth"
                        >
                            <div className="flex justify-center mb-10">
                                <div className="px-4 py-1.5 bg-background/40 backdrop-blur-xl text-muted-foreground/80 dark:text-white/60 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/10 dark:border-white/5 shadow-sm">
                                    Today
                                </div>
                            </div>

                            {messages?.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={cn("w-full flex", msg.direction === 'out' ? "justify-end" : "justify-start")}
                                >
                                    <div
                                        className={cn(
                                            "max-w-[80%] group relative animate-in fade-in slide-in-from-bottom-3 duration-500 lg:max-w-[70%]",
                                            msg.direction === 'out' ? "ml-4" : "mr-4"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "p-3.5 rounded-[1.4rem] text-[15px] shadow-sm transition-all group-hover:shadow-md relative border border-black/[0.02] dark:border-white/5 whitespace-pre-wrap",
                                                msg.direction === 'out'
                                                    ? "bg-[#dbf8c6] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-[0.2rem] shadow-[#dbf8c6]/20"
                                                    : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-[0.2rem]"
                                            )}
                                        >
                                            {msg.media_url && (
                                                <div className="mb-2 overflow-hidden rounded-xl bg-black/5 dark:bg-black/20 min-w-[200px] flex justify-center">
                                                    {msg.media_type === 'image' && msg.media_url && (
                                                        <img
                                                            src={getMediaUrl(msg.media_url)}
                                                            alt="WhatsApp Image"
                                                            className="max-h-[320px] w-auto h-auto cursor-pointer rounded-lg hover:opacity-90 transition-opacity object-contain"
                                                            onClick={() => {
                                                                const url = getMediaUrl(msg.media_url);
                                                                if (url) window.open(url);
                                                            }}
                                                        />
                                                    )}
                                                    {msg.media_type === 'video' && msg.media_url && (
                                                        <video
                                                            src={getMediaUrl(msg.media_url)}
                                                            controls
                                                            className="max-h-[320px] w-auto h-auto rounded-lg object-contain"
                                                        />
                                                    )}
                                                    {msg.media_type === 'audio' && msg.media_url && (
                                                        <audio src={getMediaUrl(msg.media_url)} controls className="max-w-full p-2" />
                                                    )}
                                                    {msg.media_type === 'voice' && msg.media_url && (
                                                        <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                                                            <Mic className="w-5 h-5 text-primary animate-pulse" />
                                                            <audio src={getMediaUrl(msg.media_url)} controls className="h-8 w-48" />
                                                        </div>
                                                    )}
                                                    {msg.media_type === 'document' && msg.media_url && (
                                                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl border border-border/50">
                                                            <FileText className="w-8 h-8 text-primary" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold truncate">Document</p>
                                                                <p className="text-[10px] opacity-50">Click to preview</p>
                                                            </div>
                                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                                                                const url = getMediaUrl(msg.media_url);
                                                                if (url) window.open(url);
                                                            }}>
                                                                <Play className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="pr-14 min-w-[60px] leading-relaxed font-medium">
                                                {msg.body}
                                            </div>
                                            <div className="absolute right-3.5 bottom-2 flex items-center gap-1.5 select-none">
                                                <span className="text-[10px] opacity-40 font-bold uppercase tracking-tight">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                </span>
                                                {msg.direction === 'out' && (
                                                    msg.status === 'sent' ? (
                                                        <CheckCheck className="w-3.5 h-3.5 text-blue-500 stroke-[3px]" />
                                                    ) : msg.status === 'failed' ? (
                                                        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                                                    ) : (
                                                        <Check className="w-3.5 h-3.5 text-muted-foreground opacity-30 stroke-[3px]" />
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Input Footer */}
                        <div className="z-10 bg-background/80 backdrop-blur-2xl p-6 border-t border-border/30 flex items-center gap-4 dark:bg-[#202c33]/80">
                            {!isOnline || bridgeStatus !== 'connected' ? (
                                <div className="flex-1 flex items-center justify-center gap-3 h-14 bg-muted/20 rounded-2xl border border-dashed border-muted-foreground/20 text-muted-foreground text-sm font-bold uppercase tracking-widest opacity-60 italic">
                                    <WifiOff className="w-5 h-5" />
                                    Communication restricted while offline
                                </div>
                            ) : (
                                <>
                                    <Input
                                        placeholder="Type a message..."
                                        className="flex-1 h-14 rounded-2xl bg-muted/40 border-none focus-visible:ring-2 focus-visible:ring-primary/20 placeholder:text-muted-foreground/30 text-base"
                                        value={messageInput}
                                        onChange={(e) => setMessageInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                                        disabled={isLoading}
                                    />
                                    <Button
                                        size="icon"
                                        className="h-14 w-14 rounded-2xl shadow-2xl shadow-primary/30 shrink-0 transform active:scale-90 transition-all duration-300 hover:shadow-primary/40 hover:-translate-y-0.5"
                                        onClick={handleSendMessage}
                                        disabled={!messageInput.trim() || isLoading}
                                    >
                                        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                                    </Button>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 z-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                        <div className="relative">
                            <div className="w-28 h-28 bg-primary/20 rounded-[2.5rem] flex items-center justify-center text-primary shadow-inner border border-primary/20 animate-pulse">
                                <MessageSquare className="w-14 h-14 fill-primary/10" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg border-4 border-background">
                                <Shield className="w-4 h-4 text-white" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-3xl font-black tracking-tighter">WhatsApp Central</h3>
                            <p className="max-w-xs text-muted-foreground font-medium leading-relaxed opacity-60">
                                Connect with your customers directly from the ERP. Your messages are private and stored only on this computer.
                            </p>
                        </div>
                        <Button
                            className="rounded-2xl px-10 py-7 text-xl font-black shadow-2xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 transition-all duration-300 active:scale-95"
                            onClick={handleNewChat}
                        >
                            Start New Conversation
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
