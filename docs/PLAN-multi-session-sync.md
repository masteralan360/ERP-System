# PLAN: Multi-Session Synchronization for Workspace Assets

## Goal Description
Enhance the P2P synchronization mechanism to track and deliver files based on active **Session IDs** instead of **User IDs**. This ensures that users logged into the same account across multiple devices (e.g., Desktop and Mobile) receive and synchronize product images and workspace logos on every device.

## Analysis
- **Current State**: `p2pSyncManager` ignores items uploaded by the same `userId`. `sync_queue` tracks completion using a JSONB array of `userId`s and compares against `workspaces.member_count`.
- **Constraint**: `Session ID` is available in the Supabase JWT (`sid` claim) and is now exposed via `AuthContext`.
- **Logic Change**: 
    1. Uploaders must include their `sessionId`.
    2. Sync check must exclude the specific `sessionId` of the uploader, but include other sessions of the same user.
    3. Cleanup must count active sessions in the workspace to determine if "all targets" have received the file.

## User Review Required
> [!IMPORTANT]
> **Active Target Definition**: Using session counts depends on Supabase accurately reflecting active sessions. If a user has a stale session (abandoned browser tab), the file might not be "cleaned up" from the cloud until the 48h TTL expires.
> [!WARNING]
> **Backward Compatibility**: Existing items in the `sync_queue` use User IDs. Transitioning to Session IDs will make older items effectively "stuck" until they expire, as they won't match the new session tracking logic.

## Proposed Changes

### Database Tier
#### [MODIFY] `auth.sessions` Dependency awareness
- We need to query this table in the `acknowledge_p2p_sync` RPC.

#### [NEW] `supabase/migrations/update_sync_queue_for_sessions.sql` (Conceptual)
- Add `uploader_session_id` column (uuid) to `sync_queue`.
- Update `acknowledge_p2p_sync` function:
    - Accept `p_session_id`.
    - Retrieve active session count for the workspace from `auth.sessions` joined with `profiles`.
    - Check completion based on session count.

### Application Tier
#### [MODIFY] `src/lib/p2pSyncManager.ts`
- Update `initialize` to accept `sessionId`.
- Update `uploadFile` to send `uploader_session_id`.
- Update `handleNewSyncItem` and `checkPendingDownloads` to filter by `sessionId` instead of `userId`.
- Update `downloadFile` to pass `sessionId` to the `acknowledge_p2p_sync` RPC.

#### [MODIFY] `src/ui/components/Layout.tsx`
- Pass the `sessionId` from `AuthContext` to `p2pSyncManager.initialize`.

## Verification Plan
### Automated Tests
- RPC test: Verify that `acknowledge_p2p_sync` returns `is_complete: true` only when all sessions have acknowledged.
- Integration test: Mock two sessions for the same user and verify both receive the sync event.

### Manual Verification
1. Login to Desktop (Session A).
2. Login to Mobile (Session B).
3. Upload a product image on Desktop.
4. Verify P2P Indicator appears on Mobile and the image is downloaded.
5. Verify the file is deleted from Supabase Storage once both sessions have acknowledged.
