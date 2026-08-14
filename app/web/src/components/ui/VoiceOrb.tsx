import { WaveIcon } from "../../icons";

export type VoiceOrbState = "idle" | "connecting" | "connected" | "failed";

interface VoiceOrbProps {
  state: VoiceOrbState;
  /** Announced to screen readers in place of the visual state. */
  label: string;
}

/**
 * The one mark in the product that says "voice" rather than "software". Lifted out
 * of the retired /secret test-call screen into the shared kit so the demo call —
 * the moment the product actually proves itself — has a centrepiece.
 */
export function VoiceOrb({ state, label }: VoiceOrbProps) {
  return (
    <div className="orb-wrap" role="img" aria-label={label}>
      <div className={`voice-orb ${state === "connected" ? "voice-orb--active" : ""}`}>
        <WaveIcon size={42} />
      </div>
      <div className="orb-ring orb-ring--one" aria-hidden />
      <div className="orb-ring orb-ring--two" aria-hidden />
    </div>
  );
}
