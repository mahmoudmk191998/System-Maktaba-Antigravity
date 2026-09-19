/**
 * Professional Thermal Printing Engine (80mm / 58mm)
 * Uses isolated iframe rendering to ensure pristine printing in dialogs, iframes, and all browsers.
 */

import type { Sale, SaleReturn, CashierShift } from '@/types/retail.types';

export interface PrintSettingsSnapshot {
  invoiceCompanyName?: string;
  invoicePhone?: string;
  invoiceAddress?: string;
  invoiceTaxNumber?: string;
  invoiceLogo?: string;
  receiptWelcomeMessage?: string;
  receiptFooterMessage?: string;
  printKitchenTicket?: boolean;
}

/**
 * Execute printing of raw HTML in an isolated iframe or window
 */
export function printThermalDocument(htmlContent: string, title = 'طباعة'): void {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('title', title);

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      fallbackPrintWindow(htmlContent);
      return;
    }

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn('Iframe print error, attempting fallback window:', e);
        fallbackPrintWindow(htmlContent);
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 120000);
      }
    }, 400);
  } catch (err) {
    console.error('Print thermal document error:', err);
    fallbackPrintWindow(htmlContent);
  }
}

function fallbackPrintWindow(htmlContent: string) {
  const w = window.open('', '_blank', 'width=420,height=700');
  if (!w) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }
  w.document.open();
  w.document.write(htmlContent);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch (_) {}
  }, 400);
}

/**
 * Common Thermal CSS Styles
 */
const THERMAL_BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
  @page { margin: 0; size: 80mm auto; }
  body {
    width: 78mm;
    max-width: 78mm;
    margin: 0 auto;
    padding: 3mm 2mm;
    font-size: 11px;
    color: #000;
    background: #fff;
    direction: rtl;
    text-align: right;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .logo { max-width: 45mm; max-height: 22mm; object-fit: contain; margin: 0 auto 6px auto; display: block; filter: grayscale(100%); }
  h1 { font-size: 14px; font-weight: 900; margin-bottom: 2px; }
  h2 { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
  .subtitle { font-size: 10px; color: #333; margin-bottom: 2px; }
  .divider-dashed { border-top: 1px dashed #444; margin: 5px 0; }
  .divider-solid { border-top: 1.5px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 1.5px 0; font-size: 10.5px; }
  .row-bold { display: flex; justify-content: space-between; align-items: center; padding: 2.5px 0; font-weight: 900; font-size: 11.5px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 10px; }
  th { border-bottom: 1px solid #000; padding: 3px 1px; font-weight: 900; }
  td { padding: 3px 1px; border-bottom: 1px dashed #ccc; }
  .badge { display: inline-block; padding: 1px 4px; border: 1px solid #000; border-radius: 3px; font-weight: bold; font-size: 9px; }
  .footer { text-align: center; font-size: 9.5px; color: #444; margin-top: 8px; line-height: 1.3; }
`;

/**
 * Generate and print sale receipt HTML
 */
export function printSaleReceipt(
  sale: Sale,
  settings: PrintSettingsSnapshot = {},
  storeNameFallback = 'مكتبة ألوان التجارية',
  viewMode: 'receipt' | 'kitchen' = 'receipt'
): void {
  const storeName = settings.invoiceCompanyName || storeNameFallback;
  const storePhone = settings.invoicePhone || '';
  const storeAddress = settings.invoiceAddress || '';
  const taxNumber = settings.invoiceTaxNumber || '';
  const logo = settings.invoiceLogo || '';
  const welcomeMsg = settings.receiptWelcomeMessage || 'شكراً لزيارتكم ونسعد بخدمتكم دائماً';
  const footerMsg = settings.receiptFooterMessage || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً مع أصل الفاتورة';

  const dateStr = new Date(sale.createdAt).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const paymentMethodsText =
    sale.paymentMethods?.map((p) => (p.method === 'cash' ? 'نقداً' : p.method === 'visa' || p.method === 'card' ? 'بطاقة' : p.method)).join(' + ') ||
    (sale.paymentMethod === 'cash' ? 'نقداً' : 'إلكتروني');

  const itemsHtml = sale.items
    .map(
      (item) => `
      <tr>
        <td style="width: 48%; text-align: right;">
          <div style="font-weight: 700; font-size: 10.5px;">${item.productNameSnapshot}</div>
          ${item.variantNameSnapshot ? `<div style="font-size: 9px; color: #555;">${item.variantNameSnapshot}</div>` : ''}
          ${item.barcodeSnapshot ? `<div style="font-size: 8.5px; color: #777;">${item.barcodeSnapshot}</div>` : ''}
        </td>
        <td style="width: 14%; text-align: center; font-weight: 700;">${item.quantity}</td>
        <td style="width: 18%; text-align: center;">${Number(item.unitSellingPrice).toFixed(2)}</td>
        <td style="width: 20%; text-align: left; font-weight: 900;">${Number(item.lineTotal).toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>فاتورة ${sale.invoiceNumber}</title>
        <style>${THERMAL_BASE_CSS}</style>
      </head>
      <body>
        <div class="center">
          ${logo ? `<img src="${logo}" class="logo" alt="Logo" />` : ''}
          <h1>${storeName}</h1>
          ${storeAddress ? `<div class="subtitle">${storeAddress}</div>` : ''}
          ${storePhone ? `<div class="subtitle">هاتف: ${storePhone}</div>` : ''}
          ${taxNumber ? `<div class="subtitle">الرقم الضريبي: ${taxNumber}</div>` : ''}
          <div class="divider-dashed"></div>
          <div style="font-size: 12px; font-weight: 900; margin: 3px 0;">
            ${viewMode === 'kitchen' ? 'تذكرة تحضير وتجهيز' : 'فاتورة ضريبية مبسطة'}
          </div>
          <div style="font-family: monospace; font-size: 12px; font-weight: 900;">
            ${sale.invoiceNumber}
          </div>
        </div>

        <div class="divider-dashed"></div>

        <div class="row"><span>التاريخ:</span><span>${dateStr}</span></div>
        <div class="row"><span>الكاشير:</span><span>${sale.cashierNameSnapshot || 'كاشير'}</span></div>
        <div class="row"><span>العميل:</span><span>${sale.customerNameSnapshot || 'عميل نقدي'}</span></div>
        <div class="row"><span>نوع البيع:</span><span>${sale.saleType === 'wholesale' ? 'جملة' : 'قطاعي'}</span></div>
        <div class="row"><span>طريقة الدفع:</span><span>${paymentMethodsText}</span></div>

        <div class="divider-dashed"></div>

        <table>
          <thead>
            <tr>
              <th style="text-align: right;">الصنف</th>
              <th style="text-align: center;">الكمية</th>
              <th style="text-align: center;">السعر</th>
              <th style="text-align: left;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider-solid"></div>

        <div class="row"><span>المجموع الفرعي:</span><span>${Number(sale.subtotal).toFixed(2)} ج.م</span></div>
        ${Number(sale.cartDiscountAmount || 0) > 0 ? `<div class="row" style="color: #c00;"><span>خصم الفاتورة:</span><span>-${Number(sale.cartDiscountAmount).toFixed(2)} ج.م</span></div>` : ''}
        ${Number(sale.taxAmount || 0) > 0 ? `<div class="row"><span>ضريبة القيمة المضافة:</span><span>+${Number(sale.taxAmount).toFixed(2)} ج.م</span></div>` : ''}
        ${Number(sale.serviceChargeAmount || 0) > 0 ? `<div class="row"><span>رسوم الخدمة:</span><span>+${Number(sale.serviceChargeAmount).toFixed(2)} ج.م</span></div>` : ''}
        
        <div class="divider-solid"></div>

        <div class="row-bold" style="font-size: 15px;">
          <span>الإجمالي المطلوب:</span>
          <span>${Number(sale.total).toFixed(2)} ج.م</span>
        </div>

        ${Number(sale.returnedAmount || 0) > 0 ? `
          <div class="row" style="color: #c00; font-weight: 700; border-top: 1px dashed #c00; margin-top: 3px; padding-top: 3px;">
            <span>تم استرجاع:</span>
            <span>-${Number(sale.returnedAmount).toFixed(2)} ج.م</span>
          </div>
          <div class="row-bold" style="font-size: 13px;">
            <span>الصافي بعد المرتجع:</span>
            <span>${Math.max(0, Number(sale.total) - Number(sale.returnedAmount)).toFixed(2)} ج.م</span>
          </div>
        ` : ''}

        <div class="divider-dashed"></div>

        <div class="footer">
          <div style="font-weight: 700; margin-bottom: 3px;">${welcomeMsg}</div>
          <div>${footerMsg}</div>
          <div style="margin-top: 4px; font-size: 8.5px; color: #777;">نظام ألوان السحابي المتكامل</div>
        </div>
      </body>
    </html>
  `;

  printThermalDocument(html, `فاتورة ${sale.invoiceNumber}`);
}

/**
 * Generate and print Return Receipt HTML
 */
export function printReturnReceipt(
  saleReturn: SaleReturn,
  settings: PrintSettingsSnapshot = {},
  storeNameFallback = 'مكتبة ألوان التجارية'
): void {
  const storeName = settings.invoiceCompanyName || storeNameFallback;
  const storePhone = settings.invoicePhone || '';
  const storeAddress = settings.invoiceAddress || '';
  const logo = settings.invoiceLogo || '';

  const dateStr = new Date(saleReturn.createdAt).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isExchange = Boolean(saleReturn.isExchange);
  const diff = Number(saleReturn.difference || 0);

  const itemsHtml = (saleReturn.items || [])
    .map(
      (item) => `
      <tr>
        <td style="width: 50%; text-align: right;">
          <div style="font-weight: 700;">${item.productNameSnapshot}</div>
          <div style="font-size: 8.5px; color: #555;">الحالة: ${item.condition === 'resellable' ? 'سليم للمخزن' : 'تالف / هالك'}</div>
        </td>
        <td style="width: 15%; text-align: center; font-weight: 700;">${item.quantity}</td>
        <td style="width: 15%; text-align: center;">${Number(item.unitSellingPrice).toFixed(2)}</td>
        <td style="width: 20%; text-align: left; font-weight: 900; color: #c00;">-${Number(item.refundLineAmount || item.lineTotal || 0).toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>إيصال مرتجع ${saleReturn.returnNumber}</title>
        <style>${THERMAL_BASE_CSS}</style>
      </head>
      <body>
        <div class="center">
          ${logo ? `<img src="${logo}" class="logo" alt="Logo" />` : ''}
          <h1>${storeName}</h1>
          ${storeAddress ? `<div class="subtitle">${storeAddress}</div>` : ''}
          ${storePhone ? `<div class="subtitle">هاتف: ${storePhone}</div>` : ''}
          <div class="divider-dashed"></div>
          <div style="font-size: 13px; font-weight: 900; margin: 3px 0;">
            ${isExchange ? 'إيصال استبدال مبيعات رسمي' : 'إيصال مرتجع مبيعات رسمي'}
          </div>
          <div style="font-family: monospace; font-size: 12px; font-weight: 900;">
            ${saleReturn.returnNumber}
          </div>
        </div>

        <div class="divider-dashed"></div>

        <div class="row"><span>التاريخ:</span><span>${dateStr}</span></div>
        <div class="row"><span>الفاتورة الأصلية:</span><span style="font-family: monospace; font-weight: 700;">${saleReturn.invoiceNumberSnapshot}</span></div>
        ${isExchange && saleReturn.replacementInvoiceNumber ? `
          <div class="row" style="color: #4338ca; font-weight: 700;">
            <span>الفاتورة البديلة:</span>
            <span style="font-family: monospace;">${saleReturn.replacementInvoiceNumber}</span>
          </div>
        ` : ''}
        <div class="row"><span>المسؤول:</span><span>${saleReturn.processedBy || 'كاشير'}</span></div>
        <div class="row"><span>طريقة الرد:</span><span>${isExchange ? 'استبدال بضاعة' : saleReturn.refundMethod}</span></div>

        <div class="divider-dashed"></div>

        <table>
          <thead>
            <tr>
              <th style="text-align: right;">الصنف المرتجع</th>
              <th style="text-align: center;">الكمية</th>
              <th style="text-align: center;">السعر</th>
              <th style="text-align: left;">القيمة</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider-solid"></div>

        <div class="row-bold" style="font-size: 14px; color: #c00;">
          <span>إجمالي المبلغ المرتجع:</span>
          <span>-${Number(saleReturn.refundAmount || saleReturn.totalRefundAmount || 0).toFixed(2)} ج.م</span>
        </div>

        ${isExchange ? `
          <div class="divider-dashed"></div>
          <div class="row-bold" style="font-size: 13px;">
            <span>تسوية فرق الاستبدال:</span>
            <span>${diff > 0 ? `العميل دفع فرق: +${diff.toFixed(2)}` : diff < 0 ? `مسترد للعميل: ${Math.abs(diff).toFixed(2)}` : 'تبادل متكافئ (0.00)'} ج.م</span>
          </div>
        ` : ''}

        <div class="divider-dashed"></div>

        <div class="footer">
          <div>تم تسجيل العملية وتحديث المخزون وحسابات الأرباح تلقائياً</div>
          <div style="margin-top: 4px; font-size: 8.5px; color: #777;">نظام ألوان السحابي المتكامل</div>
        </div>
      </body>
    </html>
  `;

  printThermalDocument(html, `إيصال مرتجع ${saleReturn.returnNumber}`);
}

/**
 * Generate and print Shift Closing Z-Report HTML (for POS and Shift Management)
 */
export function printShiftReport(
  shift: CashierShift | any,
  orders: any[] = [],
  expenses: any[] = [],
  settings: PrintSettingsSnapshot = {},
  storeNameFallback = 'مكتبة ألوان التجارية'
): void {
  const storeName = settings.invoiceCompanyName || storeNameFallback;
  const storePhone = settings.invoicePhone || '';
  const logo = settings.invoiceLogo || '';

  const cashierName = shift.cashier_name || shift.cashierName || 'كاشير';
  const employeeRole = shift.employee_role || shift.cashier_role || shift.role || 'كاشير';
  const startTimeStr = shift.start_time || shift.openedAt ? new Date(shift.start_time || shift.openedAt).toLocaleString('ar-EG') : '-';
  const endTimeStr = shift.end_time || shift.closedAt ? new Date(shift.end_time || shift.closedAt).toLocaleString('ar-EG') : 'مستمرة';

  // Aggregate Sold Items Breakdown
  const itemsMap = new Map<string, { name: string; quantity: number; total: number }>();
  if (Array.isArray(shift.sold_items) && shift.sold_items.length > 0) {
    shift.sold_items.forEach((it: any) => {
      itemsMap.set(it.name, { name: it.name, quantity: it.quantity, total: it.total });
    });
  } else {
    orders.forEach((o) => {
      const lineItems = o.items || o.order_items || [];
      lineItems.forEach((it: any) => {
        const name = it.productNameSnapshot || it.productName || it.name || 'صنف';
        const qty = Number(it.quantity || it.qty || 1);
        const price = Number(it.unitPrice || it.unitSellingPrice || it.price || 0);
        const lineTotal = Number(it.lineTotal || it.total || (qty * price));
        const cur = itemsMap.get(name) || { name, quantity: 0, total: 0 };
        cur.quantity += qty;
        cur.total += lineTotal;
        itemsMap.set(name, cur);
      });
    });
  }

  const soldItemsList = Array.from(itemsMap.values()).sort((a, b) => b.quantity - a.quantity);
  const totalUniqueItems = soldItemsList.length;
  const totalUnitsSold = soldItemsList.reduce((acc, it) => acc + it.quantity, 0);

  const soldItemsHtml = soldItemsList.length > 0
    ? soldItemsList.map((it) => `
        <tr style="border-bottom: 1px dashed #ddd;">
          <td style="padding: 2px 0; text-align: right; word-break: break-word;">${it.name}</td>
          <td style="padding: 2px 0; text-align: center; font-weight: 700;">${it.quantity}</td>
          <td style="padding: 2px 0; text-align: left; font-weight: 700;">${it.total.toFixed(2)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="text-align: center; color: #777; padding: 4px 0;">لا توجد أصناف مباعة</td></tr>';

  const totalSales = Number(
    shift.total_sales != null
      ? shift.total_sales
      : shift.totalSales != null
      ? shift.totalSales
      : Number(shift.cash_sales || shift.totalSalesCash || 0) + Number(shift.card_sales || shift.totalSalesCard || 0)
  );

  const cashSales = Number(shift.cash_sales != null ? shift.cash_sales : shift.totalSalesCash || 0);
  const cardSales = Number(shift.card_sales != null ? shift.card_sales : shift.totalSalesCard || 0);
  const walletSales = Number(shift.wallet_sales || 0);
  const totalDiscounts = Number(shift.totalDiscounts || 0);
  const startingCash = Number(shift.starting_cash != null ? shift.starting_cash : shift.openingCash || 0);
  const shiftExpensesTotal = Number(shift.shift_expenses != null ? shift.shift_expenses : shift.cashOut || 0);
  const expectedCash = Number(shift.expected_cash != null ? shift.expected_cash : startingCash + cashSales - shiftExpensesTotal);
  const actualCash = Number(shift.actual_cash != null ? shift.actual_cash : shift.closingCash || 0);
  const discrepancy = Number(shift.discrepancy != null ? shift.discrepancy : actualCash - expectedCash);

  const expensesListHtml =
    expenses.length > 0
      ? expenses
          .map(
            (e) => `
        <div class="row">
          <span>${e.description || e.category || 'مصروف'}</span>
          <span style="font-weight: 700;">${Number(e.amount).toFixed(2)} ج.م</span>
        </div>
      `
          )
          .join('')
      : '<div class="row" style="color: #777;"><span>لا توجد مصروفات مسجلة</span><span>-</span></div>';

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>تقرير إغلاق الوردية (Z-Report)</title>
        <style>${THERMAL_BASE_CSS}</style>
      </head>
      <body>
        <div class="center">
          ${logo ? `<img src="${logo}" class="logo" alt="Logo" />` : ''}
          <h1>${storeName}</h1>
          ${storePhone ? `<div class="subtitle">هاتف: ${storePhone}</div>` : ''}
          <div class="divider-dashed"></div>
          <div style="font-size: 13px; font-weight: 900; background: #eee; padding: 2px 0; border-radius: 4px; border: 1px solid #000; margin: 3px 0;">
            تقرير إغلاق الوردية (Z-Report)
          </div>
          <div style="font-family: monospace; font-size: 11px;">
            ${shift.shift_number || shift.id?.substring(0, 8) || 'SHIFT'}
          </div>
        </div>

        <div class="divider-dashed"></div>

        <div class="row"><span>الموظف:</span><span style="font-weight: 700;">${cashierName}</span></div>
        <div class="row"><span>الدور الوظيفي:</span><span style="font-weight: 700;">${employeeRole}</span></div>
        <div class="row"><span>وقت الفتح:</span><span>${startTimeStr}</span></div>
        <div class="row"><span>وقت الإغلاق:</span><span>${endTimeStr}</span></div>
        <div class="row"><span>عدد الفواتير الفعلية:</span><span style="font-weight: 700;">${orders.length || shift.salesCount || 0} فاتورة</span></div>
        <div class="row"><span>إجمالي الأصناف المباعة:</span><span style="font-weight: 700;">${totalUniqueItems} صنف (${totalUnitsSold} قطعة)</span></div>

        <div class="divider-solid"></div>
        <div style="font-weight: 900; font-size: 11px; margin-bottom: 2px;">ملخص المبيعات والإيرادات</div>

        <div class="row"><span>مبيعات نقدي (كاش):</span><span>${cashSales.toFixed(2)} ج.م</span></div>
        <div class="row"><span>مبيعات شبكة (بطاقة):</span><span>${cardSales.toFixed(2)} ج.م</span></div>
        ${walletSales > 0 ? `<div class="row"><span>مبيعات محفظة:</span><span>${walletSales.toFixed(2)} ج.م</span></div>` : ''}
        ${totalDiscounts > 0 ? `<div class="row" style="color: #c00;"><span>إجمالي الخصومات الممنوحة:</span><span>-${totalDiscounts.toFixed(2)} ج.م</span></div>` : ''}
        
        <div class="row-bold" style="border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px;">
          <span>إجمالي المبيعات المحققة:</span>
          <span>${totalSales.toFixed(2)} ج.م</span>
        </div>

        <div class="divider-solid"></div>
        <div style="font-weight: 900; font-size: 11px; margin-bottom: 3px;">قائمة الأصناف المباعة بالتفصيل</div>
        <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin-bottom: 4px;">
          <thead>
            <tr style="border-bottom: 1px solid #000; font-weight: 900;">
              <th style="text-align: right; padding: 2px 0;">الصنف</th>
              <th style="text-align: center; padding: 2px 0; width: 40px;">الكمية</th>
              <th style="text-align: left; padding: 2px 0; width: 55px;">القيمة</th>
            </tr>
          </thead>
          <tbody>
            ${soldItemsHtml}
          </tbody>
        </table>

        <div class="divider-solid"></div>
        <div style="font-weight: 900; font-size: 11px; margin-bottom: 2px;">المصروفات والسحوبات</div>
        ${expensesListHtml}
        <div class="row-bold" style="color: #c00; border-top: 1px dashed #000; margin-top: 2px;">
          <span>إجمالي المصروفات:</span>
          <span>-${shiftExpensesTotal.toFixed(2)} ج.م</span>
        </div>

        <div class="divider-solid"></div>
        <div style="font-weight: 900; font-size: 11px; margin-bottom: 2px;">جرد الدرج والعهدة النقدية</div>

        <div class="row"><span>العهدة النقدية الافتتاحية:</span><span>${startingCash.toFixed(2)} ج.م</span></div>
        <div class="row"><span>المتحصلات النقدية (كاش):</span><span>+${cashSales.toFixed(2)} ج.م</span></div>
        <div class="row" style="color: #c00;"><span>المصروفات النقدية:</span><span>-${shiftExpensesTotal.toFixed(2)} ج.م</span></div>
        
        <div class="divider-dashed"></div>

        <div class="row-bold" style="font-size: 12px;">
          <span>النقدية المتوقعة بالدرج:</span>
          <span>${expectedCash.toFixed(2)} ج.م</span>
        </div>

        <div class="row-bold" style="font-size: 13px; border: 1px solid #000; padding: 3px; border-radius: 4px; margin: 3px 0; background: #f9f9f9;">
          <span>المبلغ الفعلي المحصور:</span>
          <span>${actualCash.toFixed(2)} ج.م</span>
        </div>

        <div class="row-bold" style="font-size: 12px; color: ${discrepancy === 0 ? '#15803d' : '#b91c1c'};">
          <span>${discrepancy === 0 ? 'مطابقة الدرج:' : discrepancy > 0 ? 'فائض بالدرج:' : 'عجز بالدرج:'}</span>
          <span>${discrepancy > 0 ? `+${discrepancy.toFixed(2)}` : discrepancy.toFixed(2)} ج.م</span>
        </div>

        ${shift.shortage_reason || shift.notes ? `
          <div class="divider-dashed"></div>
          <div style="font-size: 9.5px; color: #555;">
            <strong>ملاحظات:</strong> ${shift.shortage_reason || shift.notes}
          </div>
        ` : ''}

        <div class="divider-dashed"></div>

        <div style="margin: 20px 0 10px 0; text-align: center;">
          <div style="font-weight: 700; font-size: 11px; margin-bottom: 25px;">توقيع الكاشير / المسؤول المستلم</div>
          <div style="border-bottom: 1px solid #000; width: 60%; margin: 0 auto;"></div>
        </div>

        <div class="footer">
          <div>تم استخراج وطباعة هذا التقرير عبر النظام السحابي</div>
          <div style="font-size: 8px; color: #888;">${new Date().toLocaleString('ar-EG')}</div>
        </div>
      </body>
    </html>
  `;

  printThermalDocument(html, `تقرير وردية ${cashierName}`);
}
