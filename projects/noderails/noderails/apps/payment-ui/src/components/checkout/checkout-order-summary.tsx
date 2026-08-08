'use client';

import { Package } from 'lucide-react';

type LineItem = {
  description?: string;
  name?: string;
  amount: number | string;
  currency: string;
  quantity: number;
};

type ProductPlan = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
};

type LinkedPrice = {
  amount: number;
  billingInterval?: string | null;
  billingIntervalCount?: number | null;
};

function billingCadenceLabel(linkedPrice: LinkedPrice): string {
  if (!linkedPrice.billingInterval) return 'One-time payment';
  const count = linkedPrice.billingIntervalCount ?? 1;
  const interval = linkedPrice.billingInterval.toLowerCase();
  if (count > 1) {
    return `Billed every ${count} ${interval}${interval.endsWith('s') ? '' : 's'}`;
  }
  return `Billed every ${interval}`;
}

export function CheckoutOrderSummary({
  title,
  description,
  currency,
  totalAmount,
  subtotal,
  taxAmount,
  taxDescription,
  items,
  productPlan,
  linkedPrice,
  hasFixedAmount = true,
}: {
  title: string;
  description?: string | null;
  currency: string;
  totalAmount: number;
  subtotal?: number | null;
  taxAmount?: number | null;
  taxDescription?: string | null;
  items?: LineItem[];
  productPlan?: ProductPlan | null;
  linkedPrice?: LinkedPrice | null;
  hasFixedAmount?: boolean;
}) {
  const isSubscription = Boolean(linkedPrice?.billingInterval);
  const lineItems = productPlan ? [] : (items ?? []);
  const hasTax = taxAmount != null && taxAmount > 0 && subtotal != null;

  return (
    <div className="checkout-order-summary">
      <div className="checkout-order-summary__headline">
        <p className="checkout-order-summary__intent-label">
          {isSubscription ? 'Subscribe to' : 'Pay for'}
        </p>
        <h1 className="checkout-order-summary__title">{title}</h1>
        {description && (
          <p className="checkout-order-summary__desc">{description}</p>
        )}
      </div>

      {hasFixedAmount && (
        <div className="checkout-order-summary__price-hero">
          <span className="checkout-order-summary__price-amount tabular-nums">
            ${totalAmount.toFixed(2)}
          </span>
          <span className="checkout-order-summary__price-currency">{currency}</span>
          {linkedPrice?.billingInterval && (
            <span className="checkout-order-summary__price-interval">
              /{linkedPrice.billingInterval.toLowerCase()}
            </span>
          )}
        </div>
      )}

      {productPlan && (
        <div className="checkout-order-summary__card">
          <div className="checkout-order-summary__plan-row">
            {productPlan.imageUrl ? (
              <img
                src={productPlan.imageUrl}
                alt=""
                className="checkout-order-summary__plan-icon"
              />
            ) : (
              <div className="checkout-order-summary__plan-icon-fallback">
                <Package className="h-5 w-5" strokeWidth={1.75} />
              </div>
            )}
            <div className="checkout-order-summary__plan-copy">
              <p className="checkout-order-summary__plan-name">{productPlan.name}</p>
              {productPlan.description && (
                <p className="checkout-order-summary__plan-desc">{productPlan.description}</p>
              )}
            </div>
          </div>
          {linkedPrice && (
            <div className="checkout-order-summary__plan-billing">
              <span className="checkout-order-summary__plan-billing-label">
                {billingCadenceLabel(linkedPrice)}
              </span>
              <span className="checkout-order-summary__plan-billing-amount tabular-nums">
                ${Number(linkedPrice.amount).toFixed(2)}
                {linkedPrice.billingInterval && (
                  <span className="checkout-order-summary__plan-billing-interval">
                    /{linkedPrice.billingInterval.toLowerCase()}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {lineItems.length > 0 && (
        <div className="checkout-order-summary__card checkout-order-summary__card--list">
          {lineItems.map((item, idx) => {
            const lineTotal = Number(item.amount) * item.quantity;
            const label = item.name || item.description || 'Item';

            return (
              <div key={idx} className="checkout-order-summary__line-item">
                <div className="checkout-order-summary__line-item-copy">
                  <p className="checkout-order-summary__line-item-label">{label}</p>
                  {item.quantity > 1 && (
                    <p className="checkout-order-summary__line-item-qty">Qty: {item.quantity}</p>
                  )}
                </div>
                <span className="checkout-order-summary__line-item-amount tabular-nums">
                  ${lineTotal.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {hasFixedAmount && hasTax && (
        <div className="checkout-order-summary__breakdown">
          <div className="checkout-order-summary__breakdown-row">
            <span className="checkout-order-summary__breakdown-label">
              {isSubscription ? 'Plan price' : 'Subtotal'}
            </span>
            <span className="checkout-order-summary__breakdown-value tabular-nums">
              ${Number(subtotal).toFixed(2)}
            </span>
          </div>
          <div className="checkout-order-summary__breakdown-row">
            <span className="checkout-order-summary__breakdown-label">
              {taxDescription ?? 'Tax'}
            </span>
            <span className="checkout-order-summary__breakdown-value tabular-nums">
              ${Number(taxAmount).toFixed(2)}
            </span>
          </div>
          <div className="checkout-order-summary__breakdown-row checkout-order-summary__breakdown-row--final">
            <span className="checkout-order-summary__breakdown-label">
              {isSubscription ? 'Due today' : 'Total'}
            </span>
            <span className="checkout-order-summary__breakdown-total tabular-nums">
              ${totalAmount.toFixed(2)} {currency}
            </span>
          </div>
        </div>
      )}

      {!hasFixedAmount && !linkedPrice && (
        <p className="checkout-order-summary__open-amount">Open amount: pay what you choose</p>
      )}
    </div>
  );
}
