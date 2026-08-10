import Link from 'next/link';

const EFFECTIVE_DATE = '24 March 2026';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12 docs-content">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-indigo-600">Legal</p>
          <h1>Privacy Policy</h1>
          <p className="subtitle">Effective date: {EFFECTIVE_DATE}</p>

          <p>
            This Privacy Policy explains how NodeRails collects, uses, stores, and shares personal data when you use our
            websites, APIs, dashboards, and related services.
          </p>

          <h2>1. Data We Collect</h2>
          <ul>
            <li>Account and business information (name, email, organization, role).</li>
            <li>Service usage and event data (logs, diagnostics, API metadata, analytics).</li>
            <li>Billing and plan information.</li>
            <li>Support and communications data.</li>
          </ul>

          <h2>2. Non-Custodial Clarification</h2>
          <p>
            NodeRails is non-custodial. We do not hold customer funds or private keys. We may process transaction metadata
            required to operate payment workflows, monitor reliability, prevent abuse, and satisfy legal obligations.
          </p>

          <h2>3. How We Use Data</h2>
          <ul>
            <li>Provide, secure, and improve the service.</li>
            <li>Authenticate users and enforce platform access controls.</li>
            <li>Detect fraud, abuse, sanctions risks, and security incidents.</li>
            <li>Operate merchant-facing compliance and risk workflows we provide through the platform.</li>
            <li>Provide customer support and service communications.</li>
            <li>Meet legal, regulatory, tax, and audit requirements.</li>
          </ul>

          <h2>4. Legal Bases (Where Applicable)</h2>
          <p>
            We process data based on contract performance, legitimate interests, legal obligations, and, where required,
            consent.
          </p>

          <h2>5. Data Sharing</h2>
          <p>We may share data with:</p>
          <ul>
            <li>Infrastructure and analytics providers acting as processors.</li>
            <li>Compliance, risk, or security vendors where required.</li>
            <li>Authorities when legally required.</li>
            <li>Professional advisers and auditors under confidentiality obligations.</li>
          </ul>

          <h2>6. International Transfers</h2>
          <p>
            Data may be processed in countries other than your own. We use contractual and organizational safeguards where
            required by law.
          </p>

          <h2>7. Retention</h2>
          <p>
            We retain data only as long as necessary for service operation, contractual commitments, dispute resolution,
            compliance, and legal recordkeeping.
          </p>

          <h2>8. Security</h2>
          <p>
            We use technical and organizational measures designed to protect data. No system is perfectly secure, so you
            should also secure your credentials, wallets, and internal environments.
          </p>

          <h2>9. Your Rights</h2>
          <p>
            Subject to local law, you may have rights to access, correct, delete, restrict, or port your personal data, or
            object to certain processing.
          </p>

          <h2>10. Cookies and Analytics</h2>
          <p>
            We use cookies and analytics technologies to understand product usage and improve performance. You can manage
            browser cookie settings directly in your browser.
          </p>

          <h2>11. Children</h2>
          <p>
            Our services are intended for businesses and adults. We do not knowingly collect personal data from children.
          </p>

          <h2>12. Policy Updates</h2>
          <p>
            We may revise this Privacy Policy periodically. Material updates will be posted on this page with an updated
            effective date.
          </p>

          <h2>13. Contact</h2>
          <p>
            For privacy requests and questions, contact{' '}
            <a href="mailto:business@noderails.com">business@noderails.com</a>.
          </p>

          <hr />

          <p className="mt-6 text-sm">
            Also review our <Link href="/terms">Terms and Conditions</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
