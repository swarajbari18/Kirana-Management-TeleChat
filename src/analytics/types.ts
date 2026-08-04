export interface PaymentSlice {
  paise: number;
  count: number;
}

export interface PeriodMetrics {
  periodId: string;
  label: string;
  rangeStartIso: string;
  rangeEndIso: string;
  totalSalesPaise: number;
  billCount: number;
  gstCollectedPaise: number;
  paymentBreakdown: {
    cash: PaymentSlice;
    upi: PaymentSlice;
    khata: PaymentSlice;
  };
  khataCreditsInPeriod: {
    creditSalePaise: number;
    manualCreditPaise: number;
  };
  topItems: Array<{
    sku: string;
    productName: string;
    revenuePaise: number;
    quantity: number;
  }>;
  totalOutstandingUdharPaise: number;
}

export interface DayRowMetrics {
  dateIso: string;
  totalSalesPaise: number;
  billCount: number;
  gstCollectedPaise: number;
  paymentBreakdown: {
    cash: PaymentSlice;
    upi: PaymentSlice;
    khata: PaymentSlice;
  };
  khataCreditsInPeriod: {
    creditSalePaise: number;
    manualCreditPaise: number;
  };
  totalOutstandingUdharPaise: number;
}

export interface AnalysisSnapshot {
  generatedAtIso: string;
  shopName: string;
  daily: PeriodMetrics;
  currentWeek: PeriodMetrics & { days: DayRowMetrics[] };
  weekly: PeriodMetrics;
  currentMonth: PeriodMetrics;
  monthly: PeriodMetrics;
  yearly: PeriodMetrics;
  lowStockProducts: Array<{
    sku: string;
    productName: string;
    quantityOnHand: number;
    reorderLevel: number;
  }>;
}

export interface PeriodRange {
  periodId: string;
  label: string;
  startIso: string;
  endIso: string;
}

export const EMPTY_PAYMENT_BREAKDOWN = {
  cash: { paise: 0, count: 0 },
  upi: { paise: 0, count: 0 },
  khata: { paise: 0, count: 0 },
} as const;
