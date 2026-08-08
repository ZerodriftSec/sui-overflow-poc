import Link from 'next/link';

const EFFECTIVE_DATE = '24 March 2026';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12 docs-content">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-indigo-600">Legal</p>
          <h1>Terms and Conditions</h1>
          <p className="subtitle">Effective date: {EFFECTIVE_DATE}</p>

          <p>
            These Terms and Conditions govern your access to and use of NodeRails products, including our hosted checkout,
            payment links, invoicing, subscriptions, payout tooling, APIs, SDKs, and dashboards.
          </p>

          <h2>1. Scope of Service</h2>
          <p>
            NodeRails provides software and infrastructure for crypto payment processing workflows. We provide technology,
            orchestration, and settlement tooling for merchants and developers.
          </p>

          <h2>2. Non-Custodial Model</h2>
          <p>
            NodeRails is a non-custodial platform. We do not custody user or customer funds, do not control private keys,
            and do not operate as a bank, wallet custodian, broker, or exchange for customer assets. Funds settle to
            addresses and accounts designated by you.
          </p>

          <h2>3. Compliance Model and Shared Responsibilities</h2>
          <p>
            NodeRails helps merchants with compliance operations through platform controls, risk tooling, workflow
            support, and reporting capabilities. However, legal responsibility for your business activities remains with
            you, including compliance with laws and regulations applicable to your products, customers, and jurisdictions.
          </p>
          <ul>
            <li>NodeRails may provide controls that support KYC, AML, sanctions, and monitoring workflows.</li>
            <li>You remain responsible for final compliance decisions and legally required disclosures.</li>
            <li>Only use the service for lawful products and services.</li>
            <li>Do not process payments that violate sanctions or prohibited-use rules.</li>
            <li>Maintain accurate business and payout information.</li>
            <li>Handle customer disputes and refunds in accordance with applicable law.</li>
          </ul>

          <h2>4. Prohibited Activities</h2>
          <p>You may not use NodeRails for:</p>
          <ul>
            <li>Fraud, theft, money laundering, terrorist financing, or sanctions evasion.</li>
            <li>Illegal goods/services, phishing, malware distribution, or deceptive practices.</li>
            <li>Attempts to reverse engineer, exploit, or disrupt the platform.</li>
          </ul>

          <h2>5. Platform Fees</h2>
          <p>
            Platform fees are disclosed in your pricing plan and include blockchain network execution costs handled by
            NodeRails for supported payment flows. There are no separate network or gas charges billed to you beyond the
            platform fee disclosed in your plan, unless explicitly stated in a custom enterprise agreement.
          </p>

          <h2>6. Service Reliability and Product Improvements</h2>
          <p>
            NodeRails is designed for high availability and we continuously improve platform reliability, performance,
            and chain support. From time to time we may release feature, API, and integration updates to improve the
            product. When changes affect implementation behavior, we aim to communicate updates with reasonable notice.
          </p>

          <h2>7. Security and Account Use</h2>
          <p>
            You are responsible for securing API keys, credentials, wallet setup, and internal access controls. You must
            notify us promptly of any suspected unauthorized access.
          </p>

          <h2>8. Intellectual Property</h2>
          <p>
            NodeRails and related software, branding, and documentation are protected by intellectual property laws. You
            receive a limited, revocable right to use the service under these terms.
          </p>

          <h2>9. Disclaimers</h2>
          <p>
            The service is provided on an "as is" and "as available" basis. To the maximum extent permitted by law,
            NodeRails disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement.
          </p>

          <h2>10. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, NodeRails will not be liable for indirect, incidental, special,
            consequential, or punitive damages, or for loss of profits, data, reputation, or opportunity.
          </p>

          <h2>11. Suspension and Termination</h2>
          <p>
            We may suspend or terminate access where required for legal, regulatory, security, abuse-prevention, or
            platform-integrity reasons.
          </p>

          <h2>12. Updates to These Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the service after updates constitutes acceptance
            of the revised terms.
          </p>

          <h2>13. Contact</h2>
          <p>
            For legal and compliance questions, contact us at{' '}
            <a href="mailto:business@noderails.com">business@noderails.com</a>.
          </p>

          <hr />

          <p className="text-sm text-slate-500">
            This page is provided for general information and does not constitute legal advice. Consult qualified legal
            counsel for your specific obligations.
          </p>

          <p className="mt-6 text-sm">
            Also review our <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
