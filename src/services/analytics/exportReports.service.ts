/**
 * Universal Reports Export Engine (CSV / Excel format)
 * Supports Arabic UTF-8 BOM encoding for seamless Excel compatibility.
 * Dynamically enforces cost/margin data masking based on user permissions.
 */

export interface ExportColumn<T> {
  headerAr: string;
  headerEn: string;
  field: keyof T | ((row: T) => string | number | undefined);
  isCostOrMarginSensitive?: boolean;
}

/**
 * Trigger browser file download of CSV content with UTF-8 BOM
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  // Prepend UTF-8 BOM (\uFEFF) so Excel opens Arabic text correctly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format any dataset into CSV text with optional cost masking
 */
export function generateCsvString<T>(
  data: T[],
  columns: ExportColumn<T>[],
  canViewCosts: boolean = true,
  lang: 'ar' | 'en' = 'ar'
): string {
  // 1. Headers
  const headerRow = columns.map((col) => {
    const title = lang === 'ar' ? col.headerAr : col.headerEn;
    return `"${title.replace(/"/g, '""')}"`;
  }).join(',');

  // 2. Data rows
  const rows = data.map((item) => {
    return columns.map((col) => {
      if (col.isCostOrMarginSensitive && !canViewCosts) {
        return '"***"';
      }

      let val: any;
      if (typeof col.field === 'function') {
        val = col.field(item);
      } else {
        val = item[col.field];
      }

      if (val === undefined || val === null) {
        return '""';
      }

      const strVal = String(val).replace(/"/g, '""');
      return `"${strVal}"`;
    }).join(',');
  });

  return [headerRow, ...rows].join('\r\n');
}

/**
 * Export Sales Trend Data
 */
export function exportSalesTrendCsv(
  dailyData: any[],
  canViewCosts: boolean = true,
  filename: string = 'sales_report'
): void {
  const columns: ExportColumn<any>[] = [
    { headerAr: 'التاريخ', headerEn: 'Date', field: 'date' },
    { headerAr: 'إجمالي المبيعات', headerEn: 'Gross Sales', field: 'grossSales' },
    { headerAr: 'الخصومات', headerEn: 'Discounts', field: 'discounts' },
    { headerAr: 'المرتجعات', headerEn: 'Returns', field: 'returns' },
    { headerAr: 'صافي المبيعات', headerEn: 'Net Sales', field: 'netSales' },
    { headerAr: 'تكلفة البضاعة المباعة', headerEn: 'COGS', field: 'cogs', isCostOrMarginSensitive: true },
    { headerAr: 'الربح الإجمالي', headerEn: 'Gross Profit', field: 'grossProfit', isCostOrMarginSensitive: true },
    {
      headerAr: 'هامش الربح %',
      headerEn: 'Margin %',
      field: (r) => (r.netSales > 0 ? `${(((r.grossProfit || 0) / r.netSales) * 100).toFixed(1)}%` : '0%'),
      isCostOrMarginSensitive: true,
    },
    { headerAr: 'عدد الفواتير', headerEn: 'Transactions', field: 'transactionsCount' },
  ];

  const csv = generateCsvString(dailyData, columns, canViewCosts, 'ar');
  downloadCsvFile(filename, csv);
}

/**
 * Export Inventory Health & Aging Data
 */
export function exportInventoryHealthCsv(
  items: any[],
  canViewCosts: boolean = true,
  filename: string = 'inventory_health_report'
): void {
  const columns: ExportColumn<any>[] = [
    { headerAr: 'الباركود / SKU', headerEn: 'SKU', field: 'sku' },
    { headerAr: 'اسم الصنف', headerEn: 'Item Name', field: 'name' },
    { headerAr: 'التصنيف', headerEn: 'Category', field: 'category' },
    { headerAr: 'الرصيد الفعلي', headerEn: 'On Hand', field: 'currentStock' },
    { headerAr: 'المتاح للبيع', headerEn: 'Available', field: 'availableStock' },
    { headerAr: 'تكلفة الوحدة', headerEn: 'Unit Cost', field: 'unitCost', isCostOrMarginSensitive: true },
    { headerAr: 'سعر البيع', headerEn: 'Retail Price', field: 'retailPrice' },
    { headerAr: 'إجمالي القيمة بالتكلفة', headerEn: 'Cost Valuation', field: 'totalCostValue', isCostOrMarginSensitive: true },
    { headerAr: 'إجمالي القيمة بالبيع', headerEn: 'Retail Valuation', field: 'totalRetailValue' },
    { headerAr: 'مبيعات الفترة', headerEn: 'Units Sold', field: 'unitsSoldInPeriod' },
    { headerAr: 'أيام التغطية', headerEn: 'Stock Cover Days', field: (r) => (r.stockCoverDays >= 999 ? '∞' : r.stockCoverDays) },
    { headerAr: 'الحالة', headerEn: 'Status', field: 'status' },
  ];

  const csv = generateCsvString(items, columns, canViewCosts, 'ar');
  downloadCsvFile(filename, csv);
}

/**
 * Export Reorder Recommendations Data
 */
export function exportReorderRecommendationsCsv(
  reorders: any[],
  canViewCosts: boolean = true,
  filename: string = 'reorder_recommendations'
): void {
  const columns: ExportColumn<any>[] = [
    { headerAr: 'الباركود / SKU', headerEn: 'SKU', field: 'sku' },
    { headerAr: 'اسم الصنف', headerEn: 'Name', field: 'name' },
    { headerAr: 'المورد المفضل', headerEn: 'Preferred Supplier', field: 'preferredSupplierName' },
    { headerAr: 'المبيعات اليومية', headerEn: 'Daily Sales', field: 'effectiveDailyDemand' },
    { headerAr: 'الرصيد المتاح', headerEn: 'Available', field: 'availableStock' },
    { headerAr: 'قيد التوريد بأمر شراء', headerEn: 'Incoming PO', field: 'incomingPoStock' },
    { headerAr: 'المستوى المستهدف', headerEn: 'Target Level', field: 'targetStockLevel' },
    { headerAr: 'الكمية المقترحة للطلب', headerEn: 'Recommended Qty', field: 'reorderQuantity' },
    { headerAr: 'سعر التكلفة المتوقع', headerEn: 'Est Unit Cost', field: 'unitCost', isCostOrMarginSensitive: true },
    { headerAr: 'إجمالي التكلفة المتوقعة', headerEn: 'Est Total Cost', field: 'estimatedTotalCost', isCostOrMarginSensitive: true },
    { headerAr: 'درجة الاستعجال', headerEn: 'Urgency', field: 'urgency' },
    { headerAr: 'التفسير المحاسبي والتشغيلي', headerEn: 'Explanation', field: 'explanationAr' },
  ];

  const csv = generateCsvString(reorders, columns, canViewCosts, 'ar');
  downloadCsvFile(filename, csv);
}

/**
 * Export Profitability & Margin Erosion Data
 */
export function exportProfitabilityCsv(
  profitabilityItems: any[],
  canViewCosts: boolean = true,
  filename: string = 'profitability_report'
): void {
  const columns: ExportColumn<any>[] = [
    { headerAr: 'الباركود / SKU', headerEn: 'SKU', field: 'sku' },
    { headerAr: 'اسم الصنف', headerEn: 'Product Name', field: 'name' },
    { headerAr: 'التصنيف', headerEn: 'Category', field: 'category' },
    { headerAr: 'الوحدات المباعة', headerEn: 'Units Sold', field: 'unitsSold' },
    { headerAr: 'صافي الإيراد', headerEn: 'Net Revenue', field: 'netRevenue' },
    { headerAr: 'التكلفة التاريخية (COGS)', headerEn: 'Historical Cost', field: 'historicalCogs', isCostOrMarginSensitive: true },
    { headerAr: 'الربح الإجمالي', headerEn: 'Gross Profit', field: 'grossProfit', isCostOrMarginSensitive: true },
    { headerAr: 'هامش الربح %', headerEn: 'Margin %', field: (r) => `${r.grossMarginPct}%`, isCostOrMarginSensitive: true },
    { headerAr: 'تنبيه تآكل الهامش', headerEn: 'Erosion Alert', field: (r) => (r.isNegativeMargin ? 'خسارة (بيع بأقل من التكلفة)' : r.isLowMargin ? 'هامش ضعيف (<10%)' : 'طبيعي') },
  ];

  const csv = generateCsvString(profitabilityItems, columns, canViewCosts, 'ar');
  downloadCsvFile(filename, csv);
}
