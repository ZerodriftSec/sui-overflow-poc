'use client';

import { useState } from 'react';

/* ─── Inline style objects (bypasses Tailwind v4 layer conflicts) ─── */

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = 'typescript', title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [hoverCopy, setHoverCopy] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 12,
        border: '1px solid #1e293b',
        backgroundColor: '#0f172a',
        overflow: 'hidden',
        margin: '16px 0',
      }}
    >
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            backgroundColor: '#1e293b',
            borderBottom: '1px solid #334155',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>{title}</span>
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Monaco','Menlo',monospace",
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {language}
          </span>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <button
          onClick={handleCopy}
          onMouseEnter={() => setHoverCopy(true)}
          onMouseLeave={() => setHoverCopy(false)}
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 8,
            backgroundColor: hoverCopy ? '#475569' : '#334155',
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: hoverCopy ? '#e2e8f0' : '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.15s, color 0.15s',
          }}
        >
          {copied ? (
            <>
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy
            </>
          )}
        </button>
        <pre
          style={{
            overflowX: 'auto',
            padding: 16,
            fontSize: 13,
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          <code
            style={{
              fontFamily: "'Monaco','Menlo','Ubuntu Mono','Consolas',monospace",
              color: '#e2e8f0',
            }}
          >
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

/* ─── Param ─── */

interface ParamProps {
  name: string;
  type: string;
  required?: boolean;
  description: string;
  children?: React.ReactNode;
}

export function Param({ name, type, required, description, children }: ParamProps) {
  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <code
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#4f46e5',
            fontFamily: "'Monaco','Menlo',monospace",
            background: 'none',
            padding: 0,
          }}
        >
          {name}
        </code>
        <span
          style={{
            fontSize: 11,
            fontFamily: "'Monaco','Menlo',monospace",
            color: '#94a3b8',
          }}
        >
          {type}
        </span>
        {required && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#e11d48',
              backgroundColor: '#fff1f2',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            required
          </span>
        )}
      </div>
      <p style={{ marginTop: 4, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{description}</p>
      {children && (
        <div style={{ marginTop: 8, marginLeft: 16, borderLeft: '2px solid #e2e8f0', paddingLeft: 16 }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Endpoint ─── */

interface EndpointProps {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description?: string;
}

const methodInlineStyles: Record<string, React.CSSProperties> = {
  GET: { backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' },
  POST: { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  PUT: { backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' },
  DELETE: { backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' },
};

export function Endpoint({ method, path, description }: EndpointProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        padding: '12px 16px',
        margin: '16px 0',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontFamily: "'Monaco','Menlo',monospace",
          ...methodInlineStyles[method],
        }}
      >
        {method}
      </span>
      <code
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#1e293b',
          fontFamily: "'Monaco','Menlo',monospace",
          background: 'none',
          padding: 0,
        }}
      >
        {path}
      </code>
      {description && (
        <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 'auto' }}>{description}</span>
      )}
    </div>
  );
}

/* ─── Callout ─── */

interface CalloutProps {
  type?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
  children: React.ReactNode;
}

const calloutInlineStyles: Record<
  string,
  { bg: string; border: string; icon: string; titleColor: string; leftBorder: string }
> = {
  info: { bg: '#eff6ff', border: '#bfdbfe', icon: '💡', titleColor: '#1e40af', leftBorder: '#3b82f6' },
  warning: { bg: '#fffbeb', border: '#fde68a', icon: '⚠️', titleColor: '#92400e', leftBorder: '#f59e0b' },
  success: { bg: '#ecfdf5', border: '#a7f3d0', icon: '✅', titleColor: '#065f46', leftBorder: '#10b981' },
  danger: { bg: '#fff1f2', border: '#fecdd3', icon: '🚨', titleColor: '#9f1239', leftBorder: '#f43f5e' },
};

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const s = calloutInlineStyles[type];
  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${s.border}`,
        borderLeft: `4px solid ${s.leftBorder}`,
        backgroundColor: s.bg,
        padding: '14px 16px',
        margin: '16px 0',
      }}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{s.icon}</span>
        <div>
          {title && (
            <p style={{ fontWeight: 600, fontSize: 13, color: s.titleColor, marginBottom: 4 }}>{title}</p>
          )}
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.65 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── ResponseField ─── */

interface ResponseFieldProps {
  name: string;
  type: string;
  description: string;
}

export function ResponseField({ name, type, description }: ResponseFieldProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid #f1f5f9',
      }}
    >
      <code
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#1e293b',
          fontFamily: "'Monaco','Menlo',monospace",
          background: 'none',
          padding: 0,
        }}
      >
        {name}
      </code>
      <span style={{ fontSize: 11, fontFamily: "'Monaco','Menlo',monospace", color: '#94a3b8' }}>
        {type}
      </span>
      <span style={{ fontSize: 13, color: '#64748b', marginLeft: 'auto' }}>{description}</span>
    </div>
  );
}

/* ─── ParamsTable ─── */

export function ParamsTable({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: 16,
        margin: '16px 0',
      }}
    >
      <h4
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#64748b',
          marginBottom: 12,
          marginTop: 0,
        }}
      >
        Parameters
      </h4>
      {children}
    </div>
  );
}

/* ─── ResponseTable ─── */

export function ResponseTable({ children, title = 'Response' }: { children: React.ReactNode; title?: string }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: 16,
        margin: '16px 0',
      }}
    >
      <h4
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#64748b',
          marginBottom: 12,
          marginTop: 0,
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}
