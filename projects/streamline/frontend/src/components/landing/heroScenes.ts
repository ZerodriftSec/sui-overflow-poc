export type PhoneScene =
  | "dashboard"
  | "drip"
  | "states"
  | "stats"
  | "finance"
  | "privacy"
  | "pro"
  | "names"
  | "work"
  | "scale"
  | "launch";

export type SceneTheme = "light" | "pro";

export type ScenePanel = {
  label: string;
  headline: string;
  accent: string;
  body: string;
  bullets: string[];
  metric?: { value: string; label: string };
  headlineLarge?: boolean;
};

export type PanelMode = "tiles" | "full";

export type HeroScene = {
  id: string;
  phone: PhoneScene;
  theme: SceneTheme;
  panelMode?: PanelMode;
  left: ScenePanel;
  right: ScenePanel;
  rightExtra?: ScenePanel;
};

export const HERO_SCENES: HeroScene[] = [
  {
    id: "hero",
    phone: "dashboard",
    theme: "light",
    panelMode: "tiles",
    left: {
      label: "",
      headline: "Moving money at",
      accent: "the  speed of work.",
      body: "Programmable Micropayments",
      bullets: [],
    },
    right: {
      label: "",
      headline: "Simply, ",
      accent: "Securely & Privately.",
      body: "Gasless, yield-bearing, liquid.",
      bullets: [],
    },
  },
  {
    id: "how",
    phone: "states",
    theme: "light",
    left: {
      label: "open your stream",
      headline: "Get paid as you Work",
      accent: "in Real time.",
      body: "No invoices. No wires. No waiting. Open a stream in seconds, and start recieving USDC in real time.",
      bullets: [
     ],
    },
    right: {
      label: "decentralised",
      headline: "Smart contracts ",
      accent: "replace the handshake.",
      body: "Flows only when milestones are approved. Auditable by all parties.",
      bullets: [
    ],
    },
  },
  {
    id: "finance",
    phone: "finance",
    theme: "light",
    left: {
      label: "earn more",
      headline: "Earn Yield ",
      accent: "with your Stream.",
      body: "Money shouldn't sit idle, so split your stream into yield, and savings, and let your earnings compound from the 1st second. Automatically.",
      bullets: [
      ],
      headlineLarge: true,
    },
    right: {
      label: "Use Anytime",
      headline: "Borrow against",
      accent: "your stream.",
      body: "Need cash today? Borrow against your stream's present value — one lump sum now, then part of your stream repays the lender automatically. No liquidation risk. No manual payments. No worries about collateral health.",
      bullets: [

      ],
    },
  },
  {
    id: "privacy",
    phone: "privacy",
    theme: "light",
    left: {
      label: "Remain Private",
      headline: "Your money is",
      accent: "nobody's business.",
      body: "When you don't want salary, rates or clients visible on-chain, use your streams privately. No configuration needed.",
      bullets: [
  
      ],
      headlineLarge: true,
    },
    right: {
      label: "Provable on demand",
      headline: "Audit trail &",
      accent: "Selective Disclosure.",
      body: "Accountant, bank, tax authority — share a proof they can verify. Streamline gives you selective disclosure on your terms, visible only to you, and whoever you choose to show.",
      bullets: [
   
      ],
    },
  },
  {
    id: "names",
    phone: "names",
    theme: "light",
    left: {
      label: "built for people",
      headline: "The name you can",
      accent: "Remember",
      body: "Pay and get paid without pasting a 64-character address — human-readable, on-chain.",
      bullets: [],
      headlineLarge: true,
    },
    right: {
      label: "…and for the machines",
      headline: "SDK & API",
      accent: "machines can use",
      body: "Program streams from code, agents, and backends on the same rails — one identity layer for humans and machines.",
      bullets: [],
    },
  },
  {
    id: "pro",
    phone: "pro",
    theme: "pro",
    left: {
      label: "Manage Payrolls",
      headline: "Payroll that  ",
      accent: "runs itself.",
      body: "Run contractor payroll, vendor milestones, and global disbursements from one dashboard. Create in bulk, lock per engagement, and let drips settle continuously, private and auditable.",
      bullets: [
        "Pay runs for 500+ contractors at once",
        "Team-based roles and permissions",
       "Milestones & approvals in batch",

      ],
    },
    right: {
      label: "global & instant",
      headline: "Zero Borders",
      accent: "Zero Banks",
      body: "USDC streams to anyone, anywhere, instantly. No SWIFT. No correspondent banks. No conversion fees. Same experience for a contractor in Lagos as an employee in London. Plus, the compliance-ready history is always audit ready.",
      bullets: [
      ],
    },
    rightExtra: {
      label: "Efficient capital",
      headline: "Your Capital",
      accent: "Works Harder.",
      body: "Every dollar committed to a stream earns yield before it reaches your team. Recover up to 12% APY on payroll capital automatically — no treasury management, no extra steps.",
      bullets: [

      ],
    },
  },
  {
    id: "work",
    phone: "work",
    theme: "pro",
    left: {
      label: "for professionals",
      headline: "Empowering",
      accent: "professionals.",
      body: "Freelancers, contractors, creatives — get paid as you deliver. Raise when you ship, drip by the second, borrow against what’s already streaming. Your work, your cash flow.",
      bullets: [],
      headlineLarge: true,
    },
    right: {
      label: "for teams",
      headline: "And",
      accent: "Organizations.",
      body: "Fund engagements once, unlock by milestone, run contractor payroll without wires or waiting. Same rails from one hire to a full roster — private when you need it, auditable when you don’t.",
      bullets: [],
    },
  },
  {
    id: "scale",
    phone: "scale",
    theme: "pro",
    left: {
      label: "get started",
      headline: "Start for",
      accent: "Free.",
      body: "Open a stream, claim your name, get paid in seconds. No card, no minimums — just work money on day one.",
      bullets: [],
      headlineLarge: true,
    },
    right: {
      label: "grow with you",
      headline: "Scale just when",
      accent: "You are Ready.",
      body: "Graduate to Pro when you need payroll, invoices, POS, and compliance — same rails, bigger surface. Pay for power only when the work demands it.",
      bullets: [],
    },
  },
  {
    id: "launch",
    phone: "launch",
    theme: "light",
    left: {
      label: "",
      headline: "",
      accent: "",
      body: "",
      bullets: [],
    },
    right: {
      label: "",
      headline: "",
      accent: "",
      body: "",
      bullets: [],
    },
  },
];

export const SCENE_COUNT = HERO_SCENES.length;

export function sceneIsPro(index: number): boolean {
  return HERO_SCENES[index]?.theme === "pro";
}
