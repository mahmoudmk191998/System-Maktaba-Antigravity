/**
 * Analytics Definitions, Types & Formulas
 * Clear mathematical definitions for all Retail, Inventory, Demand, Partner & Financial KPIs.
 */

export interface KPIChange {
  current: number;
  previous?: number;
  absoluteChange?: number;
  percentageChange?: number; // e.g. +12.5% or -4.2%
}

export interface MetricDefinition {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  formula: string;
  category: 'sales' | 'inventory' | 'demand' | 'profitability' | 'partners' | 'finance' | 'operations';
}

export const OFFICIAL_METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'net_sales',
    nameEn: 'Net Sales Revenue',
    nameAr: 'صافي إيرادات المبيعات',
    descriptionEn: 'Total customer purchases minus commercial discounts and returns.',
    descriptionAr: 'إجمالي مبيعات العملاء مطروحاً منها الخصومات والمرتجعات.',
    formula: 'Gross Sales - Discounts - Returns',
    category: 'sales',
  },
  {
    id: 'cogs',
    nameEn: 'Cost of Goods Sold (COGS)',
    nameAr: 'تكلفة البضاعة المباعة',
    descriptionEn: 'The historical cost snapshot of items sold, adjusted for purchase returns and inventory counts.',
    descriptionAr: 'التكلفة التاريخية للبضائع المباعة استناداً إلى لقطة التكلفة لحظة البيع.',
    formula: 'Sum(SaleItem.quantity * SaleItem.unitCostSnapshot) - Sum(ReturnItem.quantity * ReturnItem.unitCostSnapshot)',
    category: 'profitability',
  },
  {
    id: 'gross_profit',
    nameEn: 'Gross Profit',
    nameAr: 'إجمالي الربح التجاري',
    descriptionEn: 'Operating profit before branch operating expenses and overhead.',
    descriptionAr: 'الربح الناتج عن المبيعات بعد خصم تكلفة البضاعة المباعة مباشرة وقبل المصروفات التشغيلية.',
    formula: 'Net Sales - COGS',
    category: 'profitability',
  },
  {
    id: 'gross_margin_pct',
    nameEn: 'Gross Margin %',
    nameAr: 'نسبة هامش الربح الإجمالي',
    descriptionEn: 'Percentage of revenue that exceeds the cost of goods sold.',
    descriptionAr: 'نسبة الربح الإجمالي إلى صافي إيرادات المبيعات.',
    formula: '(Gross Profit / Net Sales) * 100',
    category: 'profitability',
  },
  {
    id: 'inventory_turnover',
    nameEn: 'Inventory Turnover Ratio',
    nameAr: 'معدل دوران المخزون',
    descriptionEn: 'The number of times inventory is sold and replaced over a given period.',
    descriptionAr: 'عدد مرات بيع واستبدال المخزون خلال فترة زمنية محددة.',
    formula: 'Period COGS / Average Inventory Value',
    category: 'inventory',
  },
  {
    id: 'dio',
    nameEn: 'Days Inventory Outstanding (DIO)',
    nameAr: 'متوسط أيام بقاء المخزون',
    descriptionEn: 'Average number of days required to turn inventory into sales.',
    descriptionAr: 'متوسط عدد الأيام التي يستغرقها تحويل المخزون إلى مبيعات نقدية أو آجلة.',
    formula: '(Average Inventory Value / Period COGS) * Period Days',
    category: 'inventory',
  },
  {
    id: 'stock_cover_days',
    nameEn: 'Stock Cover (Days of Supply)',
    nameAr: 'أيام تغطية المخزون الحالي',
    descriptionEn: 'Estimated days current stock will last based on historical average daily sales.',
    descriptionAr: 'عدد الأيام المتوقعة لنفاد المخزون الحالي استناداً إلى متوسط المبيعات اليومية.',
    formula: 'Current Quantity Available / Average Daily Sales Quantity',
    category: 'inventory',
  },
  {
    id: 'sell_through_rate',
    nameEn: 'Sell-Through Rate %',
    nameAr: 'معدل التصريف النسبي %',
    descriptionEn: 'Percentage of inventory sold compared to the amount received/held.',
    descriptionAr: 'نسبة الوحدات المباعة إلى إجمالي الوحدات المستلمة والمخزنة خلال الفترة.',
    formula: '(Units Sold / (Beginning Inventory + Units Received)) * 100',
    category: 'inventory',
  },
  {
    id: 'reorder_need',
    nameEn: 'Explainable Reorder Quantity',
    nameAr: 'كمية إعادة الطلب الذكية والمبررة',
    descriptionEn: 'Recommended replenishment quantity balancing lead time, sales velocity, and safety buffer.',
    descriptionAr: 'كمية الشراء الموصى بها لتفادي العجز استناداً لسرعة البيع ومدة التوريد ومخزون الأمان.',
    formula: '(Average Daily Sales * Lead Time Days) + Safety Stock - Available Stock - Incoming POs',
    category: 'demand',
  },
  {
    id: 'dso',
    nameEn: 'Days Sales Outstanding (DSO)',
    nameAr: 'متوسط فترة التحصيل (أيام)',
    descriptionEn: 'Average time taken to collect receivables from credit customers.',
    descriptionAr: 'متوسط عدد الأيام التي تستغرقها المكتبة لتحصيل مستحقاتها من مبيعات الآجل.',
    formula: '(Accounts Receivable Balance / Total Credit Sales) * Period Days',
    category: 'finance',
  },
  {
    id: 'ccc',
    nameEn: 'Cash Conversion Cycle (CCC)',
    nameAr: 'دورة التحول النقدي (أيام)',
    descriptionEn: 'Time taken to convert investments in inventory and resources into cash inflows.',
    descriptionAr: 'المدة الزمنية الإجمالية لتحويل استثمار المخزون إلى تدفقات نقدية داخلة.',
    formula: 'DIO + DSO - DPO (Days Payable Outstanding)',
    category: 'finance',
  },
];

export function calculatePercentageChange(current: number, previous?: number): number | undefined {
  if (previous === undefined || previous === null || isNaN(previous)) return undefined;
  if (previous === 0) {
    return current > 0 ? 100 : current < 0 ? -100 : 0;
  }
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

export function buildKPIChange(current: number, previous?: number): KPIChange {
  const percentageChange = calculatePercentageChange(current, previous);
  const absoluteChange = previous !== undefined ? Number((current - previous).toFixed(2)) : undefined;
  return {
    current: Number(current.toFixed(2)),
    previous: previous !== undefined ? Number(previous.toFixed(2)) : undefined,
    absoluteChange,
    percentageChange,
  };
}
