export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toFixed(2)}`;
}

export function formatCreateCustomerConfirmation(input: {
  canonicalName: string;
  aliases: string[];
}): string {
  const lines = [
    "Create khata customer?",
    "",
    `Name: ${input.canonicalName}`,
  ];
  if (input.aliases.length > 0) {
    lines.push(`Aliases: ${input.aliases.join(", ")}`);
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}

export function formatManualCreditConfirmation(input: {
  customerName: string;
  amountPaise: number;
  currentBalancePaise: number;
  notes?: string;
}): string {
  const newBalance = input.currentBalancePaise + input.amountPaise;
  const lines = [
    "Record manual credit (udhar)?",
    "",
    `Customer: ${input.customerName}`,
    `Amount: ${formatPaise(input.amountPaise)}`,
    `Current balance: ${formatPaise(input.currentBalancePaise)}`,
    `New balance: ${formatPaise(newBalance)}`,
  ];
  if (input.notes) {
    lines.push(`Notes: ${input.notes}`);
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}

export function formatPaymentConfirmation(input: {
  customerName: string;
  amountPaise: number;
  currentBalancePaise: number;
  notes?: string;
}): string {
  const newBalance = input.currentBalancePaise - input.amountPaise;
  const lines = [
    "Record customer payment?",
    "",
    `Customer: ${input.customerName}`,
    `Payment: ${formatPaise(input.amountPaise)}`,
    `Current balance: ${formatPaise(input.currentBalancePaise)}`,
    `Resulting balance: ${formatPaise(newBalance)}`,
  ];
  if (input.notes) {
    lines.push(`Notes: ${input.notes}`);
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}

export function formatPaymentWithCreateCustomerConfirmation(input: {
  customerName: string;
  amountPaise: number;
  notes?: string;
}): string {
  const resultingBalance = -input.amountPaise;
  const lines = [
    "Customer not in khata — create and record payment?",
    "",
    `Customer: ${input.customerName}`,
    `Payment: ${formatPaise(input.amountPaise)}`,
    `Current balance: ${formatPaise(0)}`,
    `Resulting balance: ${formatPaise(resultingBalance)}`,
    "",
    "A new khata customer will be created.",
  ];
  if (input.notes) {
    lines.push(`Notes: ${input.notes}`);
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}

export function formatCreditFromBillConfirmation(input: {
  billId: string;
  customerName: string;
  amountPaise: number;
  createCustomer: boolean;
  currentBalancePaise?: number;
}): string {
  const lines = [
    input.createCustomer
      ? "Customer not in khata — create and record bill credit?"
      : "Record bill credit on khata?",
    "",
    `Bill: ${input.billId.slice(0, 8)}`,
    `Customer: ${input.customerName}`,
    `Credit amount: ${formatPaise(input.amountPaise)}`,
  ];
  if (input.createCustomer) {
    lines.push("A new khata customer will be created.");
  } else if (input.currentBalancePaise !== undefined) {
    lines.push(`Current balance: ${formatPaise(input.currentBalancePaise)}`);
    lines.push(
      `New balance: ${formatPaise(input.currentBalancePaise + input.amountPaise)}`,
    );
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}
