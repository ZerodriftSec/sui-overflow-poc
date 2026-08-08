'use client';

export function CheckoutChainFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="checkout-chain-frame">
      {/* Corner brackets */}
      <span className="checkout-chain-frame__corner checkout-chain-frame__corner--tl" aria-hidden />
      <span className="checkout-chain-frame__corner checkout-chain-frame__corner--tr" aria-hidden />
      <span className="checkout-chain-frame__corner checkout-chain-frame__corner--bl" aria-hidden />
      <span className="checkout-chain-frame__corner checkout-chain-frame__corner--br" aria-hidden />

      {/* Animated edge rails */}
      <span className="checkout-chain-frame__edge checkout-chain-frame__edge--top" aria-hidden>
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--1" />
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--2" />
      </span>
      <span className="checkout-chain-frame__edge checkout-chain-frame__edge--right" aria-hidden>
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--1" />
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--2" />
      </span>
      <span className="checkout-chain-frame__edge checkout-chain-frame__edge--bottom" aria-hidden>
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--1" />
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--2" />
      </span>
      <span className="checkout-chain-frame__edge checkout-chain-frame__edge--left" aria-hidden>
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--1" />
        <span className="checkout-chain-frame__packet checkout-chain-frame__packet--2" />
      </span>

      <div className="checkout-chain-frame__content">{children}</div>
    </div>
  );
}
