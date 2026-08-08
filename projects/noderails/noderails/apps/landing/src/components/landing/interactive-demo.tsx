import { SectionHeader } from '@/components/landing/section-header';

export function InteractiveDemo() {
  return (
    <section id="interactive-demo" className="nr-section-muted py-16 sm:py-24">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <SectionHeader
          align="center"
          eyebrow="Interactive Demo"
          title="See NodeRails in action"
          description="Explore the checkout and payment flow with a live interactive walkthrough."
          className="mx-auto"
        />
        <div className="nr-panel overflow-hidden p-2 sm:p-3">
          <div className="relative aspect-video w-full min-h-[240px] sm:min-h-[320px]">
            <iframe
              src="https://demo.arcade.software/fYpBogRqsEAUF1wU2vk2?embed&embed_mobile=tab&embed_desktop=inline&show_copy_link=true"
              title="NodeRails Interactive Demo"
              className="absolute inset-0 h-full w-full rounded-lg"
              loading="lazy"
              allow="clipboard-write"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}
