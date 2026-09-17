import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  orderBy,
} from 'firebase/firestore';
import type {
  AcquisitionOrder,
  AcquisitionItem,
  BookCopy,
} from '@/types/library.types';
import { AccessionNumberGenerator } from '../catalog/accessionNumber';
import { createBookCopy } from '../catalog/copies.service';

export interface CreateAcquisitionRequest {
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierName?: string;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  createdBy: string;
  items: {
    bookId?: string | null;
    title: string;
    author?: string;
    isbn?: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export async function getAcquisitionOrders(
  tenantId: string,
  options: { branchId?: string; status?: string } = {}
): Promise<AcquisitionOrder[]> {
  if (!tenantId) return [];
  const constraints = [where('tenantId', '==', tenantId)];

  if (options.status && options.status !== 'all') {
    constraints.push(where('status', '==', options.status));
  }
  if (options.branchId && options.branchId !== 'all') {
    constraints.push(where('branchId', '==', options.branchId));
  }

  const q = query(collection(db, 'acquisition_orders'), ...constraints, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AcquisitionOrder, 'id'>) }));
}

export async function createAcquisitionOrder(
  request: CreateAcquisitionRequest
): Promise<{ order: AcquisitionOrder; items: AcquisitionItem[] }> {
  const { tenantId, branchId, supplierId, supplierName, notes, createdBy, items } = request;

  if (!items || items.length === 0) {
    throw new Error('أمر التزويد يجب أن يحتوي على بند واحد على الأقل.');
  }

  const now = new Date().toISOString();
  const orderNumber = `ACQ-${Date.now().toString().slice(-6)}`;

  let totalAmount = 0;
  const processedItems = items.map((i) => {
    const qty = Number(i.quantity);
    const price = Number(i.unitPrice);
    if (qty <= 0 || price < 0 || isNaN(qty) || isNaN(price)) {
      throw new Error('يرجى التحقق من صحة الكميات والأسعار (أرقام موجبة غير سالبة).');
    }
    const totalPrice = Number((qty * price).toFixed(2));
    totalAmount += totalPrice;
    return {
      bookId: i.bookId || null,
      title: i.title.trim(),
      author: i.author || '',
      isbn: i.isbn ? i.isbn.replace(/[-\s]/g, '') : '',
      quantity: qty,
      receivedQuantity: 0,
      unitPrice: price,
      totalPrice,
    };
  });

  const orderDocRef = doc(collection(db, 'acquisition_orders'));
  const newOrder: AcquisitionOrder = {
    id: orderDocRef.id,
    tenantId,
    branchId,
    orderNumber,
    supplierId,
    supplierName: supplierName || '',
    status: 'draft',
    orderDate: request.orderDate || now.slice(0, 10),
    expectedDate: request.expectedDate || '',
    totalAmount: Number(totalAmount.toFixed(2)),
    paidAmount: 0,
    paymentStatus: 'unpaid',
    notes: notes || '',
    createdBy,
    itemsCount: items.length,
    createdAt: now,
    updatedAt: now,
  };

  await runTransaction(db, async (t) => {
    t.set(orderDocRef, newOrder);
    for (const item of processedItems) {
      const itemRef = doc(collection(db, 'acquisition_items'));
      const acqItem: AcquisitionItem = {
        id: itemRef.id,
        tenantId,
        orderId: orderDocRef.id,
        ...item,
      };
      t.set(itemRef, acqItem);
    }
  });

  return { order: newOrder, items: processedItems as any };
}

export async function receiveAcquisitionOrder(options: {
  tenantId: string;
  orderId: string;
  branchId: string;
  branchCode?: string;
  autoCreateCopies?: boolean;
  receivedBy: string;
}): Promise<void> {
  const { tenantId, orderId, branchId, branchCode = 'MAIN', autoCreateCopies = true, receivedBy } = options;

  const orderRef = doc(db, 'acquisition_orders', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error('أمر التزويد غير موجود.');
  const order = orderSnap.data() as AcquisitionOrder;

  if (order.status === 'received') {
    throw new Error('تم استلام هذا الطلب بالفعل مسبقاً.');
  }

  // Fetch items
  const itemsQ = query(
    collection(db, 'acquisition_items'),
    where('tenantId', '==', tenantId),
    where('orderId', '==', orderId)
  );
  const itemsSnap = await getDocs(itemsQ);
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AcquisitionItem, 'id'>) }));

  const now = new Date().toISOString();

  // If auto-create copies is enabled, provision book_copies with atomic accession numbers
  if (autoCreateCopies) {
    for (const item of items) {
      if (!item.bookId) continue; // Skip unlinked titles until cataloged

      const count = item.quantity - (item.receivedQuantity || 0);
      if (count <= 0) continue;

      const accessionNumbers = await AccessionNumberGenerator.generateBatch(
        { tenantId, branchCode },
        count
      );

      for (let idx = 0; idx < count; idx++) {
        const accessionNumber = accessionNumbers[idx];
        const barcode = `CP-${Date.now().toString().slice(-6)}-${idx + 1}`;
        await createBookCopy(tenantId, {
          bookId: item.bookId,
          branchId,
          barcode,
          accessionNumber,
          branchCode,
          purchasePrice: item.unitPrice,
          supplierId: order.supplierId,
          condition: 'new',
          status: 'available',
          notes: `تم التوريد آلياً من أمر الشراء ${order.orderNumber}`,
          performedBy: receivedBy,
        });
      }
    }
  }

  // Update order status to received
  await runTransaction(db, async (t) => {
    t.update(orderRef, {
      status: 'received',
      receivedDate: now.slice(0, 10),
      updatedAt: now,
    });
    for (const d of itemsSnap.docs) {
      const it = d.data() as AcquisitionItem;
      t.update(d.ref, {
        receivedQuantity: it.quantity,
      });
    }
  });
}
