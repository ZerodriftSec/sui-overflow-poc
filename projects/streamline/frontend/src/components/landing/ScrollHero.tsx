"use client";

import { useState } from "react";
import { HeroNav } from "./HeroNav";
import { HeroBackground } from "./HeroBackground";
import { PhoneMockup } from "./PhoneMockup";
import { SceneTextPanel } from "./SceneTextPanel";
import { HERO_SCENES, SCENE_COUNT } from "./heroScenes";
import { useSceneNavigation } from "./useSceneNavigation";
import type { PhoneAppRoute } from "@/components/app/phone/types";
import { HERO_LAYOUT_MAX_CLASS } from "./heroLayout";
import { LegalFooter } from "./LegalFooter";

export function ScrollHero() {
  const [phoneApp, setPhoneApp] = useState<PhoneAppRoute | null>(null);
  const launchApp = () => setPhoneApp("launcher");
  const closeApp = () => setPhoneApp(null);

  const { activeIndex, sceneProgress, transitioning, goTo } = useSceneNavigation({
    enabled: phoneApp === null,
  });
  const scene = HERO_SCENES[activeIndex];
  const textVisible = !transitioning;
  const isLast = activeIndex === SCENE_COUNT - 1;
  const isPro = scene.theme === "pro";
  const inApp = phoneApp !== null;
  const isIntroTiles = scene.panelMode === "tiles";
  const panelTall = scene.rightExtra;

  return (
    <div
      className={`fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden transition-colors duration-700 ${
        inApp ? "bg-white" : isPro ? "bg-[#0a0a0a]" : "bg-white"
      }`}
    >
      <HeroBackground theme={inApp ? "light" : scene.theme} />
      <HeroNav
        theme={inApp ? "light" : scene.theme}
        inApp={inApp}
        onLaunchApp={launchApp}
        onBackToMain={closeApp}
      />

      {/* Desktop: fixed 3-column grid — text slots always same size */}
      <div
        className={`relative z-10 mx-auto hidden w-full ${HERO_LAYOUT_MAX_CLASS} flex-1 items-center px-8 lg:grid lg:grid-cols-[1fr_auto_1fr] ${
          inApp
            ? ""
            : "-translate-y-4 lg:-translate-y-9 xl:-translate-y-10"
        } ${
          isIntroTiles ? "lg:gap-8 xl:gap-12" : "lg:gap-16 xl:gap-24"
        }`}
      >
        <div
          className={`relative flex justify-end transition-opacity duration-500 ${
            isIntroTiles
              ? "h-[min(42vh,360px)] items-start lg:-translate-y-6"
              : panelTall
                ? "h-[min(78vh,620px)] items-center"
                : "h-[320px] items-center"
          } ${inApp ? "pointer-events-none opacity-30" : ""}`}
        >
          {HERO_SCENES.map((s, i) => (
            <div
              key={s.id}
              className={`absolute inset-0 flex justify-end ${
                isIntroTiles ? "items-start" : "items-center"
              } ${i === activeIndex ? "z-10" : "z-0 pointer-events-none"}`}
            >
              {i === activeIndex &&
                (i === SCENE_COUNT - 1 ? (
                  <SceneTextPanel
                    side="left"
                    content={s.left}
                    theme={s.theme}
                    visible={textVisible && !inApp}
                    storeCard="apple"
                  />
                ) : (
                  <SceneTextPanel
                    side="left"
                    content={s.left}
                    theme={s.theme}
                    panelMode={s.panelMode}
                    visible={textVisible && !inApp}
                  />
                ))}
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-center px-4 py-2">
          <PhoneMockup
            scene={scene.phone}
            sceneProgress={sceneProgress}
            transitioning={transitioning}
            theme={scene.theme}
            phoneApp={phoneApp}
            onPhoneAppChange={setPhoneApp}
            onCloseApp={closeApp}
            onLaunchApp={launchApp}
          />
        </div>

        <div
          className={`relative flex justify-start transition-opacity duration-500 ${
            isIntroTiles
              ? "h-[min(42vh,360px)] items-end lg:translate-y-6"
              : panelTall
                ? "h-[min(78vh,620px)] items-center"
                : "h-[320px] items-center"
          } ${inApp ? "pointer-events-none opacity-30" : ""}`}
        >
          {HERO_SCENES.map((s, i) => (
            <div
              key={s.id}
              className={`absolute inset-0 flex justify-start ${
                isIntroTiles ? "items-end" : "items-center"
              } ${i === activeIndex ? "z-10" : "z-0 pointer-events-none"}`}
            >
              {i === activeIndex &&
                (s.rightExtra ? (
                  <div className="flex w-full max-w-[360px] flex-col gap-10 lg:gap-12">
                    <SceneTextPanel
                      side="right"
                      content={s.right}
                      theme={s.theme}
                      panelMode={s.panelMode}
                      visible={textVisible && !inApp}
                      stacked
                    />
                    <SceneTextPanel
                      side="right"
                      content={s.rightExtra}
                      theme={s.theme}
                      panelMode={s.panelMode}
                      visible={textVisible && !inApp}
                      stacked
                    />
                  </div>
                ) : (
                  <SceneTextPanel
                    side="right"
                    content={s.right}
                    theme={s.theme}
                    panelMode={s.panelMode}
                    visible={textVisible && !inApp}
                    storeCard={i === SCENE_COUNT - 1 ? "google" : undefined}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile */}
      <div
        className={`relative z-10 flex flex-1 flex-col items-center justify-center px-[5%] lg:hidden ${
          inApp ? "" : "-translate-y-3"
        }`}
      >
        <PhoneMockup
          scene={scene.phone}
          sceneProgress={sceneProgress}
          transitioning={transitioning}
          theme={scene.theme}
          compact
          phoneApp={phoneApp}
          onPhoneAppChange={setPhoneApp}
          onCloseApp={closeApp}
          onLaunchApp={launchApp}
        />
        {!inApp && (
          <div
            className={`mt-6 w-full ${
              scene.panelMode === "tiles"
                ? "flex max-w-[360px] gap-3"
                : "max-w-[360px]"
            }`}
          >
            {isLast ? (
              <div className="mt-4 flex w-full max-w-[360px] gap-3">
                <SceneTextPanel
                  side="left"
                  content={scene.left}
                  theme={scene.theme}
                  visible={textVisible}
                  compact
                  storeCard="apple"
                />
                <SceneTextPanel
                  side="right"
                  content={scene.right}
                  theme={scene.theme}
                  visible={textVisible}
                  compact
                  storeCard="google"
                />
              </div>
            ) : (
              <>
                <SceneTextPanel
                  side="left"
                  content={scene.left}
                  theme={scene.theme}
                  panelMode={scene.panelMode}
                  visible={textVisible}
                  compact
                />
                {scene.panelMode !== "tiles" && (
                  <div className="mt-4 space-y-4">
                    <SceneTextPanel
                      side="right"
                      content={scene.right}
                      theme={scene.theme}
                      visible={textVisible}
                      compact
                      stacked={!!scene.rightExtra}
                    />
                    {scene.rightExtra && (
                      <SceneTextPanel
                        side="right"
                        content={scene.rightExtra}
                        theme={scene.theme}
                        visible={textVisible}
                        compact
                        stacked
                      />
                    )}
                  </div>
                )}
                {scene.panelMode === "tiles" && (
                  <SceneTextPanel
                    side="right"
                    content={scene.right}
                    theme={scene.theme}
                    panelMode={scene.panelMode}
                    visible={textVisible}
                    compact
                  />
                )}
              </>
            )}
            {isLast && (
              <button
                type="button"
                onClick={launchApp}
                className="sl-glass-btn sl-glass-btn-primary mt-5 font-semibold"
              >
                Start App →
              </button>
            )}
          </div>
        )}
      </div>

      {isLast && textVisible && !inApp && (
        <button
          type="button"
          onClick={() => goTo(0)}
          className="sl-glass-btn absolute bottom-6 right-[5%] z-30 !gap-2"
          aria-label="Start over from the beginning"
        >
          <span aria-hidden className="text-base leading-none">
            ↺
          </span>
          Start over
        </button>
      )}

      {!isLast && !inApp && (
        <p
          className={`absolute bottom-6 right-[5%] z-30 hidden text-[10px] font-medium uppercase tracking-[0.2em] lg:block ${
            isPro ? "text-white/30" : "text-black/25"
          }`}
        >
          Scroll ↓
        </p>
      )}

      {!inApp && (
        <div className="absolute bottom-5 left-0 right-0 z-30 px-[5%]">
          <LegalFooter theme={scene.theme} />
        </div>
      )}
    </div>
  );
}
