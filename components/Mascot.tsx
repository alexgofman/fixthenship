// FixThenShip mascot. Needs mascot.css loaded once (see README.md).
// No hooks and no browser APIs, so it renders on the server as well.
// The markup is the same for every state; the class on the <svg> picks the pose and the loop.
import "./mascot.css";

export type MascotState =
  | "checking"
  | "fixing"
  | "rechecking"
  | "done"
  | "needsYou"
  | "stopped";

export type MascotProps = {
  state: MascotState;
  /** Width and height in pixels. Default 72. */
  size?: number;
  /** When given, the mascot is announced as an image with this label. Otherwise it is hidden from screen readers. */
  label?: string;
};

export function Mascot({ state, size = 72, label }: MascotProps) {
  return (
    <svg
      className={`fts-mascot fts-mascot-${state}`}
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <ellipse className="fts-mascot-shadow" cx="40" cy="90" rx="22" ry="3"/>
      <rect className="fts-mascot-m" x="24" y="74" width="12" height="13" rx="4"/>
      <rect className="fts-mascot-m" x="44" y="74" width="12" height="13" rx="4"/>
      <g className="fts-mascot-body">
        <path className="fts-mascot-lm" d="M17 60q-7 2-8 9"/>
        <circle className="fts-mascot-m" cx="9" cy="69.5" r="3.6"/>
        <rect className="fts-mascot-a" x="16" y="33" width="48" height="48" rx="11"/>
        <g className="fts-mascot-eyes">
          <circle className="fts-mascot-w" cx="31" cy="53" r="7"/>
          <circle className="fts-mascot-w" cx="49" cy="53" r="7"/>
          <g className="fts-mascot-pupils">
            <circle className="fts-mascot-k" cx="31" cy="53" r="3.3"/>
            <circle className="fts-mascot-k" cx="49" cy="53" r="3.3"/>
          </g>
        </g>
        <path className="fts-mascot-lw fts-mascot-smile" d="M35 66q5 4 10 0"/>
        {/* done: content, closed eyes */}
        <path className="fts-mascot-lw fts-mascot-s fts-mascot-s-done" d="M25 55q6-8 12 0M43 55q6-8 12 0"/>
        {/* fixing: straight mouth of someone concentrating */}
        <path className="fts-mascot-lw fts-mascot-s fts-mascot-s-fixing" d="M36 67h8"/>
        {/* stopped: one raised brow, wavy mouth */}
        <g className="fts-mascot-s fts-mascot-s-stopped">
          <path className="fts-mascot-l fts-mascot-thin" d="M25 43h10M44 40q5-3.5 10 0"/>
          <path className="fts-mascot-lw" d="M34 67q3-3 6 0t6 0"/>
        </g>
        {/* checking: arm sweeping a magnifying glass */}
        <g className="fts-mascot-arm fts-mascot-s fts-mascot-s-checking">
          <path className="fts-mascot-lm" d="M64 60q8-1 11.5-9"/>
          <path className="fts-mascot-l" d="M75.5 51L78.6 42"/>
          <circle className="fts-mascot-lens" cx="82" cy="32" r="9"/>
          <path className="fts-mascot-l fts-mascot-glint" d="M77 31a5.2 5.2 0 0 1 4-4.2"/>
          <circle className="fts-mascot-m" cx="75.5" cy="51" r="3.8"/>
        </g>
        {/* fixing: arm turning a wrench */}
        <g className="fts-mascot-arm fts-mascot-s fts-mascot-s-fixing">
          <path className="fts-mascot-lm" d="M64 60q7 0 10-6"/>
          <g transform="translate(74 54) rotate(25)">
            <path className="fts-mascot-l" d="M0 0V-14"/>
            <path className="fts-mascot-l fts-mascot-jaw" transform="rotate(38 0 -20.5)" d="M-4-25.6a6.5 6.5 0 1 0 8 0"/>
          </g>
          <circle className="fts-mascot-m" cx="74" cy="54" r="3.8"/>
        </g>
        {/* rechecking: the glass held up to one eye */}
        <g className="fts-mascot-s fts-mascot-s-rechecking">
          <path className="fts-mascot-lm" d="M64 61q4 3 2 7.5"/>
          <path className="fts-mascot-l" d="M59.5 62l6.5 6.5"/>
          <circle className="fts-mascot-lens fts-mascot-solid" cx="50.5" cy="53" r="10"/>
          <circle className="fts-mascot-k fts-mascot-bigp" cx="50.5" cy="53" r="4.8"/>
          <circle className="fts-mascot-m" cx="66" cy="68.5" r="3.8"/>
        </g>
        {/* done: arm holding up a tick */}
        <g className="fts-mascot-arm fts-mascot-s fts-mascot-s-done">
          <path className="fts-mascot-lm" d="M64 60q9-3 9.5-19"/>
          <circle className="fts-mascot-a" cx="79" cy="27" r="12"/>
          <path className="fts-mascot-lw" d="M73.5 27.5l4 4 7.5-8.5"/>
          <circle className="fts-mascot-m" cx="73.5" cy="41" r="3.8"/>
        </g>
        {/* needsYou: arm holding up a note */}
        <g className="fts-mascot-arm fts-mascot-s fts-mascot-s-needsYou">
          <path className="fts-mascot-lm" d="M64 60q8-3 9-17.5"/>
          <g transform="rotate(8 78 28)">
            <rect className="fts-mascot-note" x="68" y="15.5" width="20" height="25" rx="3"/>
            <path className="fts-mascot-l fts-mascot-thin" d="M73.5 24h9M73.5 31h5"/>
            <circle className="fts-mascot-a fts-mascot-dot fts-mascot-pop" cx="87" cy="16.5" r="4"/>
          </g>
          <circle className="fts-mascot-m" cx="73" cy="42.5" r="3.8"/>
        </g>
        {/* stopped: hand scratching the head */}
        <g className="fts-mascot-arm fts-mascot-s fts-mascot-s-stopped">
          <path className="fts-mascot-lm" d="M64 60q10-8-3-23"/>
          <circle className="fts-mascot-m" cx="61" cy="37" r="3.8"/>
        </g>
      </g>
      {/* rechecking: a tick that appears and fades */}
      <g className="fts-mascot-s fts-mascot-s-rechecking">
        <g className="fts-mascot-tick fts-mascot-pop">
          <circle className="fts-mascot-a" cx="81" cy="24" r="10"/>
          <path className="fts-mascot-lw" d="M76.5 24.5l3.3 3.3 6.2-7"/>
        </g>
      </g>
      {/* fixing: effort marks */}
      <path className="fts-mascot-la fts-mascot-spark fts-mascot-pop fts-mascot-s fts-mascot-s-fixing" d="M73 27l-3-4M82 23v-5.5M90.5 27l2.5-4"/>
    </svg>
  );
}

export default Mascot;

