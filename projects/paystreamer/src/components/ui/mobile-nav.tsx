import { cn } from "../../lib/utils";
import { useIsMobile } from "../../hooks/use-mobile";

export function MobileNav({
  items,
  currentPath,
}: {
  items: { label: string; href: string; icon: React.ReactNode }[];
  currentPath: string;
}) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-bg-primary/95 backdrop-blur-sm md:hidden">
      <div className="flex items-center justify-around py-2 px-4">
        {items.map((item) => {
          const isActive = currentPath === item.href || currentPath.startsWith(item.href + "/");
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-3 min-w-[44px] min-h-[44px] justify-center rounded-md transition-colors",
                isActive
                  ? "text-white bg-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}