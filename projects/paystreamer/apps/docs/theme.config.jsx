import { LiveModeToggle } from './components/LiveModeToggle';

export default {
  logo: (
    <div className="flex items-center gap-4">
      <strong>PayStreamer SDK</strong>
      <LiveModeToggle />
    </div>
  ),
  project: {
    link: 'https://github.com/paystreamer/sdk'
  },
  head: (
    <>
      <link rel="icon" href="/favicon.ico" />
      <link rel="icon" type="image/png" href="/logo.png" />
      <meta name="description" content="PayStreamer Docs — Complete documentation, React SDK reference, and API guides for PayStreamer recurring billing on Sui." />
      <meta property="og:title" content="PayStreamer Docs — Developer SDK & Integration Guide" />
      <meta property="og:description" content="Complete documentation, React SDK reference, and API guides for PayStreamer recurring billing on Sui." />
      <meta property="og:image" content="https://docs.usepaystreamer.xyz/og-image.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://docs.usepaystreamer.xyz/og-image.png" />
    </>
  ),
  useNextSeoProps() {
    return {
      titleTemplate: '%s – PayStreamer SDK'
    }
  }
}
