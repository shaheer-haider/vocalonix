import { TextArea } from "@vocalonix/web";

const stack: React.CSSProperties = {
  display: "grid",
  gap: 16,
  maxWidth: 460,
};

export function Default() {
  return (
    <div style={stack}>
      <TextArea
        label="Greeting"
        defaultValue="Hi, thanks for calling Acme Dental. How can I help today?"
      />
    </div>
  );
}

export function AutoResized() {
  return (
    <div style={stack}>
      <TextArea
        label="Agent instructions"
        helper="The box grows with the content — no scrollbar."
        defaultValue={[
          "You are the front desk for Acme Dental.",
          "Book, move and cancel appointments. Never quote prices.",
          "If a caller sounds distressed or mentions bleeding, offer the emergency line immediately.",
          "Close by confirming the appointment time back to the caller.",
        ].join("\n")}
      />
    </div>
  );
}

export function FixedHeightWithError() {
  return (
    <div style={stack}>
      <TextArea
        label="Voicemail message"
        autoResize={false}
        rows={3}
        error="Voicemail can't be longer than 30 seconds of speech."
        defaultValue="We're closed right now, but leave your name and number and the practice will call you back first thing tomorrow morning."
      />
    </div>
  );
}
