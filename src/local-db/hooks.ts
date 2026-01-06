import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './database'
import type { Product, Customer, Order, Invoice, SyncQueueItem } from './models'
import { generateId } from '@/lib/utils'

// ===================
// PRODUCTS HOOKS
// ===================

export function useProducts(workspaceId: string | undefined) {
    const products = useLiveQuery(
        () => workspaceId ? db.products.where('workspaceId').equals(workspaceId).and(p => !p.isDeleted).toArray() : [],
        [workspaceId]
    )
    return products ?? []
}

export function useProduct(id: string | undefined) {
    const product = useLiveQuery(
        () => id ? db.products.get(id) : undefined,
        [id]
    )
    return product
}

export async function createProduct(workspaceId: string, data: Omit<Product, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'lastSyncedAt' | 'version' | 'isDeleted'>): Promise<Product> {
    const now = new Date().toISOString()
    const product: Product = {
        ...data,
        id: generateId(),
        workspaceId,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        lastSyncedAt: null,
        version: 1,
        isDeleted: false
    }

    await db.products.add(product)
    await addToSyncQueue('products', product.id, 'create', product as unknown as Record<string, unknown>)

    return product
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.products.get(id)
    if (!existing) throw new Error('Product not found')

    const updated = {
        ...existing,
        ...data,
        updatedAt: now,
        syncStatus: 'pending' as const,
        version: existing.version + 1
    }

    await db.products.put(updated)
    await addToSyncQueue('products', id, 'update', updated as unknown as Record<string, unknown>)
}

export async function deleteProduct(id: string): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.products.get(id)
    if (!existing) return

    await db.products.update(id, {
        isDeleted: true,
        updatedAt: now,
        syncStatus: 'pending',
        version: existing.version + 1
    })
    await addToSyncQueue('products', id, 'delete', { id })
}

// ===================
// CUSTOMERS HOOKS
// ===================

export function useCustomers(workspaceId: string | undefined) {
    const customers = useLiveQuery(
        () => workspaceId ? db.customers.where('workspaceId').equals(workspaceId).and(c => !c.isDeleted).toArray() : [],
        [workspaceId]
    )
    return customers ?? []
}

export function useCustomer(id: string | undefined) {
    const customer = useLiveQuery(
        () => id ? db.customers.get(id) : undefined,
        [id]
    )
    return customer
}

export async function createCustomer(workspaceId: string, data: Omit<Customer, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'lastSyncedAt' | 'version' | 'isDeleted' | 'totalOrders' | 'totalSpent'>): Promise<Customer> {
    const now = new Date().toISOString()
    const customer: Customer = {
        ...data,
        id: generateId(),
        workspaceId,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        lastSyncedAt: null,
        version: 1,
        isDeleted: false,
        totalOrders: 0,
        totalSpent: 0
    }

    await db.customers.add(customer)
    await addToSyncQueue('customers', customer.id, 'create', customer as unknown as Record<string, unknown>)

    return customer
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.customers.get(id)
    if (!existing) throw new Error('Customer not found')

    const updated = {
        ...existing,
        ...data,
        updatedAt: now,
        syncStatus: 'pending' as const,
        version: existing.version + 1
    }

    await db.customers.put(updated)
    await addToSyncQueue('customers', id, 'update', updated as unknown as Record<string, unknown>)
}

export async function deleteCustomer(id: string): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.customers.get(id)
    if (!existing) return

    await db.customers.update(id, {
        isDeleted: true,
        updatedAt: now,
        syncStatus: 'pending',
        version: existing.version + 1
    })
    await addToSyncQueue('customers', id, 'delete', { id })
}

// ===================
// ORDERS HOOKS
// ===================

export function useOrders(workspaceId: string | undefined) {
    const orders = useLiveQuery(
        () => workspaceId ? db.orders.where('workspaceId').equals(workspaceId).and(o => !o.isDeleted).toArray() : [],
        [workspaceId]
    )
    return orders ?? []
}

export function useOrder(id: string | undefined) {
    const order = useLiveQuery(
        () => id ? db.orders.get(id) : undefined,
        [id]
    )
    return order
}

export async function createOrder(workspaceId: string, data: Omit<Order, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'lastSyncedAt' | 'version' | 'isDeleted' | 'orderNumber'>): Promise<Order> {
    const now = new Date().toISOString()
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`

    const order: Order = {
        ...data,
        id: generateId(),
        workspaceId,
        orderNumber,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        lastSyncedAt: null,
        version: 1,
        isDeleted: false
    }

    await db.orders.add(order)
    await addToSyncQueue('orders', order.id, 'create', order as unknown as Record<string, unknown>)

    // Update customer stats
    const customer = await db.customers.get(data.customerId)
    if (customer) {
        await db.customers.update(data.customerId, {
            totalOrders: customer.totalOrders + 1,
            totalSpent: customer.totalSpent + data.total
        })
    }

    return order
}

export async function updateOrder(id: string, data: Partial<Order>): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.orders.get(id)
    if (!existing) throw new Error('Order not found')

    const updated = {
        ...existing,
        ...data,
        updatedAt: now,
        syncStatus: 'pending' as const,
        version: existing.version + 1
    }

    await db.orders.put(updated)
    await addToSyncQueue('orders', id, 'update', updated as unknown as Record<string, unknown>)
}

export async function deleteOrder(id: string): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.orders.get(id)
    if (!existing) return

    await db.orders.update(id, {
        isDeleted: true,
        updatedAt: now,
        syncStatus: 'pending',
        version: existing.version + 1
    })
    await addToSyncQueue('orders', id, 'delete', { id })
}

// ===================
// INVOICES HOOKS
// ===================

export function useInvoices(workspaceId: string | undefined) {
    const invoices = useLiveQuery(
        () => workspaceId ? db.invoices.where('workspaceId').equals(workspaceId).and(i => !i.isDeleted).toArray() : [],
        [workspaceId]
    )
    return invoices ?? []
}

export function useInvoice(id: string | undefined) {
    const invoice = useLiveQuery(
        () => id ? db.invoices.get(id) : undefined,
        [id]
    )
    return invoice
}

export async function createInvoice(workspaceId: string, data: Omit<Invoice, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'lastSyncedAt' | 'version' | 'isDeleted' | 'invoiceNumber'>): Promise<Invoice> {
    const now = new Date().toISOString()
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`

    const invoice: Invoice = {
        ...data,
        id: generateId(),
        workspaceId,
        invoiceNumber,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        lastSyncedAt: null,
        version: 1,
        isDeleted: false
    }

    await db.invoices.add(invoice)
    await addToSyncQueue('invoices', invoice.id, 'create', invoice as unknown as Record<string, unknown>)

    return invoice
}

export async function updateInvoice(id: string, data: Partial<Invoice>): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.invoices.get(id)
    if (!existing) throw new Error('Invoice not found')

    const updated = {
        ...existing,
        ...data,
        updatedAt: now,
        syncStatus: 'pending' as const,
        version: existing.version + 1
    }

    await db.invoices.put(updated)
    await addToSyncQueue('invoices', id, 'update', updated as unknown as Record<string, unknown>)
}

export async function deleteInvoice(id: string): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.invoices.get(id)
    if (!existing) return

    await db.invoices.update(id, {
        isDeleted: true,
        updatedAt: now,
        syncStatus: 'pending',
        version: existing.version + 1
    })
    await addToSyncQueue('invoices', id, 'delete', { id })
}

// ===================
// SYNC QUEUE
// ===================

export function useSyncQueue() {
    const queue = useLiveQuery(() => db.syncQueue.toArray(), [])
    return queue ?? []
}

export function usePendingSyncCount() {
    const count = useLiveQuery(() => db.syncQueue.count(), [])
    return count ?? 0
}

async function addToSyncQueue(
    entityType: SyncQueueItem['entityType'],
    entityId: string,
    operation: SyncQueueItem['operation'],
    data: Record<string, unknown>
): Promise<void> {
    // Check if there's already an item for this entity
    const existing = await db.syncQueue
        .where('entityId')
        .equals(entityId)
        .first()

    if (existing) {
        // Update existing queue item
        await db.syncQueue.update(existing.id, {
            operation: existing.operation === 'create' ? 'create' : operation,
            data,
            timestamp: new Date().toISOString()
        })
    } else {
        // Add new queue item
        await db.syncQueue.add({
            id: generateId(),
            entityType,
            entityId,
            operation,
            data,
            timestamp: new Date().toISOString(),
            retryCount: 0
        })
    }
}

export async function removeFromSyncQueue(id: string): Promise<void> {
    await db.syncQueue.delete(id)
}

export async function clearSyncQueue(): Promise<void> {
    await db.syncQueue.clear()
}

// ===================
// DASHBOARD STATS
// ===================

export function useDashboardStats(workspaceId: string | undefined) {
    const stats = useLiveQuery(async () => {
        if (!workspaceId) return null
        const [
            productCount,
            customerCount,
            orderCount,
            invoiceCount,
            recentOrders,
            pendingInvoices,
            lowStockProducts
        ] = await Promise.all([
            db.products.where('workspaceId').equals(workspaceId).and(p => !p.isDeleted).count(),
            db.customers.where('workspaceId').equals(workspaceId).and(c => !c.isDeleted).count(),
            db.orders.where('workspaceId').equals(workspaceId).and(o => !o.isDeleted).count(),
            db.invoices.where('workspaceId').equals(workspaceId).and(i => !i.isDeleted).count(),
            db.orders.where('workspaceId').equals(workspaceId).and(o => !o.isDeleted).reverse().sortBy('createdAt').then(orders => orders.slice(0, 5)),
            db.invoices.where('workspaceId').equals(workspaceId).and(inv => !inv.isDeleted && (inv.status === 'sent' || inv.status === 'overdue')).toArray(),
            db.products.where('workspaceId').equals(workspaceId).and(p => !p.isDeleted && p.quantity <= p.minStockLevel).toArray()
        ])

        const totalRevenue = (await db.invoices.where('workspaceId').equals(workspaceId).and(inv => !inv.isDeleted && inv.status === 'paid').toArray())
            .reduce((sum, inv) => sum + inv.total, 0)

        return {
            productCount,
            customerCount,
            orderCount,
            invoiceCount,
            recentOrders,
            pendingInvoices,
            lowStockProducts,
            totalRevenue
        }
    }, [])

    return stats ?? {
        productCount: 0,
        customerCount: 0,
        orderCount: 0,
        invoiceCount: 0,
        recentOrders: [],
        pendingInvoices: [],
        lowStockProducts: [],
        totalRevenue: 0
    }
}
