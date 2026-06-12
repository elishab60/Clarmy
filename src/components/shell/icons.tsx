import type { SVGProps } from "react";

type IconName = "office" | "sessions" | "projects" | "history" | "skills" | "mcp" | "plugins" | "hooks" | "settings" | "metrics" | "agents" | "crons";

const stroke = { stroke: "currentColor", strokeWidth: 1.4, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

const PATHS: Record<IconName, React.ReactNode> = {
  office: (<>
    <rect x="1" y="5" width="10" height="6" rx="0.5" />
    <path d="M3 5V3.5A1.5 1.5 0 0 1 4.5 2h3A1.5 1.5 0 0 1 9 3.5V5" fill="none" />
    <rect x="4.75" y="7" width="2.5" height="4" />
  </>),
  sessions: (<>
    <rect x="1.5" y="1.5" width="4" height="4" {...stroke}/>
    <rect x="7.5" y="1.5" width="4" height="4" {...stroke}/>
    <rect x="1.5" y="7.5" width="4" height="4" {...stroke}/>
    <rect x="7.5" y="7.5" width="4" height="4" {...stroke}/>
  </>),
  projects: (<path d="M1.5 3.5h4l1 1h4.5v6.5h-9.5z" {...stroke}/>),
  history: (<>
    <circle cx="6.5" cy="6.5" r="5" {...stroke}/>
    <path d="M6.5 3.5v3l2 1.5" {...stroke}/>
  </>),
  skills: (<path d="M6.5 1.5l2 2 2.5 .5-1.5 2 .5 2.5-2.5-.5-1 2-1-2-2.5.5.5-2.5-1.5-2 2.5-.5z" {...stroke}/>),
  mcp: (<>
    <rect x="2" y="2" width="9" height="9" {...stroke}/>
    <path d="M2 5.5h9M5.5 2v9" {...stroke}/>
  </>),
  plugins: (<path d="M3 2v3H1.5v3h1.5v3h7v-3h1.5v-3h-1.5v-3" {...stroke}/>),
  hooks: (<path d="M3 2v5a3 3 0 0 0 6 0v-1" {...stroke}/>),
  metrics: (<>
    <path d="M1.5 11.5h10" {...stroke}/>
    <path d="M3 9.5v-3M6 9.5v-5M9 9.5v-4" {...stroke}/>
  </>),
  agents: (<>
    <circle cx="6.5" cy="4" r="2.5" {...stroke}/>
    <path d="M2 11.5v-.5a4.5 4.5 0 0 1 9 0v.5" {...stroke}/>
  </>),
  crons: (<>
    <circle cx="6.5" cy="6.5" r="5" {...stroke}/>
    <path d="M6.5 3.5v3l2 1.5" {...stroke}/>
    <path d="M10.5 2.5v2h-2" {...stroke}/>
  </>),
  settings: (<>
    <circle cx="6.5" cy="6.5" r="2" {...stroke}/>
    <path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2M3 3l1.5 1.5M8.5 8.5L10 10M3 10l1.5-1.5M8.5 4.5L10 3" {...stroke}/>
  </>),
};

export function Icon({ name, size = 12, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" className="ico" aria-hidden="true" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
