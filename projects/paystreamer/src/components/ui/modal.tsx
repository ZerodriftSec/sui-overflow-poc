import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function Modal({ className, open, onOpenChange, children, ...props }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm",
        className
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onOpenChange?.(false);
        }
      }}
      {...props}
    >
      {children}
    </div>
  );
}

interface ModalContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function ModalContent({ className, children, ...props }: ModalContentProps) {
  return (
    <div
      className={cn(
        "relative w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg mx-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function ModalHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-1.5 mb-4", className)} {...props} />
  );
}

function ModalTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
  );
}

function ModalDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function ModalFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex justify-end gap-3 mt-4", className)} {...props} />;
}

function ModalClose({ className, onClick, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100",
        className
      )}
      onClick={onClick}
      {...props}
    />
  );
}

export { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter, ModalClose };